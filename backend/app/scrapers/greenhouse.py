from __future__ import annotations
import os
from typing import AsyncIterator, Optional, List
from datetime import datetime, timezone, timedelta
from .base import Scraper, HarvestResult, norm_space, parse_iso_dt
from .http import client, get_json

def _boards() -> List[str]:
    # Comma-separated slugs, e.g. "stripe,notion,snowflake,databricks"
    raw = os.getenv("GREENHOUSE_BOARDS", "")
    if raw.strip():
        return [s.strip() for s in raw.split(",") if s.strip()]
    # safer defaults known to be on Greenhouse (adjust as needed)
    return ["stripe", "notion", "databricks", "snowflake"]

class GreenhouseScraper(Scraper):
    name = "greenhouse"

    async def harvest(self, *, query: Optional[str], window_hours: int) -> AsyncIterator[HarvestResult]:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=window_hours)
        async with client() as c:
            for board in _boards():
                url = f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs"
                data = await get_json(c, url, ok_statuses=(200, 404))
                if not data or "jobs" not in data:
                    # 404 or unexpected shape => skip this board
                    continue
                for j in data.get("jobs", []):
                    posted = parse_iso_dt(j.get("updated_at") or j.get("created_at"))
                    if posted and posted < cutoff:
                        continue
                    title = norm_space(j.get("title"))
                    if query and query.lower() not in title.lower():
                        continue
                    jid = j.get("id")
                    detail = await get_json(c, f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs/{jid}", ok_statuses=(200, 404))
                    if not detail:
                        continue
                    desc = detail.get("content") or ""
                    apply_url = detail.get("absolute_url") or j.get("absolute_url")
                    location = (detail.get("location") or {}).get("name")
                    yield HarvestResult({
                        "company": board,
                        "title": title,
                        "location": location,
                        "remote": None,
                        "employment_type": None,
                        "level": None,
                        "posted_at": (posted.isoformat().replace("+00:00","Z") if posted else None),
                        "apply_url": apply_url,
                        "canonical_url": detail.get("absolute_url"),
                        "currency": None,
                        "salary_min": None,
                        "salary_max": None,
                        "salary_period": None,
                        "description_md": desc,
                        "description_raw": None,
                        "source": f"greenhouse:{board}",
                        "meta": {"job_id": jid},
                    })
