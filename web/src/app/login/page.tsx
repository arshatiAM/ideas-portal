"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import type { Audience } from "@/lib/types";

const AUDIENCE_OPTIONS: { value: Audience; label: string }[] = [
  { value: "uae_national", label: "UAE national" },
  { value: "uae_resident", label: "UAE resident" },
  { value: "international", label: "International participant" },
];

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { session, loading } = useAuth();
  const { lang } = useI18n();

  const next = params.get("next") && params.get("next")!.startsWith("/") ? params.get("next")! : "/dashboard";
  const [mode, setMode] = useState<"signin" | "signup">(params.get("mode") === "signup" ? "signup" : "signin");
  const initialAudience = (params.get("audience") as Audience | null) ?? "international";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState("");
  const [audience, setAudience] = useState<Audience>(
    AUDIENCE_OPTIONS.some((o) => o.value === initialAudience) ? initialAudience : "international",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && session) router.replace(next);
  }, [loading, session, next, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(next);
      } else {
        if (password.length < 8) throw new Error("Password must be at least 8 characters.");
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName.trim(), country: country.trim(), audience, language: lang } },
        });
        if (error) throw error;
        if (data.session) router.replace(next);
        else setInfo("Account created. Check your email to confirm your address, then sign in.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="card">
        <div className="mb-6 grid grid-cols-2 rounded-lg bg-sand p-1 text-sm font-semibold">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md py-2 ${mode === m ? "bg-white shadow-sm" : "text-ink/60"}`}
            >
              {m === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {mode === "signup" && (
            <>
              <div>
                <label className="label" htmlFor="name">Full name</label>
                <input id="name" className="input" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="country">Country</label>
                  <input id="country" className="input" required value={country} onChange={(e) => setCountry(e.target.value)} />
                </div>
                <div>
                  <label className="label" htmlFor="aud">I am a</label>
                  <select id="aud" className="input" value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>
                    {AUDIENCE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" className="input" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="pw">Password</label>
            <input
              id="pw"
              type="password"
              className="input"
              required
              minLength={mode === "signup" ? 8 : undefined}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === "signup" && <p className="hint">At least 8 characters.</p>}
          </div>

          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
          {info && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{info}</p>}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="py-16 text-center text-sm text-ink/60">Loading…</p>}>
      <LoginForm />
    </Suspense>
  );
}
