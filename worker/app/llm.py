"""Model gateway.

The rest of the app talks to the `ModelGateway` interface only. To use Claude, GPT or a
self-hosted Llama later, add another class with the same three methods and change one line in
`build_gateway()`. Nothing else in the pipeline changes.
"""
from __future__ import annotations

import logging
import time
from typing import Protocol

from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from tenacity import before_sleep_log, retry, stop_after_attempt, wait_exponential_jitter

from .config import Settings
from .prompts import SYSTEM_INSTRUCTION, extraction_prompt, scoring_prompt
from .schemas import Part, ScoreResult, StructuredProfile

log = logging.getLogger("worker.llm")

# Retry transient failures (rate limits, 5xx, timeouts) with exponential backoff and jitter.
_retry = retry(
    stop=stop_after_attempt(4),
    wait=wait_exponential_jitter(initial=2, max=30),
    before_sleep=before_sleep_log(log, logging.WARNING),
    reraise=True,
)


class ModelGateway(Protocol):
    model_name: str

    def extract_profile(self, parts: list[Part], challenge_title: str) -> StructuredProfile: ...

    def score_profile(self, challenge: dict, criteria: list[dict], profile: StructuredProfile,
                      user_fields: str) -> ScoreResult: ...

    def embed(self, text: str) -> list[float]: ...


class GeminiGateway:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.client = genai.Client(
            api_key=settings.gemini_api_key,
            # Never wait forever on one call: time out, then retry or fall back.
            http_options=types.HttpOptions(timeout=settings.gemini_timeout_seconds * 1000),
        )
        self.model_name = settings.gemini_model

    # -- helpers ------------------------------------------------------------------------
    def _upload(self, path: str, mime: str):
        """Upload a file to the Gemini Files API and wait until it is ready (video takes a while)."""
        f = self.client.files.upload(file=path, config={"mime_type": mime})
        deadline = time.time() + 600
        while f.state is not None and f.state.name == "PROCESSING":
            if time.time() > deadline:
                raise TimeoutError(f"Gemini file processing timed out for {path}")
            time.sleep(3)
            f = self.client.files.get(name=f.name)
        if f.state is not None and f.state.name == "FAILED":
            raise RuntimeError(f"Gemini could not process file {path}")
        return f

    def _call(self, model: str, contents: list, config: types.GenerateContentConfig):
        level = self.settings.gemini_thinking_level
        if level:
            config.thinking_config = types.ThinkingConfig(thinking_level=level)
        try:
            return self.client.models.generate_content(model=model, contents=contents, config=config)
        except genai_errors.ClientError as exc:
            # A model that does not support the thinking setting answers 400: retry once without it.
            if level and getattr(exc, "code", None) == 400:
                log.warning("Model %s rejected thinking_level=%s; retrying without it.", model, level)
                config.thinking_config = None
                return self.client.models.generate_content(model=model, contents=contents, config=config)
            raise

    def _generate(self, *, contents: list, config: types.GenerateContentConfig):
        """Call the primary model; if it is overloaded or too slow, try the fallback model once."""
        try:
            return self._call(self.model_name, contents, config)
        except Exception as exc:  # noqa: BLE001
            fallback = self.settings.gemini_fallback_model
            if not fallback or fallback == self.model_name:
                raise
            log.warning("Primary model %s failed (%s). Trying fallback %s.", self.model_name, type(exc).__name__, fallback)
            return self._call(fallback, contents, config)

    # -- stage 1: extraction (sees the raw, untrusted submission) --------------------------
    @_retry
    def _generate_profile(self, contents: list) -> StructuredProfile:
        resp = self._generate(
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                response_mime_type="application/json",
                response_schema=StructuredProfile,
                temperature=0.0,
            ),
        )
        return StructuredProfile.model_validate_json(resp.text)

    def extract_profile(self, parts: list[Part], challenge_title: str) -> StructuredProfile:
        uploaded = []
        try:
            contents: list = ["=== SUBMISSION START (untrusted data) ==="]
            for p in parts:
                if p.kind == "text":
                    contents.append(f"[{p.label}]\n{p.text}" if p.label else p.text)
                else:
                    f = self._upload(p.path, p.mime)
                    uploaded.append(f)
                    contents.append(f"[attached file: {p.label}]")
                    contents.append(f)
            contents.append("=== SUBMISSION END ===")
            contents.append(extraction_prompt(challenge_title))
            return self._generate_profile(contents)
        finally:
            # Do not leave submitter files on a third-party service longer than needed.
            for f in uploaded:
                try:
                    self.client.files.delete(name=f.name)
                except Exception:  # best effort
                    log.warning("Could not delete uploaded file %s", getattr(f, "name", "?"))

    # -- stage 2: scoring (sees ONLY the structured profile, never the raw files) -------------
    @_retry
    def score_profile(self, challenge: dict, criteria: list[dict], profile: StructuredProfile,
                      user_fields: str) -> ScoreResult:
        prompt = scoring_prompt(challenge, criteria, profile.model_dump_json(indent=2), user_fields)
        resp = self._generate(
            contents=[prompt],
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                response_mime_type="application/json",
                response_schema=ScoreResult,
                temperature=0.2,
            ),
        )
        return ScoreResult.model_validate_json(resp.text)

    # -- embeddings --------------------------------------------------------------------------
    @_retry
    def embed(self, text: str) -> list[float]:
        resp = self.client.models.embed_content(
            model=self.settings.gemini_embedding_model,
            contents=text[:8000],
            config=types.EmbedContentConfig(
                output_dimensionality=self.settings.embedding_dim,
                task_type="SEMANTIC_SIMILARITY",
            ),
        )
        return list(resp.embeddings[0].values)


def build_gateway(settings: Settings) -> ModelGateway:
    return GeminiGateway(settings)
