"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface FileRow {
  id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  kind: string;
}
interface Sub {
  title: string;
  summary: string | null;
  body: string | null;
  cost_estimate: number | null;
  duration_months: number | null;
}

const fmt = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Shows exactly what the participant submitted: their text and every uploaded file. Staff and the owner can read these under RLS. */
export function SubmissionContent({ submissionId }: { submissionId: string }) {
  const [sub, setSub] = useState<Sub | null>(null);
  const [files, setFiles] = useState<(FileRow & { url?: string })[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const [s, f] = await Promise.all([
        supabase.from("submissions").select("title,summary,body,cost_estimate,duration_months").eq("id", submissionId).single(),
        supabase.from("submission_files").select("id,storage_path,file_name,mime_type,size_bytes,kind").eq("submission_id", submissionId),
      ]);
      if (!alive) return;
      if (s.error) return setErr(s.error.message);
      setSub(s.data as Sub);
      const rows = (f.data ?? []) as FileRow[];
      const withUrls = await Promise.all(
        rows.map(async (r) => {
          const { data } = await supabase.storage.from("submissions").createSignedUrl(r.storage_path, 3600);
          return { ...r, url: data?.signedUrl };
        }),
      );
      if (alive) setFiles(withUrls);
    })();
    return () => {
      alive = false;
    };
  }, [submissionId]);

  if (err) return <p className="text-sm text-red-700">Could not load the submission: {err}</p>;
  if (!sub) return <p className="text-sm text-ink/70">Loading submission…</p>;

  return (
    <section className="rounded-xl border border-line bg-white p-4 space-y-3">
      <h4 className="font-semibold text-ink">Submitted idea (original)</h4>
      <div>
        <p className="font-medium">{sub.title}</p>
        {sub.summary && <p className="text-sm text-ink/70 mt-1">{sub.summary}</p>}
      </div>
      {sub.body ? (
        <p className="text-sm text-ink/70 whitespace-pre-wrap break-words max-h-80 overflow-auto rounded-lg bg-white border border-line p-3">{sub.body}</p>
      ) : (
        <p className="text-sm text-ink/70">No written description; the idea is in the files below.</p>
      )}
      {(sub.cost_estimate != null || sub.duration_months != null) && (
        <p className="text-xs text-ink/70">
          Stated cost: {sub.cost_estimate != null ? `AED ${sub.cost_estimate.toLocaleString()}` : "not given"} · Stated duration:{" "}
          {sub.duration_months != null ? `${sub.duration_months} months` : "not given"}
        </p>
      )}
      {files.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/70">Files ({files.length})</p>
          {files.map((f) => (
            <div key={f.id} className="rounded-lg border border-line bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="break-all">{f.file_name} <span className="text-ink/70">· {f.kind} · {fmt(f.size_bytes)}</span></span>
                {f.url && (
                  <a href={f.url} target="_blank" rel="noreferrer" className="text-teal-700 underline">Open / download</a>
                )}
              </div>
              {f.url && f.mime_type.startsWith("image/") && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.url} alt={f.file_name} className="mt-2 max-h-96 w-auto max-w-full rounded border" />
              )}
              {f.url && f.mime_type.startsWith("audio/") && <audio controls src={f.url} className="mt-2 w-full" />}
              {f.url && f.mime_type.startsWith("video/") && <video controls src={f.url} className="mt-2 max-h-96 w-full rounded" />}
              {!f.url && <p className="mt-1 text-xs text-red-700">Could not create a link for this file.</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
