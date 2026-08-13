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
      assessmentRevisionKey: true,
      createdAt: true,
      updatedAt: true,
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
    assessmentRevisionKey: answer.assessmentRevisionKey,
    snapshots,
  });
  const latestEvent = await transaction.learningEvent.findFirst({
    where: {
      sourceType: LearningEventSourceType.RECOMMENDATION_PRACTICE_ANSWER,
      sourceId: answer.id,
    },
    orderBy: { sourceRevision: "desc" },
    select: { id: true, sourceRevision: true, inputFingerprint: true },
  });
  if (latestEvent?.inputFingerprint === fingerprint) {
    const mastery = await recalculateStudentCourseConceptMastery(
      transaction,
      answer.recommendation.studentId,
      courseId,
    );
    return { courseId, learningEventId: latestEvent.id, mastery };
  }
  const sourceRevision = (latestEvent?.sourceRevision ?? 0) + 1;
  const payload = recommendationPracticeLearningEventPayloadSchema.parse({
    recommendationId: answer.recommendation.id,
    recommendationPracticeAnswerId: answer.id,
    score: answer.score.toFixed(CONCEPT_EVIDENCE_SCORE_SCALE),
    maxScore: answer.maxScore.toFixed(CONCEPT_EVIDENCE_SCORE_SCALE),
    isCorrect: answer.isCorrect,
    assessmentRevisionKey: answer.assessmentRevisionKey,
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
      sourceRevision,
      occurredAt: answer.updatedAt,
      idempotencyKey: `recommendation-practice:${answer.id}:revision:${sourceRevision}`,
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
  const previousEvidence =
    await transaction.recommendationConceptEvidence.findMany({
      where: { recommendationPracticeAnswerId: answer.id },
      orderBy: { revision: "desc" },
      distinct: ["conceptId"],
      select: { id: true, conceptId: true, revision: true },
    });
  const previousByConcept = new Map(
    previousEvidence.map((row) => [row.conceptId, row]),
  );
  await transaction.recommendationConceptEvidence.createMany({
    data: snapshots.map((snapshot) => {
      const previous = previousByConcept.get(snapshot.conceptId);
      return {
        studentId: answer.recommendation.studentId,
        courseId,
        recommendationId: answer.recommendation.id,
        recommendationPracticeAnswerId: answer.id,
        questionId: answer.questionId,
        recommendationConceptSnapshotId: snapshot.id,
        conceptId: snapshot.conceptId,
        bindingType: snapshot.bindingType,
        revision: (previous?.revision ?? 0) + 1,
        inputFingerprint: fingerprint,
        status: ConceptEvidenceStatus.VALID,
        score: answer.score,
        maxScore: answer.maxScore,
        normalizedScore,
        gradedAt: answer.updatedAt,
        supersedesEvidenceId: previous?.id ?? null,
        learningEventId: event.id,
      };
    }),
  });
  const mastery = await recalculateStudentCourseConceptMastery(
    transaction,
    answer.recommendation.studentId,
    courseId,
  );
  return { courseId, learningEventId: event.id, mastery };
}

export async function revokeRecommendationPracticeLearningEvent(
  transaction: Prisma.TransactionClient,
  recommendationPracticeAnswerId: string,
) {
  const answer = await transaction.recommendationPracticeAnswer.findUnique({
    where: { id: recommendationPracticeAnswerId },
    select: {
      id: true,
      questionId: true,
      recommendation: {
        select: {
          id: true,
          studentId: true,
          courseCycle: { select: { courseId: true } },
          conceptSnapshots: {
            where: {
              resolutionStatus: AssignmentConceptResolutionStatus.RESOLVED,
            },
            select: { id: true, conceptId: true, bindingType: true },
          },
        },
      },
    },
  });
  const courseId = answer?.recommendation.courseCycle?.courseId ?? null;
  if (
    !answer ||
    !courseId ||
    answer.recommendation.conceptSnapshots.length === 0
  )
    return null;
  const latestEvent = await transaction.learningEvent.findFirst({
    where: {
      sourceType: LearningEventSourceType.RECOMMENDATION_PRACTICE_ANSWER,
      sourceId: answer.id,
    },
    orderBy: { sourceRevision: "desc" },
    select: { sourceRevision: true },
  });
  const sourceRevision = (latestEvent?.sourceRevision ?? 0) + 1;
  const fingerprint = conceptMasteryFingerprint({
    recommendationPracticeAnswerId: answer.id,
    revoked: true,
    sourceRevision,
  });
  const event = await transaction.learningEvent.create({
    data: {
      studentId: answer.recommendation.studentId,
      courseId,
      eventType: LearningEventType.RECOMMENDATION_PRACTICE_REVOKED,
      schemaVersion: RECOMMENDATION_LEARNING_EVENT_SCHEMA_VERSION,
      sourceType: LearningEventSourceType.RECOMMENDATION_PRACTICE_ANSWER,
      sourceId: answer.id,
      sourceRevision,
      occurredAt: new Date(),
      idempotencyKey: `recommendation-practice:${answer.id}:revision:${sourceRevision}`,
      inputFingerprint: fingerprint,
      ruleVersion: RECOMMENDATION_LEARNING_EVENT_RULE_VERSION,
      payload: {
        recommendationId: answer.recommendation.id,
        recommendationPracticeAnswerId: answer.id,
        revoked: true,
      },
      concepts: {
        create: answer.recommendation.conceptSnapshots.map((snapshot) => ({
          conceptId: snapshot.conceptId,
          bindingType: snapshot.bindingType,
          recommendationConceptSnapshotId: snapshot.id,
        })),
      },
    },
    select: { id: true },
  });
  const previousEvidence =
    await transaction.recommendationConceptEvidence.findMany({
      where: { recommendationPracticeAnswerId: answer.id },
      orderBy: { revision: "desc" },
      distinct: ["conceptId"],
      select: { id: true, conceptId: true, revision: true },
    });
  const previousByConcept = new Map(
    previousEvidence.map((row) => [row.conceptId, row]),
  );
  await transaction.recommendationConceptEvidence.createMany({
    data: answer.recommendation.conceptSnapshots.map((snapshot) => {
      const previous = previousByConcept.get(snapshot.conceptId);
      return {
        studentId: answer.recommendation.studentId,
        courseId,
        recommendationId: answer.recommendation.id,
        recommendationPracticeAnswerId: answer.id,
        questionId: answer.questionId,
        recommendationConceptSnapshotId: snapshot.id,
        conceptId: snapshot.conceptId,
        bindingType: snapshot.bindingType,
        revision: (previous?.revision ?? 0) + 1,
        inputFingerprint: fingerprint,
        status: ConceptEvidenceStatus.REVOKED,
        supersedesEvidenceId: previous?.id ?? null,
        learningEventId: event.id,
      };
    }),
  });
  const mastery = await recalculateStudentCourseConceptMastery(
    transaction,
    answer.recommendation.studentId,
    courseId,
  );
  return { courseId, learningEventId: event.id, mastery };
}
