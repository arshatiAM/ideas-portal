"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { LogoMark } from "@/components/Logo";

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="mt-auto bg-brand-dark text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <LogoMark size={36} />
          <div>
            <p className="font-semibold">{t("brand")}</p>
            <p className="max-w-md text-sm text-white/75">{t("footer")}</p>
          </div>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/85">
          <Link href="/leaderboard" className="hover:text-white hover:underline">Leaderboard</Link>
          <Link href="/submit" className="hover:text-white hover:underline">Submit an idea</Link>
          <Link href="/track" className="hover:text-white hover:underline">Track</Link>
        </nav>
      </div>
    </footer>
  );
}
