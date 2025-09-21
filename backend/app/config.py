# config.py
import os
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()  # <-- add this line

class Settings(BaseModel):
    env: str = os.getenv("ENV", "dev")
    database_url: str = os.getenv("DATABASE_URL")
    redis_url: str = os.getenv("REDIS_URL")
    groq_api_key: str = os.getenv("GROQ_API_KEY")
    groq_model: str = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    tz: str = os.getenv("TZ", "America/Los_Angeles")
    disable_embeddings: bool = os.getenv("DISABLE_EMBEDDINGS", "false").lower() in ("1", "true", "yes")

settings = Settings()


# Optional: fail fast with a clearer message
missing = [k for k,v in {
    "DATABASE_URL": settings.database_url,
    "REDIS_URL": settings.redis_url,
    "GROQ_API_KEY": settings.groq_api_key
}.items() if not v]
if missing:
    raise RuntimeError(f"Missing required env(s): {', '.join(missing)}")
