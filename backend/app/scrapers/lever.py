from __future__ import annotations
import os
from typing import AsyncIterator, Optional, List
from datetime import datetime, timezone, timedelta
from .base import Scraper, HarvestResult, norm_space
from .http import client, get_json

def _companies() -> List[str]:
    raw = os.getenv("LEVER_COMPANIES", "")
    if raw.strip():
        return [s.strip() for s in raw.split(",") if s.strip()]
    # try some that commonly work; adjust as needed
    return ["sentry", "zapier", "robinhood", "nylas"]

class LeverScraper(Scraper):
    name = "lever"

    async def harvest(self, *, query: Optional[str], window_hours: int) -> AsyncIterator[HarvestResult]:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=window_hours)
        async with client() as c:
            for company in _companies():
                url = f"https://api.lever.co/v0/postings/{company}?mode=json"
                posts = await get_json(c, url, ok_statuses=(200, 404))
                if not posts or isinstance(posts, dict) and posts.get("ok") is False:
                    continue
                for p in posts or []:
                    ts = p.get("createdAt") or p.get("updatedAt")
                    posted = datetime.fromtimestamp(ts/1000.0, tz=timezone.utc) if ts else None
                    if posted and posted < cutoff:
                        continue
                    title = norm_space(p.get("text") or p.get("title") or "")
                    if query and query.lower() not in title.lower():
                        continue
                    location = p.get("categories", {}).get("location") or ""
                    if isinstance(location, list):
                        location = ", ".join([str(x.get("name", "")) for x in location])
                    apply_url = p.get("applyUrl") or p.get("hostedUrl")
                    desc = p.get("descriptionPlain") or p.get("description") or ""
                    yield HarvestResult({
                        "company": company,
                        "title": title,
                        "location": location,
                        "remote": None,
                        "employment_type": (p.get("categories", {}) or {}).get("commitment"),
                        "level": None,
                        "posted_at": posted.isoformat().replace("+00:00","Z") if posted else None,
                        "apply_url": apply_url,
                        "canonical_url": p.get("hostedUrl"),
                        "currency": None,
                        "salary_min": None,
                        "salary_max": None,
                        "salary_period": None,
                        "description_md": desc,
                        "description_raw": None,
                        "source": f"lever:{company}",
                        "meta": {"job_id": p.get("id")},
                    })
