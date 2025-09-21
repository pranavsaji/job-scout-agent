# app/routers/harvest.py
from __future__ import annotations

from typing import List, Dict, Any, Optional
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.harvest import run_harvest

router = APIRouter(prefix="/harvest", tags=["harvest"])

class HarvestRequest(BaseModel):
    # Sources to run; if empty, the service will fall back to env (HARVEST_SOURCES)
    sources: List[str] = Field(default_factory=list, description="e.g. ['greenhouse','ashby','lever']")
    # Flat org list applied to any source lacking an explicit list
    orgs: List[str] = Field(default_factory=list, description="Org slugs applied to sources without per-source lists")
    # Per-source org lists (optional)
    ashby_orgs: List[str] = Field(default_factory=list)
    greenhouse_orgs: List[str] = Field(default_factory=list)
    lever_orgs: List[str] = Field(default_factory=list)
    # Compatibility knobs (accepted by run_harvest)
    max_pages: int = 2
    dry_run: bool = False
    # Extra bag for future options
    extra: Dict[str, Any] = Field(default_factory=dict)

@router.post("/run")
async def harvest_run(payload: HarvestRequest):
    """
    Trigger a harvest run. Any per-source org lists are tunneled via `extra`
    because app.services.harvest.run_harvest(...) expects:
        run_harvest(sources?, orgs?, max_pages?, dry_run?, extra?)
    """
    # Build `extra` with any provided per-source lists, while preserving user-supplied `extra`.
    extra: Dict[str, Any] = dict(payload.extra or {})
    if payload.ashby_orgs:
        extra["ashby_orgs"] = payload.ashby_orgs
    if payload.greenhouse_orgs:
        extra["greenhouse_orgs"] = payload.greenhouse_orgs
    if payload.lever_orgs:
        extra["lever_orgs"] = payload.lever_orgs

    result = await run_harvest(
        sources=(payload.sources or None),
        orgs=(payload.orgs or None),
        max_pages=payload.max_pages,
        dry_run=payload.dry_run,
        extra=extra or None,
    )
    return result
