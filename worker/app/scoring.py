"""Pure scoring logic: no network, no database, easy to test.

Scale: each criterion is scored 0-10 and the rubric weights sum to 1.
The total is returned on a 0-100 scale.
"""
from __future__ import annotations

from statistics import mean
from typing import Iterable, Optional

Criteria = list[dict]  # [{"key", "label", "weight", "source", "description"}]


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, float(value)))


def normalize_weights(criteria: Criteria) -> Criteria:
    """Return a copy of the criteria whose weights sum to exactly 1."""
    total = sum(float(c["weight"]) for c in criteria)
    if total <= 0:
        raise ValueError("Rubric weights must sum to a positive number")
    return [{**c, "weight": float(c["weight"]) / total} for c in criteria]


def weighted_total(criteria: Criteria, scores: dict[str, float]) -> float:
    """Weighted sum of 0-10 criterion scores, scaled to 0-100."""
    crit = normalize_weights(criteria)
    missing = [c["key"] for c in crit if c["key"] not in scores]
    if missing:
        raise ValueError(f"Missing scores for criteria: {missing}")
    total = sum(c["weight"] * clamp(scores[c["key"]], 0, 10) for c in crit)
    return round(total * 10, 2)


def originality_score(max_similarity: Optional[float]) -> float:
    """Map the highest cosine similarity to another submission to a 0-10 score.

    >= 0.95 similarity is a near duplicate (0). <= 0.50 is clearly different (10).
    With no other submissions there is nothing to compare against, so we use a neutral 7.5.
    Known limitation: early submissions are compared with fewer ideas, so admins re-run
    evaluations (admin_requeue) when a challenge closes.
    """
    if max_similarity is None:
        return 7.5
    s = clamp(max_similarity, 0.0, 1.0)
    if s >= 0.95:
        return 0.0
    if s <= 0.50:
        return 10.0
    return round(10.0 * (0.95 - s) / (0.95 - 0.50), 2)


def combine_runs(criteria: Criteria, runs: Iterable[dict[str, float]],
                 originality: float) -> tuple[dict[str, float], float, float]:
    """Average several scoring runs.

    Returns (final per-criterion scores, total 0-100, disagreement 0-100), where
    disagreement is the gap between the highest and lowest run total.
    """
    runs = list(runs)
    if not runs:
        raise ValueError("At least one scoring run is required")
    llm_keys = [c["key"] for c in criteria if c.get("source", "llm") == "llm"]
    embedding_scores = {c["key"]: originality for c in criteria if c.get("source") == "embedding"}
    final: dict[str, float] = {
        key: round(mean(clamp(r[key], 0, 10) for r in runs), 2) for key in llm_keys
    }
    final.update(embedding_scores)
    run_totals = [weighted_total(criteria, {**r, **embedding_scores}) for r in runs]
    total = weighted_total(criteria, final)
    disagreement = round(max(run_totals) - min(run_totals), 2)
    return final, total, disagreement


def needs_human_review(*, disagreement: float, threshold: float, injection_flagged: bool,
                       profile_is_empty: bool) -> bool:
    return bool(injection_flagged or profile_is_empty or disagreement > threshold)
