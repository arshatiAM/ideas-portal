export type Role = "participant" | "evaluator" | "admin" | "stakeholder";
export type Audience = "uae_national" | "uae_resident" | "international";
export type ChallengeStatus = "draft" | "open" | "closed" | "judging" | "published";
export type SubmissionStatus = "draft" | "queued" | "processing" | "evaluated" | "needs_review" | "failed";

export interface Profile {
  id: string;
  full_name: string;
  country: string;
  audience: Audience;
  role: Role;
  language: string;
}

export interface Challenge {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: ChallengeStatus;
  opens_at: string;
  closes_at: string;
  prize_amount: number | null;
  prize_currency: string | null;
  rubric_id: string;
}

export interface Criterion {
  key: string;
  label: string;
  weight: number;
  source: "llm" | "embedding";
  description: string;
}

export interface Rubric {
  id: string;
  name: string;
  version: number;
  prompt_version: string;
  criteria: Criterion[];
}

export const STATUS_LABEL: Record<SubmissionStatus, string> = {
  draft: "Draft",
  queued: "Received, waiting to be evaluated",
  processing: "Being evaluated",
  evaluated: "Evaluated, awaiting judging",
  needs_review: "Evaluated, under human review",
  failed: "Processing problem, will be retried by our team",
};

export const AUDIENCE_LABEL: Record<Audience, string> = {
  uae_national: "UAE national",
  uae_resident: "UAE resident",
  international: "International participant",
};
