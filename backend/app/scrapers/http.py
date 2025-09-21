from __future__ import annotations
import os, asyncio, logging
import httpx

log = logging.getLogger("scraper-http")

_TIMEOUT = float(os.getenv("HARVEST_TIMEOUT_SECS", "20"))
_PROXY = os.getenv("HARVEST_PROXY") or None
_LIMIT = int(os.getenv("HARVEST_MAX_CONCURRENCY", "6"))

_sem = asyncio.Semaphore(_LIMIT)

# Detect HTTP/2 support
try:
    import h2  # type: ignore
    _HTTP2 = True
except Exception:
    _HTTP2 = False

def client() -> httpx.AsyncClient:
    common = dict(
        timeout=_TIMEOUT,
        http2=_HTTP2,
        headers={"user-agent": "job-scout-agent/1.0 (+github.com/you)"},
        follow_redirects=True,
    )
    if _PROXY:
        return httpx.AsyncClient(proxies=_PROXY, **common)
    return httpx.AsyncClient(**common)

async def get_json(c: httpx.AsyncClient, url: str, ok_statuses=(200,)) -> dict:
    async with _sem:
        try:
            r = await c.get(url)
            if r.status_code not in ok_statuses:
                log.info("GET %s -> %s; tolerated=%s", url, r.status_code, ok_statuses)
                return {}
            return r.json()
        except Exception as e:
            log.warning("GET JSON failed %s: %s", url, e)
            return {}

async def get_text(c: httpx.AsyncClient, url: str, ok_statuses=(200,)) -> str:
    async with _sem:
        try:
            r = await c.get(url)
            if r.status_code not in ok_statuses:
                log.info("GET %s -> %s; tolerated=%s", url, r.status_code, ok_statuses)
                return ""
            return r.text
        except Exception as e:
            log.warning("GET TEXT failed %s: %s", url, e)
            return ""
