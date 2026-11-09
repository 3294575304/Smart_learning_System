import "server-only";

import {
  AIRecordStatus,
  AuditAction,
  AuditTargetType,
  Prisma,
  Role,
  SubmissionStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type {
  DashboardActivity,
  DashboardOverview,
} from "@/services/admin/dashboard/types";

const EFFECTIVE_SUBMISSION_STATUSES: SubmissionStatus[] = [
  SubmissionStatus.SUBMITTED,
  SubmissionStatus.PENDING_REVIEW,
  SubmissionStatus.GRADED,
  SubmissionStatus.PUBLISHED,
];
const FINALIZED_SUBMISSION_STATUSES: SubmissionStatus[] = [
  SubmissionStatus.GRADED,
  SubmissionStatus.PUBLISHED,
];
const GENERATED_ANALYSIS_STATUSES: AIRecordStatus[] = [
  AIRecordStatus.SUCCEEDED,
  AIRecordStatus.FALLBACK,
];

interface CountByDateRow {
  date: string;
  count: bigint;
}

interface KnowledgeCoverageRow {
  id: string;
  name: string;
  questionCount: bigint;
}

export async function loadUserOverview(input: {
  schoolId: string;
  current7Start: Date;
  current7End: Date;
  previous7Start: Date;
  previous7End: Date;
  current30Start: Date;
}) {
  const [total, roles, statuses, current7, previous7, current30] =
    await Promise.all([
      prisma.user.count({
        where: { schoolId: input.schoolId, deletedAt: null },
      }),
      prisma.user.groupBy({
        by: ["role"],
        where: { schoolId: input.schoolId, deletedAt: null },
        _count: { _all: true },
      }),
      prisma.user.groupBy({
        by: ["status"],
        where: { schoolId: input.schoolId, deletedAt: null },
        _count: { _all: true },
      }),
      prisma.user.count({
        where: {
          schoolId: input.schoolId,
          deletedAt: null,
          createdAt: { gte: input.current7Start, lt: input.current7End },
        },
      }),
      prisma.user.count({
        where: {
          schoolId: input.schoolId,
          deletedAt: null,
          createdAt: { gte: input.previous7Start, lt: input.previous7End },
        },
      }),
      prisma.user.count({
        where: {
          schoolId: input.schoolId,
          deletedAt: null,
          createdAt: { gte: input.current30Start, lt: input.current7End },
        },
      }),
    ]);
  return { total, roles, statuses, current7, previous7, current30 };
}

export async function loadTeachingOverview(schoolId: string) {
  const [
    classroomTotal,
    activeClassroomCount,
    questionTotal,
    assignmentStatuses,
    effectiveSubmissionCount,
    gradedSubmissionCount,
    pendingReviewSubmissionCount,
  ] = await Promise.all([
    prisma.classroom.count({ where: { teacher: { schoolId } } }),
    prisma.classroom.count({
      where: { status: "ACTIVE", teacher: { schoolId } },
    }),
    prisma.question.count({
      where: { deletedAt: null, creator: { schoolId } },
    }),
    prisma.assignment.groupBy({
      by: ["status"],
      where: { teacher: { schoolId } },
      _count: { _all: true },
    }),
    prisma.submission.count({
      where: {
        student: { schoolId },
        status: { in: EFFECTIVE_SUBMISSION_STATUSES },
      },
    }),
    prisma.submission.count({
      where: {
        student: { schoolId },
        status: { in: FINALIZED_SUBMISSION_STATUSES },
      },
    }),
    prisma.submission.count({
      where: { student: { schoolId }, status: SubmissionStatus.PENDING_REVIEW },
    }),
  ]);
  return {
    classroomTotal,
    activeClassroomCount,
    questionTotal,
    assignmentStatuses,
    effectiveSubmissionCount,
    gradedSubmissionCount,
    pendingReviewSubmissionCount,
  };
}

export async function loadLearningOverview(input: {
  schoolId: string;
  current7Start: Date;
  current30Start: Date;
  end: Date;
}) {
  const [
    finalizedSubmissions,
    answersLast7Days,
    answersLast30Days,
    incorrectAnswerCount,
    generatedAnalysisCount,
    generatedRecommendationCount,
  ] = await Promise.all([
    prisma.submission.aggregate({
      where: {
        student: { schoolId: input.schoolId },
        status: { in: FINALIZED_SUBMISSION_STATUSES },
        percentage: { not: null },
      },
      _count: { _all: true },
      _avg: { percentage: true },
    }),
    prisma.studentAnswer.count({
      where: {
        submission: { student: { schoolId: input.schoolId } },
        createdAt: { gte: input.current7Start, lt: input.end },
      },
    }),
    prisma.studentAnswer.count({
      where: {
        submission: { student: { schoolId: input.schoolId } },
        createdAt: { gte: input.current30Start, lt: input.end },
      },
    }),
    prisma.studentAnswer.count({
      where: {
        submission: { student: { schoolId: input.schoolId } },
        isCorrect: false,
      },
    }),
    prisma.aIAnalysis.count({
      where: {
        requestedBy: { schoolId: input.schoolId },
        status: { in: GENERATED_ANALYSIS_STATUSES },
        completedAt: { not: null },
      },
    }),
    prisma.personalizedRecommendation.count({
      where: { student: { schoolId: input.schoolId } },
    }),
  ]);
  return {
    finalizedSubmissionCount: finalizedSubmissions._count._all,
    averageGradedPercentage:
      finalizedSubmissions._avg.percentage?.toNumber() ?? null,
    answersLast7Days,
    answersLast30Days,
    incorrectAnswerCount,
    generatedAnalysisCount,
    generatedRecommendationCount,
  };
}

export async function loadAIQuestionGenerationMetrics(
  schoolId: string,
  start: Date,
  end: Date,
) {
  const [metrics] = await prisma.$queryRaw<
    DashboardOverview["ai"]["questionGeneration"][]
  >`
    WITH cohort AS (
      SELECT b.id, b.status, b."firstValidationChecks", b."firstValidationPasses"
      FROM "AIQuestionGenerationBatch" b
      JOIN "QuestionCourseCategory" category ON category.id = b."questionCategoryId"
      WHERE category."schoolId" = ${schoolId}
        AND b."createdAt" >= (${start}::timestamptz AT TIME ZONE 'UTC')
        AND b."createdAt" < (${end}::timestamptz AT TIME ZONE 'UTC')
    ), candidates AS (
      SELECT COUNT(*)::int AS generated,
             COUNT(*) FILTER (WHERE c.status = 'CONFIRMED' AND q.id IS NOT NULL)::int AS confirmed,
             COUNT(*) FILTER (WHERE c.status = 'CONFIRMED' AND q.origin = 'AI_ASSISTED')::int AS "editedBeforeConfirmation",
             COALESCE(SUM(CASE WHEN jsonb_typeof(c."reviewHistory") = 'array'
                               THEN jsonb_array_length(c."reviewHistory") ELSE 0 END), 0)::int AS "reviewEdits"
      FROM cohort b
      JOIN "AIQuestionGenerationCandidate" c ON c."batchId" = b.id
      LEFT JOIN "Question" q ON q.id = c."confirmedQuestionId"
    ), batches AS (
      SELECT COALESCE(SUM("firstValidationChecks"), 0)::int AS "firstValidationChecks",
             COALESCE(SUM("firstValidationPasses"), 0)::int AS "firstValidationPasses",
             COUNT(*) FILTER (WHERE status IN ('READY', 'PARTIAL', 'FAILED'))::int AS "terminalBatches",
             COUNT(*) FILTER (WHERE status IN ('PARTIAL', 'FAILED'))::int AS "incompleteBatches"
      FROM cohort
    )
    SELECT * FROM candidates CROSS JOIN batches
  `;
  return metrics;
}

export function loadAIGatewayOverview(
  schoolId: string,
  start: Date,
  end: Date,
) {
  return prisma.$queryRaw<DashboardOverview["ai"]["gateway"]>`
    SELECT capability,
      COUNT(DISTINCT "requestKey")::int AS requests,
      COUNT(*) FILTER (WHERE outcome <> 'REJECTED')::int AS attempts,
      COUNT(*) FILTER (WHERE outcome = 'FAILED')::int AS failed,
      COUNT(DISTINCT "requestKey") FILTER (WHERE "wouldLimit")::int AS "wouldLimit",
      COUNT(DISTINCT "requestKey") FILTER (WHERE outcome = 'REJECTED')::int AS rejected,
      COUNT("totalTokens")::int AS "measuredAttempts",
      COALESCE(SUM("totalTokens"), 0)::float8 AS "totalTokens",
      (percentile_disc(0.95) WITHIN GROUP (ORDER BY "latencyMs")
        FILTER (WHERE outcome <> 'REJECTED'))::int AS "p95LatencyMs"
    FROM "AIProviderAttemptLog"
    WHERE "schoolId" = ${schoolId}
      AND "createdAt" >= (${start}::timestamptz AT TIME ZONE 'UTC')
      AND "createdAt" < (${end}::timestamptz AT TIME ZONE 'UTC')
    GROUP BY capability ORDER BY capability
  `;
}

export async function loadAIOverview(input: {
  schoolId: string;
  start7: Date;
  end: Date;
}) {
  const [
    analysisRecordCount,
    recommendationRecordCount,
    analysisStatuses,
    tutoringStatuses,
    recentAnalyses,
    recentTutoring,
    analysisLatency,
    tutoringLatency,
  ] = await Promise.all([
    prisma.aIAnalysis.count({
      where: { requestedBy: { schoolId: input.schoolId } },
    }),
    prisma.personalizedRecommendation.count({
      where: { student: { schoolId: input.schoolId } },
    }),
    prisma.aIAnalysis.groupBy({
      where: { requestedBy: { schoolId: input.schoolId } },
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.aITutoringRecord.groupBy({
      where: { student: { schoolId: input.schoolId } },
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.aIAnalysis.count({
      where: {
        requestedBy: { schoolId: input.schoolId },
        createdAt: { gte: input.start7, lt: input.end },
      },
    }),
    prisma.aITutoringRecord.count({
      where: {
        student: { schoolId: input.schoolId },
        createdAt: { gte: input.start7, lt: input.end },
      },
    }),
    prisma.aIAnalysis.aggregate({
      where: { requestedBy: { schoolId: input.schoolId } },
      _sum: { latencyMs: true },
      _count: { latencyMs: true },
    }),
    prisma.aITutoringRecord.aggregate({
      where: { student: { schoolId: input.schoolId } },
      _sum: { latencyMs: true },
      _count: { latencyMs: true },
    }),
  ]);
  return {
    analysisRecordCount,
    recommendationRecordCount,
    analysisStatuses,
    tutoringStatuses,
    recentCount: recentAnalyses + recentTutoring,
    latencySum:
      (analysisLatency._sum.latencyMs ?? 0) +
      (tutoringLatency._sum.latencyMs ?? 0),
    latencyCount:
      analysisLatency._count.latencyMs + tutoringLatency._count.latencyMs,
  };
}

export async function loadTrendCounts(
  start: Date,
  end: Date,
  schoolId: string,
) {
  const [users, assignments, submissions, answers, analyses, recommendations] =
    await Promise.all([
      prisma.$queryRaw<CountByDateRow[]>(Prisma.sql`
        SELECT to_char(timezone('Asia/Shanghai', "createdAt"), 'YYYY-MM-DD') AS "date",
               COUNT(*)::bigint AS "count"
        FROM "User"
        WHERE "schoolId" = ${schoolId} AND "createdAt" >= ${start} AND "createdAt" < ${end}
        GROUP BY 1 ORDER BY 1
      `),
      prisma.$queryRaw<CountByDateRow[]>(Prisma.sql`
        SELECT to_char(timezone('Asia/Shanghai', "publishedAt"), 'YYYY-MM-DD') AS "date",
               COUNT(*)::bigint AS "count"
        FROM "Assignment"
        WHERE "examSessionId" IS NULL
          AND EXISTS (SELECT 1 FROM "User" owner WHERE owner.id = "Assignment"."teacherId" AND owner."schoolId" = ${schoolId})
          AND "publishedAt" >= ${start} AND "publishedAt" < ${end}
        GROUP BY 1 ORDER BY 1
      `),
      prisma.$queryRaw<CountByDateRow[]>(Prisma.sql`
        SELECT to_char(timezone('Asia/Shanghai', "submittedAt"), 'YYYY-MM-DD') AS "date",
               COUNT(*)::bigint AS "count"
        FROM "Submission"
        WHERE EXISTS (SELECT 1 FROM "User" owner WHERE owner.id = "Submission"."studentId" AND owner."schoolId" = ${schoolId}) AND "submittedAt" >= ${start} AND "submittedAt" < ${end}
          AND "status" IN ('SUBMITTED', 'PENDING_REVIEW', 'GRADED', 'PUBLISHED')
        GROUP BY 1 ORDER BY 1
      `),
      prisma.$queryRaw<CountByDateRow[]>(Prisma.sql`
        SELECT to_char(timezone('Asia/Shanghai', "createdAt"), 'YYYY-MM-DD') AS "date",
               COUNT(*)::bigint AS "count"
        FROM "StudentAnswer"
        WHERE EXISTS (SELECT 1 FROM "Submission" sub JOIN "User" owner ON owner.id = sub."studentId" WHERE sub.id = "StudentAnswer"."submissionId" AND owner."schoolId" = ${schoolId}) AND "createdAt" >= ${start} AND "createdAt" < ${end}
        GROUP BY 1 ORDER BY 1
      `),
      prisma.$queryRaw<CountByDateRow[]>(Prisma.sql`
        SELECT to_char(timezone('Asia/Shanghai', "completedAt"), 'YYYY-MM-DD') AS "date",
               COUNT(*)::bigint AS "count"
        FROM "AIAnalysis"
        WHERE EXISTS (SELECT 1 FROM "User" owner WHERE owner.id = "AIAnalysis"."requestedById" AND owner."schoolId" = ${schoolId}) AND "completedAt" >= ${start} AND "completedAt" < ${end}
          AND "status" IN ('SUCCEEDED', 'FALLBACK')
        GROUP BY 1 ORDER BY 1
      `),
      prisma.$queryRaw<CountByDateRow[]>(Prisma.sql`
        SELECT to_char(timezone('Asia/Shanghai', "createdAt"), 'YYYY-MM-DD') AS "date",
               COUNT(*)::bigint AS "count"
        FROM "PersonalizedRecommendation"
        WHERE EXISTS (SELECT 1 FROM "User" owner WHERE owner.id = "PersonalizedRecommendation"."studentId" AND owner."schoolId" = ${schoolId}) AND "createdAt" >= ${start} AND "createdAt" < ${end}
        GROUP BY 1 ORDER BY 1
      `),
    ]);
  return {
    users,
    assignments,
    submissions,
    answers,
    analyses,
    recommendations,
  };
}

export async function loadDistributions(schoolId: string) {
  const [
    roles,
    userStatuses,
    questionTypes,
    questionObjectives,
    assignmentStatuses,
    submissionStatuses,
    recommendationStatuses,
    recommendationSources,
    knowledgePointCoverage,
  ] = await Promise.all([
    prisma.user.groupBy({
      where: { schoolId, deletedAt: null },
      by: ["role"],
      _count: { _all: true },
    }),
    prisma.user.groupBy({
      where: { schoolId, deletedAt: null },
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.question.groupBy({
      by: ["type"],
      where: { deletedAt: null, creator: { schoolId } },
      _count: { _all: true },
    }),
    prisma.question.groupBy({
      by: ["defaultObjectiveKind"],
      where: { deletedAt: null, creator: { schoolId } },
      _count: { _all: true },
      orderBy: { defaultObjectiveKind: "asc" },
    }),
    prisma.assignment.groupBy({
      where: { teacher: { schoolId } },
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.submission.groupBy({
      where: { student: { schoolId } },
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.personalizedRecommendation.groupBy({
      where: { student: { schoolId } },
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.personalizedRecommendation.groupBy({
      where: { student: { schoolId } },
      by: ["source"],
      _count: { _all: true },
    }),
    prisma.$queryRaw<KnowledgeCoverageRow[]>(Prisma.sql`
      SELECT kp."id", kp."name", COUNT(DISTINCT qkp."questionId")::bigint AS "questionCount"
      FROM "QuestionKnowledgePoint" qkp
      INNER JOIN "Question" q ON q."id" = qkp."questionId" AND q."deletedAt" IS NULL
      INNER JOIN "KnowledgePoint" kp ON kp."id" = qkp."knowledgePointId"
      INNER JOIN "User" creator ON creator.id = q."creatorId"
      WHERE creator."schoolId" = ${schoolId}
      GROUP BY kp."id", kp."name"
      ORDER BY "questionCount" DESC, kp."name" ASC
      LIMIT 10
    `),
  ]);
  return {
    roles,
    userStatuses,
    questionTypes,
    questionObjectives,
    assignmentStatuses,
    submissionStatuses,
    recommendationStatuses,
    recommendationSources,
    knowledgePointCoverage,
  };
}

function safeErrorCode(value: string | null): string {
  if (!value) return "UNKNOWN";
  return value.replace(/[^A-Z0-9_-]/giu, "").slice(0, 80) || "UNKNOWN";
}

export async function loadRecentUsers(
  limit: number,
  schoolId: string,
): Promise<DashboardActivity[]> {
  const activities: DashboardActivity[] = [];
  const batchSize = Math.max(limit, 10);
  let skip = 0;

  while (activities.length < limit) {
    const records = await prisma.user.findMany({
      where: { schoolId, deletedAt: null, role: { not: Role.SUPER_ADMIN } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take: batchSize,
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        profile: { select: { displayName: true } },
      },
    });
    if (records.length === 0) break;

    const superAdminCreatedUserIds = new Set(
      (
        await prisma.auditLog.findMany({
          where: {
            action: AuditAction.USER_CREATED,
            targetType: AuditTargetType.USER,
            targetId: { in: records.map((record) => record.id) },
            actor: { is: { role: Role.SUPER_ADMIN } },
          },
          select: { targetId: true },
        })
      ).map((record) => record.targetId),
    );

    activities.push(
      ...records
        .filter((record) => !superAdminCreatedUserIds.has(record.id))
        .map((record) => ({
          id: `user:${record.id}`,
          type: "USER_CREATED" as const,
          summary: `新增${record.role === Role.TEACHER ? "教师" : record.role === Role.STUDENT ? "学生" : "管理员"}：${record.profile?.displayName ?? record.email}`,
          occurredAt: record.createdAt.toISOString(),
          href: `/admin/users/${record.id}/edit`,
        })),
    );
    skip += records.length;
  }

  return activities.slice(0, limit);
}

export async function loadRecentAssignments(
  limit: number,
  schoolId: string,
): Promise<DashboardActivity[]> {
  const records = await prisma.assignment.findMany({
    where: {
      teacher: { schoolId },
      deletedAt: null,
      publishedAt: { not: null },
    },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: limit,
    select: {
      id: true,
      title: true,
      publishedAt: true,
      classroom: { select: { name: true } },
    },
  });
  return records.flatMap((record) =>
    record.publishedAt
      ? [
          {
            id: `assignment:${record.id}`,
            type: "ASSIGNMENT_PUBLISHED" as const,
            summary: `“${record.classroom.name}”发布作业“${record.title}”`,
            occurredAt: record.publishedAt.toISOString(),
            href: null,
          },
        ]
      : [],
  );
}

export async function loadRecentAnalyses(
  limit: number,
  schoolId: string,
): Promise<DashboardActivity[]> {
  const records = await prisma.aIAnalysis.findMany({
    where: {
      requestedBy: { schoolId },
      status: AIRecordStatus.SUCCEEDED,
      completedAt: { not: null },
    },
    orderBy: [{ completedAt: "desc" }, { id: "desc" }],
    take: limit,
    select: { id: true, scope: true, completedAt: true },
  });
  return records.flatMap((record) =>
    record.completedAt
      ? [
          {
            id: `analysis:${record.id}`,
            type: "ANALYSIS_GENERATED" as const,
            summary: `生成${record.scope === "STUDENT" ? "学生" : "班级"}学情分析`,
            occurredAt: record.completedAt.toISOString(),
            href: null,
          },
        ]
      : [],
  );
}

export async function loadRecentRecommendations(
  limit: number,
  schoolId: string,
): Promise<DashboardActivity[]> {
  const records = await prisma.personalizedRecommendation.findMany({
    where: { student: { schoolId } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    select: {
      id: true,
      createdAt: true,
      source: true,
      question: { select: { title: true } },
    },
  });
  return records.map((record) => ({
    id: `recommendation:${record.id}`,
    type: "RECOMMENDATION_GENERATED",
    summary: `生成${record.source === "RULE" ? "规则" : "AI 增强"}推荐“${record.question.title}”`,
    occurredAt: record.createdAt.toISOString(),
    href: null,
  }));
}

export async function loadRecentAuditLogs(
  limit: number,
  schoolId: string,
): Promise<DashboardActivity[]> {
  const records = await prisma.auditLog.findMany({
    where: { actor: { is: { schoolId, role: { not: Role.SUPER_ADMIN } } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    select: { id: true, summary: true, createdAt: true },
  });
  return records.map((record) => ({
    id: `audit:${record.id}`,
    type: "ADMIN_AUDIT",
    summary: record.summary,
    occurredAt: record.createdAt.toISOString(),
    href: "/admin/audit-logs",
  }));
}

export async function loadRecentAIFailures(
  limit: number,
  schoolId: string,
): Promise<DashboardActivity[]> {
  const [analyses, tutoring] = await Promise.all([
    prisma.aIAnalysis.findMany({
      where: {
        requestedBy: { schoolId },
        status: { in: [AIRecordStatus.FAILED, AIRecordStatus.FALLBACK] },
        errorCode: { not: null },
      },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
      select: {
        id: true,
        status: true,
        errorCode: true,
        completedAt: true,
        createdAt: true,
      },
    }),
    prisma.aITutoringRecord.findMany({
      where: {
        student: { schoolId },
        status: { in: [AIRecordStatus.FAILED, AIRecordStatus.FALLBACK] },
        errorCode: { not: null },
      },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
      select: {
        id: true,
        status: true,
        errorCode: true,
        completedAt: true,
        createdAt: true,
      },
    }),
  ]);
  return [
    ...analyses.map((record) => ({
      id: `ai-analysis-failure:${record.id}`,
      type: "AI_FAILURE" as const,
      summary: `学情分析${record.status === AIRecordStatus.FALLBACK ? "已规则降级" : "失败"}（${safeErrorCode(record.errorCode)}）`,
      occurredAt: (record.completedAt ?? record.createdAt).toISOString(),
      href: null,
    })),
    ...tutoring.map((record) => ({
      id: `ai-tutoring-failure:${record.id}`,
      type: "AI_FAILURE" as const,
      summary: `AI 辅导${record.status === AIRecordStatus.FALLBACK ? "已规则降级" : "失败"}（${safeErrorCode(record.errorCode)}）`,
      occurredAt: (record.completedAt ?? record.createdAt).toISOString(),
      href: null,
    })),
  ]
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, limit);
}
