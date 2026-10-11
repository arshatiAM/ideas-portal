"use client";

import { wakeWorker } from "@/lib/wakeWorker";
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Protected } from "@/components/Protected";
import { StatusBadge } from "@/components/StatusBadge";
import { formatBytes } from "@/lib/files";
import { STATUS_LABEL, type SubmissionStatus } from "@/lib/types";

interface Tracked {
  id: string;
  reference_id: string;
  title: string;
  status: SubmissionStatus;
  created_at: string;
  challenges: { title: string; status: string } | null;
  submission_files: { file_name: string; kind: string; size_bytes: number }[];
}

interface Published {
  effective_score: number;
  reasoning: string;
}

const STEPS: { key: string; label: string; reached: (s: SubmissionStatus) => boolean }[] = [
  { key: "received", label: "Received", reached: (s) => s !== "draft" },
  { key: "evaluating", label: "Being evaluated", reached: (s) => ["processing", "evaluated", "needs_review"].includes(s) },
  { key: "evaluated", label: "Evaluated", reached: (s) => ["evaluated", "needs_review"].includes(s) },
];

function TrackInner() {
  const params = useSearchParams();
  const [input, setInput] = useState(params.get("ref") ?? "");
  const [ref, setRef] = useState(params.get("ref") ?? "");
  const [data, setData] = useState<Tracked | null>(null);
  const [published, setPublished] = useState<Published | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "notfound">("idle");

  const load = useCallback(async (reference: string, quiet = false) => {
    if (!reference) return;
    if (!quiet) setState("loading");
    const { data: sub } = await supabase
      .from("submissions")
      .select("id,reference_id,title,status,created_at,challenges(title,status),submission_files(file_name,kind,size_bytes)")
      .eq("reference_id", reference.trim().toUpperCase())
      .maybeSingle();
    if (!sub) {
      setData(null);
      setState("notfound");
      return;
    }
    setData(sub as unknown as Tracked);
    if (["queued", "processing"].includes((sub as { status: string }).status)) wakeWorker();
    setState("idle");
    // Scores are only visible to the owner after the challenge results are published (enforced by RLS).
    const { data: ev } = await supabase
      .from("current_evaluations")
      .select("effective_score,reasoning")
      .eq("submission_id", (sub as { id: string }).id)
      .maybeSingle();
    setPublished((ev as Published | null) ?? null);
  }, []);

  useEffect(() => {
    if (ref) load(ref);
  }, [ref, load]);

  // Poll while the submission is still moving through the pipeline.
  useEffect(() => {
    if (!data || !["queued", "processing"].includes(data.status)) return;
    const id = setInterval(() => load(ref, true), 5000);
    return () => clearInterval(id);
  }, [data, ref, load]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setRef(input.trim());
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-semibold">Track a submission</h1>
      <form onSubmit={onSubmit} className="mt-5 flex gap-2">
        <input
          className="input font-mono uppercase"
          placeholder="IDX-2026-000123"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Reference ID"
        />
        <button className="btn-primary" type="submit">Look up</button>
      </form>

      {state === "loading" && <p className="mt-6 text-sm text-ink/60">Looking up…</p>}
      {state === "notfound" && (
        <p className="mt-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No submission with that ID was found on your account.
        </p>
      )}

      {data && (
        <div className="card mt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-sm text-ink/60">{data.reference_id}</p>
              <h2 className="text-xl font-semibold">{data.title}</h2>
              <p className="text-sm text-ink/60">{data.challenges?.title}</p>
            </div>
            <StatusBadge status={data.status} />
          </div>

          <ol className="mt-6 grid grid-cols-3 gap-2" aria-label="Progress">
            {STEPS.map((s) => {
              const done = s.reached(data.status);
              return (
                <li key={s.key} className={`rounded-lg border px-3 py-2 text-center text-xs font-semibold ${done ? "border-brand bg-brand-soft text-brand-dark" : "border-line text-ink/40"}`}>
                  {s.label}
                </li>
              );
            })}
          </ol>
          <p className="mt-4 text-sm text-ink/70">{STATUS_LABEL[data.status]}</p>
          {data.status === "needs_review" && (
            <p className="mt-2 text-sm text-ink/60">An evaluator will take a closer look before results are finalised. This is routine.</p>
          )}

          {data.submission_files.length > 0 && (
            <div className="mt-6 border-t border-line pt-4">
              <h3 className="text-sm font-semibold">Files</h3>
              <ul className="mt-2 space-y-1 text-sm text-ink/70">
                {data.submission_files.map((f) => (
                  <li key={f.file_name}>{f.file_name} <span className="text-ink/40">({f.kind}, {formatBytes(f.size_bytes)})</span></li>
                ))}
              </ul>
            </div>
          )}

          {published ? (
            <div className="mt-6 border-t border-line pt-4">
              <h3 className="text-sm font-semibold">Your result</h3>
              <p className="mt-1 text-3xl font-semibold text-brand-dark">{Number(published.effective_score).toFixed(1)} <span className="text-base font-normal text-ink/50">/ 100</span></p>
              <p className="mt-2 text-sm text-ink/70">{published.reasoning}</p>
            </div>
          ) : (
            <p className="mt-6 border-t border-line pt-4 text-sm text-ink/50">
              Scores are shared once the judging for this challenge is complete.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function TrackPage() {
  return (
    <Protected>
      <Suspense fallback={<p className="py-16 text-center text-sm text-ink/60">Loading…</p>}>
        <TrackInner />
      </Suspense>
    </Protected>
  );
}
