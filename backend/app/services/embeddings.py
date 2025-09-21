from app.config import settings

def embeddings_enabled() -> bool:
    return not settings.disable_embeddings

def ensure_embeddings_table(db) -> None:
    # no-op when disabled
    return

def upsert_job_embeddings(db, job_id: str, title: str, description: str) -> None:
    if not embeddings_enabled():
        return
    # If/when you enable pgvector, put the insertion code here.
    return

def similarity_search(db, query: str, limit: int = 20):
    if not embeddings_enabled():
        # Fallback: very simple text search when vectors are off
        from sqlalchemy import or_
        from app.models import Job
        q = f"%{query.lower()}%"
        return (
            db.query(Job)
              .filter(or_(Job.title.ilike(q), Job.company.ilike(q), Job.description_md.ilike(q)))
              .order_by(Job.posted_at.desc())
              .limit(limit)
              .all()
        )
    # When enabled, do a vector search here.
    return []
