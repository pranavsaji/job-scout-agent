# backend/app/services/llm_groq.py
from __future__ import annotations
import os
from typing import List, Dict, Any, Tuple, Optional

import httpx

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
_API_URL = "https://api.groq.com/openai/v1/chat/completions"

MAX_TOTAL_CHARS = 80_000
MIN_TOTAL_CHARS = 8_000
MAX_TOKENS = 1024

def _as_dict(msg: Any) -> Dict[str, str]:
    if isinstance(msg, dict):
        return {"role": str(msg.get("role", "user")), "content": str(msg.get("content", ""))}
    if hasattr(msg, "model_dump"):
        d = msg.model_dump()
        return {"role": str(d.get("role", "user")), "content": str(d.get("content", ""))}
    return {"role": str(getattr(msg, "role", "user")), "content": str(getattr(msg, "content", ""))}

def _normalize_messages(messages: List[Any]) -> List[Dict[str, str]]:
    return [_as_dict(m) for m in messages]

def _len_msgs(messages: List[Dict[str, str]]) -> int:
    return sum(len(m.get("content", "")) for m in messages)

def _shrink_text(s: str, keep: int) -> str:
    if len(s) <= keep:
        return s
    head = keep // 2
    tail = keep - head
    return s[:head] + "\n...\n[TRIMMED]\n...\n" + s[-tail:]

def _shrink_messages(messages: List[Dict[str, str]], budget: int) -> Tuple[List[Dict[str, str]], bool]:
    total = _len_msgs(messages)
    if total <= budget:
        return messages, False
    sizes = [len(m.get("content", "")) for m in messages]
    total_sizes = sum(sizes) or 1
    per_budget = [max(500, (sizes[i] * budget) // total_sizes) for i in range(len(messages))]
    new_msgs: List[Dict[str, str]] = []
    for i, msg in enumerate(messages):
        content = msg.get("content", "")
        keep_n = per_budget[i]
        new_msgs.append({"role": msg.get("role", "user"), "content": _shrink_text(content, keep_n)})
    while _len_msgs(new_msgs) > budget:
        i = max(range(len(new_msgs)), key=lambda k: len(new_msgs[k].get("content", "")))
        c = new_msgs[i].get("content", "")
        if len(c) <= 1000:
            break
        new_msgs[i]["content"] = _shrink_text(c, len(c) - 1000)
    return new_msgs, True

class GroqLLM:
    def __init__(self):
        if not GROQ_API_KEY:
            raise RuntimeError("GROQ_API_KEY not set")
        self._headers = {
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json",
        }

    async def chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.2,
        response_format: Optional[Dict[str, str]] = None,
    ) -> str:
        msgs = _normalize_messages(messages)
        total = _len_msgs(msgs)
        if total > MAX_TOTAL_CHARS:
            msgs, _ = _shrink_messages(msgs, MAX_TOTAL_CHARS)

        payload: Dict[str, Any] = {
            "model": GROQ_MODEL,
            "temperature": temperature,
            "messages": msgs,
            "stream": False,
            "max_tokens": MAX_TOKENS,
        }
        if response_format:
            payload["response_format"] = response_format  # OpenAI-compatible

        async with httpx.AsyncClient(timeout=90) as c:
            r = await c.post(_API_URL, headers=self._headers, json=payload)
            if r.status_code == 413:
                tighter_msgs, _ = _shrink_messages(_normalize_messages(messages), MIN_TOTAL_CHARS)
                tighter_payload = dict(payload, messages=tighter_msgs)
                r = await c.post(_API_URL, headers=self._headers, json=tighter_payload)
            r.raise_for_status()
            data = r.json()
            return data["choices"][0]["message"]["content"]
