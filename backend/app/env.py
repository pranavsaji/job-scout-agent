# backend/app/env.py
from __future__ import annotations

from pathlib import Path
from os import environ as env
from dotenv import load_dotenv, find_dotenv

# Try CWD→parents; if that fails, try repo-root/.env (…/backend/../.env)
dotenv_path = find_dotenv(usecwd=True)
if not dotenv_path:
    repo_root = Path(__file__).resolve().parents[1].parent  # backend/ -> repo root
    candidate = repo_root / ".env"
    dotenv_path = str(candidate) if candidate.exists() else ""

# Load only once; do NOT override real environment
load_dotenv(dotenv_path or None, override=False)

# tiny helper to check quickly in logs
def _mask(val: str | None) -> str:
    if not val:
        return "<missing>"
    if len(val) <= 8:
        return "********"
    return f"{val[:4]}…{val[-4:]}"

# Optional: debug at import (comment out if you don’t want it)
try:
    _dbg = env.get("GROQ_API_KEY")
    print(
        f"[env] .env loaded from: {dotenv_path or '<none>'} | GROQ_API_KEY: {_mask(_dbg)}"
    )
except Exception:
    pass

__all__ = ["env"]
