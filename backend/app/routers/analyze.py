# app/routers/analyze.py (add this alongside /analyze and /cover_letters)
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import Job
from app.config import settings

router = APIRouter(tags=["analyze"])

class QARequest(BaseModel):
    job_id: str
    question: str
    resume_text: str | None = None

@router.post("/qa")
def qa(req: QARequest, db: Session = Depends(get_db)):
    job = db.query(Job).filter_by(id=req.job_id).first()
    if not job:
        raise HTTPException(404, "job not found")
    if not settings.groq_api_key:
        raise HTTPException(400, "GROQ_API_KEY not configured")

    # very small prompt; swap with your prompt lib if you have one
    from groq import Groq
    client = Groq(api_key=settings.groq_api_key)
    system = "You are a helpful assistant that answers questions about a job description."
    user = f"""JOB TITLE: {job.title}
COMPANY: {job.company}
LOCATION: {job.location or 'N/A'}

JOB DESCRIPTION (Markdown/HTML):
{job.description_md}

RESUME (optional):
{req.resume_text or '(none)'}

QUESTION:
{req.question}
"""
    resp = client.chat.completions.create(
        model=settings.groq_model,
        messages=[{"role":"system","content":system},{"role":"user","content":user}],
        temperature=0.2,
    )
    return {"answer": resp.choices[0].message.content.strip()}
