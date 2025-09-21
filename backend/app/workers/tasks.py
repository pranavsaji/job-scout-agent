from celery import shared_task
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.db import SessionLocal
from app.models import Job
from app.services.dedupe import simhash_text

@shared_task
def ingest_job(payload: dict):
    """Idempotent insert-or-skip based on simhash + canonical_url."""
    db: Session = SessionLocal()
    try:
        h = simhash_text(payload["description_md"])
        existing = db.query(Job).filter(Job.hash_sim == h).first()
        if existing: return str(existing.id)
        job = Job(**payload, hash_sim=h)
        db.add(job); db.commit()
        return str(job.id)
    finally:
        db.close()
