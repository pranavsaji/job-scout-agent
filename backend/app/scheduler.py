from __future__ import annotations
import os, asyncio, logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from app.services.harvest import harvest_once

log = logging.getLogger("scheduler")

def start_scheduler(loop):
    if os.getenv("HARVEST_ENABLED", "false").lower() not in ("1","true","yes"):
        log.info("harvest disabled")
        return
    cron = os.getenv("HARVEST_INTERVAL_CRON", "*/30 * * * *")  # every 30m
    minute, hour, day, month, dow = cron.split()
    sched = AsyncIOScheduler(event_loop=loop, timezone="UTC")
    sched.add_job(harvest_once, CronTrigger(minute=minute, hour=hour, day=day, month=month, day_of_week=dow))
    sched.start()
    log.info("scheduler started: %s", cron)
