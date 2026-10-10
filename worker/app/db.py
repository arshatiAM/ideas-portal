"""Database and storage access (Supabase, using the service role key)."""
from __future__ import annotations

import logging
from typing import Optional

from supabase import Client, create_client

from .config import Settings
from .schemas import JobContext

log = logging.getLogger("worker.db")

BUCKET = "submissions"


class Database:
    def __init__(self, settings: Settings):
        self.client: Client = create_client(settings.supabase_url, settings.supabase_service_role_key)

    # -- queue -----------------------------------------------------------------------------
    def claim_job(self) -> Optional[dict]:
        """Atomically claim the next pending job (FOR UPDATE SKIP LOCKED in SQL)."""
        data = self.client.rpc("claim_job").execute().data
        if not data:
            return None
        row = data[0] if isinstance(data, list) else data
        return row if row and row.get("id") else None

    def complete_job(self, job_id: str, needs_review: bool) -> None:
        self.client.rpc("complete_job", {"p_job_id": job_id, "p_needs_review": needs_review}).execute()

    def fail_job(self, job_id: str, error: str) -> None:
        self.client.rpc("fail_job", {"p_job_id": job_id, "p_error": error}).execute()

    def queue_stats(self) -> dict:
        out = {}
        for status in ("pending", "running", "done", "failed"):
            res = self.client.table("jobs").select("id", count="exact").eq("status", status).limit(1).execute()
            out[status] = res.count or 0
        return out

    # -- data ------------------------------------------------------------------------------
    def load_context(self, submission_id: str) -> JobContext:
        sub = self.client.table("submissions").select("*").eq("id", submission_id).single().execute().data
        files = self.client.table("submission_files").select("*").eq("submission_id", submission_id).execute().data
        challenge = self.client.table("challenges").select("*").eq("id", sub["challenge_id"]).single().execute().data
        rubric = self.client.table("rubrics").select("*").eq("id", challenge["rubric_id"]).single().execute().data
        return JobContext(submission=sub, files=files or [], challenge=challenge, rubric=rubric)

    def download(self, path: str) -> bytes:
        return self.client.storage.from_(BUCKET).download(path)

    def match_similar(self, challenge_id: str, embedding: list[float], exclude_id: str) -> list[dict]:
        res = self.client.rpc(
            "match_similar",
            {"p_challenge_id": challenge_id, "p_embedding": embedding, "p_exclude": exclude_id, "p_limit": 3},
        ).execute()
        return res.data or []

    def save_evaluation(self, row: dict) -> None:
        self.client.table("evaluations").insert(row).execute()
