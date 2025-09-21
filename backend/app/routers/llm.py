# backend/app/routers/llm.py
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

class AnalyzeIn(BaseModel):
    job_id: str
    resume_text: str

class CoverIn(BaseModel):
    job_id: str
    resume_text: str
    variant: str | None = "standard"
    tone: str | None = None

class ChatIn(BaseModel):
    job_id: str
    resume_text: str
    question: str

@router.post("/analyze")
def analyze(body: AnalyzeIn):
    # TODO: call your model here
    return {
        "fit_score": 72,
        "strengths": ["Python", "LLM apps", "Data pipelines"],
        "gaps": ["Distributed systems at scale"],
        "ats_keywords": ["ML", "inference", "microservices"],
        "rationale": "Solid overlap with job requirements; missing deep infra expertise.",
    }

@router.post("/cover_letters")
def cover(body: CoverIn):
    # TODO: call your model here
    return {
        "letter_md": f"""Dear Hiring Team,

I’m excited to apply for this role. My background in ML apps and backend engineering aligns well with your needs…

Best,
You"""
    }

@router.post("/chat")
def chat(body: ChatIn):
    # TODO: call your model here
    return { "answer": f"(stub) Q: {body.question}\nGiven your resume, you’d be a strong fit for the modeling portions." }
