import json
from pathlib import Path
from app.services.llm_groq import chat

# Load JSON prompt from file
PROMPTS_DIR = Path(__file__).resolve().parents[1] / "prompts"
ANALYZE_JSON = PROMPTS_DIR / "analyze.json"

with ANALYZE_JSON.open("r", encoding="utf-8") as f:
    data = json.load(f)

SYSTEM = data["system"]
USER_TEMPLATE = data["user_template"]

def analyze_fit(job_title: str, company: str, jd: str, resume: str, keywords: list[str]):
    user = USER_TEMPLATE.format(
        job_title=job_title,
        company=company,
        jd=jd,
        resume=resume,
        keywords=", ".join(keywords) if keywords else "none",
    )
    out = chat(
        [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": user},
        ],
        temperature=0.2,
        json_mode=True,
    )
    return json.loads(out)
