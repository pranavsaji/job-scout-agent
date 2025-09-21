# backend/app/services/jobs.py
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Iterable, List, Optional, Tuple

from sqlalchemy import select, or_, and_
from sqlalchemy.orm import Session

from app.models import Job
from app.services.dedupe import simhash_text


_MIN_DESC_FOR_SIMHASH = 120  # if shorter, we fallback to a metadata-based hash
_RECENT_WINDOW_FOR_HASH_MATCH_DAYS = 90


def _first(s: Optional[str]) -> str:
    return (s or "").strip()


def _canon_url(u: Optional[str]) -> Optional[str]:
    if not u:
        return None
    u = u.strip()
    # Very light canonicalization; keep it simple/safe
    return u if u else None


def _num_or_none(x: Any) -> Optional[float]:
    try:
        if x is None:
            return None
        return float(x)
    except Exception:
        return None


def _parse_ts(x: Any) -> datetime:
    # Expecting ISO8601 or datetime; default to now() if missing
    if isinstance(x, datetime):
        dt = x
    else:
        try:
            # Allow timezone-naive; treat as UTC
            dt = datetime.fromisoformat(str(x))
        except Exception:
            dt = datetime.now(timezone.utc)

    # Ensure tz-aware (UTC)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _stable_fallback_fingerprint(company: str, title: str, location: str,
                                 canonical_url: Optional[str], apply_url: Optional[str]) -> str:
    """
    When the description is empty/very short, we need an idempotent, stable hash
    that won't collapse everything to a single value.
    """
    base = "|".join([
        _first(company).lower(),
        _first(title).lower(),
        _first(location).lower(),
        (canonical_url or "").strip().lower(),
        (apply_url or "").strip().lower(),
    ])
    return simhash_text(base)


def _choose_hash(description_md: str,
                 company: str,
                 title: str,
                 location: str,
                 canonical_url: Optional[str],
                 apply_url: Optional[str]) -> str:
    desc = (description_md or "").strip()
    if len(desc) >= _MIN_DESC_FOR_SIMHASH:
        return simhash_text(desc)
    # Fallback to a metadata-based fingerprint when description is thin
    return _stable_fallback_fingerprint(company, title, location, canonical_url, apply_url)


