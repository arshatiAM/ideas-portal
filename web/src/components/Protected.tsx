"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return <p className="py-16 text-center text-sm text-ink/60">{label}</p>;
}

/** Redirects anonymous visitors to /login and blocks users without the required role.
 *  This is a UX guard only: the real enforcement is row-level security in the database. */
export function Protected({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { session, profile, loading } = useAuth();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (!loading && !session) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [loading, session, router, path]);

  if (loading || !session) return <Spinner />;
  if (roles) {
    if (!profile) return <Spinner />;
    if (!roles.includes(profile.role)) {
      return (
        <div className="card mx-auto max-w-lg text-center">
          <h1 className="text-xl font-semibold">Access restricted</h1>
          <p className="mt-2 text-sm text-ink/70">Your account does not have permission to view this page.</p>
        </div>
      );
    }
  }
  return <>{children}</>;
}
