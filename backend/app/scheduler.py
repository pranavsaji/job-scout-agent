# app/scheduler.py
from __future__ import annotations

import os
import asyncio
import logging
from typing import List, Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.db import SessionLocal
from app.services.harvest import harvest_once
from app.services.cleanup import cleanup_old_jobs

log = logging.getLogger("scheduler")

def _env_bool(name: str, default: str = "false") -> bool:
    return (os.getenv(name, default) or "").lower() in ("1", "true", "yes", "y", "on")

def _env_list(name: str, default: str = "") -> List[str]:
    raw = os.getenv(name, default) or ""
    return [s.strip() for s in raw.split(",") if s.strip()]

def _parse_cron(expr: str) -> CronTrigger:
    """
    Accepts standard 5-field cron: 'min hour day month dow'
    """
    minute, hour, day, month, dow = expr.split()
    return CronTrigger(minute=minute, hour=hour, day=day, month=month, day_of_week=dow, timezone="UTC")

def _harvest_sync():
    """
    Runs a single harvest sweep, reading ALL parameters from env.
    """
    sources = _env_list("HARVEST_SOURCES")  # e.g. "ashby,greenhouse"
    ashby_orgs = _env_list("ASHBY_ORGS")  # e.g. "roblox,togetherai"
    greenhouse_orgs = _env_list("GREENHOUSE_ORGS")  # e.g. "databricks,snowflake"

    with SessionLocal() as db:
        try:
            res = harvest_once(
                db=db,
                sources=sources or None,                # None => harvest_once will also fall back to env
                ashby_orgs=ashby_orgs or None,
                greenhouse_orgs=greenhouse_orgs or None,
            )
            log.info("Harvest completed: %s", res)
        except Exception:
            log.exception("Harvest run failed")

def _cleanup_sync():
    ttl_hours = int(os.getenv("JOB_TTL_HOURS", "48"))  # default 2 days
    try:
        deleted = cleanup_old_jobs(ttl_hours)
        log.info("Cleanup completed: deleted=%s (ttl=%sh)", deleted, ttl_hours)
    except Exception:
        log.exception("Cleanup run failed")

async def _harvest_async():
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _harvest_sync)

async def _cleanup_async():
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _cleanup_sync)

def start_scheduler(loop):
    """
    Bootstraps AsyncIOScheduler using CRON from env.
    Pulls sources/orgs/ttl entirely from env variables:
      HARVEST_ENABLED=true|false
      HARVEST_INTERVAL_CRON="*/30 * * * *"
      HARVEST_SOURCES="ashby,greenhouse"
      ASHBY_ORGS="roblox,togetherai"
      GREENHOUSE_ORGS="databricks,snowflake"
      CLEANUP_INTERVAL_CRON="0 * * * *"
      JOB_TTL_HOURS="48"
    """
    sched = AsyncIOScheduler(event_loop=loop, timezone="UTC")

    # Harvest job
    if _env_bool("HARVEST_ENABLED", "false"):
        cron = os.getenv("HARVEST_INTERVAL_CRON", "*/30 * * * *")  # every 30 minutes by default
        sched.add_job(_harvest_async, _parse_cron(cron))
        log.info("Harvest scheduled: %s", cron)
    else:
        log.info("Harvest disabled via HARVEST_ENABLED")

    # Cleanup job
    cleanup_cron = os.getenv("CLEANUP_INTERVAL_CRON", "0 * * * *")  # top of every hour by default
    sched.add_job(_cleanup_async, _parse_cron(cleanup_cron))
    log.info(
        "Cleanup scheduled: %s (ttl=%sh)",
        cleanup_cron,
        os.getenv("JOB_TTL_HOURS", "48"),
    )

    sched.start()
    log.info("Scheduler started")

# from __future__ import annotations
# import os, asyncio, logging
# from apscheduler.schedulers.asyncio import AsyncIOScheduler
# from apscheduler.triggers.cron import CronTrigger
# from app.services.harvest import harvest_once
# from app.services.cleanup import cleanup_old_jobs

# log = logging.getLogger("scheduler")

# def start_scheduler(loop):
#     if os.getenv("HARVEST_ENABLED", "false").lower() not in ("1","true","yes"):
#         log.info("harvest disabled")
#         return
#     cron = os.getenv("HARVEST_INTERVAL_CRON", "*/30 * * * *")  # every 30m
#     minute, hour, day, month, dow = cron.split()
#     sched = AsyncIOScheduler(event_loop=loop, timezone="UTC")
#     sched.add_job(harvest_once, CronTrigger(minute=minute, hour=hour, day=day, month=month, day_of_week=dow))
#     sched.start()
#     log.info("scheduler started: %s", cron)
#     cleanup_cron = os.getenv("CLEANUP_INTERVAL_CRON", "0 * * * *")  # top of every hour
#     ttl_hours = int(os.getenv("JOB_TTL_HOURS", "48"))
#     cm, ch, cd, cmo, cdow = cleanup_cron.split()
#     sched.add_job(lambda: cleanup_old_jobs(ttl_hours),
#                   CronTrigger(minute=cm, hour=ch, day=cd, month=cmo, day_of_week=cdow))
#     log.info("cleanup scheduled: %s (ttl=%sh)", cleanup_cron, ttl_hours)
