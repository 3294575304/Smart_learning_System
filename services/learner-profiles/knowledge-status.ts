import type { LearnerProfileEvidenceState } from "@prisma/client";

export type KnowledgeStatus =
  "MASTERED" | "DEVELOPING" | "NEEDS_SUPPORT" | "INSUFFICIENT" | "NO_EVIDENCE";

/** Presentation rules for the student profile; historical score aggregation is unchanged. */
export function studentKnowledgeStatus(
  concept: {
    evidenceState: LearnerProfileEvidenceState;
    masteryScore: number | null;
  } | null,
): KnowledgeStatus {
  if (!concept || concept.evidenceState === "NO_EVIDENCE") return "NO_EVIDENCE";
  if (
    concept.evidenceState === "INSUFFICIENT_EVIDENCE" ||
    concept.masteryScore === null
  )
    return "INSUFFICIENT";
  if (concept.masteryScore >= 80) return "MASTERED";
  if (concept.masteryScore >= 60) return "DEVELOPING";
  return "NEEDS_SUPPORT";
}

export const STUDENT_KNOWLEDGE_STATES = {
  MASTERED: {
    label: "已掌握",
    symbol: "✓",
    style: "border-emerald-700 bg-emerald-700 text-white",
  },
  DEVELOPING: {
    label: "巩固中",
    symbol: "~",
    style: "border-sky-700 bg-sky-700 text-white",
  },
  NEEDS_SUPPORT: {
    label: "需加强",
    symbol: "!",
    style: "border-rose-700 bg-rose-700 text-white",
  },
  INSUFFICIENT: {
    label: "待进一步评估",
    symbol: "?",
    style: "border-amber-700 bg-amber-100 text-amber-900",
  },
  NO_EVIDENCE: {
    label: "尚未评估",
    symbol: "—",
    style: "border-slate-500 bg-slate-100 text-slate-700",
  },
} as const;
