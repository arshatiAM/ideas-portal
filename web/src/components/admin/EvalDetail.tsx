"use client";

import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { SubmissionContent } from "./SubmissionContent";

export interface Ev {
  id: string;
  submission_id: string;
  total_score: number;
  effective_score: number;
  disagreement: number;
  needs_review: boolean;
  injection_flagged: boolean;
  reasoning: string;
  override_score: number | null;
  override_reason: string | null;
  model_name: string;
  rubric_version: number;
  prompt_version: string;
  structured_profile: {
    problem?: string;
    proposed_solution?: string;
    expected_impact?: string;
    expected_traffic_reduction_percent?: number | null;
    estimated_cost_aed?: number | null;
    estimated_duration_months?: number | null;
    sustainability_notes?: string;
    risks?: string[];
    evidence_provided?: string[];
    injection_notes?: string;
  };
  criterion_scores: {
    final?: Record<string, number>;
    runs?: { key: string; score: number; justification: string; evidence: string }[][];
    originality?: { max_similarity: number | null; score: number };
  };
}

export interface JobRow {
  submission_id: string;
  status: string;
  attempts: number;
  last_error: string | null;
}

const pretty = (k: string) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export function EvalDetail({
  ev,
  job,
  submissionId,
  isAdmin,
  onChanged,
}: {
  ev: Ev | undefined;
  job: JobRow | undefined;
  submissionId: string;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const [score, setScore] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function override(e: FormEvent) {
    e.preventDefault();
    if (!ev) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc("staff_override_score", {
      p_evaluation_id: ev.id,
      p_score: Number(score),
      p_reason: reason,
    });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: "Override saved and written to the audit log." });
    setScore("");
    setReason("");
    onChanged();
  }

  async function requeue() {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc("admin_requeue", { p_submission_id: submissionId });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: "Re-queued. The worker will pick it up shortly." });
    onChanged();
  }

  const firstRun = ev?.criterion_scores.runs?.[0] ?? [];
  const justification = Object.fromEntries(firstRun.map((r) => [r.key, r]));
  const final = ev?.criterion_scores.final ?? {};
  const p = ev?.structured_profile;

  return (
    <div className="space-y-5 bg-sand/60 p-5 text-sm">
      <SubmissionContent submissionId={submissionId} />
      {job?.last_error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-red-800">
          Job {job.status}, attempt {job.attempts}: {job.last_error}
        </p>
      )}

      {!ev ? (
        <p className="text-ink/60">No evaluation yet.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="badge bg-white text-ink/70">Model {ev.model_name}</span>
            <span className="badge bg-white text-ink/70">Rubric v{ev.rubric_version}</span>
            <span className="badge bg-white text-ink/70">Prompt {ev.prompt_version}</span>
            {ev.injection_flagged && <span className="badge bg-red-100 text-red-800">Prompt-injection suspected</span>}
            {ev.needs_review && <span className="badge bg-purple-100 text-purple-800">Needs human review</span>}
            {ev.override_score !== null && <span className="badge bg-accent-soft text-accent">Human override</span>}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="card !p-4">
              <p className="text-xs text-ink/60">AI score</p>
              <p className="text-2xl font-semibold">{Number(ev.total_score).toFixed(1)}</p>
            </div>
            <div className="card !p-4">
              <p className="text-xs text-ink/60">Score that counts</p>
              <p className="text-2xl font-semibold text-brand-dark">{Number(ev.effective_score).toFixed(1)}</p>
            </div>
            <div className="card !p-4">
              <p className="text-xs text-ink/60">Disagreement between AI runs</p>
              <p className="text-2xl font-semibold">{Number(ev.disagreement).toFixed(1)}</p>
            </div>
          </div>

          {ev.override_reason && (
            <p className="rounded-lg bg-accent-soft px-3 py-2">
              <strong>Override reason:</strong> {ev.override_reason}
            </p>
          )}
          {p?.injection_notes && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-red-800">
              <strong>Suspicious text:</strong> {p.injection_notes}
            </p>
          )}

          <div>
            <h4 className="mb-2 font-semibold">Scores by criterion (0 to 10)</h4>
            <ul className="space-y-2">
              {Object.entries(final).map(([k, v]) => (
                <li key={k} className="rounded-lg border border-line bg-white p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{pretty(k)}</span>
                    <span className="font-semibold">{Number(v).toFixed(1)}</span>
                  </div>
                  {k === "originality" ? (
                    <p className="mt-1 text-ink/60">
                      Computed from embeddings. Highest similarity to another submission:{" "}
                      {ev.criterion_scores.originality?.max_similarity != null
                        ? ev.criterion_scores.originality.max_similarity.toFixed(2)
                        : "none to compare yet"}
                      .
                    </p>
                  ) : (
                    <>
                      <p className="mt-1 text-ink/70">{justification[k]?.justification}</p>
                      {justification[k]?.evidence && <p className="mt-1 text-xs text-ink/50">Evidence: {justification[k].evidence}</p>}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-1 font-semibold">Overall reasoning</h4>
            <p className="text-ink/80">{ev.reasoning}</p>
          </div>

          {p && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div><h4 className="font-semibold">Problem</h4><p className="text-ink/70">{p.problem}</p></div>
              <div><h4 className="font-semibold">Proposed solution</h4><p className="text-ink/70">{p.proposed_solution}</p></div>
              <div><h4 className="font-semibold">Expected impact</h4><p className="text-ink/70">{p.expected_impact}</p></div>
              <div><h4 className="font-semibold">Sustainability</h4><p className="text-ink/70">{p.sustainability_notes}</p></div>
              <div>
                <h4 className="font-semibold">Stated numbers</h4>
                <p className="text-ink/70">
                  Cost (AED): {p.estimated_cost_aed ?? "n/a"} · Duration (months): {p.estimated_duration_months ?? "n/a"} · Traffic reduction (%):{" "}
                  {p.expected_traffic_reduction_percent ?? "n/a"}
                </p>
              </div>
              <div>
                <h4 className="font-semibold">Evidence and risks</h4>
                <p className="text-ink/70">Evidence: {(p.evidence_provided ?? []).join("; ") || "none"}</p>
                <p className="text-ink/70">Risks: {(p.risks ?? []).join("; ") || "none stated"}</p>
              </div>
            </div>
          )}

          <form onSubmit={override} className="rounded-xl border border-line bg-white p-4">
            <h4 className="mb-3 font-semibold">Human review: override the score</h4>
            <div className="grid gap-3 sm:grid-cols-4">
              <input className="input" type="number" min={0} max={100} step="0.1" required placeholder="0 to 100" value={score} onChange={(e) => setScore(e.target.value)} />
              <input className="input sm:col-span-2" required minLength={10} placeholder="Reason (required, at least 10 characters)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <button className="btn-primary" disabled={busy}>Save override</button>
            </div>
          </form>
        </>
      )}

      {isAdmin && (
        <button className="btn-secondary" onClick={requeue} disabled={busy}>
          Re-run evaluation
        </button>
      )}
      {msg && (
        <p role="status" className={`rounded-lg px-3 py-2 ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{msg.text}</p>
      )}
    </div>
  );
}
