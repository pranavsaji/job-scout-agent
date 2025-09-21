# app/services/harvest.py
from __future__ import annotations

import os
import json
import logging
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone

import httpx
from sqlalchemy.orm import Session

from app.services.jobs import upsert_jobs
from app.services.dedupe import simhash_text  # keep if you use it for de-dupe

log = logging.getLogger(__name__)

HTTP_TIMEOUT = float(os.getenv("HARVEST_HTTP_TIMEOUT", "20"))  # seconds


# ---------- Public API (sync) ----------

def harvest_once(
    db: Session,
    sources: Optional[List[str]] = None,
    *,
    ashby_orgs: Optional[List[str]] = None,
    greenhouse_orgs: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Run a single harvest sweep across selected sources.

    Params can be provided directly or via env:
      HARVEST_SOURCES=ashby,greenhouse
      ASHBY_ORGS=roblox,togetherai
      GREENHOUSE_ORGS=databricks,snowflake

    Returns { source: {seen, inserted, skipped_dupe, errors}, ... , total: {...} }
    """
    sources = _resolve_sources(sources)
    ashby_orgs = _resolve_list(ashby_orgs, os.getenv("ASHBY_ORGS", ""))
    greenhouse_orgs = _resolve_list(greenhouse_orgs, os.getenv("GREENHOUSE_ORGS", ""))

    overall: Dict[str, Any] = {}
    total = {"seen": 0, "inserted": 0, "skipped_dupe": 0, "errors": 0}

    with httpx.Client(timeout=HTTP_TIMEOUT, follow_redirects=True) as client:
        if "ashby" in sources and ashby_orgs:
            stats = _harvest_ashby(db, client, ashby_orgs)
            overall["ashby"] = stats
            _rollup(total, stats)

        if "greenhouse" in sources and greenhouse_orgs:
            stats = _harvest_greenhouse(db, client, greenhouse_orgs)
            overall["greenhouse"] = stats
            _rollup(total, stats)

    overall["total"] = total
    return overall


# ---------- Public API (async wrapper expected by router) ----------

async def run_harvest(
    sources: Optional[List[str]] = None,
    orgs: Optional[List[str]] = None,
    max_pages: int = 2,            # kept for compatibility; not used in current scrapers
    dry_run: bool = False,         # kept for compatibility; not used (no remote writes)
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Async facade used by app/routers/harvest.py.

    - Opens a DB session.
    - Splits orgs by source using `extra` or env vars.
    - Calls `harvest_once` and returns the result.
    """
    # Lazy import to avoid circulars during startup
    try:
        from app.db import SessionLocal  # type: ignore
    except Exception as e:
        log.exception("Failed to import SessionLocal from app.db: %s", e)
        raise

    sources = _resolve_sources(sources)

    # Prefer explicit per-source lists from `extra`
    extra = extra or {}
    ashby_orgs: Optional[List[str]] = _resolve_list(extra.get("ashby_orgs"), os.getenv("ASHBY_ORGS", ""))
    greenhouse_orgs: Optional[List[str]] = _resolve_list(extra.get("greenhouse_orgs"), os.getenv("GREENHOUSE_ORGS", ""))

    # If caller passed a flat `orgs` list, use it for any requested sources that
    # don't already have per-source lists configured.
    if orgs:
        orgs = [o.strip() for o in orgs if o and o.strip()]
        if "ashby" in sources and not ashby_orgs:
            ashby_orgs = orgs
        if "greenhouse" in sources and not greenhouse_orgs:
            greenhouse_orgs = orgs

    # Open session and run
    with SessionLocal() as db:
        return harvest_once(
            db,
            sources=sources,
            ashby_orgs=ashby_orgs,
            greenhouse_orgs=greenhouse_orgs,
        )


# ---------- Scrapers ----------

def _harvest_ashby(db: Session, client: httpx.Client, orgs: List[str]) -> Dict[str, int]:
    stats = {"seen": 0, "inserted": 0, "skipped_dupe": 0, "errors": 0}
    for org in orgs:
        org_slug = org.strip()
        if not org_slug:
            continue
        url = f"https://api.ashbyhq.com/posting-api/job-board/{org_slug}"
        try:
            resp = client.get(url)
            if resp.status_code != 200:
                log.warning("Ashby non-200 for %s: %s", org_slug, resp.status_code)
                stats["errors"] += 1
                continue
            try:
                data = resp.json()
            except json.JSONDecodeError:
                log.warning("GET JSON failed %s: Expecting value at 1:1", url)
                stats["errors"] += 1
                continue

            postings = data.get("jobs") or data.get("postings") or []
            if not isinstance(postings, list):
                log.warning("Ashby unexpected jobs payload for %s", org_slug)
                stats["errors"] += 1
                continue

            items: List[Dict[str, Any]] = []
            for j in postings:
                if not isinstance(j, dict):
                    continue
                title = _s(j.get("title"))
                company = _s(j.get("companyName") or org_slug)
                apply_url = _s(j.get("applyUrl") or j.get("url"))
                canonical_url = _s(j.get("jobUrl") or j.get("jobUrlForJobBoard") or apply_url)
                location = _s(_ashby_location(j))
                level = _s(j.get("seniority") or j.get("jobLevel"))
                employment_type = _s(j.get("employmentType"))
                posted_at = _dt(_s(j.get("publishedAt") or j.get("createdAt")))
                desc_html = j.get("descriptionHtml") or j.get("description") or ""
                description_md = _to_markdown(desc_html)

                if not (title and company and description_md and apply_url):
                    continue

                items.append({
                    "source": "ashby",
                    "company": company,
                    "title": title,
                    "location": location,
                    "remote": _remote_from_text(description_md),
                    "employment_type": employment_type,
                    "level": level,
                    "posted_at": posted_at,
                    "apply_url": apply_url,
                    "canonical_url": canonical_url,
                    "currency": None,
                    "salary_min": None,
                    "salary_max": None,
                    "salary_period": None,
                    "description_md": description_md,
                    "description_raw": None,
                    "meta": {"org": org_slug, "raw_id": j.get("id")},
                })

            res = upsert_jobs(db, items)
            _rollup(stats, res)

        except Exception as e:
            log.exception("Ashby fetch failed for %s: %s", org_slug, e)
            stats["errors"] += 1

    return stats


def _harvest_greenhouse(db: Session, client: httpx.Client, orgs: List[str]) -> Dict[str, int]:
    """
    Greenhouse public board API:
      https://boards-api.greenhouse.io/v1/boards/{org}/jobs?content=true
    Observation: `jobs[].content` is typically an HTML string; handle strings, lists, or dicts.
    """
    stats = {"seen": 0, "inserted": 0, "skipped_dupe": 0, "errors": 0}
    for org in orgs:
        org_slug = org.strip()
        if not org_slug:
            continue
        url = f"https://boards-api.greenhouse.io/v1/boards/{org_slug}/jobs?content=true"
        try:
            resp = client.get(url)
            if resp.status_code != 200:
                log.warning("Greenhouse non-200 for %s: %s", org_slug, resp.status_code)
                stats["errors"] += 1
                continue

            data = resp.json()
            postings = data.get("jobs", [])
            if not isinstance(postings, list):
                log.warning("Greenhouse unexpected jobs payload for %s", org_slug)
                stats["errors"] += 1
                continue

            items: List[Dict[str, Any]] = []
            for j in postings:
                if not isinstance(j, dict):
                    continue
                title = _s(j.get("title"))
                company = _s(j.get("company_name") or org_slug)
                apply_url = _s(j.get("absolute_url") or j.get("url"))
                canonical_url = _s(j.get("absolute_url") or apply_url)
                posted_at = _dt(j.get("updated_at") or j.get("created_at"))
                location = _s((j.get("location") or {}).get("name")) if isinstance(j.get("location"), dict) else _s(j.get("location"))

                description_md = _extract_greenhouse_description(j)

                if not (title and company and description_md and apply_url):
                    continue

                items.append({
                    "source": "greenhouse",
                    "company": company,
                    "title": title,
                    "location": location,
                    "remote": _remote_from_text(description_md),
                    "employment_type": None,
                    "level": None,
                    "posted_at": posted_at,
                    "apply_url": apply_url,
                    "canonical_url": canonical_url,
                    "currency": None,
                    "salary_min": None,
                    "salary_max": None,
                    "salary_period": None,
                    "description_md": description_md,
                    "description_raw": None,
                    "meta": {"org": org_slug, "raw_id": j.get("id")},
                })

            res = upsert_jobs(db, items)
            _rollup(stats, res)

        except Exception as e:
            log.exception("Greenhouse fetch failed for %s: %s", org_slug, e)
            stats["errors"] += 1

    return stats


# ---------- helpers ----------

def _extract_greenhouse_description(j: Dict[str, Any]) -> Optional[str]:
    """
    Greenhouse `content` can be:
      - a string of HTML (most common)
      - a list of blocks (strings or dicts with 'value'/'content')
      - a dict with value/content
    """
    content = j.get("content")

    if isinstance(content, str):
        md = _to_markdown(content)
        if md:
            return md

    if isinstance(content, list):
        parts: List[str] = []
        for c in content:
            if isinstance(c, str):
                v = c
            elif isinstance(c, dict):
                v = c.get("value") or c.get("content") or ""
            else:
                v = ""
            if not isinstance(v, str):
                v = str(v)
            md = _to_markdown(v)
            if md:
                parts.append(md)
        if parts:
            return "\n\n".join(parts)

    if isinstance(content, dict):
        v = content.get("value") or content.get("content") or ""
        md = _to_markdown(v)
        if md:
            return md

    desc = j.get("description") or j.get("internal_job_description")
    if isinstance(desc, str):
        return _to_markdown(desc)

    return None


def _resolve_sources(sources: Optional[List[str]]) -> List[str]:
    if sources:
        return [s.strip().lower() for s in sources if s and s.strip()]
    env = os.getenv("HARVEST_SOURCES", "ashby,greenhouse")
    return [s.strip().lower() for s in env.split(",") if s.strip()]

def _resolve_list(value: Optional[List[str]] | Optional[Any], env_str: str) -> List[str]:
    # value can be List[str] or any (e.g., string) from extra; normalize
    if value:
        if isinstance(value, list):
            return [str(v).strip() for v in value if v and str(v).strip()]
        if isinstance(value, str):
            return [v.strip() for v in value.split(",") if v.strip()]
    if not env_str:
        return []
    return [v.strip() for v in env_str.split(",") if v.strip()]

def _rollup(dst: Dict[str, int], part: Dict[str, Any]) -> None:
    dst["seen"] += int(part.get("seen", 0))
    dst["inserted"] += int(part.get("inserted", 0))
    dst["skipped_dupe"] += int(part.get("skipped_dupe", 0))
    dst["errors"] += int(part.get("errors", 0))

def _s(v: Any) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s or None

def _dt(v: Any) -> Optional[datetime]:
    if not v:
        return None
    try:
        dt = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None

def _remote_from_text(text: Optional[str]) -> Optional[str]:
    if not text:
        return None
    t = text.lower()
    if "remote" in t or "work from home" in t:
        return "remote"
    if "hybrid" in t:
        return "hybrid"
    if "on-site" in t or "onsite" in t:
        return "onsite"
    return None

def _to_markdown(html_or_md: Any) -> Optional[str]:
    """
    Crude HTML -> plaintext/markdown-ish converter.
    Collapses whitespace so we don't get one word per line.
    """
    if not html_or_md:
        return None
    text = str(html_or_md)

    if "<" in text and ">" in text:
        import re
        text = re.sub(r"</li\s*>", "\n", text, flags=re.I)
        text = re.sub(r"<li[^>]*>", "- ", text, flags=re.I)
        text = re.sub(r"<\s*br\s*/?>", "\n", text, flags=re.I)
        text = re.sub(r"</p\s*>", "\n\n", text, flags=re.I)
        text = re.sub(r"<p[^>]*>", "", text, flags=re.I)
        text = re.sub(r"<[^>]+>", "", text)

    lines = [ln.strip() for ln in text.replace("\r", "\n").split("\n")]
    out: List[str] = []
    prev_blank = False
    for ln in lines:
        if not ln:
            if not prev_blank:
                out.append("")
            prev_blank = True
        else:
            out.append(ln)
            prev_blank = False
    md = "\n".join(out).strip()
    return md or None

def _ashby_location(j: Dict[str, Any]) -> Optional[str]:
    loc = j.get("location") or j.get("jobLocation")
    if isinstance(loc, dict):
        return loc.get("name") or loc.get("displayName")
    if isinstance(loc, str):
        return loc
    return None

# # app/services/harvest.py
# from __future__ import annotations

# import os
# import json
# import logging
# import asyncio
# from typing import Any, Dict, Iterable, List, Optional, Tuple
# from datetime import datetime, timezone

# import httpx
# from sqlalchemy.orm import Session

# from app.db import SessionLocal
# from app.services.jobs import upsert_jobs
# from app.services.dedupe import simhash_text  # ensure this exists as in your project

# log = logging.getLogger(__name__)

# HTTP_TIMEOUT = float(os.getenv("HARVEST_HTTP_TIMEOUT", "20"))  # seconds

# __all__ = [
#     "harvest_once",
#     "run_harvest",
# ]

# # ---------- Public API ----------

# def harvest_once(
#     db: Session,
#     sources: Optional[List[str]] = None,
#     *,
#     ashby_orgs: Optional[List[str]] = None,
#     greenhouse_orgs: Optional[List[str]] = None,
# ) -> Dict[str, Any]:
#     """
#     Run a single harvest sweep across selected sources.

#     Params can be provided directly or via env:
#       HARVEST_SOURCES=ashby,greenhouse
#       ASHBY_ORGS=roblox,togetherai
#       GREENHOUSE_ORGS=databricks,snowflake

#     Returns { source: {seen, inserted, skipped_dupe, errors}, ... , total: {...} }
#     """
#     sources = _resolve_sources(sources)
#     ashby_orgs = _resolve_list(ashby_orgs, os.getenv("ASHBY_ORGS", ""))
#     greenhouse_orgs = _resolve_list(greenhouse_orgs, os.getenv("GREENHOUSE_ORGS", ""))

#     overall: Dict[str, Any] = {}
#     total = {"seen": 0, "inserted": 0, "skipped_dupe": 0, "errors": 0}

#     with httpx.Client(timeout=HTTP_TIMEOUT, follow_redirects=True) as client:
#         if "ashby" in sources and ashby_orgs:
#             stats = _harvest_ashby(db, client, ashby_orgs)
#             overall["ashby"] = stats
#             _rollup(total, stats)

#         if "greenhouse" in sources and greenhouse_orgs:
#             stats = _harvest_greenhouse(db, client, greenhouse_orgs)
#             overall["greenhouse"] = stats
#             _rollup(total, stats)

#         # Silently ignore unimplemented sources so the API doesn’t crash
#         for src in sources:
#             if src not in ("ashby", "greenhouse"):
#                 overall[src] = {"seen": 0, "inserted": 0, "skipped_dupe": 0, "errors": 0}

#     overall["total"] = total
#     return overall


# async def run_harvest(
#     *,
#     sources: Optional[List[str]] = None,
#     orgs: Optional[List[str]] = None,
#     ashby_orgs: Optional[List[str]] = None,
#     greenhouse_orgs: Optional[List[str]] = None,
#     extra: Optional[Dict[str, Any]] = None,
# ) -> Dict[str, Any]:
#     """
#     Async wrapper used by routers/scheduler. Opens a DB session and calls harvest_once
#     in a worker thread. Org lists can come from args, `extra`, or env.
#     """
#     # allow extra to override
#     extra = extra or {}

#     # unify org inputs:
#     # - per-source lists take precedence
#     # - a generic `orgs` list is used for both if per-source missing
#     if ashby_orgs is None:
#         ashby_orgs = _resolve_list(ashby_orgs, os.getenv("ASHBY_ORGS", ""))
#     if greenhouse_orgs is None:
#         greenhouse_orgs = _resolve_list(greenhouse_orgs, os.getenv("GREENHOUSE_ORGS", ""))

#     # if only `orgs` provided, apply to both where empty
#     orgs = orgs or []
#     if orgs and not ashby_orgs:
#         ashby_orgs = orgs
#     if orgs and not greenhouse_orgs:
#         greenhouse_orgs = orgs

#     # sources fallback to env if not provided
#     sources = _resolve_sources(sources)

#     def _work():
#         with SessionLocal() as db:
#             return harvest_once(
#                 db,
#                 sources=sources,
#                 ashby_orgs=ashby_orgs,
#                 greenhouse_orgs=greenhouse_orgs,
#             )

#     return await asyncio.to_thread(_work)

# # ---------- Scrapers ----------

# def _harvest_ashby(db: Session, client: httpx.Client, orgs: List[str]) -> Dict[str, int]:
#     stats = {"seen": 0, "inserted": 0, "skipped_dupe": 0, "errors": 0}
#     for org in orgs:
#         url = f"https://api.ashbyhq.com/posting-api/job-board/{org.strip()}"
#         try:
#             resp = client.get(url)
#             if resp.status_code != 200:
#                 log.warning("Ashby non-200 for %s: %s", org, resp.status_code)
#                 stats["errors"] += 1
#                 continue
#             try:
#                 data = resp.json()
#             except json.JSONDecodeError:
#                 log.warning("GET JSON failed %s: Expecting value at 1:1", url)
#                 stats["errors"] += 1
#                 continue

#             postings = data.get("jobs") or data.get("postings") or []
#             items = []
#             for j in postings:
#                 # Ashby objects vary; do a best-effort extract
#                 title = _s(j.get("title"))
#                 company = _s(j.get("companyName") or org)
#                 apply_url = _s(j.get("applyUrl") or j.get("url"))
#                 canonical_url = _s(j.get("jobUrl") or j.get("jobUrlForJobBoard") or apply_url)
#                 location = _s(_ashby_location(j))
#                 level = _s(j.get("seniority") or j.get("jobLevel"))
#                 employment_type = _s(j.get("employmentType"))
#                 posted_at = _dt(_s(j.get("publishedAt") or j.get("createdAt")))
#                 desc_html = j.get("descriptionHtml") or j.get("description") or ""
#                 description_md = _to_markdown(desc_html)

#                 if not (title and company and description_md and apply_url):
#                     continue

#                 items.append({
#                     "source": "ashby",
#                     "company": company,
#                     "title": title,
#                     "location": location,
#                     "remote": _remote_from_text(description_md),
#                     "employment_type": employment_type,
#                     "level": level,
#                     "posted_at": posted_at,
#                     "apply_url": apply_url,
#                     "canonical_url": canonical_url,
#                     "currency": None,
#                     "salary_min": None,
#                     "salary_max": None,
#                     "salary_period": None,
#                     "description_md": description_md,
#                     "description_raw": None,
#                     "meta": {"org": org, "raw_id": j.get("id")},
#                 })

#             res = upsert_jobs(db, items)
#             _rollup(stats, res)

#         except Exception as e:
#             log.exception("Ashby fetch failed for %s: %s", org, e)
#             stats["errors"] += 1

#     return stats


# def _harvest_greenhouse(db: Session, client: httpx.Client, orgs: List[str]) -> Dict[str, int]:
#     """
#     Greenhouse public board API:
#       https://boards-api.greenhouse.io/v1/boards/{org}/jobs?content=true
#     """
#     stats = {"seen": 0, "inserted": 0, "skipped_dupe": 0, "errors": 0}
#     for org in orgs:
#         url = f"https://boards-api.greenhouse.io/v1/boards/{org.strip()}/jobs?content=true"
#         try:
#             resp = client.get(url)
#             if resp.status_code != 200:
#                 log.warning("Greenhouse non-200 for %s: %s", org, resp.status_code)
#                 stats["errors"] += 1
#                 continue

#             data = resp.json()
#             postings = data.get("jobs", [])
#             items = []
#             for j in postings:
#                 title = _s(j.get("title"))
#                 company = _s(j.get("company_name") or org)
#                 apply_url = _s(j.get("absolute_url") or j.get("url"))
#                 canonical_url = _s(j.get("absolute_url") or apply_url)
#                 posted_at = _dt(j.get("updated_at") or j.get("created_at"))
#                 location = _s(j.get("location", {}).get("name"))
#                 employment_type = None
#                 level = None
#                 remote = None

#                 # Choose the first content block with non-empty value
#                 description_md = None
#                 for c in (j.get("content") or []):
#                     if not c:
#                         continue
#                     v = _s(c.get("value"))
#                     if v:
#                         description_md = _to_markdown(v)
#                         break
#                 # Fallback to raw content
#                 if not description_md:
#                     description_md = _to_markdown(j.get("content"))

#                 if not (title and company and description_md and apply_url):
#                     continue

#                 items.append({
#                     "source": "greenhouse",
#                     "company": company,
#                     "title": title,
#                     "location": location,
#                     "remote": remote or _remote_from_text(description_md),
#                     "employment_type": employment_type,
#                     "level": level,
#                     "posted_at": posted_at,
#                     "apply_url": apply_url,
#                     "canonical_url": canonical_url,
#                     "currency": None,
#                     "salary_min": None,
#                     "salary_max": None,
#                     "salary_period": None,
#                     "description_md": description_md,
#                     "description_raw": None,
#                     "meta": {"org": org, "raw_id": j.get("id")},
#                 })

#             res = upsert_jobs(db, items)
#             _rollup(stats, res)

#         except Exception as e:
#             log.exception("Greenhouse fetch failed for %s: %s", org, e)
#             stats["errors"] += 1

#     return stats

# def _ashby_location(j: Dict[str, Any]) -> Optional[str]:
#     # Ashby can embed locations variously; best-effort
#     loc = j.get("location") or {}
#     if isinstance(loc, dict):
#         return loc.get("name") or loc.get("location") or None
#     if isinstance(loc, str):
#         return loc
#     return None

# # ---------- helpers ----------

# def _resolve_sources(sources: Optional[List[str]]) -> List[str]:
#     if sources:
#         return [s.strip().lower() for s in sources if s and s.strip()]
#     env = os.getenv("HARVEST_SOURCES", "ashby,greenhouse")
#     return [s.strip().lower() for s in env.split(",") if s.strip()]

# def _resolve_list(value: Optional[List[str]], env_str: str) -> List[str]:
#     if value:
#         return [v.strip() for v in value if v and v.strip()]
#     if not env_str:
#         return []
#     return [v.strip() for v in env_str.split(",") if v.strip()]

# def _rollup(dst: Dict[str, int], part: Dict[str, Any]) -> None:
#     dst["seen"] += int(part.get("seen", 0))
#     dst["inserted"] += int(part.get("inserted", 0))
#     dst["skipped_dupe"] += int(part.get("skipped_dupe", 0))
#     dst["errors"] += int(part.get("errors", 0))

# def _s(v: Any) -> Optional[str]:
#     if v is None:
#         return None
#     s = str(v).strip()
#     return s or None

# def _dt(v: Any) -> Optional[datetime]:
#     if not v:
#         return None
#     try:
#         # try ISO first
#         dt = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
#         return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
#     except Exception:
#         return None

# def _remote_from_text(text: Optional[str]) -> Optional[str]:
#     if not text:
#         return None
#     t = text.lower()
#     if "remote" in t or "work from home" in t:
#         return "remote"
#     if "hybrid" in t:
#         return "hybrid"
#     if "on-site" in t or "onsite" in t:
#         return "onsite"
#     return None

# def _to_markdown(html_or_md: Any) -> Optional[str]:
#     """
#     Keep it simple: if the text looks like HTML, strip a few common tags
#     and collapse whitespace so we don't get one word per line.
#     """
#     if not html_or_md:
#         return None
#     text = str(html_or_md)

#     # crude HTML -> text
#     if "<" in text and ">" in text:
#         import re
#         # convert <li> to "- "
#         text = re.sub(r"</li\s*>", "\n", text, flags=re.I)
#         text = re.sub(r"<li[^>]*>", "- ", text, flags=re.I)
#         # convert <p>,<br> to newlines
#         text = re.sub(r"<\s*br\s*/?>", "\n", text, flags=re.I)
#         text = re.sub(r"</p\s*>", "\n\n", text, flags=re.I)
#         text = re.sub(r"<p[^>]*>", "", text, flags=re.I)
#         # strip the rest of tags
#         text = re.sub(r"<[^>]+>", "", text)

#     # collapse whitespace / multiple blank lines
#     lines = [ln.strip() for ln in text.replace("\r", "\n").split("\n")]
#     out: List[str] = []
#     prev_blank = False
#     for ln in lines:
#         if not ln:
#             if not prev_blank:
#                 out.append("")
#             prev_blank = True
#         else:
#             out.append(ln)
#             prev_blank = False
#     md = "\n".join(out).strip()
#     return md or None
