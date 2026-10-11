"""Runtime configuration, read from environment variables (or worker/.env)."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Supabase (the SERVICE ROLE key is a secret: server-side only, never in the browser)
    supabase_url: str
    supabase_service_role_key: str

    # Model gateway (Gemini free tier by default; swap provider by adding a gateway class)
    gemini_api_key: str
    gemini_model: str = "gemini-3.8-flash"
    gemini_fallback_model: str = ""      # optional: used if the primary model is overloaded or times out
    gemini_thinking_level: str = ""      # optional: "low" makes Gemini 3.x models answer much faster
    gemini_timeout_seconds: int = 150    # per model call
    gemini_embedding_model: str = "gemini-embedding-001"
    embedding_dim: int = 768  # must match vector(768) in the database

    # Pipeline behaviour
    score_runs: int = 2                 # independent scoring passes, averaged
    disagreement_threshold: float = 15  # total-score gap (0-100) that triggers human review
    max_file_mb: int = 50
    poll_interval_seconds: float = 2.0
    worker_concurrency: int = 3        # parallel job loops; safe because claim_job uses SKIP LOCKED
    run_loop: bool = True               # set false to run only the API (e.g. in tests)

    # Protects /stats. Leave empty to disable the endpoint.
    worker_admin_token: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
