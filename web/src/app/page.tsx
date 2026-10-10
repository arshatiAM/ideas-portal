"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { AUDIENCES } from "@/lib/audiences";
import { ChallengeCard, BriefDetails } from "@/components/ChallengeBrief";
import type { Challenge } from "@/lib/types";

export default function Home() {
  const { t } = useI18n();
  const { session } = useAuth();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supabase
      .from("challenges")
      .select("*")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setChallenge((data as Challenge | null) ?? null));
  }, []);

  return (
    <div className="space-y-16">
      <section className="grid gap-8 lg:grid-cols-5 lg:items-start">
        <div className="lg:col-span-3">
          <p className="mb-3 inline-block rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
            Open challenge
          </p>
          <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">{t("hero_title")}</h1>
          <p className="mt-5 max-w-2xl text-lg text-ink/75">{t("hero_sub")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={session ? "/submit" : "/login?mode=signup&next=/submit"} className="btn-primary">
              {session ? t("cta_submit") : t("cta_start")}
            </Link>
            <Link href="/leaderboard" className="btn-secondary">
              {t("cta_board")}
            </Link>
          </div>
        </div>

        {challenge ? (
          <ChallengeCard challenge={challenge} prizeLabel={t("prize")} closesLabel={t("closes")} open={open} onToggle={() => setOpen(!open)} />
        ) : (
          <div className="card lg:col-span-2">
            <p className="text-sm text-ink/60">No challenge is open right now. Please check back soon.</p>
          </div>
        )}
      </section>

      {challenge && open && <BriefDetails challenge={challenge} />}

      <section>
        <h2 className="mb-6 text-2xl font-semibold">{t("who_for")}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AUDIENCES.map((a) => (
            <Link key={a.slug} href={`/for/${a.slug}`} className="card transition hover:-translate-y-0.5 hover:shadow-md">
              <h3 className="text-lg font-semibold">{a.title}</h3>
              <p className="mt-2 text-sm text-ink/70">{a.tagline}</p>
              <span className="mt-4 inline-block text-sm font-semibold text-brand">Learn more →</span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-6 text-2xl font-semibold">{t("how_title")}</h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(["1", "2", "3", "4"] as const).map((n) => (
            <li key={n} className="card">
              <h3 className="font-semibold text-brand-dark">{t(`step${n}_t`)}</h3>
              <p className="mt-2 text-sm text-ink/70">{t(`step${n}_d`)}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
