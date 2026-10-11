"use client";

import { wakeWorker } from "@/lib/wakeWorker";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Protected, Spinner } from "@/components/Protected";
import { ALLOWED_MIME, MAX_FILE_BYTES, formatBytes, kindFor, mimeFor, safeName } from "@/lib/files";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { SubmissionGuide } from "@/components/ChallengeBrief";
import type { Challenge } from "@/lib/types";

const KIND_LABEL: Record<string, string> = { document: "Document", text: "Document", image: "Diagram / image", audio: "Audio", video: "Video" };
const KIND_ICON: Record<string, string> = { document: "📄", text: "📄", image: "🖼️", audio: "🎙️", video: "🎬" };

function SubmitForm() {
  const { user } = useAuth();
  const [challenges, setChallenges] = useState<Challenge[] | null>(null);
  const [challengeId, setChallengeId] = useState("");

  const [dragging, setDragging] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [cost, setCost] = useState("");
  const [months, setMonths] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // If something fails halfway, pressing Submit again resumes with the same draft.
  const draftId = useRef<string | null>(null);
  const uploaded = useRef<Set<string>>(new Set());

  useEffect(() => {
    supabase
      .from("challenges")
      .select("*")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const list = (data as Challenge[] | null) ?? [];
        setChallenges(list);
        if (list[0]) setChallengeId(list[0].id);
      });
  }, []);

  function addFiles(picked: File[]) {
    setError(null);
    const ok: File[] = [];
    const problems: string[] = [];
    for (const f of picked) {
      if (f.size === 0) problems.push(`"${f.name}" is empty.`);
      else if (f.size > MAX_FILE_BYTES) problems.push(`"${f.name}" is larger than ${formatBytes(MAX_FILE_BYTES)}.`);
      else if (!ALLOWED_MIME.has(mimeFor(f))) problems.push(`"${f.name}" is not a supported type.`);
      else ok.push(f);
    }
    setFiles((prev) => {
      const merged = [...prev, ...ok];
      if (merged.length > 10) problems.push("Only the first 10 files were kept.");
      return merged.slice(0, 10);
    });
    if (problems.length) setError(problems.join(" "));
  }

  function onFiles(e: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!user || !challengeId) return;
    if (!consent) return setError("Please accept the terms to continue.");
    if (!body.trim() && files.length === 0) return setError("Add some text, or drop in at least one file.");

    setBusy(true);
    try {
      if (!draftId.current) {
        setProgress("Saving your idea…");
        const { data, error } = await supabase
          .from("submissions")
          .insert({
            challenge_id: challengeId,
            user_id: user.id,
            title: title.trim(),
            summary: summary.trim() || null,
            body: body.trim() || null,
            cost_estimate: cost === "" ? null : Number(cost),
            duration_months: months === "" ? null : Number(months),
          })
          .select("id")
          .single();
        if (error) throw error;
        draftId.current = data.id as string;
      }
      const sid = draftId.current;

      for (const f of files) {
        const key = `${f.name}:${f.size}:${f.lastModified}`;
        if (uploaded.current.has(key)) continue;
        setProgress(`Uploading ${f.name} (${formatBytes(f.size)})…`);
        const mime = mimeFor(f);
        const path = `${user.id}/${sid}/${crypto.randomUUID().slice(0, 8)}-${safeName(f.name)}`;
        const up = await supabase.storage.from("submissions").upload(path, f, { contentType: mime, upsert: false });
        if (up.error) throw up.error;
        const ins = await supabase.from("submission_files").insert({
          submission_id: sid,
          storage_path: path,
          file_name: f.name,
          mime_type: mime,
          size_bytes: f.size,
          kind: kindFor(mime),
        });
        if (ins.error) throw ins.error;
        uploaded.current.add(key);
      }

      setProgress("Finalising…");
      const { data: ref, error: finErr } = await supabase.rpc("finalize_submission", { p_submission_id: sid });
      if (finErr) throw finErr;
      setReference(ref as string);
      wakeWorker();
    } catch (err) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message;
      setError(`${msg ?? "Something went wrong."} You can press Submit again to retry; nothing is lost.`);
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  if (reference) {
    return (
      <div className="card mx-auto max-w-xl text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">Submission received</p>
        <h1 className="mt-2 text-3xl font-semibold">Your reference ID</h1>
        <p className="my-6 select-all rounded-xl border border-dashed border-brand bg-brand-soft px-4 py-5 font-mono text-3xl font-bold tracking-wider text-brand-dark">
          {reference}
        </p>
        <p className="text-sm text-ink/70">
          Keep this ID. Evaluation starts automatically and usually finishes within a few minutes. You can follow progress at any time.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            className="btn-secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(reference);
                setCopied(true);
              } catch {
                /* clipboard unavailable */
              }
            }}
          >
            {copied ? "Copied" : "Copy ID"}
          </button>
          <Link href={`/track?ref=${encodeURIComponent(reference)}`} className="btn-primary">Track this submission</Link>
        </div>
      </div>
    );
  }

  if (!challenges) return <Spinner />;
  if (challenges.length === 0) {
    return (
      <div className="card mx-auto max-w-lg text-center">
        <h1 className="text-xl font-semibold">No open challenge</h1>
        <p className="mt-2 text-sm text-ink/70">Submissions are closed right now. Please check back soon.</p>
      </div>
    );
  }

  const selected = challenges.find((c) => c.id === challengeId);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-semibold">Submit your idea</h1>
      <p className="mt-2 text-ink/70">
        Bring your idea in whatever form suits you: type it, upload a document, a diagram, a voice note or a video, or
        combine them. Only a title and at least some content (text or a file) are needed.
      </p>

      {selected && <SubmissionGuide challenge={selected} />}

      <form onSubmit={onSubmit} className="card mt-6 space-y-5">
        {challenges.length > 1 && (
          <div>
            <label className="label" htmlFor="challenge">Challenge</label>
            <select id="challenge" className="input" value={challengeId} onChange={(e) => setChallengeId(e.target.value)}>
              {challenges.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
        )}
        {selected && <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand-dark">{selected.title}</p>}

        <div>
          <label className="label" htmlFor="title">Idea title *</label>
          <input id="title" className="input" required minLength={3} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="body">Describe your idea</label>
          <textarea
            id="body"
            className="input"
            rows={7}
            maxLength={30000}
            placeholder="Write as much or as little as you like: the problem, your solution, the impact, cost and timeline, sustainability, risks. If your idea is already in a file or recording, you can skip this."
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>

        <div>
          <span className="label">Add anything that explains your idea</span>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(Array.from(e.dataTransfer.files)); }}
            className={`rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${dragging ? "border-brand bg-brand-soft" : "border-line bg-sand/40"}`}
          >
            <p className="font-semibold">Drop files here, or</p>
            <label htmlFor="files" className="btn-secondary mt-3 inline-block cursor-pointer">Choose files</label>
            <input id="files" type="file" multiple className="sr-only" onChange={onFiles}
              accept=".pdf,.docx,.txt,image/png,image/jpeg,image/webp,audio/*,video/mp4,video/webm,video/quicktime" />
            <p className="hint mt-3">
              Documents, diagrams and images, voice recordings, videos: any mix, up to 10 files, 50 MB each. We detect the type and read all of it together.
            </p>
          </div>

          <div className="mt-3">
            <VoiceRecorder onUse={(f) => addFiles([f])} />
          </div>

          {files.length > 0 && (
            <>
              <ul className="mt-3 space-y-2">
                {files.map((f, i) => {
                  const kind = kindFor(mimeFor(f));
                  return (
                    <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span aria-hidden>{KIND_ICON[kind]}</span>
                        <span className="truncate">{f.name}</span>
                        <span className="badge shrink-0 bg-brand-soft text-brand-dark">{KIND_LABEL[kind]}</span>
                        <span className="shrink-0 text-ink/50">{formatBytes(f.size)}</span>
                      </span>
                      <button type="button" className="shrink-0 text-red-700 hover:underline" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="cost">Estimated total cost (AED, optional)</label>
            <input id="cost" type="number" min={0} step="any" className="input" value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="months">Estimated duration (months, optional)</label>
            <input id="months" type="number" min={0} step="any" className="input" value={months} onChange={(e) => setMonths(e.target.value)} />
          </div>
          <p className="hint sm:col-span-2">Already in your file or recording? Leave these blank: they are read from it.</p>
        </div>

        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            I confirm this is my own work. I understand it will be analysed by AI and reviewed by people, and I agree to the
            competition terms, including how intellectual property and prizes are handled.
          </span>
        </label>

        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        {busy && <p role="status" className="text-sm text-ink/70">{progress}</p>}

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? "Submitting…" : "Submit idea"}
        </button>
      </form>
    </div>
  );
}

export default function SubmitPage() {
  return (
    <Protected>
      <SubmitForm />
    </Protected>
  );
}
