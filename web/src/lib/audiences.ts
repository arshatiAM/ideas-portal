export interface AudienceInfo {
  slug: string;
  title: string;
  tagline: string;
  points: string[];
  note?: string;
  cta: { label: string; href: string };
}

export const AUDIENCES: AudienceInfo[] = [
  {
    slug: "national",
    title: "UAE nationals",
    tagline: "You know this corridor better than anyone. Help shape its future.",
    points: [
      "Arabic and English interface",
      "Submit documents, diagrams, audio or video",
      "Track your idea with a reference ID",
      "Prize eligibility is verified for finalists",
    ],
    note: "Finalists confirm identity before winners are announced.",
    cta: { label: "Create a national account", href: "/login?mode=signup&audience=uae_national" },
  },
  {
    slug: "resident",
    title: "UAE residents",
    tagline: "You live the Dubai to Sharjah commute. Turn your experience into a solution.",
    points: [
      "Arabic and English interface",
      "Commuter perspective is highly valued",
      "Submit as a short note or a full proposal",
      "Prize eligibility is verified for finalists",
    ],
    note: "Finalists provide residency details before winners are announced.",
    cta: { label: "Create a resident account", href: "/login?mode=signup&audience=uae_resident" },
  },
  {
    slug: "international",
    title: "International participants",
    tagline: "Cities worldwide have solved similar problems. Bring what works.",
    points: [
      "Open to everyone, anywhere in the world",
      "Submit in English or Arabic",
      "Reference examples from other cities with evidence",
      "Prize eligibility is verified for finalists",
    ],
    note: "Finalists verify identity and country eligibility before winners are announced.",
    cta: { label: "Create an account", href: "/login?mode=signup&audience=international" },
  },
  {
    slug: "evaluator",
    title: "Evaluators",
    tagline: "Review the AI's reasoning and make the final call on the best ideas.",
    points: [
      "See every score with its reasoning and evidence",
      "Override scores with a recorded reason",
      "Flagged submissions are routed to you",
      "Every action is written to the audit log",
    ],
    note: "Evaluator access is granted by an administrator.",
    cta: { label: "Sign in", href: "/login" },
  },
  {
    slug: "administrator",
    title: "Administrators",
    tagline: "Run challenges, tune the rubric, verify finalists and publish winners.",
    points: [
      "Manage challenge status and rubric versions",
      "Re-run failed evaluations",
      "Build the Top 10 shortlist and verify eligibility",
      "Publish winners with a full audit trail",
    ],
    note: "Administrator access is granted by the platform owner.",
    cta: { label: "Sign in", href: "/login?next=/admin" },
  },
  {
    slug: "stakeholder",
    title: "Government stakeholders",
    tagline: "Follow the competition and see the best ideas once they are published.",
    points: ["Read-only view of published results", "Transparent scoring criteria", "No account needed for the public leaderboard"],
    cta: { label: "View leaderboard", href: "/leaderboard" },
  },
];

export function findAudience(slug: string): AudienceInfo | undefined {
  return AUDIENCES.find((a) => a.slug === slug);
}
