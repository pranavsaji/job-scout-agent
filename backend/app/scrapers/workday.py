from __future__ import annotations
from typing import AsyncIterator, Optional
from datetime import datetime, timezone, timedelta
from .base import Scraper, HarvestResult, norm_space
from .http import client, get_json

# Workday is messy—many tenants have a public "fs" endpoint.
# Provide a few known tenants (org, tenant) pairs:
WORKDAY_TENANTS = [
    ("NVIDIA", "nvidia"),
    ("Apple", "apple"),
]

class WorkdayScraper(Scraper):
    name = "workday"

    async def harvest(self, *, query: Optional[str], window_hours: int) -> AsyncIterator[HarvestResult]:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=window_hours)
        async with client() as c:
            for company, tenant in WORKDAY_TENANTS:
                # This "fs" endpoint works for many tenants; adjust per org if needed
                url = f"https://{tenant}.wd3.myworkdayjobs.com/wday/cxs/{tenant}/careers/jobs"
                data = await get_json(c, url)
                for j in data.get("jobPostings", []):
                    title = norm_space(j.get("title") or "")
                    if query and query.lower() not in title.lower():
                        continue
                    # postedDate in ISO8601 like 2025-09-19T00:00:00.000Z
                    iso = j.get("postedOn") or j.get("postedDate")
                    posted = None
                    try:
                        posted = datetime.fromisoformat(iso.replace("Z","+00:00")).astimezone(timezone.utc) if iso else None
                    except Exception:
                        pass
                    if posted and posted < cutoff:
                        continue
                    apply_url = j.get("externalPath") or j.get("externalUrl")
                    if apply_url and not apply_url.startswith("http"):
                        apply_url = f"https://{tenant}.wd3.myworkdayjobs.com{apply_url}"
                    desc = j.get("shortText") or ""
                    yield HarvestResult({
                        "company": company,
                        "title": title,
                        "location": j.get("locationsText"),
                        "remote": None,
                        "employment_type": None,
                        "level": None,
                        "posted_at": posted.isoformat().replace("+00:00","Z") if posted else None,
                        "apply_url": apply_url,
                        "canonical_url": apply_url,
                        "currency": None,
                        "salary_min": None,
                        "salary_max": None,
                        "salary_period": None,
                        "description_md": desc,
                        "description_raw": None,
                        "source": f"workday:{tenant}",
                        "meta": {"job_id": j.get("bulletFields", {}).get("jobId")},
                    })
