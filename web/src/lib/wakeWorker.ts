/**
 * Free worker hosts sleep when nobody visits them. Pinging the worker's health URL wakes it,
 * so a queued idea starts being evaluated right away. Fire-and-forget: failures are ignored.
 */
export function wakeWorker(): void {
  const url = process.env.NEXT_PUBLIC_WORKER_URL;
  if (!url) return;
  try {
    void fetch(`${url.replace(/\/$/, "")}/healthz`, { mode: "no-cors", cache: "no-store" }).catch(() => {});
  } catch {
    /* ignore */
  }
}
