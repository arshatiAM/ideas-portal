"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface Row {
  id: number;
  actor: string | null;
  action: string;
  target: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export function AuditTab() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    supabase
      .from("audit_log")
      .select("*")
      .order("id", { ascending: false })
      .limit(100)
      .then(({ data }) => setRows((data as Row[] | null) ?? []));
  }, []);

  if (!rows) return <p className="text-sm text-ink/60">Loading…</p>;
  if (rows.length === 0) return <div className="card text-center text-sm text-ink/60">No admin actions recorded yet.</div>;

  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white">
      <table className="w-full text-sm">
        <thead className="bg-sand text-xs uppercase tracking-wide text-ink/60">
          <tr>
            <th className="px-4 py-3 text-start">When</th>
            <th className="px-4 py-3 text-start">Action</th>
            <th className="px-4 py-3 text-start">Target</th>
            <th className="px-4 py-3 text-start">Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-line align-top">
              <td className="whitespace-nowrap px-4 py-3 text-ink/70">{new Date(r.created_at).toLocaleString()}</td>
              <td className="px-4 py-3 font-medium">{r.action}</td>
              <td className="px-4 py-3 font-mono text-xs">{r.target}</td>
              <td className="px-4 py-3 text-xs text-ink/70">{JSON.stringify(r.details)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
