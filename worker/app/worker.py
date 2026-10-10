"""Polling loop: claim a job, run the pipeline, mark done or failed (with backoff)."""
from __future__ import annotations

import logging
import threading

from .pipeline import Pipeline

log = logging.getLogger("worker.loop")


def run_loop(db, pipeline: Pipeline, stop: threading.Event, poll_seconds: float) -> None:
    log.info("Worker loop started")
    while not stop.is_set():
        try:
            job = db.claim_job()
        except Exception:
            log.exception("Could not claim a job; will retry")
            stop.wait(poll_seconds * 3)
            continue

        if job is None:
            stop.wait(poll_seconds)
            continue

        job_id = job["id"]
        log.info("Claimed job %s (attempt %s)", job_id, job.get("attempts"))
        try:
            needs_review = pipeline.run(job)
            db.complete_job(job_id, needs_review)
        except Exception as exc:  # noqa: BLE001 - any failure is recorded and retried with backoff
            log.exception("Job %s failed", job_id)
            try:
                db.fail_job(job_id, f"{type(exc).__name__}: {exc}")
            except Exception:
                log.exception("Could not record failure for job %s", job_id)
    log.info("Worker loop stopped")
