"use client";

import { isConfigured } from "@/lib/supabase";

export function ConfigNotice() {
  if (isConfigured) return null;
  return (
    <div className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm text-amber-900">
      Setup needed: add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{" "}
      <code>web/.env.local</code> (or to Vercel environment variables), then restart.
    </div>
  );
}
