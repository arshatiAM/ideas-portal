"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Protected, Spinner } from "@/components/Protected";
import { QueueTab } from "@/components/admin/QueueTab";
import { ShortlistTab } from "@/components/admin/ShortlistTab";
import { RubricTab } from "@/components/admin/RubricTab";
import { AuditTab } from "@/components/admin/AuditTab";
import type { Challenge, ChallengeStatus } from "@/lib/types";

type Tab = "queue" | "shortlist" | "rubric" | "audit";

function AdminConsole() {
  const { isAdmin } = useAuth();
  const [challenges, setChallenges] = useState<Challenge[] | null>(null);
  const [selected, setSelected] = useState("");
  const [tab, setTab] = useState<Tab>("queue");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const loadChallenges = useCallback(async () => {
    const { data } = await supabase.from("challenges").select("*").order("created_at", { ascending: false });
    const list = (data as Challenge[] | null) ?? [];
    setChallenges(list);
    setSelected((cur) => cur || list[0]?.id || "");
  }, []);

  useEffect(() => {
    loadChallenges();
  }, [loadChallenges]);

  if (!challenges) return <Spinner />;
  const challenge = challenges.find((c) => c.id === selected);
  if (!challenge) return <div className="card text-center text-sm text-ink/60">No challenges yet.</div>;

  const tabs: { key: Tab; label: string; adminOnly?: boolean }[] = [
    { key: "queue", label: "Submissions" },
    { key: "shortlist", label: "Shortlist and winners", adminOnly: true },
    { key: "rubric", label: "Rubric", adminOnly: true },
    { key: "audit", label: "Audit log", adminOnly: true },
  ];

  async function setStatus(status: ChallengeStatus) {
    setStatusMsg(null);
    const { error } = await supabase.from("challenges").update({ status }).eq("id", challenge!.id);
    setStatusMsg(error ? error.message : `Challenge is now "${status}".`);
    loadChallenges();
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Admin console</h1>
          <p className="text-sm text-ink/60">{isAdmin ? "Administrator" : "Evaluator"} access</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {challenges.length > 1 && (
            <select className="input !w-auto" value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="Challenge">
              {challenges.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          )}
          {isAdmin && (
            <label className="flex items-center gap-2 text-sm">
              Status
              <select className="input !w-auto" value={challenge.status} onChange={(e) => setStatus(e.target.value as ChallengeStatus)}>
                {["draft", "open", "closed", "judging", "published"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          )}
        </div>
      </div>
      <p className="mb-4 text-sm text-ink/70">{challenge.title}</p>
      {statusMsg && <p role="status" className="mb-4 rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand-dark">{statusMsg}</p>}

      <div className="mb-6 flex flex-wrap gap-2 border-b border-line">
        {tabs.filter((t) => !t.adminOnly || isAdmin).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === t.key ? "border-brand text-brand-dark" : "border-transparent text-ink/60 hover:text-ink"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "queue" && <QueueTab challenge={challenge} isAdmin={isAdmin} />}
      {tab === "shortlist" && isAdmin && <ShortlistTab challenge={challenge} onChallengeChanged={loadChallenges} />}
      {tab === "rubric" && isAdmin && <RubricTab challenge={challenge} onChallengeChanged={loadChallenges} />}
      {tab === "audit" && isAdmin && <AuditTab />}
    </div>
  );
}

export default function AdminPage() {
  return (
    <Protected roles={["admin", "evaluator"]}>
      <AdminConsole />
    </Protected>
  );
}
