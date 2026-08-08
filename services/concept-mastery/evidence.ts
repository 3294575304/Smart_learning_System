import { Prisma } from "@prisma/client";

import {
  appendAssessmentLearningEventAndProjectEvidence,
  appendAssessmentLearningEventsAndProjectEvidence,
  type AssessmentLearningEventResult,
} from "@/services/learning-events/assessment";

export type ConceptEvidenceSyncResult = AssessmentLearningEventResult;

/**
 * Compatibility adapter for callers that have not yet adopted the learning-event
 * vocabulary. New grading code must use appendAssessmentLearningEventAndProjectEvidence.
 */
export async function synchronizeAnswerConceptEvidence(
  transaction: Prisma.TransactionClient,
  studentAnswerId: string,
): Promise<ConceptEvidenceSyncResult> {
  return appendAssessmentLearningEventAndProjectEvidence(
    transaction,
    studentAnswerId,
  );
}

/** @deprecated Use appendAssessmentLearningEventsAndProjectEvidence. */
export async function synchronizeAnswersConceptEvidence(
  transaction: Prisma.TransactionClient,
  studentAnswerIds: readonly string[],
) {
  return appendAssessmentLearningEventsAndProjectEvidence(
    transaction,
    studentAnswerIds,
  );
}
