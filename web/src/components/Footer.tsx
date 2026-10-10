"use client";

import { useI18n } from "@/lib/i18n";

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-line bg-white/60">
      <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-ink/60 sm:px-6">{t("footer")}</div>
    </footer>
  );
}
