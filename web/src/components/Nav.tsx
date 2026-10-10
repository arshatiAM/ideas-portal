"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Logo } from "@/components/Logo";

export function Nav() {
  const { session, profile, isStaff, signOut, loading } = useAuth();
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const desktop = "rounded-md px-3 py-2 text-sm font-medium text-ink/80 hover:bg-brand-soft hover:text-brand-dark";
  const mobile = "block rounded-lg px-3 py-3 text-base font-medium text-ink hover:bg-brand-soft";
  const close = () => setOpen(false);

  const links = (cls: string) => (
    <>
      <Link href="/leaderboard" className={cls} onClick={close}>{t("nav_leaderboard")}</Link>
      {session && (
        <>
          <Link href="/submit" className={cls} onClick={close}>{t("nav_submit")}</Link>
          <Link href="/dashboard" className={cls} onClick={close}>{t("nav_mine")}</Link>
          <Link href="/track" className={cls} onClick={close}>{t("nav_track")}</Link>
        </>
      )}
      {isStaff && <Link href="/admin" className={cls} onClick={close}>{t("nav_admin")}</Link>}
    </>
  );

  const langButton = (
    <button
      type="button"
      onClick={() => setLang(lang === "en" ? "ar" : "en")}
      className="rounded-md border border-line bg-white px-2.5 py-1.5 text-xs font-semibold hover:bg-brand-soft"
      aria-label="Switch language"
    >
      {lang === "en" ? "العربية" : "English"}
    </button>
  );

  async function doSignOut() {
    close();
    await signOut();
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-sand/90 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5 sm:px-6 sm:py-3">
        <Link href="/" className="me-2 shrink-0 sm:me-4" aria-label={t("brand")} onClick={close}>
          <Logo name={t("brand")} />
        </Link>

        <div className="hidden items-center gap-1 md:flex">{links(desktop)}</div>

        <div className="ms-auto flex items-center gap-2">
          {langButton}
          <div className="hidden items-center gap-2 md:flex">
            {!loading && session ? (
              <>
                <span className="max-w-[10rem] truncate text-sm text-ink/70">{profile?.full_name || session.user.email}</span>
                <button type="button" className="btn-secondary" onClick={doSignOut}>{t("nav_signout")}</button>
              </>
            ) : (
              !loading && <Link href="/login" className="btn-primary">{t("nav_signin")}</Link>
            )}
          </div>
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-white md:hidden"
            aria-label="Menu"
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen(!open)}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </nav>

      {open && (
        <div id="mobile-menu" className="border-t border-line bg-sand px-4 pb-4 pt-2 md:hidden">
          <div className="space-y-1">{links(mobile)}</div>
          <div className="mt-3 border-t border-line pt-3">
            {!loading && session ? (
              <div className="space-y-2">
                <p className="truncate px-1 text-sm text-ink/60">{profile?.full_name || session.user.email}</p>
                <button type="button" className="btn-secondary w-full" onClick={doSignOut}>{t("nav_signout")}</button>
              </div>
            ) : (
              !loading && <Link href="/login" className="btn-primary w-full" onClick={close}>{t("nav_signin")}</Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
