# server/routes_parse.py
from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import Literal
import io, re

# Lightweight parsers
from PyPDF2 import PdfReader
from docx import Document  # python-docx
try:
    from unidecode import unidecode  # better ASCII-ization
except Exception:
    unidecode = None

router = APIRouter(prefix="/parse", tags=["parse"])

def _clean_text(text: str) -> str:
    # Normalize unicode → ASCII-ish for ATS friendliness
    if unidecode:
        text = unidecode(text)
    # Collapse control chars & binary noise
    text = re.sub(r"[^\x09\x0A\x0D\x20-\x7E]", " ", text)  # keep tabs/newlines/printables
    # Collapse excessive whitespace
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()

def _read_pdf(file: UploadFile) -> str:
    data = file.file.read()
    try:
        reader = PdfReader(io.BytesIO(data))
        pages = []
        for p in reader.pages:
            pages.append(p.extract_text() or "")
        return "\n\n".join(pages)
    except Exception as e:
        # Fallback: return bytes as text if extraction fails (still cleaned later)
        return data.decode("utf-8", errors="ignore")

def _read_docx(data: bytes) -> str:
    bio = io.BytesIO(data)
    doc = Document(bio)
    return "\n".join(p.text for p in doc.paragraphs)

@router.post("/resume")
async def parse_resume(file: UploadFile = File(...)):
    name = (file.filename or "").lower()

    try:
        if name.endswith(".pdf"):
            raw = _read_pdf(file)
        elif name.endswith(".docx"):
            raw = _read_docx(await file.read())
        elif name.endswith(".txt") or not name:
            raw = (await file.read()).decode("utf-8", errors="ignore")
        else:
            raise HTTPException(status_code=415, detail="Unsupported file type. Upload PDF, DOCX, or TXT.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse: {e}")

    cleaned = _clean_text(raw or "")
    if not cleaned:
        raise HTTPException(status_code=422, detail="No readable text found in document.")

    return {"text": cleaned, "chars": len(cleaned)}