def _normalize(raw: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize a raw scraper item into our Job columns. Be lenient with inputs.
    Required: company, title, posted_at, apply_url or canonical_url, description_md (can be short).
    """
    company = _first(raw.get("company"))
    title = _first(raw.get("title"))
    location = _first(raw.get("location"))
    remote = _first(raw.get("remote"))
    employment_type = _first(raw.get("employment_type"))
    level = _first(raw.get("level"))

    # prefer canonical_url, then apply_url
    canonical_url = _canon_url(raw.get("canonical_url")) or _canon_url(raw.get("apply_url"))
    apply_url = _canon_url(raw.get("apply_url")) or canonical_url

    description_md = raw.get("description_md") or raw.get("description_raw") or ""
    description_md = str(description_md or "").strip()

    # posted_at
    posted_at = _parse_ts(raw.get("posted_at"))

    # salary
    currency = _first(raw.get("currency"))
    salary_min = _num_or_none(raw.get("salary_min"))
    salary_max = _num_or_none(raw.get("salary_max"))
    salary_period = _first(raw.get("salary_period"))

    # source tagging (e.g. "greenhouse:databricks")
    source = _first(raw.get("source")) or "unknown"

    meta = raw.get("meta") or {}

    return {
        "source": source,
        "company": company or "unknown",
        "title": title or "(untitled)",
        "location": location or "",
        "remote": remote or "",
        "employment_type": employment_type or "",
        "level": level or "",
        "posted_at": posted_at,
        "apply_url": apply_url or "",
        "canonical_url": canonical_url or apply_url or "",
        "currency": currency or "",
        "salary_min": salary_min,
        "salary_max": salary_max,
        "salary_period": salary_period or "",
        "description_md": description_md,
        "description_raw": raw.get("description_raw") or None,
        "meta": meta,
    }


def _find_existing(db: Session, *,
                   company: str,
                   title: str,
                   canonical_url: Optional[str],
                   apply_url: Optional[str],
                   hash_sim: str,
                   posted_at: datetime) -> Optional[Job]:
    """
    Try to find an existing job using progressively weaker keys:
    1) canonical_url exact match
    2) apply_url exact match
    3) hash_sim + (company,title) within a recent window
    """
    # 1) canonical_url
    if canonical_url:
        q = select(Job).where(Job.canonical_url == canonical_url)
        row = db.execute(q).scalars().first()
        if row:
            return row

    # 2) apply_url
    if apply_url:
        q = select(Job).where(Job.apply_url == apply_url)
        row = db.execute(q).scalars().first()
        if row:
            return row

    # 3) hash + company/title within window
    cutoff = posted_at - timedelta(days=_RECENT_WINDOW_FOR_HASH_MATCH_DAYS)
    q = (
        select(Job)
        .where(
            and_(
                Job.hash_sim == hash_sim,
                Job.company.ilike(company),
                Job.title.ilike(title),
                Job.posted_at >= cutoff,
            )
        )
        .order_by(Job.posted_at.desc())
    )
    return db.execute(q).scalars().first()


def upsert_jobs(db: Session, items: Iterable[Dict[str, Any]]) -> Dict[str, int]:
    """
    Ingest a batch of normalized or raw items into the DB with robust idempotency.
    Returns counters: seen, inserted, updated, skipped_dupe, errors.
    """
    seen = inserted = updated = skipped = errors = 0

    batch: List[Job] = []

    for raw in items:
        seen += 1
        try:
            n = _normalize(raw)

            # compute a robust hash
            h = _choose_hash(
                n["description_md"],
                n["company"],
                n["title"],
                n["location"],
                n.get("canonical_url"),
                n.get("apply_url"),
            )

            # Try to find an existing record
            existing = _find_existing(
                db,
                company=n["company"],
                title=n["title"],
                canonical_url=n.get("canonical_url"),
                apply_url=n.get("apply_url"),
                hash_sim=h,
                posted_at=n["posted_at"],
            )

            if existing:
                # Optionally refresh fields when new data is better/newer
                changed = False

                # Prefer newer posted_at
                if n["posted_at"] and existing.posted_at and n["posted_at"] > existing.posted_at:
                    existing.posted_at = n["posted_at"]
                    changed = True

                # Prefer longer/better description
                new_desc = n["description_md"] or ""
                if new_desc and len(new_desc) > len(existing.description_md or ""):
                    existing.description_md = new_desc
                    changed = True

                # Backfill canonical_url/apply_url if missing
                if (not existing.canonical_url) and n.get("canonical_url"):
                    existing.canonical_url = n["canonical_url"]
                    changed = True
                if (not existing.apply_url) and n.get("apply_url"):
                    existing.apply_url = n["apply_url"]
                    changed = True

                # Currency/salary backfill
                if (not existing.currency) and n.get("currency"):
                    existing.currency = n["currency"]
                    changed = True
                if (existing.salary_min is None) and (n.get("salary_min") is not None):
                    existing.salary_min = n["salary_min"]
                    changed = True
                if (existing.salary_max is None) and (n.get("salary_max") is not None):
                    existing.salary_max = n["salary_max"]
                    changed = True
                if (not existing.salary_period) and n.get("salary_period"):
                    existing.salary_period = n["salary_period"]
                    changed = True

                # Location/level/employment type backfill
                for fld in ("location", "level", "employment_type", "remote"):
                    if not getattr(existing, fld) and n.get(fld):
                        setattr(existing, fld, n[fld])
                        changed = True

                if changed:
                    updated += 1
                else:
                    skipped += 1

                # flush periodically
                if (inserted + updated) % 100 == 0:
                    db.flush()

                continue

            # Insert new row
            job = Job(
                source=n["source"],
                company=n["company"],
                title=n["title"],
                location=n["location"],
                remote=n["remote"],
                employment_type=n["employment_type"],
                level=n["level"],
                posted_at=n["posted_at"],
                apply_url=n["apply_url"],
                canonical_url=n["canonical_url"],
                currency=n["currency"],
                salary_min=n["salary_min"],
                salary_max=n["salary_max"],
                salary_period=n["salary_period"],
                description_md=n["description_md"],
                description_raw=n.get("description_raw"),
                hash_sim=h,
                meta=n.get("meta") or {},
            )
            db.add(job)
            inserted += 1

            if (inserted + updated) % 100 == 0:
                db.flush()

        except Exception:
            errors += 1
            # keep moving

    db.commit()
    return {
        "seen": seen,
        "inserted": inserted,
        "updated": updated,
        "skipped_dupe": skipped,
        "errors": errors,
    }


# ----- Cleanup helper for router (/jobs/cleanup) -----

def delete_older_than_hours(cutoff: datetime) -> int:
    """
    Delete jobs older than a cutoff datetime (UTC).
    """
    # Ensure tz-aware UTC cutoff
    if cutoff.tzinfo is None:
        cutoff = cutoff.replace(tzinfo=timezone.utc)
    cutoff = cutoff.astimezone(timezone.utc)

    from sqlalchemy import delete
    stmt = delete(Job).where(Job.posted_at < cutoff)
    with db_transaction() as (db, commit):
        res = db.execute(stmt)
        commit()
        # res.rowcount may be None in some drivers; normalize to int
        return int(res.rowcount or 0)


# Small context helper to make delete_older_than_hours work standalone if used elsewhere
from contextlib import contextmanager
from app.db import SessionLocal

@contextmanager
def db_transaction():
    db = SessionLocal()
    try:
        yield db, db.commit
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


# # backend/app/services/jobs.py
# from __future__ import annotations

# from datetime import datetime, timedelta, timezone
# from typing import Any, Dict, Iterable, List, Optional, Tuple

# from sqlalchemy.orm import Session
# from sqlalchemy import select

# from app.models import Job
# from app.services.dedupe import simhash_text
# from app.services.cleanup import cleanup_old_jobs  # existing module does the heavy lifting


# # -----------------------------
# # Public API
# # -----------------------------

# def upsert_jobs(db: Session, items: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
#     """
#     Normalize + idempotently insert jobs.
#     De-dupes by: simhash(description_md) OR canonical_url OR apply_url.

