# backend/app/routers/jobs.py

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, text, and_
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Job
from app.schemas import JobFilter
from app.services.dedupe import simhash_text
from app.services.jobs import delete_older_than_hours

router = APIRouter(prefix="/jobs", tags=["jobs"])


# ----------------------------
# Request/response helpers
# ----------------------------

class JobCreate(BaseModel):
    source: str = "Manual"
    company: str
    title: str
    location: str | None = None
    remote: str | None = None
    employment_type: str | None = None
    level: str | None = None
    posted_at: datetime
    apply_url: str
    canonical_url: str | None = None
    currency: str | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    salary_period: str | None = None
    description_md: str
    description_raw: str | None = None
    meta: dict | None = None


def _serialize_job(j: Job) -> dict:
    return {
        "id": str(j.id),
        "source": j.source,
        "company": j.company,
        "title": j.title,
        "location": j.location,
        "remote": j.remote,
        "employment_type": j.employment_type,
        "level": j.level,
        "posted_at": (j.posted_at.isoformat() if isinstance(j.posted_at, datetime) else None),
        "apply_url": j.apply_url,
        "canonical_url": j.canonical_url,
        "currency": j.currency,
        "salary_min": float(j.salary_min) if j.salary_min is not None else None,
        "salary_max": float(j.salary_max) if j.salary_max is not None else None,
        "salary_period": j.salary_period,
        "description_md": j.description_md,
        "description_raw": j.description_raw,
        "created_at": (j.created_at.isoformat() if getattr(j, "created_at", None) else None),
    }


# ----------------------------
# Routes
# ----------------------------

@router.post("/ingest")
def ingest_job(payload: JobCreate, db: Session = Depends(get_db)):
    # idempotent insert using a stable fingerprint over content
    h = simhash_text(payload.description_md)
    existing = db.query(Job).filter(Job.hash_sim == h).first()
    if existing:
        return {"id": str(existing.id), "status": "exists"}

    job = Job(
        source=payload.source,
        company=payload.company,
        title=payload.title,
        location=payload.location,
        remote=payload.remote,
        employment_type=payload.employment_type,
        level=payload.level,
        posted_at=payload.posted_at,
        apply_url=payload.apply_url,
        canonical_url=payload.canonical_url or payload.apply_url,
        currency=payload.currency,
        salary_min=payload.salary_min,
        salary_max=payload.salary_max,
        salary_period=payload.salary_period,
        description_md=payload.description_md,
        description_raw=payload.description_raw,
        hash_sim=h,
        meta=payload.meta or {},
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return {"id": str(job.id), "status": "created"}


def _parse_date(d: Optional[str]) -> Optional[datetime]:
    if not d:
        return None
    # Accept YYYY-MM-DD or full ISO8601
    try:
        if len(d) == 10:
            # naive date -> start of day UTC
            return datetime.fromisoformat(d).replace(tzinfo=timezone.utc)
        dt = datetime.fromisoformat(d.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


@router.post("/search")
def search_jobs(
    filter: JobFilter,
    db: Session = Depends(get_db),
    # query-string overrides (so curl/HTTPie/FE can pass them easily)
    date_from: Optional[str] = Query(None, description="ISO date/time or YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="ISO date/time or YYYY-MM-DD"),
    q_limit: Optional[int] = Query(None, ge=1, le=500),
    q_offset: Optional[int] = Query(None, ge=0),
):
    """
    Accepts a JSON body `JobFilter` (q, remote, level, location, posted_within_hours),
    plus optional query params:
      - date_from, date_to: when provided, they override the 24h default and
        we DO NOT apply `posted_within_hours`.
      - q_limit, q_offset: override pagination.

    Results are ordered by posted_at DESC.
    """

    # resolve pagination
    limit = q_limit if q_limit is not None else getattr(filter, "limit", 21) or 21
    offset = q_offset if q_offset is not None else getattr(filter, "offset", 0) or 0
    limit = min(max(limit, 1), 500)

    q = select(Job).order_by(Job.posted_at.desc())

    # if a date range is supplied, apply it and **ignore** posted_within_hours
    df = _parse_date(date_from)
    dt = _parse_date(date_to)
    if df and dt:
        # inclusive range: [df, dt_end]
        # if dt has only a date part, bump to end-of-day
        if dt.hour == 0 and dt.minute == 0 and dt.second == 0 and dt.microsecond == 0:
            dt = dt + timedelta(days=1) - timedelta(microseconds=1)
        q = q.where(and_(Job.posted_at >= df, Job.posted_at <= dt))
    elif df:
        q = q.where(Job.posted_at >= df)
    elif dt:
        q = q.where(Job.posted_at <= dt)
    else:
        # No date range given: respect posted_within_hours if present
        hrs = getattr(filter, "posted_within_hours", None)
        if isinstance(hrs, int) and hrs > 0:
            cutoff = datetime.now(timezone.utc) - timedelta(hours=hrs)
            q = q.where(Job.posted_at >= cutoff)

    # other filters
    if getattr(filter, "remote", None):
        q = q.where(Job.remote == filter.remote)
    if getattr(filter, "level", None):
        q = q.where(Job.level == filter.level)
    if getattr(filter, "location", None):
        q = q.where(Job.location.ilike(f"%{filter.location}%"))
    if getattr(filter, "q", None):
        q = q.where(
            text("(title ILIKE :term OR company ILIKE :term OR description_md ILIKE :term)")
        ).params(term=f"%{filter.q}%")

    rows = db.execute(q.offset(offset).limit(limit)).scalars().all()
    return [_serialize_job(j) for j in rows]


@router.get("/recent")
def recent_jobs(limit: int = 21, db: Session = Depends(get_db)):
    rows = (
        db.query(Job)
        .order_by(Job.posted_at.desc())
        .limit(min(max(limit, 1), 200))
        .all()
    )
    return [_serialize_job(j) for j in rows]


@router.get("/{job_id}")
def get_job(job_id: UUID, db: Session = Depends(get_db)):
    row = db.query(Job).filter(Job.id == job_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="job not found")
    return _serialize_job(row)


# --- Cleanup (manual/admin) ---

@router.delete("/cleanup")
def cleanup_jobs(ttl_hours: int = Query(48, ge=1, le=24 * 30), db: Session = Depends(get_db)):
    """
    Delete jobs with posted_at older than ttl_hours (default 48).
    """
    cutoff = datetime.now(timezone.utc) - timedelta(hours=ttl_hours)
    deleted = (
        db.query(Job)
        .filter(Job.posted_at < cutoff)
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"deleted": int(deleted or 0), "older_than": cutoff.isoformat()}


class CleanupIn(BaseModel):
    ttl_hours: int = 48


@router.post("/cleanup")
async def cleanup_jobs_post(payload: CleanupIn):
    cutoff = datetime.now(timezone.utc) - timedelta(hours=payload.ttl_hours)
    deleted = await delete_older_than_hours(cutoff)
    return {"ok": True, "deleted": deleted, "cutoff": cutoff.isoformat()}

@router.get("/all")
def list_all_jobs(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Job)
          .order_by(Job.posted_at.desc())
          .offset(offset)
          .limit(limit)
          .all()
    )
    return [_serialize_job(j) for j in rows]


