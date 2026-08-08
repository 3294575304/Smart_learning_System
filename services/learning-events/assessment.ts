import {
  AssignmentConceptResolutionStatus,
  ConceptEvidenceGradingSource,
  ConceptEvidenceStatus,
  GradingStatus,
  LearningEventSourceType,
  LearningEventType,
  Prisma,
} from "@prisma/client";

import { CONCEPT_EVIDENCE_SCORE_SCALE } from "@/services/concept-mastery/constants";
import { ConceptMasteryConcurrencyError } from "@/services/concept-mastery/errors";
import { conceptMasteryFingerprint } from "@/services/concept-mastery/fingerprint";
import { recalculateStudentCourseConceptMastery } from "@/services/concept-mastery/service";
import {
  ASSESSMENT_LEARNING_EVENT_RULE_VERSION,
  ASSESSMENT_LEARNING_EVENT_SCHEMA_VERSION,
} from "@/services/learning-events/constants";
import { assessmentLearningEventPayloadSchema } from "@/services/learning-events/schemas";

export interface AssessmentLearningEventResult {
  changed: boolean;
  courseId: string | null;
  studentId: string | null;
  revision: number | null;
  learningEventId: string | null;
  evidenceCount: number;
  status: ConceptEvidenceStatus | null;
}

function gradingSource(
  status: GradingStatus,
): ConceptEvidenceGradingSource | null {
  if (status === GradingStatus.AUTO_GRADED)
    return ConceptEvidenceGradingSource.AUTO_GRADING;
  if (status === GradingStatus.GRADED)
    return ConceptEvidenceGradingSource.MANUAL_GRADING;
  return null;
}

