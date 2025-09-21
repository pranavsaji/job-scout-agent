from __future__ import annotations
import os
from typing import AsyncIterator, Optional, List
from datetime import datetime, timezone, timedelta
from .base import Scraper, HarvestResult, norm_space
from .http import client, get_json

def _orgs() -> List[str]:
    raw = os.getenv("ASHBY_COMPANIES", "")
    if raw.strip():
        return [s.strip() for s in raw.split(",") if s.strip()]
    # add ones you confirm; change as needed
    return ["togetherai", "perplexity", "roblox"]  # may require updates

class AshbyScraper(Scraper):
    name = "ashby"

    async def harvest(self, *, query: Optional[str], window_hours: int) -> AsyncIterator[HarvestResult]:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=window_hours)
        async with client() as c:
            for org in _orgs():
                url = f"https://api.ashbyhq.com/posting-api/job-board/{org}"
                data = await get_json(c, url, ok_statuses=(200, 404))
                if not data or "jobPostings" not in data:
                    continue
                for g in data.get("jobPostings", []):
                    title = norm_space(g.get("title") or "")
                    if query and query.lower() not in title.lower():
                        continue
                    iso = g.get("updatedDate") or g.get("createdDate")
                    posted = None
                    try:
                        posted = datetime.fromisoformat((iso or "").replace("Z","+00:00")).astimezone(timezone.utc) if iso else None
                    except Exception:
                        pass
                    if posted and posted < cutoff:
                        continue
                    apply_url = g.get("applyUrl") or g.get("jobUrl")
                    desc = g.get("descriptionPlain")
                    yield HarvestResult({
                        "company": org,
                        "title": title,
                        "location": g.get("locationName"),
                        "remote": "remote" if g.get("isRemote") else None,
                        "employment_type": g.get("employmentType"),
                        "level": None,
                        "posted_at": posted.isoformat().replace("+00:00","Z") if posted else None,
                        "apply_url": apply_url,
                        "canonical_url": g.get("jobUrl"),
                        "currency": None,
                        "salary_min": None,
                        "salary_max": None,
                        "salary_period": None,
                        "description_md": desc or "",
                        "description_raw": None,
                        "source": f"ashby:{org}",
                        "meta": {"job_id": g.get("id")},
                    })
