# backend/app/routers/chat.py
from __future__ import annotations
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Literal, Optional, Dict, Any
import httpx

from app.services.llm_groq import GroqLLM

router = APIRouter(prefix="/chat", tags=["chat"])
_llm = GroqLLM()

class AskIn(BaseModel):
    # Pass the job description (markdown or text) and resume text from the FE
    job_md: str = Field(..., description="Full job description text/markdown")
    resume_md: str = Field(..., description="Parsed resume in text/markdown")
    question: str = Field(..., description="User's question to the bot")

class AskOut(BaseModel):
    answer: str
    score: int
    matches: List[str] = []
    gaps: List[str] = []
    suggestions: List[str] = []

def _system_prompt(job_md: str, resume_md: str) -> str:
    return (
        "You are a concise career copilot. Use ONLY the job description and the candidate resume provided.\n"
        "Requirements:\n"
        "1) Always answer the user's question.\n"
        "2) Compute a fit score from 0-100 (integer) based on the JD vs resume.\n"
        "3) List the top matches (strengths) and top gaps (missing items).\n"
        "4) Provide brief, actionable suggestions to close gaps.\n"
        "Reply strictly as a compact JSON object with keys: "
        '{"answer","score","matches","gaps","suggestions"}.\n'
        "Do not include any other fields, markup, or prose outside JSON."
        "\n\n---\nJOB DESCRIPTION:\n"
        f"{job_md}\n"
        "\n---\nRESUME:\n"
        f"{resume_md}\n"
    )

def _fallback_json(text: str) -> Dict[str, Any]:
    # Extremely defensive: if model returns non-JSON, wrap it.
    return {
        "answer": text.strip(),
        "score": 50,
        "matches": [],
        "gaps": [],
        "suggestions": [],
    }

@router.post("/ask", response_model=AskOut)
async def ask(body: AskIn) -> AskOut:
    if not body.job_md.strip() or not body.resume_md.strip():
        raise HTTPException(400, detail="job_md and resume_md are required")

    sys = {"role": "system", "content": _system_prompt(body.job_md, body.resume_md)}
    user = {"role": "user", "content": body.question.strip()}

    try:
        # Ask the model for strict JSON. (OpenAI-compatible flag is supported by Groq.)
        reply_text = await _llm.chat(
            [sys, user],
            temperature=0.2,
            response_format={"type": "json_object"},  # ask for JSON
        )
    except httpx.HTTPStatusError as e:
        status = e.response.status_code if e.response is not None else 500
        text = e.response.text if e.response is not None else str(e)
        raise HTTPException(500, detail=f"Groq error {status}: {text}")
    except Exception as e:
        raise HTTPException(500, detail=str(e))

    # Parse JSON safely
    import json
    try:
        data = json.loads(reply_text)
        # normalize/validate
        answer = str(data.get("answer", "")).strip()
        score = int(data.get("score", 0))
        matches = [str(x) for x in (data.get("matches") or [])][:10]
        gaps = [str(x) for x in (data.get("gaps") or [])][:10]
        suggestions = [str(x) for x in (data.get("suggestions") or [])][:10]
        if not answer:
            # edge case: JSON but empty answer
            answer = "I analyzed the JD and resume and computed a fit score."
        # clamp score
        score = max(0, min(100, score))
        return AskOut(answer=answer, score=score, matches=matches, gaps=gaps, suggestions=suggestions)
    except Exception:
        f = _fallback_json(reply_text)
        return AskOut(**f)
