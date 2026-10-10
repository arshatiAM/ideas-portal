import type { SubmissionStatus } from "@/lib/types";

const STYLE: Record<SubmissionStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  queued: "bg-blue-100 text-blue-800",
  processing: "bg-amber-100 text-amber-800",
  evaluated: "bg-emerald-100 text-emerald-800",
  needs_review: "bg-purple-100 text-purple-800",
  failed: "bg-red-100 text-red-800",
};

const SHORT: Record<SubmissionStatus, string> = {
  draft: "Draft",
  queued: "Queued",
  processing: "Evaluating",
  evaluated: "Evaluated",
  needs_review: "Needs review",
  failed: "Failed",
};

export function StatusBadge({ status }: { status: SubmissionStatus }) {
  return <span className={`badge ${STYLE[status]}`}>{SHORT[status]}</span>;
}
