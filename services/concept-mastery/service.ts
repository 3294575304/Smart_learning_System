import "server-only";

import {
  ConceptEvidenceStatus,
  MembershipStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { calculateConceptMastery } from "@/services/concept-mastery/calculation";
import {
  CONCEPT_MASTERY_RULE_VERSION,
  CONCEPT_MASTERY_TRACE_LIMIT,
} from "@/services/concept-mastery/constants";
import { conceptMasteryFingerprint } from "@/services/concept-mastery/fingerprint";
import { ResourceNotFoundError } from "@/services/auth/policy";

type EffectiveEvidence = Prisma.StudentAnswerConceptEvidenceGetPayload<{
  include: {
    assignmentQuestionConceptSnapshot: {
      include: {
        sourceGraphVersion: { select: { versionNumber: true } };
        sourceNode: { select: { code: true; name: true } };
        publishedGraphVersion: { select: { versionNumber: true } };
        resolvedNode: { select: { code: true; name: true } };
      };
    };
  };
}>;

type EffectiveRecommendationEvidence =
  Prisma.RecommendationConceptEvidenceGetPayload<{
    include: {
      recommendationConceptSnapshot: {
        include: {
          sourceGraphVersion: { select: { versionNumber: true } };
          sourceNode: { select: { code: true; name: true } };
          publishedGraphVersion: { select: { versionNumber: true } };
          resolvedNode: { select: { code: true; name: true } };
        };
      };
    };
  }>;

async function latestConceptEvidence(
  transaction: Prisma.TransactionClient,
  studentId: string,
  courseId: string,
): Promise<EffectiveEvidence[]> {
  const rows = await transaction.studentAnswerConceptEvidence.findMany({
    where: { studentId, courseId },
    orderBy: [
      { studentAnswerId: "asc" },
      { conceptId: "asc" },
      { revision: "desc" },
    ],
    include: {
      assignmentQuestionConceptSnapshot: {
        include: {
          sourceGraphVersion: { select: { versionNumber: true } },
          sourceNode: { select: { code: true, name: true } },
          publishedGraphVersion: { select: { versionNumber: true } },
          resolvedNode: { select: { code: true, name: true } },
        },
      },
    },
  });
  const current = new Map<string, EffectiveEvidence>();
  for (const row of rows) {
    const key = `${row.studentAnswerId}:${row.conceptId}`;
    if (!current.has(key)) current.set(key, row);
  }
  return [...current.values()];
}

async function latestRecommendationConceptEvidence(
  transaction: Prisma.TransactionClient,
  studentId: string,
  courseId: string,
): Promise<EffectiveRecommendationEvidence[]> {
  const rows = await transaction.recommendationConceptEvidence.findMany({
    where: { studentId, courseId },
    orderBy: [
      { recommendationPracticeAnswerId: "asc" },
      { conceptId: "asc" },
      { revision: "desc" },
    ],
    include: {
      recommendationConceptSnapshot: {
        include: {
          sourceGraphVersion: { select: { versionNumber: true } },
          sourceNode: { select: { code: true, name: true } },
          publishedGraphVersion: { select: { versionNumber: true } },
          resolvedNode: { select: { code: true, name: true } },
        },
      },
    },
  });
  const current = new Map<string, EffectiveRecommendationEvidence>();
  for (const row of rows) {
    const key = `${row.recommendationPracticeAnswerId}:${row.conceptId}`;
    if (!current.has(key)) current.set(key, row);
  }
  return [...current.values()];
}

function validConceptEvidence(rows: readonly EffectiveEvidence[]) {
  return rows.filter(
    (row) =>
      row.status === ConceptEvidenceStatus.VALID &&
      row.score !== null &&
      row.maxScore !== null &&
      row.gradedAt !== null,
  );
}

export async function recalculateStudentCourseConceptMastery(
  transaction: Prisma.TransactionClient,
  studentId: string,
  courseId: string,
): Promise<{
  revisionId: string;
  revisionNumber: number;
  reused: boolean;
} | null> {
  const latestEvidence = await latestConceptEvidence(
    transaction,
    studentId,
    courseId,
  );
  const latestRecommendationEvidence =
    await latestRecommendationConceptEvidence(transaction, studentId, courseId);
  const evidence = validConceptEvidence(latestEvidence);
  const recommendationEvidence = latestRecommendationEvidence.filter(
    (row) =>
      row.status === ConceptEvidenceStatus.VALID &&
      row.score !== null &&
      row.maxScore !== null &&
      row.gradedAt !== null,
  );
  let state = await transaction.studentCourseConceptMasteryState.findUnique({
    where: { studentId_courseId: { studentId, courseId } },
    select: { id: true },
  });
  if (!state && evidence.length === 0 && recommendationEvidence.length === 0)
    return null;
  if (!state) {
    state = await transaction.studentCourseConceptMasteryState.create({
      data: { studentId, courseId },
      select: { id: true },
    });
  }
  await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "StudentCourseConceptMasteryState"
    WHERE "id" = ${state.id}
    FOR UPDATE
  `;

  const inputFingerprint = conceptMasteryFingerprint({
    ruleVersion: CONCEPT_MASTERY_RULE_VERSION,
    evidence: [
      ...latestEvidence.map((row) => ({
        sourceType: "STUDENT_ANSWER",
        id: row.id,
        sourceAnswerId: row.studentAnswerId,
        conceptId: row.conceptId,
        revision: row.revision,
        status: row.status,
        score: row.score?.toFixed(4) ?? null,
        maxScore: row.maxScore?.toFixed(4) ?? null,
        gradingSource: row.gradingSource,
        gradedAt: row.gradedAt?.toISOString() ?? null,
      })),
      ...latestRecommendationEvidence.map((row) => ({
        sourceType: "RECOMMENDATION_PRACTICE_ANSWER",
        id: row.id,
        sourceAnswerId: row.recommendationPracticeAnswerId,
        conceptId: row.conceptId,
        revision: row.revision,
        status: row.status,
        score: row.score?.toFixed(4) ?? null,
        maxScore: row.maxScore?.toFixed(4) ?? null,
        gradingSource: "DETERMINISTIC_RECOMMENDATION",
        gradedAt: row.gradedAt?.toISOString() ?? null,
      })),
    ].sort(
      (left, right) =>
        left.conceptId.localeCompare(right.conceptId) ||
        left.sourceType.localeCompare(right.sourceType) ||
        left.sourceAnswerId.localeCompare(right.sourceAnswerId),
    ),
  });
  const latest =
    await transaction.studentCourseConceptMasteryRevision.findFirst({
      where: { stateId: state.id },
      orderBy: { revisionNumber: "desc" },
      select: { id: true, revisionNumber: true, inputFingerprint: true },
    });
  if (latest?.inputFingerprint === inputFingerprint) {
    return {
      revisionId: latest.id,
      revisionNumber: latest.revisionNumber,
      reused: true,
    };
  }

  const aggregates = calculateConceptMastery([
    ...evidence.map((row) => ({
      id: row.id,
      sourceAnswerId: `assignment:${row.studentAnswerId}`,
      conceptId: row.conceptId,
      score: row.score!,
      maxScore: row.maxScore!,
      gradedAt: row.gradedAt!,
    })),
    ...recommendationEvidence.map((row) => ({
      id: row.id,
      sourceAnswerId: `recommendation:${row.recommendationPracticeAnswerId}`,
      conceptId: row.conceptId,
      score: row.score!,
      maxScore: row.maxScore!,
      gradedAt: row.gradedAt!,
    })),
  ]);
  const revision = await transaction.studentCourseConceptMasteryRevision.create(
    {
      data: {
        stateId: state.id,
        revisionNumber: (latest?.revisionNumber ?? 0) + 1,
        inputFingerprint,
        calculationRuleVersion: CONCEPT_MASTERY_RULE_VERSION,
        entries: {
          create: aggregates.map((item) => ({
            conceptId: item.conceptId,
            evidenceCount: item.evidenceCount,
            distinctAnswerCount: item.distinctAnswerCount,
            earnedPoints: item.earnedPoints,
            availablePoints: item.availablePoints,
            masteryScore: item.masteryScore,
            level: item.level,
            firstEvidenceAt: item.firstEvidenceAt,
            lastEvidenceAt: item.lastEvidenceAt,
          })),
        },
      },
      select: { id: true, revisionNumber: true },
    },
  );
  return {
    revisionId: revision.id,
    revisionNumber: revision.revisionNumber,
    reused: false,
  };
}

async function assertStudentCourseAccess(studentId: string, courseId: string) {
  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      classrooms: {
        some: {
          memberships: {
            some: { studentId, status: MembershipStatus.ACTIVE },
          },
        },
      },
    },
    select: { id: true },
  });
  if (!course) throw new ResourceNotFoundError("课程不存在");
}

async function assertTeacherStudentCourseAccess(
  teacherId: string,
  studentId: string,
  courseId: string,
) {
  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      teacherId,
      classrooms: {
        some: {
          memberships: {
            some: { studentId, status: MembershipStatus.ACTIVE },
          },
        },
      },
    },
    select: { id: true },
  });
  if (!course) throw new ResourceNotFoundError("课程或学生不存在");
}

async function masteryView(studentId: string, courseId: string) {
  const [course, state] = await Promise.all([
    prisma.course.findUnique({
      where: { id: courseId },
      select: {
        currentPublishedKnowledgeGraphVersion: {
          select: { id: true, versionNumber: true, publishedAt: true },
        },
      },
    }),
    prisma.studentCourseConceptMasteryState.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
      select: {
        revisions: {
          orderBy: { revisionNumber: "desc" },
          take: 1,
          select: {
            id: true,
            revisionNumber: true,
            inputFingerprint: true,
            calculationRuleVersion: true,
            createdAt: true,
            entries: {
              orderBy: { conceptId: "asc" },
              select: {
                conceptId: true,
                evidenceCount: true,
                distinctAnswerCount: true,
                earnedPoints: true,
                availablePoints: true,
                masteryScore: true,
                level: true,
                firstEvidenceAt: true,
                lastEvidenceAt: true,
                concept: { select: { stableKey: true } },
              },
            },
          },
        },
      },
    }),
  ]);
  const currentGraph = course?.currentPublishedKnowledgeGraphVersion ?? null;
  const revision = state?.revisions[0] ?? null;
  if (!revision) {
    return {
      hasData: false,
      courseId,
      studentId,
      currentGraphVersion: currentGraph,
      currentRevision: null,
      concepts: [],
    };
  }

  const conceptIds = revision.entries.map((entry) => entry.conceptId);
  const [currentNodes, assignmentEvidence, recommendationEvidence] =
    await Promise.all([
      currentGraph
        ? prisma.publishedKnowledgeGraphNode.findMany({
            where: {
              graphVersionId: currentGraph.id,
              conceptId: { in: conceptIds },
            },
            select: {
              id: true,
              conceptId: true,
              code: true,
              name: true,
              nodeType: true,
            },
          })
        : Promise.resolve([]),
      prisma.$transaction((transaction) =>
        latestConceptEvidence(transaction, studentId, courseId).then(
          validConceptEvidence,
        ),
      ),
      prisma.$transaction((transaction) =>
        latestRecommendationConceptEvidence(
          transaction,
          studentId,
          courseId,
        ).then((rows) =>
          rows.filter(
            (row) =>
              row.status === ConceptEvidenceStatus.VALID &&
              row.score !== null &&
              row.maxScore !== null &&
              row.gradedAt !== null,
          ),
        ),
      ),
    ]);
  const currentNodeByConcept = new Map(
    currentNodes.map((node) => [node.conceptId, node]),
  );
  type TraceEvidence = {
    sourceType: "ASSIGNMENT" | "RECOMMENDATION_PRACTICE";
    id: string;
    revision: number;
    conceptId: string;
    bindingType: string;
    score: Prisma.Decimal;
    maxScore: Prisma.Decimal;
    normalizedScore: Prisma.Decimal;
    gradedAt: Date;
    sourceGraphVersionId: string;
    sourceGraphVersionNumber: number;
    sourceNodeId: string;
    sourceNodeCode: string;
    sourceNodeName: string;
    assignmentId?: string;
    assignmentQuestionId?: string;
    submissionId?: string;
    studentAnswerId?: string;
    recommendationId?: string;
    recommendationPracticeAnswerId?: string;
    questionId?: string;
  };
  const evidenceByConcept = new Map<string, TraceEvidence[]>();
  const traces: TraceEvidence[] = [
    ...assignmentEvidence.map((row) => ({
      sourceType: "ASSIGNMENT" as const,
      id: row.id,
      revision: row.revision,
      conceptId: row.conceptId,
      bindingType: row.bindingType,
      score: row.score!,
      maxScore: row.maxScore!,
      normalizedScore: row.normalizedScore!,
      gradedAt: row.gradedAt!,
      sourceGraphVersionId:
        row.assignmentQuestionConceptSnapshot.sourceGraphVersionId,
      sourceGraphVersionNumber:
        row.assignmentQuestionConceptSnapshot.sourceGraphVersion.versionNumber,
      sourceNodeId: row.assignmentQuestionConceptSnapshot.sourceNodeId,
      sourceNodeCode: row.assignmentQuestionConceptSnapshot.sourceNode.code,
      sourceNodeName: row.assignmentQuestionConceptSnapshot.sourceNode.name,
      assignmentId: row.assignmentId,
      assignmentQuestionId: row.assignmentQuestionId,
      submissionId: row.submissionId,
      studentAnswerId: row.studentAnswerId,
    })),
    ...recommendationEvidence.map((row) => ({
      sourceType: "RECOMMENDATION_PRACTICE" as const,
      id: row.id,
      revision: row.revision,
      conceptId: row.conceptId,
      bindingType: row.bindingType,
      score: row.score!,
      maxScore: row.maxScore!,
      normalizedScore: row.normalizedScore!,
      gradedAt: row.gradedAt!,
      sourceGraphVersionId:
        row.recommendationConceptSnapshot.sourceGraphVersionId,
      sourceGraphVersionNumber:
        row.recommendationConceptSnapshot.sourceGraphVersion.versionNumber,
      sourceNodeId: row.recommendationConceptSnapshot.sourceNodeId,
      sourceNodeCode: row.recommendationConceptSnapshot.sourceNode.code,
      sourceNodeName: row.recommendationConceptSnapshot.sourceNode.name,
      recommendationId: row.recommendationId,
      recommendationPracticeAnswerId: row.recommendationPracticeAnswerId,
      questionId: row.questionId,
    })),
  ];
  for (const row of traces) {
    const rows = evidenceByConcept.get(row.conceptId) ?? [];
    rows.push(row);
    evidenceByConcept.set(row.conceptId, rows);
  }

  return {
    hasData: true,
    courseId,
    studentId,
    currentGraphVersion: currentGraph,
    currentRevision: {
      id: revision.id,
      revisionNumber: revision.revisionNumber,
      inputFingerprint: revision.inputFingerprint,
      calculationRuleVersion: revision.calculationRuleVersion,
      generatedAt: revision.createdAt,
    },
    concepts: revision.entries.map((entry) => {
      const currentNode = currentNodeByConcept.get(entry.conceptId) ?? null;
      const rows = (evidenceByConcept.get(entry.conceptId) ?? []).sort(
        (left, right) =>
          right.gradedAt!.getTime() - left.gradedAt!.getTime() ||
          left.id.localeCompare(right.id),
      );
      const sourceGroups = new Map<
        string,
        {
          sourceGraphVersionId: string;
          sourceGraphVersionNumber: number;
          sourceNodeId: string;
          sourceNodeCode: string;
          sourceNodeName: string;
          bindingType: string;
          evidenceCount: number;
        }
      >();
      for (const row of rows) {
        const key = `${row.sourceGraphVersionId}:${row.sourceNodeId}:${row.bindingType}`;
        const current = sourceGroups.get(key);
        if (current) current.evidenceCount += 1;
        else
          sourceGroups.set(key, {
            sourceGraphVersionId: row.sourceGraphVersionId,
            sourceGraphVersionNumber: row.sourceGraphVersionNumber,
            sourceNodeId: row.sourceNodeId,
            sourceNodeCode: row.sourceNodeCode,
            sourceNodeName: row.sourceNodeName,
            bindingType: row.bindingType,
            evidenceCount: 1,
          });
      }
      return {
        conceptId: entry.conceptId,
        stableKey: entry.concept.stableKey,
        evidenceCount: entry.evidenceCount,
        distinctAnswerCount: entry.distinctAnswerCount,
        earnedPoints: entry.earnedPoints.toNumber(),
        availablePoints: entry.availablePoints.toNumber(),
        masteryScore: entry.masteryScore.toNumber(),
        level: entry.level,
        firstEvidenceAt: entry.firstEvidenceAt,
        lastEvidenceAt: entry.lastEvidenceAt,
        currentResolution: {
          status: !currentGraph
            ? "NO_CURRENT_PUBLISHED_VERSION"
            : currentNode
              ? "RESOLVED_TO_CURRENT_VERSION"
              : "MISSING_FROM_CURRENT_VERSION",
          currentNode,
        },
        historicalEvidence: {
          sourceGroups: [...sourceGroups.values()].sort(
            (left, right) =>
              left.sourceGraphVersionNumber - right.sourceGraphVersionNumber ||
              left.sourceNodeId.localeCompare(right.sourceNodeId),
          ),
          latestReferences: rows
            .slice(0, CONCEPT_MASTERY_TRACE_LIMIT)
            .map((row) => ({
              sourceType: row.sourceType,
              evidenceId: row.id,
              revision: row.revision,
              assignmentId: row.assignmentId ?? row.recommendationId,
              assignmentQuestionId:
                row.assignmentQuestionId ?? row.questionId,
              submissionId: row.submissionId,
              studentAnswerId: row.studentAnswerId,
              recommendationId: row.recommendationId,
              recommendationPracticeAnswerId:
                row.recommendationPracticeAnswerId,
              questionId: row.questionId,
              sourceGraphVersionId: row.sourceGraphVersionId,
              sourceNodeId: row.sourceNodeId,
              bindingType: row.bindingType,
              score: row.score!.toNumber(),
              maxScore: row.maxScore!.toNumber(),
              normalizedScore: row.normalizedScore!.toNumber(),
              gradedAt: row.gradedAt!,
            })),
          truncated: rows.length > CONCEPT_MASTERY_TRACE_LIMIT,
        },
      };
    }),
  };
}

export async function getStudentCourseConceptMastery(
  studentId: string,
  courseId: string,
) {
  await assertStudentCourseAccess(studentId, courseId);
  return masteryView(studentId, courseId);
}

export async function getTeacherStudentCourseConceptMastery(
  teacherId: string,
  courseId: string,
  studentId: string,
) {
  await assertTeacherStudentCourseAccess(teacherId, studentId, courseId);
  return masteryView(studentId, courseId);
}
