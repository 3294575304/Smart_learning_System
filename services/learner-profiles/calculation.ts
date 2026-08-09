import { LearnerProfileEvidenceState } from "@prisma/client";

import { CONCLUSIVE_EVIDENCE_COUNT } from "@/services/learner-profiles/constants";

export function learnerProfileEvidenceState(
  count: number,
): LearnerProfileEvidenceState {
  if (count === 0) return LearnerProfileEvidenceState.NO_EVIDENCE;
  if (count < CONCLUSIVE_EVIDENCE_COUNT) {
    return LearnerProfileEvidenceState.INSUFFICIENT_EVIDENCE;
  }
  return LearnerProfileEvidenceState.CONCLUSIVE;
}

export function evidenceConfidence(count: number): number {
  if (count === 0) return 0;
  if (count === 1) return 0.34;
  if (count === 2) return 0.67;
  return Math.min(1, 0.7 + (count - 3) * 0.05);
}
