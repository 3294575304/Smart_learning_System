import "server-only";

import {
  AIRecordStatus,
  MembershipStatus,
  RecommendationStatus,
  SubmissionStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { StudentResultsQuery } from "@/services/assignments/schemas";

const FINALIZED_STATUSES: SubmissionStatus[] = [SubmissionStatus.PUBLISHED];

const VISIBLE_RESULT_STATUSES: SubmissionStatus[] = [
  SubmissionStatus.SUBMITTED,
  SubmissionStatus.PENDING_REVIEW,
  SubmissionStatus.GRADED,
  SubmissionStatus.PUBLISHED,
];

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return (
    Math.round(
      (values.reduce((sum, value) => sum + value, 0) / values.length) * 100,
    ) / 100
  );
}

export async function getStudentDashboard(studentId: string) {
  const now = new Date();
  const soon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1_000);
  const [assignments, finalizedSubmissions, masteries, recommendations] =
    await Promise.all([
      prisma.assignment.findMany({
        where: {
          status: "PUBLISHED",
          publishedAt: { lte: now },
          classroom: {
            memberships: {
              some: { studentId, status: MembershipStatus.ACTIVE },
            },
          },
        },
        orderBy: [{ dueAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          title: true,
          dueAt: true,
          classroom: { select: { name: true } },
          _count: { select: { questions: true } },
          submissions: {
            where: {
              studentId,
              status: { not: SubmissionStatus.WITHDRAWN },
            },
            orderBy: { attemptNumber: "desc" },
            select: { id: true, status: true },
          },
        },
      }),
      prisma.submission.findMany({
        where: { studentId, status: { in: FINALIZED_STATUSES } },
        orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
        take: 50,
        select: {
          id: true,
          assignmentId: true,
          percentage: true,
          score: true,
          maxScore: true,
          submittedAt: true,
          assignment: { select: { title: true } },
        },
      }),
      prisma.studentKnowledgeMastery.findMany({
        where: { studentId, answeredCount: { gt: 0 } },
        orderBy: [{ masteryScore: "asc" }, { answeredCount: "desc" }],
        take: 5,
        select: {
          knowledgePointId: true,
          masteryScore: true,
          answeredCount: true,
          trend: true,
          knowledgePoint: { select: { name: true } },
        },
      }),
      prisma.personalizedRecommendation.findMany({
        where: {
          studentId,
          status: {
            in: [RecommendationStatus.PENDING, RecommendationStatus.STARTED],
          },
        },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        take: 3,
        select: {
          id: true,
          reason: true,
          status: true,
          targetDifficulty: true,
          question: { select: { title: true } },
          knowledgePoint: { select: { name: true } },
        },
      }),
    ]);

  const pendingAssignments = assignments.filter((assignment) => {
    const submitted = assignment.submissions.some(
      (submission) => submission.status !== SubmissionStatus.IN_PROGRESS,
    );
    return !submitted && Boolean(assignment.dueAt && assignment.dueAt > now);
  });
  const latestByAssignment = new Map<
    string,
    (typeof finalizedSubmissions)[number]
  >();
  for (const submission of finalizedSubmissions) {
    if (!latestByAssignment.has(submission.assignmentId)) {
      latestByAssignment.set(submission.assignmentId, submission);
    }
  }
  const latestResults = [...latestByAssignment.values()];
  const percentages = latestResults.flatMap((submission) =>
    submission.percentage === null ? [] : [submission.percentage.toNumber()],
  );

  return {
    metrics: {
      pendingCount: pendingAssignments.length,
      dueSoonCount: pendingAssignments.filter((assignment) =>
        Boolean(assignment.dueAt && assignment.dueAt <= soon),
      ).length,
      completedCount: latestResults.length,
      averageAccuracy: average(percentages),
      latestScore:
        latestResults[0]?.score === null || !latestResults[0]
          ? null
          : {
              score: latestResults[0].score.toNumber(),
              maxScore: latestResults[0].maxScore?.toNumber() ?? 0,
            },
    },
    pendingAssignments: pendingAssignments.slice(0, 4).map((assignment) => ({
      id: assignment.id,
      title: assignment.title,
      classroomName: assignment.classroom.name,
      questionCount: assignment._count.questions,
      dueAt: assignment.dueAt,
      inProgressSubmissionId:
        assignment.submissions.find(
          (submission) => submission.status === SubmissionStatus.IN_PROGRESS,
        )?.id ?? null,
    })),
    scoreTrend: latestResults
      .slice(0, 8)
      .reverse()
      .flatMap((submission) =>
        submission.percentage === null
          ? []
          : [
              {
                label:
                  submission.submittedAt?.toLocaleDateString("zh-CN", {
                    month: "numeric",
                    day: "numeric",
                  }) ?? "—",
                value: Math.round(submission.percentage.toNumber()),
                detail: submission.assignment.title,
              },
            ],
      ),
    weakKnowledgePoints: masteries.map((mastery) => ({
      id: mastery.knowledgePointId,
      name: mastery.knowledgePoint.name,
      masteryScore: mastery.masteryScore.toNumber(),
      answeredCount: mastery.answeredCount,
      trend: mastery.trend,
    })),
    recommendations: recommendations.map((recommendation) => ({
      id: recommendation.id,
      title: recommendation.question.title,
      reason: recommendation.reason,
      status: recommendation.status,
      difficulty: recommendation.targetDifficulty,
      knowledgePointName: recommendation.knowledgePoint?.name ?? null,
    })),
  };
}

