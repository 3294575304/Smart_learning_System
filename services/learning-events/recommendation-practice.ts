import {
  AssignmentConceptResolutionStatus,
  ConceptEvidenceStatus,
  LearningEventSourceType,
  LearningEventType,
  Prisma,
} from "@prisma/client";

import { CONCEPT_EVIDENCE_SCORE_SCALE } from "@/services/concept-mastery/constants";
import { conceptMasteryFingerprint } from "@/services/concept-mastery/fingerprint";
import { recalculateStudentCourseConceptMastery } from "@/services/concept-mastery/service";
import {
  RECOMMENDATION_LEARNING_EVENT_RULE_VERSION,
  RECOMMENDATION_LEARNING_EVENT_SCHEMA_VERSION,
} from "@/services/learning-events/constants";
import { recommendationPracticeLearningEventPayloadSchema } from "@/services/learning-events/schemas";

export async function appendRecommendationPracticeLearningEvent(
  transaction: Prisma.TransactionClient,
  recommendationPracticeAnswerId: string,
) {
  const answer = await transaction.recommendationPracticeAnswer.findUnique({
    where: { id: recommendationPracticeAnswerId },
    select: {
      id: true,
      questionId: true,
      score: true,
      maxScore: true,
      isCorrect: true,
      createdAt: true,
      recommendation: {
        select: {
          id: true,
          studentId: true,
          courseCycle: { select: { courseId: true } },
          conceptSnapshots: {
            where: {
              resolutionStatus: AssignmentConceptResolutionStatus.RESOLVED,
            },
            orderBy: { conceptId: "asc" },
            select: {
              id: true,
              courseId: true,
              conceptId: true,
              bindingType: true,
            },
          },
        },
      },
    },
  });
  const courseId = answer?.recommendation.courseCycle?.courseId ?? null;
  const snapshots = answer?.recommendation.conceptSnapshots ?? [];
  if (
    !answer ||
    !courseId ||
    snapshots.length === 0 ||
    snapshots.some((snapshot) => snapshot.courseId !== courseId)
  ) {
    return null;
  }
  const existing = await transaction.learningEvent.findUnique({
    where: {
      sourceType_sourceId_sourceRevision: {
        sourceType: LearningEventSourceType.RECOMMENDATION_PRACTICE_ANSWER,
        sourceId: answer.id,
        sourceRevision: 1,
      },
    },
    select: { id: true },
  });
  if (existing) {
    const mastery = await recalculateStudentCourseConceptMastery(
      transaction,
      answer.recommendation.studentId,
      courseId,
    );
    return { courseId, learningEventId: existing.id, mastery };
  }
  if (
    answer.maxScore.lte(0) ||
    answer.score.lt(0) ||
    answer.score.gt(answer.maxScore)
  ) {
    return null;
  }
  const fingerprint = conceptMasteryFingerprint({
    recommendationPracticeAnswerId: answer.id,
    recommendationId: answer.recommendation.id,
    score: answer.score.toFixed(CONCEPT_EVIDENCE_SCORE_SCALE),
    maxScore: answer.maxScore.toFixed(CONCEPT_EVIDENCE_SCORE_SCALE),
    isCorrect: answer.isCorrect,
    snapshots,
  });
  const payload = recommendationPracticeLearningEventPayloadSchema.parse({
    recommendationId: answer.recommendation.id,
    recommendationPracticeAnswerId: answer.id,
    score: answer.score.toFixed(CONCEPT_EVIDENCE_SCORE_SCALE),
    maxScore: answer.maxScore.toFixed(CONCEPT_EVIDENCE_SCORE_SCALE),
    isCorrect: answer.isCorrect,
    conceptSnapshotCount: snapshots.length,
  });
  const event = await transaction.learningEvent.create({
    data: {
      studentId: answer.recommendation.studentId,
      courseId,
      eventType: LearningEventType.RECOMMENDATION_PRACTICE_GRADED,
      schemaVersion: RECOMMENDATION_LEARNING_EVENT_SCHEMA_VERSION,
      sourceType: LearningEventSourceType.RECOMMENDATION_PRACTICE_ANSWER,
      sourceId: answer.id,
      sourceRevision: 1,
      occurredAt: answer.createdAt,
      idempotencyKey: `recommendation-practice:${answer.id}:revision:1`,
      inputFingerprint: fingerprint,
      ruleVersion: RECOMMENDATION_LEARNING_EVENT_RULE_VERSION,
      payload,
      concepts: {
        create: snapshots.map((snapshot) => ({
          conceptId: snapshot.conceptId,
          bindingType: snapshot.bindingType,
          recommendationConceptSnapshotId: snapshot.id,
          score: answer.score,
          maxScore: answer.maxScore,
        })),
      },
    },
    select: { id: true },
  });
  const normalizedScore = answer.score
    .div(answer.maxScore)
    .mul(100)
    .toDecimalPlaces(CONCEPT_EVIDENCE_SCORE_SCALE);
  await transaction.recommendationConceptEvidence.createMany({
    data: snapshots.map((snapshot) => ({
      studentId: answer.recommendation.studentId,
      courseId,
      recommendationId: answer.recommendation.id,
      recommendationPracticeAnswerId: answer.id,
      questionId: answer.questionId,
      recommendationConceptSnapshotId: snapshot.id,
      conceptId: snapshot.conceptId,
      bindingType: snapshot.bindingType,
      revision: 1,
      inputFingerprint: fingerprint,
      status: ConceptEvidenceStatus.VALID,
      score: answer.score,
      maxScore: answer.maxScore,
      normalizedScore,
      gradedAt: answer.createdAt,
      learningEventId: event.id,
    })),
  });
  const mastery = await recalculateStudentCourseConceptMastery(
    transaction,
    answer.recommendation.studentId,
    courseId,
  );
  return { courseId, learningEventId: event.id, mastery };
}
