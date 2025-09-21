# app/services/harvest.py
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import re
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import Job
from app.services.embeddings import upsert_job_embeddings
from app.scrapers.base import Scraper
from app.scrapers.greenhouse import GreenhouseScraper
from app.scrapers.lever import LeverScraper
from app.scrapers.ashby import AshbyScraper
from app.scrapers.workday import WorkdayScraper

log = logging.getLogger("harvest")

# ------------------------
# small shared utilities
# ------------------------

_ws_re = re.compile(r"\s+", re.MULTILINE)

def _norm_text(s: Optional[str]) -> str:
    return _ws_re.sub(" ", (s or "").strip().lower())

def _stable_simhash_from_dict(d: Dict[str, Any]) -> str:
    """
    Stable SHA1 fingerprint over salient fields; matches the router's idea
    (company/title/apply_url/description).
    """
    parts = [
        _norm_text(d.get("company")),
        _norm_text(d.get("title")),
        _norm_text(str(d.get("apply_url"))),
        _norm_text(d.get("description_md"))[:2000],
    ]
    return hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()

def _parse_posted_at(iso: Optional[str]) -> datetime:
    if not iso:
        return datetime.now(timezone.utc)
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(timezone.utc)
    except Exception:
        return datetime.now(timezone.utc)

# ------------------------
# scraper registry & config
# ------------------------

def _enabled_sources() -> List[str]:
    raw = os.getenv("HARVEST_SOURCES", "greenhouse,lever,ashby,workday")
    return [s.strip() for s in raw.split(",") if s.strip()]

def _window_hours() -> int:
    return int(os.getenv("HARVEST_WINDOW_HOURS", "24"))

def _query() -> Optional[str]:
    return os.getenv("HARVEST_QUERY") or None

def _scrapers() -> List[Scraper]:
    mapper = {
        "greenhouse": GreenhouseScraper(),
        "lever":      LeverScraper(),
        "ashby":      AshbyScraper(),
        "workday":    WorkdayScraper(),
    }
    return [mapper[s] for s in _enabled_sources() if s in mapper]

# ------------------------
# DB upsert
# ------------------------

def _ingest_one(db: Session, payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Mirrors the /jobs/ingest logic but kept local to avoid import cycles with the router.
    """
    h = _stable_simhash_from_dict(payload)
    existing = db.query(Job).filter(Job.hash_sim == h).first()
    if existing:
        return {"id": str(existing.id), "status": "exists"}

    posted_at = payload.get("posted_at")
    posted_at_dt = _parse_posted_at(posted_at) if isinstance(posted_at, str) else posted_at

    j = Job(
        # id is DB-generated if your model uses server_default; otherwise supply here
        source          = payload.get("source") or "harvest",
        company         = payload["company"],
        title           = payload["title"],
        location        = payload.get("location"),
        remote          = payload.get("remote"),
        employment_type = payload.get("employment_type"),
        level           = payload.get("level"),
        posted_at       = posted_at_dt or datetime.now(timezone.utc),
        apply_url       = str(payload["apply_url"]),
        canonical_url   = str(payload.get("canonical_url")) if payload.get("canonical_url") else None,
        currency        = payload.get("currency"),
        salary_min      = payload.get("salary_min"),
        salary_max      = payload.get("salary_max"),
        salary_period   = payload.get("salary_period"),
        description_md  = payload.get("description_md") or "",
        description_raw = payload.get("description_raw"),
        hash_sim        = h,
        meta            = payload.get("meta") or {},
    )
    db.add(j)
    db.commit()
    # best-effort embeddings (no-op when disabled)
    try:
        upsert_job_embeddings(db, str(j.id), j.title, j.description_md or "")
    except Exception:
        pass
    return {"id": str(j.id), "status": "created"}

# ------------------------
# Harvest orchestration
# ------------------------

async def _run_one(scraper: Scraper, *, window_hours: int, query: Optional[str], db: Session, stats: Dict[str, Any]):
    created = exists = failed = 0
    try:
        async for item in scraper.harvest(query=query, window_hours=window_hours):
            try:
                res = _ingest_one(db, item)
                if res["status"] == "created":
                    created += 1
                else:
                    exists += 1
            except Exception as e:
                failed += 1
                log.warning("harvest ingest failed [%s]: %s", scraper.name, e)
    except Exception as e:
        failed += 1
        log.exception("scraper %s exploded: %s", scraper.name, e)
    stats[scraper.name] = {"created": created, "exists": exists, "failed": failed}

async def harvest_once() -> Dict[str, Any]:
    scrapers = _scrapers()
    if not scrapers:
        return {"ok": True, "stats": {}, "msg": "no scrapers enabled"}
    q = _query()
    window = _window_hours()
    stats: Dict[str, Any] = {}

    db: Session = SessionLocal()
    try:
        tasks = [ _run_one(s, window_hours=window, query=q, db=db, stats=stats) for s in scrapers ]
        await asyncio.gather(*tasks)
    finally:
        db.close()
    return {"ok": True, "stats": stats}