#     Returns stats:
#       {
#         "seen": int,
#         "inserted": int,
#         "skipped_dupe": int,
#         "errors": int,
#         "ids": [uuid...]
#       }
#     """
#     stats = {"seen": 0, "inserted": 0, "skipped_dupe": 0, "errors": 0, "ids": []}
#     for raw in items:
#         stats["seen"] += 1
#         try:
#             payload = _normalize(raw)
#             if not payload:
#                 stats["errors"] += 1
#                 continue

#             # Compute simhash on normalized description
#             payload["hash_sim"] = simhash_text(payload["description_md"])

#             # De-dupe checks
#             existing = _find_existing(
#                 db,
#                 hash_sim=payload["hash_sim"],
#                 canonical_url=payload.get("canonical_url"),
#                 apply_url=payload.get("apply_url"),
#             )
#             if existing:
#                 stats["skipped_dupe"] += 1
#                 continue

#             job = Job(**payload)
#             db.add(job)
#             db.commit()
#             db.refresh(job)
#             stats["ids"].append(str(job.id))
#             stats["inserted"] += 1

#             # Optional: embed/index here if you have a function available.
#             # try:
#             #     upsert_job_embeddings(db, job)  # plug your vector/keyword indexer
#             # except Exception:
#             #     pass

#         except Exception:
#             db.rollback()
#             stats["errors"] += 1

#     return stats


# def delete_older_than_hours(hours: int = 48) -> int:
#     """
#     Thin wrapper so callers can import from a single place.
#     Uses app.services.cleanup.cleanup_old_jobs underneath.
#     Returns deleted row count.
#     """
#     return cleanup_old_jobs(hours)


# # -----------------------------
# # Internals
# # -----------------------------

