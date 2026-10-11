"""FastAPI app: health endpoints plus the background worker loop.

Run locally:   uvicorn app.main:app --port 8000
Docker/HF:     see Dockerfile (port 7860)
"""
from __future__ import annotations

import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException

from .config import get_settings
from .db import Database
from .llm import build_gateway
from .pipeline import Pipeline
from .worker import run_loop

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("worker.main")

state: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    cfg = get_settings()
    db = Database(cfg)
    pipeline = Pipeline(db, build_gateway(cfg), cfg)
    stop = threading.Event()
    state.update(db=db, stop=stop, cfg=cfg)
    threads = []
    if cfg.run_loop:
        for i in range(max(1, cfg.worker_concurrency)):
            t = threading.Thread(target=run_loop, args=(db, pipeline, stop, cfg.poll_interval_seconds),
                                 name=f"worker-loop-{i}", daemon=True)
            t.start()
            threads.append(t)
    yield
    stop.set()
    for t in threads:
        t.join(timeout=10)


app = FastAPI(title="Ideas Portal worker", lifespan=lifespan)


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/stats")
def stats(x_admin_token: str = Header(default="")):
    cfg = state["cfg"]
    if not cfg.worker_admin_token or x_admin_token != cfg.worker_admin_token:
        raise HTTPException(status_code=404)
    return {"queue": state["db"].queue_stats(), "model": cfg.gemini_model}
