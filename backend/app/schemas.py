from pydantic import BaseModel, Field
from typing import List, Dict, Optional

class JobFilter(BaseModel):
    q: Optional[str] = None
    remote: Optional[str] = None  # remote|hybrid|onsite
    level: Optional[str] = None
    location: Optional[str] = None
    posted_within_hours: int = 24

class AnalyzeReq(BaseModel):
    job_title: str
    company: str
    jd_markdown: str
    resume_markdown: str
    role_keywords: List[str] = Field(default_factory=list)

class AnalyzeResp(BaseModel):
    fit_score: int
    strengths: List[str]
    gaps: List[str]
    ats_keywords: Dict[str, List[str]]
    rationale: str

class LetterReq(BaseModel):
    job_title: str
    company: str
    jd_markdown: str
    resume_markdown: str
    tone: str = "professional"
    variant: str = "standard"  # short|standard|long

class LetterResp(BaseModel):
    letter_markdown: str