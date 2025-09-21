# backend/app/routers/cover_letters.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.cover_letter import draft_letter

router = APIRouter(prefix="/cover-letter", tags=["cover-letter"])

class CoverLetterRequest(BaseModel):
    job_title: str
    company: str
    resume_md: str
    job_desc: str
    variant: str | None = "standard"

@router.post("")
async def generate(req: CoverLetterRequest):
    try:
        letter = await draft_letter(
            job_title=req.job_title,
            company=req.company,
            resume_md=req.resume_md,
            job_desc=req.job_desc,
            variant=req.variant or "standard",
        )
        return {"letter": letter}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
