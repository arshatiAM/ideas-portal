"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { StatusBadge } from "@/components/StatusBadge";
import { EvalDetail, type Ev, type JobRow } from "./EvalDetail";
import { AUDIENCE_LABEL, type Audience, type Challenge, type SubmissionStatus } from "@/lib/types";

interface SubRow {
  id: string;
  reference_id: string;
  title: string;
  status: SubmissionStatus;
  created_at: string;
  profiles: { full_name: string; country: string; audience: Audience } | null;
}

export function QueueTab({ challenge, isAdmin }: { challenge: Challenge; isAdmin: boolean }) {
  const [subs, setSubs] = useState<SubRow[] | null>(null);
  const [evals, setEvals] = useState<Record<string, Ev>>({});
  const [jobs, setJobs] = useState<Record<string, JobRow>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "attention">("all");
  const [sort, setSort] = useState<"score" | "newest">("score");

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("submissions")
      .select("id,reference_id,title,status,created_at,profiles(full_name,country,audience)")
      .eq("challenge_id", challenge.id)
      .neq("status", "draft")
      .order("created_at", { ascending: false });
    const rows = (data as unknown as SubRow[] | null) ?? [];
    setSubs(rows);
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) {
      setEvals({});
      setJobs({});
      return;
    }
    const [{ data: ev }, { data: jb }] = await Promise.all([
      supabase.from("current_evaluations").select("*").in("submission_id", ids),
      supabase.from("jobs").select("submission_id,status,attempts,last_error").in("submission_id", ids),
    ]);
    setEvals(Object.fromEntries(((ev as Ev[] | null) ?? []).map((e) => [e.submission_id, e])));
    setJobs(Object.fromEntries(((jb as JobRow[] | null) ?? []).map((j) => [j.submission_id, j])));
  }, [challenge.id]);

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  const visible = useMemo(() => {
    let list = subs ?? [];
    if (filter === "attention") {
      list = list.filter((s) => s.status === "failed" || s.status === "needs_review" || evals[s.id]?.injection_flagged);
    }
    if (sort === "score") {
      list = [...list].sort((a, b) => (evals[b.id]?.effective_score ?? -1) - (evals[a.id]?.effective_score ?? -1));
    }
    return list;
  }, [subs, evals, filter, sort]);

  if (!subs) return <p className="py-8 text-center text-sm text-ink/60">Loading…</p>;

  const counts = subs.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.status]: (acc[s.status] ?? 0) + 1 }), {});

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-ink/60">{subs.length} submissions</span>
        {Object.entries(counts).map(([k, v]) => (
          <span key={k} className="badge bg-white text-ink/70">{k.replace("_", " ")}: {v}</span>
        ))}
        <div className="ms-auto flex gap-2">
          <select className="input !w-auto" value={filter} onChange={(e) => setFilter(e.target.value as "all" | "attention")}>
            <option value="all">All</option>
            <option value="attention">Needs attention</option>
          </select>
          <select className="input !w-auto" value={sort} onChange={(e) => setSort(e.target.value as "score" | "newest")}>
            <option value="score">Highest score first</option>
            <option value="newest">Newest first</option>
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="card text-center text-sm text-ink/60">Nothing to show yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full text-start text-sm">
            <thead className="bg-sand text-xs uppercase tracking-wide text-ink/60">
              <tr>
                <th className="px-4 py-3 text-start">Reference</th>
                <th className="px-4 py-3 text-start">Idea</th>
                <th className="px-4 py-3 text-start">Submitter</th>
                <th className="px-4 py-3 text-start">Status</th>
                <th className="px-4 py-3 text-start">Score</th>
                <th className="px-4 py-3 text-start">Flags</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => {
                const ev = evals[s.id];
                return (
                  <Fragment key={s.id}>
                    <tr className="cursor-pointer border-t border-line hover:bg-brand-soft/40" onClick={() => setOpen(open === s.id ? null : s.id)}>
                      <td className="px-4 py-3 font-mono text-xs">{s.reference_id}</td>
                      <td className="max-w-xs truncate px-4 py-3 font-medium">{s.title}</td>
                      <td className="px-4 py-3 text-ink/70">
                        {s.profiles?.full_name || "n/a"}
                        <span className="block text-xs text-ink/50">{s.profiles ? `${AUDIENCE_LABEL[s.profiles.audience]}, ${s.profiles.country}` : ""}</span>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                      <td className="px-4 py-3 font-semibold">{ev ? Number(ev.effective_score).toFixed(1) : "–"}</td>
                      <td className="px-4 py-3 text-xs">
                        {ev?.injection_flagged && <span className="badge me-1 bg-red-100 text-red-800">injection</span>}
                        {ev?.override_score != null && <span className="badge bg-accent-soft text-accent">override</span>}
                      </td>
                    </tr>
                    {open === s.id && (
                      <tr className="border-t border-line">
                        <td colSpan={6} className="p-0">
                          <EvalDetail ev={ev} job={jobs[s.id]} submissionId={s.id} isAdmin={isAdmin} onChanged={load} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
