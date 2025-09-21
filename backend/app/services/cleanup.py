from __future__ import annotations
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.db import SessionLocal
from app.models import Job

def cleanup_old_jobs(ttl_hours: int = 48) -> int:
    """
    Delete jobs whose posted_at is older than ttl_hours.
    Returns number of rows deleted.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(hours=ttl_hours)
    db: Session = SessionLocal()
    try:
        deleted = (
            db.query(Job)
              .filter(Job.posted_at < cutoff)
              .delete(synchronize_session=False)
        )
        db.commit()
        return int(deleted or 0)
    finally:
        db.close()
