"use client";

import { useI18n } from "@/lib/i18n";

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="mt-auto border-t border-line bg-white/70">
      <p className="mx-auto max-w-6xl px-4 py-5 text-center text-sm text-ink/60 sm:px-6">
        © {new Date().getFullYear()} {t("brand")}
      </p>
    </footer>
  );
}
