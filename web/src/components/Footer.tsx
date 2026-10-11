"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="mt-auto border-t border-line bg-white/70">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <p className="font-serif text-xl font-semibold text-ink">{t("brand")}</p>
            <p className="mt-1 text-sm text-ink/60">Crowd-sourced solutions to reduce traffic between Dubai and Sharjah.</p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-8 gap-y-2 text-sm font-medium text-ink/80">
            <Link href="/leaderboard" className="hover:text-brand hover:underline">Leaderboard</Link>
            <Link href="/submit" className="hover:text-brand hover:underline">Submit an idea</Link>
            <Link href="/track" className="hover:text-brand hover:underline">Track a submission</Link>
          </nav>
        </div>
        <div className="mt-6 flex flex-col gap-1 border-t border-line pt-4 text-xs text-ink/50 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} {t("brand")}</span>
          <span>{t("footer")}</span>
        </div>
      </div>
    </footer>
  );
}
