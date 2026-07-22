import "server-only";

import {
  AIRecordStatus,
  Prisma,
  Role,
  SubmissionStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { DashboardActivity } from "@/services/admin/dashboard/types";

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
  current7Start: Date;
  current7End: Date;
  previous7Start: Date;
  previous7End: Date;
  current30Start: Date;
}) {
  const [total, roles, statuses, current7, previous7, current30] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
      prisma.user.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.user.count({
        where: {
          createdAt: { gte: input.current7Start, lt: input.current7End },
        },
      }),
      prisma.user.count({
        where: {
          createdAt: { gte: input.previous7Start, lt: input.previous7End },
        },
      }),
      prisma.user.count({
        where: {
          createdAt: { gte: input.current30Start, lt: input.current7End },
        },
      }),
    ]);
  return { total, roles, statuses, current7, previous7, current30 };
}

export async function loadTeachingOverview() {
  const [
    classroomTotal,
    activeClassroomCount,
    questionTotal,
    assignmentStatuses,
    effectiveSubmissionCount,
    gradedSubmissionCount,
    pendingReviewSubmissionCount,
  ] = await Promise.all([
    prisma.classroom.count(),
    prisma.classroom.count({ where: { status: "ACTIVE" } }),
    prisma.question.count({ where: { deletedAt: null } }),
    prisma.assignment.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.submission.count({
      where: { status: { in: EFFECTIVE_SUBMISSION_STATUSES } },
    }),
    prisma.submission.count({
      where: { status: { in: FINALIZED_SUBMISSION_STATUSES } },
    }),
    prisma.submission.count({
      where: { status: SubmissionStatus.PENDING_REVIEW },
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
        status: { in: FINALIZED_SUBMISSION_STATUSES },
        percentage: { not: null },
      },
      _count: { _all: true },
      _avg: { percentage: true },
    }),
    prisma.studentAnswer.count({
      where: { createdAt: { gte: input.current7Start, lt: input.end } },
    }),
    prisma.studentAnswer.count({
      where: { createdAt: { gte: input.current30Start, lt: input.end } },
    }),
    prisma.studentAnswer.count({ where: { isCorrect: false } }),
    prisma.aIAnalysis.count({
      where: {
        status: { in: GENERATED_ANALYSIS_STATUSES },
        completedAt: { not: null },
      },
    }),
    prisma.personalizedRecommendation.count(),
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

export async function loadAIOverview(input: { start7: Date; end: Date }) {
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
    prisma.aIAnalysis.count(),
    prisma.personalizedRecommendation.count(),
    prisma.aIAnalysis.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.aITutoringRecord.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.aIAnalysis.count({
      where: { createdAt: { gte: input.start7, lt: input.end } },
    }),
    prisma.aITutoringRecord.count({
      where: { createdAt: { gte: input.start7, lt: input.end } },
    }),
    prisma.aIAnalysis.aggregate({
      _sum: { latencyMs: true },
      _count: { latencyMs: true },
    }),
    prisma.aITutoringRecord.aggregate({
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

export async function loadTrendCounts(start: Date, end: Date) {
  const [users, assignments, submissions, answers, analyses, recommendations] =
    await Promise.all([
      prisma.$queryRaw<CountByDateRow[]>(Prisma.sql`
        SELECT to_char(timezone('Asia/Shanghai', "createdAt"), 'YYYY-MM-DD') AS "date",
               COUNT(*)::bigint AS "count"
        FROM "User"
        WHERE "createdAt" >= ${start} AND "createdAt" < ${end}
        GROUP BY 1 ORDER BY 1
      `),
      prisma.$queryRaw<CountByDateRow[]>(Prisma.sql`
        SELECT to_char(timezone('Asia/Shanghai', "publishedAt"), 'YYYY-MM-DD') AS "date",
               COUNT(*)::bigint AS "count"
        FROM "Assignment"
        WHERE "publishedAt" >= ${start} AND "publishedAt" < ${end}
        GROUP BY 1 ORDER BY 1
      `),
      prisma.$queryRaw<CountByDateRow[]>(Prisma.sql`
        SELECT to_char(timezone('Asia/Shanghai', "submittedAt"), 'YYYY-MM-DD') AS "date",
               COUNT(*)::bigint AS "count"
        FROM "Submission"
        WHERE "submittedAt" >= ${start} AND "submittedAt" < ${end}
          AND "status" IN ('SUBMITTED', 'PENDING_REVIEW', 'GRADED', 'PUBLISHED')
        GROUP BY 1 ORDER BY 1
      `),
      prisma.$queryRaw<CountByDateRow[]>(Prisma.sql`
        SELECT to_char(timezone('Asia/Shanghai', "createdAt"), 'YYYY-MM-DD') AS "date",
               COUNT(*)::bigint AS "count"
        FROM "StudentAnswer"
        WHERE "createdAt" >= ${start} AND "createdAt" < ${end}
        GROUP BY 1 ORDER BY 1
      `),
      prisma.$queryRaw<CountByDateRow[]>(Prisma.sql`
        SELECT to_char(timezone('Asia/Shanghai', "completedAt"), 'YYYY-MM-DD') AS "date",
               COUNT(*)::bigint AS "count"
        FROM "AIAnalysis"
        WHERE "completedAt" >= ${start} AND "completedAt" < ${end}
          AND "status" IN ('SUCCEEDED', 'FALLBACK')
        GROUP BY 1 ORDER BY 1
      `),
      prisma.$queryRaw<CountByDateRow[]>(Prisma.sql`
        SELECT to_char(timezone('Asia/Shanghai', "createdAt"), 'YYYY-MM-DD') AS "date",
               COUNT(*)::bigint AS "count"
        FROM "PersonalizedRecommendation"
        WHERE "createdAt" >= ${start} AND "createdAt" < ${end}
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

export async function loadDistributions() {
  const [
    roles,
    userStatuses,
    questionTypes,
    questionDifficulties,
    assignmentStatuses,
    submissionStatuses,
    recommendationStatuses,
    recommendationSources,
    knowledgePointCoverage,
  ] = await Promise.all([
    prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
    prisma.user.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.question.groupBy({
      by: ["type"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.question.groupBy({
      by: ["difficulty"],
      where: { deletedAt: null },
      _count: { _all: true },
      orderBy: { difficulty: "asc" },
    }),
    prisma.assignment.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.submission.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.personalizedRecommendation.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.personalizedRecommendation.groupBy({
      by: ["source"],
      _count: { _all: true },
    }),
    prisma.$queryRaw<KnowledgeCoverageRow[]>(Prisma.sql`
      SELECT kp."id", kp."name", COUNT(DISTINCT qkp."questionId")::bigint AS "questionCount"
      FROM "QuestionKnowledgePoint" qkp
      INNER JOIN "Question" q ON q."id" = qkp."questionId" AND q."deletedAt" IS NULL
      INNER JOIN "KnowledgePoint" kp ON kp."id" = qkp."knowledgePointId"
      GROUP BY kp."id", kp."name"
      ORDER BY "questionCount" DESC, kp."name" ASC
      LIMIT 10
    `),
  ]);
  return {
    roles,
    userStatuses,
    questionTypes,
    questionDifficulties,
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
): Promise<DashboardActivity[]> {
  const records = await prisma.user.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
      profile: { select: { displayName: true } },
    },
  });
  return records.map((record) => ({
    id: `user:${record.id}`,
    type: "USER_CREATED",
    summary: `新增${record.role === Role.TEACHER ? "教师" : record.role === Role.STUDENT ? "学生" : "管理员"}：${record.profile?.displayName ?? record.email}`,
    occurredAt: record.createdAt.toISOString(),
    href: `/admin/users/${record.id}/edit`,
  }));
}

export async function loadRecentAssignments(
  limit: number,
): Promise<DashboardActivity[]> {
  const records = await prisma.assignment.findMany({
    where: { publishedAt: { not: null } },
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
): Promise<DashboardActivity[]> {
  const records = await prisma.aIAnalysis.findMany({
    where: { status: AIRecordStatus.SUCCEEDED, completedAt: { not: null } },
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
): Promise<DashboardActivity[]> {
  const records = await prisma.personalizedRecommendation.findMany({
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
): Promise<DashboardActivity[]> {
  const records = await prisma.auditLog.findMany({
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
): Promise<DashboardActivity[]> {
  const [analyses, tutoring] = await Promise.all([
    prisma.aIAnalysis.findMany({
      where: {
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
