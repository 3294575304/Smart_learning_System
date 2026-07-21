import "server-only";

import {
  AssignmentStatus,
  MembershipStatus,
  Prisma,
  QuestionStatus,
  SubmissionStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

const COMPLETED_SUBMISSION_STATUSES: SubmissionStatus[] = [
  SubmissionStatus.SUBMITTED,
  SubmissionStatus.PENDING_REVIEW,
  SubmissionStatus.GRADED,
  SubmissionStatus.PUBLISHED,
];

export interface TeacherDashboardData {
  metrics: {
    classroomCount: number;
    questionCount: number;
    publishedAssignmentCount: number;
    pendingReviewCount: number;
    averageAccuracy: number | null;
  };
  recentAssignments: Array<{
    id: string;
    title: string;
    status: AssignmentStatus;
    classroomName: string;
    dueAt: Date | null;
    submissionCount: number;
  }>;
  activeClassrooms: Array<{
    id: string;
    name: string;
    studentCount: number;
    latestAssignmentTitle: string | null;
  }>;
  scoreTrend: Array<{
    label: string;
    value: number;
    detail: string;
  }>;
  weakKnowledgePoints: Array<{
    id: string;
    name: string;
    answeredCount: number;
    accuracy: number;
  }>;
}

function percentage(part: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((part / total) * 10_000) / 100;
}

export async function getTeacherDashboard(
  teacherId: string,
): Promise<TeacherDashboardData> {
  const evaluatedAnswerWhere: Prisma.StudentAnswerWhereInput = {
    submission: { assignment: { teacherId } },
    isCorrect: { not: null },
  };

  const [
    classroomCount,
    questionCount,
    publishedAssignmentCount,
    pendingReviewCount,
    evaluatedAnswerCount,
    correctAnswerCount,
    recentAssignments,
    activeClassrooms,
    recentSubmissions,
    knowledgePointAnswers,
  ] = await Promise.all([
    prisma.classroom.count({ where: { teacherId } }),
    prisma.question.count({
      where: {
        creatorId: teacherId,
        deletedAt: null,
        status: { not: QuestionStatus.ARCHIVED },
      },
    }),
    prisma.assignment.count({
      where: { teacherId, status: AssignmentStatus.PUBLISHED },
    }),
    prisma.submission.count({
      where: {
        assignment: { teacherId },
        status: SubmissionStatus.PENDING_REVIEW,
      },
    }),
    prisma.studentAnswer.count({ where: evaluatedAnswerWhere }),
    prisma.studentAnswer.count({
      where: { ...evaluatedAnswerWhere, isCorrect: true },
    }),
    prisma.assignment.findMany({
      where: { teacherId },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 5,
      select: {
        id: true,
        title: true,
        status: true,
        dueAt: true,
        classroom: { select: { name: true } },
        _count: {
          select: {
            submissions: {
              where: { status: { in: COMPLETED_SUBMISSION_STATUSES } },
            },
          },
        },
      },
    }),
    prisma.classroom.findMany({
      where: { teacherId, status: "ACTIVE" },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 4,
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            memberships: { where: { status: MembershipStatus.ACTIVE } },
          },
        },
        assignments: {
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          take: 1,
          select: { title: true },
        },
      },
    }),
    prisma.submission.findMany({
      where: {
        assignment: { teacherId },
        status: { in: [SubmissionStatus.GRADED, SubmissionStatus.PUBLISHED] },
        percentage: { not: null },
        submittedAt: { not: null },
      },
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      take: 8,
      select: {
        percentage: true,
        submittedAt: true,
        assignment: { select: { title: true } },
      },
    }),
    prisma.studentAnswer.findMany({
      where: evaluatedAnswerWhere,
      orderBy: [{ gradedAt: "desc" }, { id: "desc" }],
      take: 500,
      select: {
        isCorrect: true,
        assignmentQuestion: {
          select: {
            knowledgePointSnapshots: {
              select: { knowledgePointId: true, nameSnapshot: true },
            },
          },
        },
      },
    }),
  ]);

  const knowledgePointMap = new Map<
    string,
    { id: string; name: string; answeredCount: number; correctCount: number }
  >();
  for (const answer of knowledgePointAnswers) {
    for (const knowledgePoint of answer.assignmentQuestion
      .knowledgePointSnapshots) {
      const current = knowledgePointMap.get(knowledgePoint.knowledgePointId) ?? {
        id: knowledgePoint.knowledgePointId,
        name: knowledgePoint.nameSnapshot,
        answeredCount: 0,
        correctCount: 0,
      };
      current.answeredCount += 1;
      if (answer.isCorrect) current.correctCount += 1;
      knowledgePointMap.set(knowledgePoint.knowledgePointId, current);
    }
  }

  const weakKnowledgePoints = [...knowledgePointMap.values()]
    .map((item) => ({
      id: item.id,
      name: item.name,
      answeredCount: item.answeredCount,
      accuracy: percentage(item.correctCount, item.answeredCount) ?? 0,
    }))
    .sort(
      (left, right) =>
        left.accuracy - right.accuracy ||
        right.answeredCount - left.answeredCount ||
        left.name.localeCompare(right.name, "zh-CN"),
    )
    .slice(0, 5);

  return {
    metrics: {
      classroomCount,
      questionCount,
      publishedAssignmentCount,
      pendingReviewCount,
      averageAccuracy: percentage(correctAnswerCount, evaluatedAnswerCount),
    },
    recentAssignments: recentAssignments.map((assignment) => ({
      id: assignment.id,
      title: assignment.title,
      status: assignment.status,
      classroomName: assignment.classroom.name,
      dueAt: assignment.dueAt,
      submissionCount: assignment._count.submissions,
    })),
    activeClassrooms: activeClassrooms.map((classroom) => ({
      id: classroom.id,
      name: classroom.name,
      studentCount: classroom._count.memberships,
      latestAssignmentTitle: classroom.assignments[0]?.title ?? null,
    })),
    scoreTrend: recentSubmissions.reverse().map((submission) => ({
      label: submission.submittedAt?.toLocaleDateString("zh-CN", {
        month: "numeric",
        day: "numeric",
      }) ?? "—",
      value: Math.round(submission.percentage?.toNumber() ?? 0),
      detail: submission.assignment.title,
    })),
    weakKnowledgePoints,
  };
}
