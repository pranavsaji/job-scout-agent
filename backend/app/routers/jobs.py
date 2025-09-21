# backend/app/routers/jobs.py

from datetime import datetime, timezone, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Job
from app.schemas import JobFilter
from app.services.dedupe import simhash_text
from fastapi import Query
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
        "created_at": None,  # add to model if you store it
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


@router.post("/search")
def search_jobs(filter: JobFilter, db: Session = Depends(get_db)):
    """
    Accepts JobFilter (q, remote, level, location, posted_within_hours).
    Extra keys like {limit, offset} in the JSON body are ignored by Pydantic,
    so we pull them manually from request state if present (or default).
    """
    # Defaults that match your UI
    limit = getattr(filter, "limit", 21) if hasattr(filter, "limit") else 21
    offset = getattr(filter, "offset", 0) if hasattr(filter, "offset") else 0

    q = select(Job).order_by(Job.posted_at.desc())

    # Posted within window (defaults to 24h)

    hrs = getattr(filter, "posted_within_hours", None)
    if isinstance(hrs, int) and hrs > 0:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hrs)
        q = q.where(Job.posted_at >= cutoff)

    if filter.remote:
        q = q.where(Job.remote == filter.remote)
    if filter.level:
        q = q.where(Job.level == filter.level)
    if filter.location:
        q = q.where(Job.location.ilike(f"%{filter.location}%"))
    if filter.q:
        # search in title, company, and description for a nicer UX
        q = q.where(
            text(
                "(title ILIKE :term OR company ILIKE :term OR description_md ILIKE :term)"
            )
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
@router.delete("/cleanup")
def cleanup_jobs(ttl_hours: int = Query(48, ge=1, le=24*30), db: Session = Depends(get_db)):
    """
    Delete jobs with posted_at older than ttl_hours (default 48).
    """
    from datetime import datetime, timezone, timedelta
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
async def cleanup_jobs(payload: CleanupIn):
  cutoff = datetime.now(timezone.utc) - timedelta(hours=payload.ttl_hours)
  deleted = await delete_older_than_hours(cutoff)
  return {"ok": True, "deleted": deleted, "cutoff": cutoff.isoformat()}
