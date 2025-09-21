# backend/app/services/jobs.py
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple

from sqlalchemy.orm import Session
from sqlalchemy import select

from app.models import Job
from app.services.dedupe import simhash_text
from app.services.cleanup import cleanup_old_jobs  # existing module does the heavy lifting


# -----------------------------
# Public API
# -----------------------------

def upsert_jobs(db: Session, items: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Normalize + idempotently insert jobs.
    De-dupes by: simhash(description_md) OR canonical_url OR apply_url.

    Returns stats:
      {
        "seen": int,
        "inserted": int,
        "skipped_dupe": int,
        "errors": int,
        "ids": [uuid...]
      }
    """
    stats = {"seen": 0, "inserted": 0, "skipped_dupe": 0, "errors": 0, "ids": []}
    for raw in items:
        stats["seen"] += 1
        try:
            payload = _normalize(raw)
            if not payload:
                stats["errors"] += 1
                continue

            # Compute simhash on normalized description
            payload["hash_sim"] = simhash_text(payload["description_md"])

            # De-dupe checks
            existing = _find_existing(
                db,
                hash_sim=payload["hash_sim"],
                canonical_url=payload.get("canonical_url"),
                apply_url=payload.get("apply_url"),
            )
            if existing:
                stats["skipped_dupe"] += 1
                continue

            job = Job(**payload)
            db.add(job)
            db.commit()
            db.refresh(job)
            stats["ids"].append(str(job.id))
            stats["inserted"] += 1

            # Optional: embed/index here if you have a function available.
            # try:
            #     upsert_job_embeddings(db, job)  # plug your vector/keyword indexer
            # except Exception:
            #     pass

        except Exception:
            db.rollback()
            stats["errors"] += 1

    return stats


def delete_older_than_hours(hours: int = 48) -> int:
    """
    Thin wrapper so callers can import from a single place.
    Uses app.services.cleanup.cleanup_old_jobs underneath.
    Returns deleted row count.
    """
    return cleanup_old_jobs(hours)


# -----------------------------
# Internals
# -----------------------------

REQUIRED_STR_FIELDS = ("source", "company", "title", "apply_url", "description_md")

def _normalize(raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Convert a raw job dict from scrapers into a Job(**payload) compatible dict.

    Expected/accepted incoming keys (best effort):
        source, company, title, location, remote, employment_type, level,
        posted_at, apply_url, canonical_url, currency, salary_min, salary_max,
        salary_period, description_md, description_raw, meta
    """
    if not isinstance(raw, dict):
        return None

    # Trim + coerce strings
    def _s(v: Any) -> Optional[str]:
        if v is None:
            return None
        v = str(v).strip()
        return v or None

    payload: Dict[str, Any] = {
        "source": _s(raw.get("source")),
        "company": _s(raw.get("company")),
        "title": _s(raw.get("title")),
        "location": _s(raw.get("location")),
        "remote": _s(raw.get("remote")),
        "employment_type": _s(raw.get("employment_type")),
        "level": _s(raw.get("level")),
        "apply_url": _s(raw.get("apply_url")),
        "canonical_url": _s(raw.get("canonical_url")),
        "currency": _s(raw.get("currency")),
        "salary_min": _num_or_none(raw.get("salary_min")),
        "salary_max": _num_or_none(raw.get("salary_max")),
        "salary_period": _s(raw.get("salary_period")),
        "description_md": _clean_desc(_s(raw.get("description_md")) or _s(raw.get("description"))),
        "description_raw": _s(raw.get("description_raw")),
        "meta": raw.get("meta") if isinstance(raw.get("meta"), dict) else None,
    }

    # Validate requireds
    for k in REQUIRED_STR_FIELDS:
        if not payload.get(k):
            return None

    # posted_at: accept str/iso, int(ts), or datetime; default to now(UTC) if absent
    payload["posted_at"] = _coerce_dt(raw.get("posted_at")) or datetime.now(timezone.utc)

    return payload


def _num_or_none(v: Any):
    if v is None:
        return None
    try:
        return float(v)
    except Exception:
        return None


def _coerce_dt(v: Any) -> Optional[datetime]:
    if not v:
        return None
    if isinstance(v, datetime):
        # treat naive as UTC
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    # epoch seconds
    if isinstance(v, (int, float)):
        return datetime.fromtimestamp(float(v), tz=timezone.utc)
    # string
    s = str(v).strip()
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S.%f%z",
                "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            dt = datetime.strptime(s, fmt)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception:
            pass
    # isoformat fallback
    try:
        dt = datetime.fromisoformat(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _clean_desc(text: Optional[str]) -> Optional[str]:
    """
    Very small cleanup: collapse whitespace lines, strip HTML-ish leftovers
    if scrapers feed HTML/Markdown mixed. Add your sanitizer if needed.
    """
    if not text:
        return None
    # normalize whitespace
    lines = [ln.strip() for ln in text.replace("\r", "\n").split("\n")]
    lines = [ln for ln in lines if ln]
    return "\n".join(lines)


def _find_existing(
    db: Session,
    *,
    hash_sim: str,
    canonical_url: Optional[str],
    apply_url: Optional[str],
) -> Optional[Job]:
    # Fast path by hash
    j = db.execute(select(Job).where(Job.hash_sim == hash_sim)).scalar_one_or_none()
    if j:
        return j
    # Also consider canonical/apply URL matches
    if canonical_url:
        j = db.execute(select(Job).where(Job.canonical_url == canonical_url)).scalar_one_or_none()
        if j:
            return j
    if apply_url:
        j = db.execute(select(Job).where(Job.apply_url == apply_url)).scalar_one_or_none()
        if j:
            return j
    return None