# REQUIRED_STR_FIELDS = ("source", "company", "title", "apply_url", "description_md")

# def _normalize(raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
#     """
#     Convert a raw job dict from scrapers into a Job(**payload) compatible dict.

#     Expected/accepted incoming keys (best effort):
#         source, company, title, location, remote, employment_type, level,
#         posted_at, apply_url, canonical_url, currency, salary_min, salary_max,
#         salary_period, description_md, description_raw, meta
#     """
#     if not isinstance(raw, dict):
#         return None

#     # Trim + coerce strings
#     def _s(v: Any) -> Optional[str]:
#         if v is None:
#             return None
#         v = str(v).strip()
#         return v or None

#     payload: Dict[str, Any] = {
#         "source": _s(raw.get("source")),
#         "company": _s(raw.get("company")),
#         "title": _s(raw.get("title")),
#         "location": _s(raw.get("location")),
#         "remote": _s(raw.get("remote")),
#         "employment_type": _s(raw.get("employment_type")),
#         "level": _s(raw.get("level")),
#         "apply_url": _s(raw.get("apply_url")),
#         "canonical_url": _s(raw.get("canonical_url")),
#         "currency": _s(raw.get("currency")),
#         "salary_min": _num_or_none(raw.get("salary_min")),
#         "salary_max": _num_or_none(raw.get("salary_max")),
#         "salary_period": _s(raw.get("salary_period")),
#         "description_md": _clean_desc(_s(raw.get("description_md")) or _s(raw.get("description"))),
#         "description_raw": _s(raw.get("description_raw")),
#         "meta": raw.get("meta") if isinstance(raw.get("meta"), dict) else None,
#     }

#     # Validate requireds
#     for k in REQUIRED_STR_FIELDS:
#         if not payload.get(k):
#             return None

#     # posted_at: accept str/iso, int(ts), or datetime; default to now(UTC) if absent
#     payload["posted_at"] = _coerce_dt(raw.get("posted_at")) or datetime.now(timezone.utc)

#     return payload


# def _num_or_none(v: Any):
#     if v is None:
#         return None
#     try:
#         return float(v)
#     except Exception:
#         return None


# def _coerce_dt(v: Any) -> Optional[datetime]:
#     if not v:
#         return None
#     if isinstance(v, datetime):
#         # treat naive as UTC
#         return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
#     # epoch seconds
#     if isinstance(v, (int, float)):
#         return datetime.fromtimestamp(float(v), tz=timezone.utc)
#     # string
#     s = str(v).strip()
#     for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S.%f%z",
#                 "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
#         try:
#             dt = datetime.strptime(s, fmt)
#             return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
#         except Exception:
#             pass
#     # isoformat fallback
#     try:
#         dt = datetime.fromisoformat(s)
#         return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
#     except Exception:
#         return None


# def _clean_desc(text: Optional[str]) -> Optional[str]:
#     """
#     Very small cleanup: collapse whitespace lines, strip HTML-ish leftovers
#     if scrapers feed HTML/Markdown mixed. Add your sanitizer if needed.
#     """
#     if not text:
#         return None
#     # normalize whitespace
#     lines = [ln.strip() for ln in text.replace("\r", "\n").split("\n")]
#     lines = [ln for ln in lines if ln]
#     return "\n".join(lines)


# def _find_existing(
#     db: Session,
#     *,
#     hash_sim: str,
#     canonical_url: Optional[str],
#     apply_url: Optional[str],
# ) -> Optional[Job]:
#     # Fast path by hash
#     j = db.execute(select(Job).where(Job.hash_sim == hash_sim)).scalar_one_or_none()
#     if j:
#         return j
#     # Also consider canonical/apply URL matches
#     if canonical_url:
#         j = db.execute(select(Job).where(Job.canonical_url == canonical_url)).scalar_one_or_none()
#         if j:
#             return j
#     if apply_url:
#         j = db.execute(select(Job).where(Job.apply_url == apply_url)).scalar_one_or_none()
#         if j:
#             return j
#     return None
