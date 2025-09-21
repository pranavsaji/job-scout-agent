# Compatibility shim so legacy imports keep working.
# Delegates to the new GroqLLM implementation.

from typing import List, Dict
from app.services.llm_groq import GroqLLM

_llm = GroqLLM()

# legacy name used elsewhere
async def chat(messages: List[Dict[str, str]], temperature: float = 0.2) -> str:
    return await _llm.chat(messages, temperature=temperature)
