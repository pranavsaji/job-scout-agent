from __future__ import annotations
import asyncio, os
from fastapi import APIRouter, BackgroundTasks
from app.services.harvest import harvest_once

router = APIRouter(prefix="/harvest", tags=["harvest"])

@router.post("/run")
async def run_harvest(background: BackgroundTasks, sync: bool = False):
    if os.getenv("HARVEST_ENABLED", "false").lower() not in ("1","true","yes"):
        return {"ok": False, "msg": "HARVEST_ENABLED=false"}
    if sync:
        return await harvest_once()
    # fire-and-forget
    loop = asyncio.get_event_loop()
    loop.create_task(harvest_once())
    return {"ok": True, "msg": "started"}
