"use client";

import { useI18n } from "@/lib/i18n";

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="mt-auto border-t border-line bg-white/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-5 text-sm text-ink/60 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span className="font-semibold text-ink/80">{t("brand")}</span>
        <span>{t("footer")}</span>
      </div>
    </footer>
  );
}
