"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Challenge, Criterion } from "@/lib/types";

const INCLUDE: { title: string; text: string }[] = [
  {
    title: "The problem",
    text: "Who is affected, where and when on the Dubai to Sharjah corridor (for example morning and evening peaks), and why it happens.",
  },
  {
    title: "Your solution",
    text: "What exactly you propose, how it works day to day, and who would build and run it.",
  },
  {
    title: "Expected impact",
    text: "How much traffic it removes, with numbers and the reasoning or data behind them (for example: share of peak trips moved, minutes saved). Claims without evidence score lower.",
  },
  {
    title: "Cost and timeline",
    text: "Total estimated cost in AED and how long it takes to deliver, in months. Say what is included in the cost. Also enter both in the form fields.",
  },
  {
    title: "Long-term sustainability",
    text: "Environmental effect, who pays to keep it running after launch, and why it stays effective in 5 to 10 years.",
  },
  {
    title: "Risks and dependencies",
    text: "Approvals, land, partners, technology or behaviour change your idea relies on, and how you reduce those risks.",
  },
  {
    title: "Evidence",
    text: "Studies, data, examples from other cities, calculations, drawings or diagrams that support your idea.",
  },
];

const FORMATS: { name: string; detail: string }[] = [
  { name: "Written text", detail: "Type it directly in the form. A few clear paragraphs are enough." },
  { name: "Documents", detail: "PDF, Word (.docx) or plain text (.txt)." },
  { name: "Images and diagrams", detail: "PNG, JPG or WEBP: system diagrams, route maps, charts, even a photo of a hand sketch. Label everything." },
  { name: "Audio", detail: "MP3, WAV or M4A. Explain your idea out loud in 2 to 5 minutes." },
  { name: "Video", detail: "MP4, WEBM or MOV. A pitch or walkthrough of 2 to 5 minutes works best." },
];

function useCriteria(rubricId: string) {
  const [criteria, setCriteria] = useState<Criterion[] | null>(null);
  useEffect(() => {
    supabase
      .from("rubrics")
      .select("criteria")
      .eq("id", rubricId)
      .maybeSingle()
      .then(({ data }) => setCriteria((data as { criteria: Criterion[] } | null)?.criteria ?? []));
  }, [rubricId]);
  return criteria;
}

function Guide({ rubricId }: { rubricId: string }) {
  const criteria = useCriteria(rubricId);
  return (
    <div className="grid gap-8 text-sm lg:grid-cols-2">
      <section>
        <h3 className="mb-2 text-base font-semibold">What your submission should include</h3>
        <ol className="space-y-2">
          {INCLUDE.map((i, n) => (
            <li key={i.title} className="flex gap-3">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand-dark">{n + 1}</span>
              <span>
                <strong>{i.title}.</strong> <span className="text-ink/70">{i.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h3 className="mb-2 text-base font-semibold">Ways to submit</h3>
        <p className="mb-2 text-ink/70">Use any mix of these. Up to 10 files, 50 MB each.</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {FORMATS.map((f) => (
            <li key={f.name} className="rounded-lg border border-line bg-sand/50 px-3 py-2">
              <p className="font-semibold">{f.name}</p>
              <p className="text-xs text-ink/70">{f.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 text-base font-semibold">How ideas are scored</h3>
        {criteria === null ? (
          <p className="text-ink/60">Loading criteria…</p>
        ) : (
          <ul className="space-y-2">
            {criteria.map((c) => (
              <li key={c.key} className="rounded-lg border border-line px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{c.label}</span>
                  <span className="badge bg-brand-soft text-brand-dark">{Math.round(c.weight * 100)}%</span>
                </div>
                <p className="text-xs text-ink/70">{c.description}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-ink/60">
          Scores come from AI using this rubric, then people review the best ideas. Finalists are verified for eligibility before winners are announced.
        </p>
      </section>
    </div>
  );
}

/** Home page card: short brief with a toggle. The expanded content is rendered by <BriefDetails/> full width. */
export function ChallengeCard({
  challenge, prizeLabel, closesLabel, open, onToggle,
}: { challenge: Challenge; prizeLabel: string; closesLabel: string; open: boolean; onToggle: () => void }) {
  return (
    <div className="card lg:col-span-2">
      <h2 className="text-xl font-semibold">{challenge.title}</h2>
      <p className="mt-2 line-clamp-4 whitespace-pre-line text-sm text-ink/70">{challenge.description}</p>

      <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 text-sm">
        <div>
          <dt className="text-ink/60">{prizeLabel}</dt>
          <dd className="text-lg font-semibold text-brand-dark">
            {challenge.prize_amount ? `${challenge.prize_currency ?? ""} ${Number(challenge.prize_amount).toLocaleString()}` : "TBA"}
          </dd>
        </div>
        <div>
          <dt className="text-ink/60">{closesLabel}</dt>
          <dd className="text-lg font-semibold">
            {new Date(challenge.closes_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
          </dd>
        </div>
      </dl>

      <button type="button" className="btn-secondary mt-4 w-full" aria-expanded={open} aria-controls="brief-details" onClick={onToggle}>
        {open ? "Hide full brief" : "Read the full brief and what to include"}
      </button>
    </div>
  );
}

/** Full-width expanded brief shown under the hero. */
export function BriefDetails({ challenge }: { challenge: Challenge }) {
  return (
    <section id="brief-details" className="card">
      <h2 className="text-xl font-semibold">{challenge.title}: full brief</h2>
      <p className="mt-2 max-w-3xl whitespace-pre-line text-sm text-ink/75">{challenge.description}</p>
      <div className="mt-6 border-t border-line pt-6">
        <Guide rubricId={challenge.rubric_id} />
      </div>
    </section>
  );
}

/** Submit page: collapsible guide shown above the form. */
export function SubmissionGuide({ challenge }: { challenge: Challenge }) {
  return (
    <details className="card mt-6 group" open>
      <summary className="cursor-pointer list-none text-base font-semibold">
        <span className="me-2 inline-block transition group-open:rotate-90">▶</span>
        How to write a strong submission
      </summary>
      <div className="mt-4 border-t border-line pt-4">
        <Guide rubricId={challenge.rubric_id} />
      </div>
    </details>
  );
}
