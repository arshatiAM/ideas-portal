"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Challenge, Criterion, Rubric } from "@/lib/types";

export function RubricTab({ challenge, onChallengeChanged }: { challenge: Challenge; onChallengeChanged: () => void }) {
  const [rubric, setRubric] = useState<Rubric | null>(null);
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase
      .from("rubrics")
      .select("*")
      .eq("id", challenge.rubric_id)
      .single()
      .then(({ data }) => {
        const r = data as Rubric | null;
        setRubric(r);
        if (r) setWeights(Object.fromEntries(r.criteria.map((c) => [c.key, String(Math.round(c.weight * 1000) / 10)])));
      });
  }, [challenge.rubric_id]);

  if (!rubric) return <p className="text-sm text-ink/60">Loading…</p>;

  const sum = rubric.criteria.reduce((a, c) => a + (Number(weights[c.key]) || 0), 0);
  const valid = Math.abs(sum - 100) < 0.01 && rubric.criteria.every((c) => Number(weights[c.key]) >= 0);

  async function save() {
    if (!rubric) return;
    setBusy(true);
    setMsg(null);
    try {
      const { data: latest } = await supabase
        .from("rubrics")
        .select("version")
        .eq("name", rubric.name)
        .order("version", { ascending: false })
        .limit(1)
        .single();
      const nextVersion = ((latest as { version: number } | null)?.version ?? rubric.version) + 1;
      const criteria: Criterion[] = rubric.criteria.map((c) => ({ ...c, weight: Number(weights[c.key]) / 100 }));
      const { data: created, error } = await supabase
        .from("rubrics")
        .insert({ name: rubric.name, version: nextVersion, prompt_version: rubric.prompt_version, criteria })
        .select("id")
        .single();
      if (error) throw error;
      const { error: e2 } = await supabase.from("challenges").update({ rubric_id: (created as { id: string }).id }).eq("id", challenge.id);
      if (e2) throw e2;
      setMsg({ ok: true, text: `Saved as rubric version ${nextVersion}. New evaluations use it; re-run older ones from the Queue tab.` });
      onChallengeChanged();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : (err as { message?: string }).message ?? "Failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink/70">
        Rubric <strong>{rubric.name}</strong>, version {rubric.version}. Changing weights never edits history: it saves a new version, so every past
        score still points at the exact rubric that produced it.
      </p>
      <ul className="space-y-3">
        {rubric.criteria.map((c) => (
          <li key={c.key} className="card flex flex-wrap items-center gap-4 !p-4">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{c.label} <span className="text-xs font-normal text-ink/50">({c.source === "embedding" ? "computed from embeddings" : "scored by AI"})</span></p>
              <p className="text-sm text-ink/60">{c.description}</p>
            </div>
            <div className="flex items-center gap-1">
              <input
                className="input !w-24 text-end"
                type="number"
                min={0}
                max={100}
                step="0.5"
                value={weights[c.key] ?? ""}
                onChange={(e) => setWeights({ ...weights, [c.key]: e.target.value })}
                aria-label={`${c.label} weight percent`}
              />
              <span className="text-sm">%</span>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-4">
        <p className={`text-sm font-semibold ${valid ? "text-emerald-700" : "text-red-700"}`}>Total: {sum.toFixed(1)}% {valid ? "" : "(must equal 100%)"}</p>
        <button className="btn-primary" disabled={!valid || busy} onClick={save}>Save as new version</button>
      </div>
      {msg && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{msg.text}</p>}
    </div>
  );
}
