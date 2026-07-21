import "server-only";

import { createHash } from "node:crypto";

import {
  AIRecordStatus,
  Prisma,
  QuestionStatus,
  QuestionVisibility,
  RecommendationSource,
  RecommendationStatus,
  SubmissionStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { studentAnalysisOutputSchema } from "@/services/ai/schemas";
import type { AuthenticatedUser } from "@/services/auth/types";
import { assertCanRecommendForStudent } from "@/services/recommendations/policy";
import type { RecommendationRequest } from "@/services/recommendations/schemas";
import type {
  KnowledgeMasteryInput,
  RecommendationCandidate,
  RecommendationItem,
  RecentErrorType,
  WeakKnowledgePointInput,
} from "@/services/recommendations/types";

const RECENT_ANSWER_LIMIT = 100;
const RECOMMENDATION_EXPIRY_DAYS = 7;

export interface RecommendationStudentContext {
  teacherId: string;
  knowledgeMasteries: KnowledgeMasteryInput[];
  weakKnowledgePoints: WeakKnowledgePointInput[];
  recentCompletedQuestionIds: string[];
  recentErrorTypes: RecentErrorType[];
  consecutiveCorrect: number;
  consecutiveWrong: number;
  analysisId: string | null;
  version: string;
}

function weaknessSeverity(masteryScore: number): number {
  if (masteryScore < 20) return 5;
  if (masteryScore < 35) return 4;
  if (masteryScore < 50) return 3;
  if (masteryScore < 60) return 2;
  return 1;
}

function consecutiveOutcomeCounts(
  answers: Array<{ isCorrect: boolean | null }>,
): { consecutiveCorrect: number; consecutiveWrong: number } {
  const firstOutcome = answers[0]?.isCorrect;
  if (firstOutcome === null || firstOutcome === undefined) {
    return { consecutiveCorrect: 0, consecutiveWrong: 0 };
  }
  let count = 0;
  for (const answer of answers) {
    if (answer.isCorrect !== firstOutcome) break;
    count += 1;
  }
  return firstOutcome
    ? { consecutiveCorrect: count, consecutiveWrong: 0 }
    : { consecutiveCorrect: 0, consecutiveWrong: count };
}

export async function loadRecommendationStudentContext(
  actor: AuthenticatedUser,
  request: RecommendationRequest,
): Promise<RecommendationStudentContext> {
  const classroom = await prisma.classroom.findUnique({
    where: { id: request.classroomId },
    select: {
      teacherId: true,
      status: true,
      memberships: {
        where: { studentId: request.studentId },
        take: 1,
        select: { status: true },
      },
    },
  });
  const access = classroom
    ? {
        teacherId: classroom.teacherId,
        status: classroom.status,
        membershipStatus: classroom.memberships[0]?.status ?? null,
      }
    : null;
  assertCanRecommendForStudent(actor, request.studentId, access);

  const [masteries, recentAnswers, latestAnalysis] = await Promise.all([
    prisma.studentKnowledgeMastery.findMany({
      where: { studentId: request.studentId },
      orderBy: { knowledgePointId: "asc" },
      select: {
        knowledgePointId: true,
        masteryScore: true,
        answeredCount: true,
        updatedAt: true,
      },
    }),
    prisma.studentAnswer.findMany({
      where: {
        isCorrect: { not: null },
        submission: {
          studentId: request.studentId,
          status: {
            in: [SubmissionStatus.GRADED, SubmissionStatus.PUBLISHED],
          },
        },
      },
      orderBy: [{ gradedAt: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
      take: RECENT_ANSWER_LIMIT,
      select: {
        isCorrect: true,
        updatedAt: true,
        assignmentQuestion: { select: { questionId: true } },
      },
    }),
    prisma.aIAnalysis.findFirst({
      where: {
        studentId: request.studentId,
        status: { in: [AIRecordStatus.SUCCEEDED, AIRecordStatus.FALLBACK] },
      },
      orderBy: [{ completedAt: "desc" }, { updatedAt: "desc" }],
      select: { id: true, rawResponse: true, updatedAt: true },
    }),
  ]);

  const parsedAnalysis = studentAnalysisOutputSchema.safeParse(
    latestAnalysis?.rawResponse,
  );
  const weaknessByKnowledgePoint = new Map<string, number>();
  for (const mastery of masteries) {
    const masteryScore = mastery.masteryScore.toNumber();
    if (mastery.answeredCount > 0 && masteryScore < 60) {
      weaknessByKnowledgePoint.set(
        mastery.knowledgePointId,
        weaknessSeverity(masteryScore),
      );
    }
  }
  if (parsedAnalysis.success) {
    for (const weakness of parsedAnalysis.data.weakKnowledgePoints) {
      weaknessByKnowledgePoint.set(
        weakness.knowledgePointId,
        Math.max(
          weaknessByKnowledgePoint.get(weakness.knowledgePointId) ?? 0,
          weakness.severity,
        ),
      );
    }
  }

  const newestContextTimestamp = Math.max(
    0,
    ...masteries.map((mastery) => mastery.updatedAt.getTime()),
    ...recentAnswers.map((answer) => answer.updatedAt.getTime()),
    latestAnalysis?.updatedAt.getTime() ?? 0,
  );
  return {
    teacherId: access.teacherId,
    knowledgeMasteries: masteries.map((mastery) => ({
      knowledgePointId: mastery.knowledgePointId,
      masteryScore: mastery.masteryScore.toNumber(),
    })),
    weakKnowledgePoints: [...weaknessByKnowledgePoint]
      .map(([knowledgePointId, severity]) => ({
        knowledgePointId,
        severity,
      }))
      .sort(
        (left, right) =>
          right.severity - left.severity ||
          left.knowledgePointId.localeCompare(right.knowledgePointId),
      ),
    recentCompletedQuestionIds: [
      ...new Set(
        recentAnswers.map((answer) => answer.assignmentQuestion.questionId),
      ),
    ],
    recentErrorTypes: parsedAnalysis.success
      ? parsedAnalysis.data.errorPatterns.map((pattern) => pattern.type)
      : recentAnswers.some((answer) => answer.isCorrect === false)
        ? ["UNKNOWN"]
        : [],
    ...consecutiveOutcomeCounts(recentAnswers),
    analysisId: parsedAnalysis.success ? (latestAnalysis?.id ?? null) : null,
    version: String(newestContextTimestamp),
  };
}

export function createRecommendationCycleKey(
  request: RecommendationRequest,
  contextVersion: string,
  now: Date,
): string {
  const payload = JSON.stringify({
    studentId: request.studentId,
    classroomId: request.classroomId,
    recommendedDifficulty: request.recommendedDifficulty,
    count: request.count,
    contextVersion,
    day: now.toISOString().slice(0, 10),
    candidateQuestionIds: [...request.teacherScope.candidateQuestionIds].sort(),
    knowledgePointIds: [...request.teacherScope.knowledgePointIds].sort(),
    types: [...request.teacherScope.types].sort(),
    tags: [...request.teacherScope.tags].sort(),
  });
  const digest = createHash("sha256")
    .update(payload)
    .digest("hex")
    .slice(0, 24);
  return `recommendation-v1:${digest}`;
}

export async function loadActiveRecommendationQuestionIds(
  studentId: string,
  cycleKey: string,
  now: Date,
): Promise<string[]> {
  const records = await prisma.personalizedRecommendation.findMany({
    where: {
      studentId,
      cycleKey: { not: cycleKey },
      status: {
        in: [RecommendationStatus.PENDING, RecommendationStatus.STARTED],
      },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { questionId: true },
  });
  return [...new Set(records.map((record) => record.questionId))];
}

export async function loadEligibleRecommendationCandidates(
  request: RecommendationRequest,
  teacherId: string,
  excludedQuestionIds: string[],
): Promise<RecommendationCandidate[]> {
  const minimumDifficulty = Math.max(1, request.recommendedDifficulty - 1);
  const maximumDifficulty = Math.min(5, request.recommendedDifficulty + 1);
  const questions = await prisma.question.findMany({
    where: {
      id: {
        in: request.teacherScope.candidateQuestionIds,
        ...(excludedQuestionIds.length > 0
          ? { notIn: excludedQuestionIds }
          : {}),
      },
      status: QuestionStatus.ACTIVE,
      deletedAt: null,
      difficulty: { gte: minimumDifficulty, lte: maximumDifficulty },
      OR: [{ creatorId: teacherId }, { visibility: QuestionVisibility.PUBLIC }],
      ...(request.teacherScope.types.length > 0
        ? { type: { in: request.teacherScope.types } }
        : {}),
      ...(request.teacherScope.knowledgePointIds.length > 0
        ? {
            knowledgePointLinks: {
              some: {
                knowledgePointId: {
                  in: request.teacherScope.knowledgePointIds,
                },
                knowledgePoint: { isActive: true },
              },
            },
          }
        : {}),
      ...(request.teacherScope.tags.length > 0
        ? { tags: { hasSome: request.teacherScope.tags } }
        : {}),
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      creatorId: true,
      title: true,
      type: true,
      difficulty: true,
      visibility: true,
      status: true,
      deletedAt: true,
      tags: true,
      knowledgePointLinks: {
        orderBy: { knowledgePointId: "asc" },
        select: {
          knowledgePoint: {
            select: { id: true, name: true, isActive: true },
          },
        },
      },
    },
  });

  return questions.map((question) => ({
    id: question.id,
    creatorId: question.creatorId,
    title: question.title,
    type: question.type,
    difficulty: question.difficulty,
    visibility: question.visibility,
    status: question.status,
    deletedAt: question.deletedAt,
    tags: question.tags,
    knowledgePoints: question.knowledgePointLinks.map(
      (link) => link.knowledgePoint,
    ),
  }));
}

export async function persistRecommendations(input: {
  studentId: string;
  cycleKey: string;
  targetDifficulty: number;
  source: RecommendationSource;
  analysisId: string | null;
  items: RecommendationItem[];
  now: Date;
}): Promise<string[]> {
  const expiresAt = new Date(input.now);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + RECOMMENDATION_EXPIRY_DAYS);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (transaction) => {
          const conflicts =
            await transaction.personalizedRecommendation.findMany({
              where: {
                studentId: input.studentId,
                questionId: { in: input.items.map((item) => item.questionId) },
                cycleKey: { not: input.cycleKey },
                status: {
                  in: [
                    RecommendationStatus.PENDING,
                    RecommendationStatus.STARTED,
                  ],
                },
                OR: [{ expiresAt: null }, { expiresAt: { gt: input.now } }],
              },
              select: { questionId: true },
            });
          const conflictingQuestionIds = new Set(
            conflicts.map((record) => record.questionId),
          );
          const acceptedItems = input.items.filter(
            (item) => !conflictingQuestionIds.has(item.questionId),
          );

          for (const item of acceptedItems) {
            const data = {
              knowledgePointId: item.primaryKnowledgePointId,
              analysisId: input.analysisId,
              source: input.source,
              reason: item.reason,
              targetDifficulty: input.targetDifficulty,
              priority: item.score,
              expiresAt,
            } satisfies Prisma.PersonalizedRecommendationUncheckedUpdateInput;
            await transaction.personalizedRecommendation.upsert({
              where: {
                studentId_questionId_cycleKey: {
                  studentId: input.studentId,
                  questionId: item.questionId,
                  cycleKey: input.cycleKey,
                },
              },
              update: data,
              create: {
                studentId: input.studentId,
                questionId: item.questionId,
                cycleKey: input.cycleKey,
                status: RecommendationStatus.PENDING,
                ...data,
              },
            });
          }
          return acceptedItems.map((item) => item.questionId);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      const isWriteConflict =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034";
      if (!isWriteConflict || attempt === 1) throw error;
    }
  }
  return [];
}
