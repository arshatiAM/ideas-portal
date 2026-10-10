import pytest

from app.scoring import (
    clamp,
    combine_runs,
    needs_human_review,
    normalize_weights,
    originality_score,
    weighted_total,
)

CRITERIA = [
    {"key": "impact", "weight": 0.30, "source": "llm"},
    {"key": "cost_effectiveness", "weight": 0.20, "source": "llm"},
    {"key": "feasibility", "weight": 0.20, "source": "llm"},
    {"key": "sustainability", "weight": 0.15, "source": "llm"},
    {"key": "originality", "weight": 0.10, "source": "embedding"},
    {"key": "clarity", "weight": 0.05, "source": "llm"},
]


def test_clamp():
    assert clamp(11, 0, 10) == 10
    assert clamp(-3, 0, 10) == 0
    assert clamp(4.5, 0, 10) == 4.5


def test_normalize_weights_sums_to_one():
    crit = normalize_weights([{"key": "a", "weight": 2}, {"key": "b", "weight": 6}])
    assert pytest.approx(sum(c["weight"] for c in crit)) == 1.0
    assert crit[0]["weight"] == pytest.approx(0.25)


def test_normalize_weights_rejects_zero():
    with pytest.raises(ValueError):
        normalize_weights([{"key": "a", "weight": 0}])


def test_weighted_total_all_tens_is_100():
    scores = {c["key"]: 10 for c in CRITERIA}
    assert weighted_total(CRITERIA, scores) == 100.0


def test_weighted_total_all_zeros_is_0():
    scores = {c["key"]: 0 for c in CRITERIA}
    assert weighted_total(CRITERIA, scores) == 0.0


def test_weighted_total_known_value():
    scores = {"impact": 8, "cost_effectiveness": 6, "feasibility": 5,
              "sustainability": 7, "originality": 9, "clarity": 10}
    # 0.30*8 + 0.20*6 + 0.20*5 + 0.15*7 + 0.10*9 + 0.05*10 = 2.4+1.2+1.0+1.05+0.9+0.5 = 7.05 -> 70.5
    assert weighted_total(CRITERIA, scores) == 70.5


def test_weighted_total_clamps_out_of_range_scores():
    scores = {c["key"]: 50 for c in CRITERIA}
    assert weighted_total(CRITERIA, scores) == 100.0


def test_weighted_total_missing_key_raises():
    with pytest.raises(ValueError):
        weighted_total(CRITERIA, {"impact": 5})


@pytest.mark.parametrize(
    "sim,expected",
    [(None, 7.5), (0.99, 0.0), (0.95, 0.0), (0.50, 10.0), (0.2, 10.0)],
)
def test_originality_edges(sim, expected):
    assert originality_score(sim) == expected


def test_originality_is_monotonic():
    values = [originality_score(s / 100) for s in range(40, 100, 5)]
    assert values == sorted(values, reverse=True)


def test_combine_runs_averages_and_reports_disagreement():
    run_a = {"impact": 8, "cost_effectiveness": 6, "feasibility": 6, "sustainability": 6, "clarity": 6}
    run_b = {"impact": 6, "cost_effectiveness": 6, "feasibility": 6, "sustainability": 6, "clarity": 6}
    final, total, disagreement = combine_runs(CRITERIA, [run_a, run_b], originality=5.0)
    assert final["impact"] == 7.0
    assert final["originality"] == 5.0
    # impact differs by 2 points * weight 0.30 * 10 = 6.0 total-score points
    assert disagreement == pytest.approx(6.0)
    assert 0 <= total <= 100


def test_combine_runs_single_run_has_zero_disagreement():
    run = {c["key"]: 5 for c in CRITERIA if c["source"] == "llm"}
    _, _, disagreement = combine_runs(CRITERIA, [run], originality=5.0)
    assert disagreement == 0.0


def test_combine_runs_requires_a_run():
    with pytest.raises(ValueError):
        combine_runs(CRITERIA, [], originality=5.0)


def test_review_rules():
    ok = dict(disagreement=5, threshold=15, injection_flagged=False, profile_is_empty=False)
    assert needs_human_review(**ok) is False
    assert needs_human_review(**{**ok, "disagreement": 20}) is True
    assert needs_human_review(**{**ok, "injection_flagged": True}) is True
    assert needs_human_review(**{**ok, "profile_is_empty": True}) is True