export async function listStudentResults(
  studentId: string,
  query: StudentResultsQuery,
) {
  const where = {
    studentId,
    status: { in: VISIBLE_RESULT_STATUSES },
  };
  const [total, submissions] = await prisma.$transaction([
    prisma.submission.count({ where }),
    prisma.submission.findMany({
      where,
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        attemptNumber: true,
        status: true,
        submittedAt: true,
        score: true,
        maxScore: true,
        percentage: true,
        assignment: {
          select: {
            id: true,
            title: true,
            classroom: { select: { name: true } },
          },
        },
      },
    }),
  ]);
  return {
    items: submissions.map((submission) => {
      const isPublished = submission.status === SubmissionStatus.PUBLISHED;
      return {
        id: submission.id,
        assignmentId: submission.assignment.id,
        assignmentTitle: submission.assignment.title,
        classroomName: submission.assignment.classroom.name,
        attemptNumber: submission.attemptNumber,
        status: submission.status,
        submittedAt: submission.submittedAt,
        score: isPublished ? (submission.score?.toNumber() ?? null) : null,
        maxScore: isPublished
          ? (submission.maxScore?.toNumber() ?? null)
          : null,
        percentage: isPublished
          ? (submission.percentage?.toNumber() ?? null)
          : null,
      };
    }),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

export async function getStudentLearningOverview(studentId: string) {
  const [masteries, latestAnalysis, recentResults] = await Promise.all([
    prisma.studentKnowledgeMastery.findMany({
      where: { studentId, answeredCount: { gt: 0 } },
      orderBy: [{ masteryScore: "asc" }, { answeredCount: "desc" }],
      select: {
        knowledgePointId: true,
        level: true,
        trend: true,
        masteryScore: true,
        answeredCount: true,
        correctCount: true,
        calculatedAt: true,
        knowledgePoint: { select: { name: true, code: true } },
      },
    }),
    prisma.aIAnalysis.findFirst({
      where: {
        studentId,
        status: { in: [AIRecordStatus.SUCCEEDED, AIRecordStatus.FALLBACK] },
      },
      orderBy: [{ completedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        summary: true,
        overallScore: true,
        riskLevel: true,
        fallbackUsed: true,
        sampleSize: true,
        completedAt: true,
        insights: {
          orderBy: [{ priority: "desc" }, { id: "asc" }],
          select: {
            id: true,
            type: true,
            title: true,
            detail: true,
            recommendedAction: true,
            knowledgePoint: { select: { name: true } },
          },
        },
      },
    }),
    prisma.submission.findMany({
      where: { studentId, status: { in: FINALIZED_STATUSES } },
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      take: 8,
      select: {
        id: true,
        submittedAt: true,
        percentage: true,
        assignment: { select: { title: true } },
      },
    }),
  ]);

  return {
    masteries: masteries.map((mastery) => ({
      id: mastery.knowledgePointId,
      name: mastery.knowledgePoint.name,
      code: mastery.knowledgePoint.code,
      level: mastery.level,
      trend: mastery.trend,
      masteryScore: mastery.masteryScore.toNumber(),
      answeredCount: mastery.answeredCount,
      correctCount: mastery.correctCount,
      calculatedAt: mastery.calculatedAt,
    })),
    latestAnalysis: latestAnalysis
      ? {
          ...latestAnalysis,
          overallScore: latestAnalysis.overallScore?.toNumber() ?? null,
        }
      : null,
    scoreTrend: recentResults.reverse().flatMap((result) =>
      result.percentage === null
        ? []
        : [
            {
              label:
                result.submittedAt?.toLocaleDateString("zh-CN", {
                  month: "numeric",
                  day: "numeric",
                }) ?? "—",
              value: Math.round(result.percentage.toNumber()),
              detail: result.assignment.title,
            },
          ],
    ),
  };
}
