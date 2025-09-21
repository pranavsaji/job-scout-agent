from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import jobs, analyze, cover_letters
from app.routers.harvest import router as harvest_router
import asyncio
from app.scheduler import start_scheduler
from app.routers import llm 
from app.routers import chat
from app.env import env
from app.routers import parse_resume

app = FastAPI(title="Job Scout Agent")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)
app.include_router(llm.router)
app.include_router(jobs.router)
app.include_router(analyze.router)
app.include_router(cover_letters.router)
app.include_router(harvest_router)
app.include_router(chat.router)
app.include_router(parse_resume.router)

@app.on_event("startup")
async def _startup():
    key = env.get("GROQ_API_KEY")
    masked = "missing" if not key else f"{key[:4]}…{key[-4:]}"
    print(f"[startup] GROQ_API_KEY: {masked}")

@app.on_event("startup")
async def _on_startup():
    loop = asyncio.get_event_loop()
    start_scheduler(loop)

@app.get("/healthz")
def health():
    return {"status": "ok"}
