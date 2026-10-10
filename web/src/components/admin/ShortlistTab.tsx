"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Challenge } from "@/lib/types";

interface RankRow {
  id: string;
  rank: number;
  eligibility_verified: boolean;
  status: "shortlisted" | "published";
  submission_id: string;
  submissions: { reference_id: string; title: string } | null;
}

export function ShortlistTab({ challenge, onChallengeChanged }: { challenge: Challenge; onChallengeChanged: () => void }) {
  const [rows, setRows] = useState<RankRow[] | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("rankings")
      .select("id,rank,eligibility_verified,status,submission_id,submissions(reference_id,title)")
      .eq("challenge_id", challenge.id)
      .order("rank", { ascending: true });
    const list = (data as unknown as RankRow[] | null) ?? [];
    setRows(list);
    if (list.length) {
      const { data: ev } = await supabase
        .from("current_evaluations")
        .select("submission_id,effective_score")
        .in("submission_id", list.map((r) => r.submission_id));
      setScores(Object.fromEntries(((ev as { submission_id: string; effective_score: number }[] | null) ?? []).map((e) => [e.submission_id, e.effective_score])));
    }
  }, [challenge.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, okText: string) {
    setBusy(true);
    setMsg(null);
    const { error } = await fn();
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: okText });
    await load();
    onChallengeChanged();
  }

  const published = challenge.status === "published" || rows?.some((r) => r.status === "published");
  const allVerified = !!rows && rows.length > 0 && rows.every((r) => r.eligibility_verified);

  return (
    <div className="space-y-5">
      <div className="card text-sm text-ink/80">
        <p>
          <strong>How winners are chosen:</strong> build the Top 10 from the current scores, verify each finalist&apos;s eligibility
          (identity, residency or country rules), then publish. Submissions flagged for prompt injection are excluded until an
          evaluator has reviewed them and entered a score. Every step is written to the audit log.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          className="btn-secondary"
          disabled={busy || !!published}
          onClick={() => {
            if (confirm("Build (or rebuild) the Top 10 shortlist from current scores?")) {
              run(() => supabase.rpc("admin_build_shortlist", { p_challenge_id: challenge.id, p_size: 10 }), "Shortlist built.");
            }
          }}
        >
          Build Top 10 shortlist
        </button>
        <button
          className="btn-primary"
          disabled={busy || !!published || !allVerified}
          title={allVerified ? "" : "Verify every finalist first"}
          onClick={() => {
            if (confirm("Publish these winners? This makes the leaderboard public and cannot be undone.")) {
              run(() => supabase.rpc("admin_publish_winners", { p_challenge_id: challenge.id }), "Winners published.");
            }
          }}
        >
          Publish winners
        </button>
      </div>

      {msg && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{msg.text}</p>}
      {published && <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand-dark">Winners are published for this challenge.</p>}

      {rows === null ? (
        <p className="text-sm text-ink/60">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="card text-center text-sm text-ink/60">No shortlist yet.</div>
      ) : (
        <ol className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="card flex flex-wrap items-center gap-4 !p-4">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-soft text-lg font-bold text-brand-dark">{r.rank}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{r.submissions?.title}</p>
                <p className="font-mono text-xs text-ink/50">{r.submissions?.reference_id}</p>
              </div>
              <p className="text-lg font-semibold">{scores[r.submission_id] != null ? Number(scores[r.submission_id]).toFixed(1) : "–"}</p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={r.eligibility_verified}
                  disabled={busy || r.status === "published"}
                  onChange={(e) => run(() => supabase.rpc("admin_verify_eligibility", { p_ranking_id: r.id, p_verified: e.target.checked }), "Eligibility updated.")}
                />
                Eligibility verified
              </label>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