export async function appendAssessmentLearningEventAndProjectEvidence(
  transaction: Prisma.TransactionClient,
  studentAnswerId: string,
): Promise<AssessmentLearningEventResult> {
  const answer = await transaction.studentAnswer.findUnique({
    where: { id: studentAnswerId },
    select: {
      id: true,
      submissionId: true,
      assignmentQuestionId: true,
      gradingStatus: true,
      score: true,
      maxScore: true,
      gradedAt: true,
      conceptEvidenceRevision: true,
      submission: {
        select: {
          studentId: true,
          assignmentId: true,
          assignment: {
            select: { classroom: { select: { courseId: true } } },
          },
        },
      },
      assignmentQuestion: {
        select: {
          questionId: true,
          conceptSnapshots: {
            where: {
              resolutionStatus: AssignmentConceptResolutionStatus.RESOLVED,
            },
            orderBy: [{ conceptId: "asc" }],
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
  if (!answer) {
    return {
      changed: false,
      courseId: null,
      studentId: null,
      revision: null,
      learningEventId: null,
      evidenceCount: 0,
      status: null,
    };
  }

  const snapshots = answer.assignmentQuestion.conceptSnapshots;
  const courseId = answer.submission.assignment.classroom.courseId;
  if (
    !courseId ||
    snapshots.length === 0 ||
    snapshots.some((snapshot) => snapshot.courseId !== courseId)
  ) {
    return {
      changed: false,
      courseId,
      studentId: answer.submission.studentId,
      revision: null,
      learningEventId: null,
      evidenceCount: 0,
      status: null,
    };
  }

  const [previousRows, previousEvent] = await Promise.all([
    transaction.studentAnswerConceptEvidence.findMany({
      where: { studentAnswerId },
      orderBy: [{ revision: "desc" }, { conceptId: "asc" }],
      select: {
        id: true,
        conceptId: true,
        revision: true,
        inputFingerprint: true,
        learningEventId: true,
      },
    }),
    transaction.learningEvent.findFirst({
      where: {
        sourceType: LearningEventSourceType.STUDENT_ANSWER,
        sourceId: studentAnswerId,
      },
      orderBy: { sourceRevision: "desc" },
      select: { id: true },
    }),
  ]);
  const latestByConcept = new Map<string, (typeof previousRows)[number]>();
  for (const row of previousRows) {
    if (!latestByConcept.has(row.conceptId)) {
      latestByConcept.set(row.conceptId, row);
    }
  }

  const source = gradingSource(answer.gradingStatus);
  const valid = Boolean(
    source &&
    answer.score &&
    answer.gradedAt &&
    answer.maxScore.gt(0) &&
    answer.score.gte(0) &&
    answer.score.lte(answer.maxScore),
  );
  if (!valid && latestByConcept.size === 0) {
    return {
      changed: false,
      courseId,
      studentId: answer.submission.studentId,
      revision: null,
      learningEventId: null,
      evidenceCount: 0,
      status: null,
    };
  }

  const nextStatus = valid
    ? ConceptEvidenceStatus.VALID
    : ConceptEvidenceStatus.REVOKED;
  const fingerprint = conceptMasteryFingerprint({
    studentAnswerId,
    status: nextStatus,
    gradingSource: valid ? source : null,
    score: valid ? answer.score?.toFixed(CONCEPT_EVIDENCE_SCORE_SCALE) : null,
    maxScore: valid
      ? answer.maxScore.toFixed(CONCEPT_EVIDENCE_SCORE_SCALE)
      : null,
    snapshots: snapshots.map((snapshot) => ({
      id: snapshot.id,
      conceptId: snapshot.conceptId,
      bindingType: snapshot.bindingType,
    })),
  });
  if (
    snapshots.every(
      (snapshot) =>
        latestByConcept.get(snapshot.conceptId)?.inputFingerprint ===
        fingerprint,
    )
  ) {
    const existingLearningEventId = snapshots
      .map(
        (snapshot) => latestByConcept.get(snapshot.conceptId)?.learningEventId,
      )
      .find((id): id is string => Boolean(id));
    return {
      changed: false,
      courseId,
      studentId: answer.submission.studentId,
      revision: answer.conceptEvidenceRevision,
      learningEventId: existingLearningEventId ?? null,
      evidenceCount: 0,
      status: nextStatus,
    };
  }

  const revision = answer.conceptEvidenceRevision + 1;
  const claimed = await transaction.studentAnswer.updateMany({
    where: {
      id: studentAnswerId,
      conceptEvidenceRevision: answer.conceptEvidenceRevision,
    },
    data: { conceptEvidenceRevision: revision },
  });
  if (claimed.count !== 1) throw new ConceptMasteryConcurrencyError();

  const payload = assessmentLearningEventPayloadSchema.parse({
    studentAnswerId,
    evidenceStatus: nextStatus,
    gradingSource: valid ? source : null,
    score: valid ? answer.score?.toFixed(CONCEPT_EVIDENCE_SCORE_SCALE) : null,
    maxScore: valid
      ? answer.maxScore.toFixed(CONCEPT_EVIDENCE_SCORE_SCALE)
      : null,
    gradedAt: valid ? answer.gradedAt?.toISOString() : null,
    conceptSnapshotCount: snapshots.length,
  });
  const occurredAt = valid ? answer.gradedAt! : new Date();
  const event = await transaction.learningEvent.create({
    data: {
      studentId: answer.submission.studentId,
      courseId,
      eventType: valid
        ? LearningEventType.ASSESSMENT_GRADED
        : LearningEventType.ASSESSMENT_REVOKED,
      schemaVersion: ASSESSMENT_LEARNING_EVENT_SCHEMA_VERSION,
      sourceType: LearningEventSourceType.STUDENT_ANSWER,
      sourceId: studentAnswerId,
      sourceRevision: revision,
      occurredAt,
      idempotencyKey: `student-answer:${studentAnswerId}:revision:${revision}`,
      inputFingerprint: fingerprint,
      ruleVersion: ASSESSMENT_LEARNING_EVENT_RULE_VERSION,
      supersedesEventId: previousEvent?.id ?? null,
      payload,
      concepts: {
        create: snapshots.map((snapshot) => ({
          conceptId: snapshot.conceptId,
          bindingType: snapshot.bindingType,
          assignmentQuestionConceptSnapshotId: snapshot.id,
          score: valid ? answer.score : null,
          maxScore: valid ? answer.maxScore : null,
          weight: null,
        })),
      },
    },
    select: { id: true },
  });

  const normalizedScore = valid
    ? answer
        .score!.div(answer.maxScore)
        .mul(100)
        .toDecimalPlaces(CONCEPT_EVIDENCE_SCORE_SCALE)
    : null;
  for (const snapshot of snapshots) {
    await transaction.studentAnswerConceptEvidence.create({
      data: {
        studentId: answer.submission.studentId,
        courseId,
        assignmentId: answer.submission.assignmentId,
        assignmentQuestionId: answer.assignmentQuestionId,
        submissionId: answer.submissionId,
        studentAnswerId,
        questionId: answer.assignmentQuestion.questionId,
        assignmentQuestionConceptSnapshotId: snapshot.id,
        conceptId: snapshot.conceptId,
        bindingType: snapshot.bindingType,
        revision,
        inputFingerprint: fingerprint,
        status: nextStatus,
        gradingSource: valid ? source : null,
        score: valid ? answer.score : null,
        maxScore: valid ? answer.maxScore : null,
        normalizedScore,
        gradedAt: valid ? answer.gradedAt : null,
        supersedesEvidenceId:
          latestByConcept.get(snapshot.conceptId)?.id ?? null,
        learningEventId: event.id,
      },
    });
  }
  return {
    changed: true,
    courseId,
    studentId: answer.submission.studentId,
    revision,
    learningEventId: event.id,
    evidenceCount: snapshots.length,
    status: nextStatus,
  };
}

export async function appendAssessmentLearningEventsAndProjectEvidence(
  transaction: Prisma.TransactionClient,
  studentAnswerIds: readonly string[],
): Promise<{ studentId: string; courseId: string; changed: boolean } | null> {
  let identity: { studentId: string; courseId: string } | null = null;
  let changed = false;
  for (const answerId of [...new Set(studentAnswerIds)].sort()) {
    const result = await appendAssessmentLearningEventAndProjectEvidence(
      transaction,
      answerId,
    );
    if (!result.studentId || !result.courseId) continue;
    if (
      identity &&
      (identity.studentId !== result.studentId ||
        identity.courseId !== result.courseId)
    ) {
      throw new Error(
        "Assessment event batch spans multiple students or courses",
      );
    }
    identity = { studentId: result.studentId, courseId: result.courseId };
    changed = changed || result.changed;
  }
  if (identity && changed) {
    await recalculateStudentCourseConceptMastery(
      transaction,
      identity.studentId,
      identity.courseId,
    );
  }
  return identity ? { ...identity, changed } : null;
}
