"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Spinner } from "@/components/Protected";
import type { Challenge } from "@/lib/types";

interface Entry {
  rank: number;
  reference_id: string;
  title: string;
  first_name: string;
  country: string;
  score: number;
}

export default function LeaderboardPage() {
  const [challenges, setChallenges] = useState<Challenge[] | null>(null);
  const [selected, setSelected] = useState("");
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    supabase
      .from("challenges")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const list = (data as Challenge[] | null) ?? [];
        setChallenges(list);
        const preferred = list.find((c) => c.status === "published") ?? list[0];
        if (preferred) setSelected(preferred.id);
      });
  }, []);

  useEffect(() => {
    if (!selected) return;
    setEntries(null);
    supabase
      .from("public_leaderboard")
      .select("rank,reference_id,title,first_name,country,score")
      .eq("challenge_id", selected)
      .order("rank", { ascending: true })
      .then(({ data }) => setEntries((data as Entry[] | null) ?? []));
  }, [selected]);

  if (!challenges) return <Spinner />;
  const challenge = challenges.find((c) => c.id === selected);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-semibold">Leaderboard</h1>

      {challenges.length > 1 && (
        <select className="input mt-4" value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="Challenge">
          {challenges.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      )}
      {challenge && <p className="mt-3 text-ink/70">{challenge.title}</p>}

      {entries === null ? (
        <Spinner />
      ) : entries.length === 0 ? (
        <div className="card mt-6 text-center text-sm text-ink/70">
          Winners will appear here once judging is complete and an administrator has published the results.
        </div>
      ) : (
        <ol className="mt-6 space-y-3">
          {entries.map((e) => (
            <li key={e.reference_id} className={`card flex items-center gap-4 ${e.rank === 1 ? "!p-6 border-accent" : "!p-4"}`}>
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg font-bold ${e.rank <= 3 ? "bg-accent text-white" : "bg-brand-soft text-brand-dark"}`}>
                {e.rank}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">{e.rank === 1 ? "Winner" : "Finalist"}</p>
                <p className={`truncate font-semibold ${e.rank === 1 ? "text-xl" : ""}`}>{e.title}</p>
                <p className="text-xs text-ink/60">{e.first_name}{e.country ? `, ${e.country}` : ""} · <span className="font-mono">{e.reference_id}</span></p>
              </div>
              <div className="w-28 text-end">
                <p className="text-lg font-semibold text-brand-dark">{Number(e.score).toFixed(1)}</p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
                  <div className="h-full bg-brand" style={{ width: `${Math.max(0, Math.min(100, Number(e.score)))}%` }} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
