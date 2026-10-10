"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Protected, Spinner } from "@/components/Protected";
import { StatusBadge } from "@/components/StatusBadge";
import { AUDIENCE_LABEL, type SubmissionStatus } from "@/lib/types";

interface Row {
  id: string;
  reference_id: string;
  title: string;
  status: SubmissionStatus;
  created_at: string;
  challenges: { title: string } | null;
}

function Mine() {
  const { profile, user } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("submissions")
      .select("id,reference_id,title,status,created_at,challenges(title)")
      .eq("user_id", user.id)
      .neq("status", "draft")
      .order("created_at", { ascending: false })
      .then(({ data }) => setRows((data as unknown as Row[] | null) ?? []));
  }, [user]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Welcome{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}</h1>
          {profile && (
            <p className="mt-1 text-sm text-ink/60">
              {AUDIENCE_LABEL[profile.audience]}
              {profile.country ? ` · ${profile.country}` : ""}
              {profile.role !== "participant" ? ` · ${profile.role}` : ""}
            </p>
          )}
        </div>
        <Link href="/submit" className="btn-primary">New submission</Link>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">My submissions</h2>
      {rows === null ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <div className="card text-center text-sm text-ink/70">
          You have not submitted an idea yet. <Link href="/submit" className="font-semibold text-brand">Submit your first idea</Link>.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/track?ref=${encodeURIComponent(r.reference_id)}`} className="card flex flex-wrap items-center justify-between gap-3 !p-4 transition hover:shadow-md">
                <div>
                  <p className="font-mono text-xs text-ink/50">{r.reference_id}</p>
                  <p className="font-semibold">{r.title}</p>
                  <p className="text-xs text-ink/50">{r.challenges?.title} · {new Date(r.created_at).toLocaleDateString()}</p>
                </div>
                <StatusBadge status={r.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Protected>
      <Mine />
    </Protected>
  );
}
