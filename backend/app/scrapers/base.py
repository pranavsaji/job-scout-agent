from __future__ import annotations
from typing import AsyncIterator, Dict, List, Optional
from datetime import datetime, timezone
import abc
import re

def norm_space(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())

def parse_iso_dt(s: str) -> Optional[datetime]:
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return dt.astimezone(timezone.utc)
    except Exception:
        return None

class HarvestResult(Dict):
    """Fields must match IngestJob schema keys."""
    pass

class Scraper(abc.ABC):
    name: str

    @abc.abstractmethod
    async def harvest(self, *, query: Optional[str], window_hours: int) -> AsyncIterator[HarvestResult]:
        ...
