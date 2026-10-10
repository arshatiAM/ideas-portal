import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && anon);

// Placeholders keep the build working when env vars are missing; the UI shows a setup notice instead.
export const supabase = createClient(url ?? "http://localhost:54321", anon ?? "public-anon-key-placeholder", {
  auth: { persistSession: true, autoRefreshToken: true },
});
