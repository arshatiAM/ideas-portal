"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { findAudience } from "@/lib/audiences";

export default function AudiencePage() {
  const params = useParams<{ audience: string }>();
  const info = findAudience(params.audience);

  if (!info) {
    return (
      <div className="card mx-auto max-w-lg text-center">
        <h1 className="text-xl font-semibold">Page not found</h1>
        <Link href="/" className="btn-primary mt-4">Back to home</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/" className="text-sm font-medium text-brand hover:underline">← All audiences</Link>
      <h1 className="mt-4 text-4xl font-semibold">{info.title}</h1>
      <p className="mt-3 text-lg text-ink/75">{info.tagline}</p>

      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {info.points.map((p) => (
          <li key={p} className="card flex gap-3 !p-4 text-sm">
            <span aria-hidden className="mt-0.5 text-brand">●</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>

      {info.note && (
        <p className="mt-6 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm text-ink/80">{info.note}</p>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href={info.cta.href} className="btn-primary">{info.cta.label}</Link>
        <Link href="/leaderboard" className="btn-secondary">See the leaderboard</Link>
      </div>
    </div>
  );
}
