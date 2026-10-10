"""Pipeline tests with a fake database and a fake model: no network, no API keys needed."""
import pytest

from app.config import Settings
from app.pipeline import Pipeline
from app.schemas import CriterionScore, JobContext, ScoreResult, StructuredProfile

CRITERIA = [
    {"key": "impact", "label": "Impact", "weight": 0.5, "source": "llm", "description": "d"},
    {"key": "feasibility", "label": "Feasibility", "weight": 0.4, "source": "llm", "description": "d"},
    {"key": "originality", "label": "Originality", "weight": 0.1, "source": "embedding", "description": "d"},
]


class FakeStore:
    def __init__(self, neighbours=None, files=None):
        self.saved = []
        self.neighbours = neighbours or []
        self.files = files or []
        self.downloaded = []

    def load_context(self, submission_id):
        return JobContext(
            submission={"id": submission_id, "reference_id": "IDX-2026-000001", "title": "Metro link",
                        "summary": "s", "body": "A commuter rail line between Dubai and Sharjah.",
                        "cost_estimate": 1_000_000, "duration_months": 24, "challenge_id": "c1"},
            files=self.files,
            challenge={"id": "c1", "title": "Reduce traffic", "description": "desc", "rubric_id": "r1"},
            rubric={"id": "r1", "version": 1, "criteria": CRITERIA},
        )

    def download(self, path):
        self.downloaded.append(path)
        return b"plain text idea from a txt file"

    def match_similar(self, challenge_id, embedding, exclude_id):
        return self.neighbours

    def save_evaluation(self, row):
        self.saved.append(row)


class FakeLLM:
    model_name = "fake-model"

    def __init__(self, scores_per_run=None, injection=False, problem="Heavy congestion on E311 every morning"):
        self.scores_per_run = scores_per_run or [(8, 6), (8, 6)]
        self.calls = 0
        self.injection = injection
        self.problem = problem
        self.parts_seen = None

    def extract_profile(self, parts, challenge_title):
        self.parts_seen = parts
        return StructuredProfile(
            problem=self.problem, proposed_solution="Build a commuter rail line with 6 stations",
            expected_impact="Cuts car trips by 20%", sustainability_notes="Electric trains",
            injection_detected=self.injection,
        )

    def score_profile(self, challenge, criteria, profile, user_fields):
        impact, feas = self.scores_per_run[min(self.calls, len(self.scores_per_run) - 1)]
        self.calls += 1
        return ScoreResult(
            scores=[CriterionScore(key="impact", score=impact, justification="j"),
                    CriterionScore(key="feasibility", score=feas, justification="j")],
            overall_reasoning="Solid idea.",
        )

    def embed(self, text):
        return [0.1] * 768


def make(store, llm, runs=2, threshold=15):
    cfg = Settings(supabase_url="http://x", supabase_service_role_key="k", gemini_api_key="g",
                   score_runs=runs, disagreement_threshold=threshold)
    return Pipeline(store, llm, cfg)


def test_happy_path_saves_one_versioned_evaluation():
    store, llm = FakeStore(), FakeLLM()
    review = make(store, llm).run({"submission_id": "s1"})
    assert review is False
    assert len(store.saved) == 1
    row = store.saved[0]
    assert row["rubric_version"] == 1 and row["prompt_version"] and row["model_name"] == "fake-model"
    assert row["criterion_scores"]["final"]["impact"] == 8
    assert len(row["embedding"]) == 768
    # no neighbours -> neutral originality 7.5 ; 0.5*8 + 0.4*6 + 0.1*7.5 = 7.15 -> 71.5
    assert row["total_score"] == pytest.approx(71.5)
    assert llm.calls == 2


def test_near_duplicate_gets_low_originality():
    store = FakeStore(neighbours=[{"submission_id": "other", "similarity": 0.97}])
    make(store, FakeLLM()).run({"submission_id": "s1"})
    assert store.saved[0]["criterion_scores"]["final"]["originality"] == 0.0


def test_prompt_injection_flags_for_review():
    store = FakeStore()
    review = make(store, FakeLLM(injection=True)).run({"submission_id": "s1"})
    assert review is True
    assert store.saved[0]["injection_flagged"] is True


def test_large_disagreement_flags_for_review():
    store = FakeStore()
    llm = FakeLLM(scores_per_run=[(9, 9), (2, 2)])
    review = make(store, llm, threshold=15).run({"submission_id": "s1"})
    assert review is True
    assert store.saved[0]["disagreement"] > 15


def test_empty_profile_flags_for_review():
    store = FakeStore()
    review = make(store, FakeLLM(problem="")).run({"submission_id": "s1"})
    assert review is True


def test_text_file_is_inlined_not_uploaded():
    files = [{"storage_path": "u/s/idea.txt", "file_name": "idea.txt", "mime_type": "text/plain",
              "kind": "text", "size_bytes": 30}]
    store, llm = FakeStore(files=files), FakeLLM()
    make(store, llm).run({"submission_id": "s1"})
    kinds = [p.kind for p in llm.parts_seen]
    assert kinds == ["text", "text"]
    assert "plain text idea" in llm.parts_seen[1].text


def test_oversized_file_is_rejected():
    files = [{"storage_path": "u/s/big.mp4", "file_name": "big.mp4", "mime_type": "video/mp4",
              "kind": "video", "size_bytes": 80 * 1024 * 1024}]
    with pytest.raises(ValueError):
        make(FakeStore(files=files), FakeLLM()).run({"submission_id": "s1"})


def test_binary_file_is_passed_to_model_as_file_part():
    files = [{"storage_path": "u/s/pitch.mp4", "file_name": "pitch.mp4", "mime_type": "video/mp4",
              "kind": "video", "size_bytes": 1000}]
    llm = FakeLLM()
    make(FakeStore(files=files), llm).run({"submission_id": "s1"})
    file_parts = [p for p in llm.parts_seen if p.kind == "file"]
    assert len(file_parts) == 1 and file_parts[0].mime == "video/mp4"
