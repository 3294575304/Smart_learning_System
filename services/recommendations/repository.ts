import "server-only";

import { createHash } from "node:crypto";

import {
  AIRecordStatus,
  ClassroomStatus,
  MembershipStatus,
  Prisma,
  QuestionStatus,
  QuestionVisibility,
  RecommendationSource,
  RecommendationStatus,
  Role,
  SubmissionStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { studentAnalysisOutputSchema } from "@/services/ai/schemas";
import { AUTO_GRADABLE_QUESTION_TYPES } from "@/services/assignments/grading";
import {
  AuthorizationError,
  ResourceNotFoundError,
} from "@/services/auth/policy";
import type { AuthenticatedUser } from "@/services/auth/types";
import { RecommendationOperationError } from "@/services/recommendations/errors";
import { assertCanRecommendForStudent } from "@/services/recommendations/policy";
import { MAX_RECOMMENDATION_CANDIDATE_IDS } from "@/services/recommendations/schemas";
import type {
  RecommendationGenerationApiInput,
  RecommendationListQuery,
  RecommendationRequest,
} from "@/services/recommendations/schemas";
import type {
  KnowledgeMasteryInput,
  RecommendationCandidate,
  RecommendationItem,
  RecentErrorType,
  WeakKnowledgePointInput,
} from "@/services/recommendations/types";

const RECENT_ANSWER_LIMIT = 100;
const RECOMMENDATION_EXPIRY_DAYS = 7;

const recommendationViewSelect =
  Prisma.validator<Prisma.PersonalizedRecommendationSelect>()({
    id: true,
    studentId: true,
    cycleKey: true,
    source: true,
    status: true,
    reason: true,
    createdAt: true,
    expiresAt: true,
    startedAt: true,
    completedAt: true,
    wasCorrect: true,
    score: true,
    maxScore: true,
    practiceAnswer: {
      select: {
        id: true,
        questionId: true,
        textAnswer: true,
        booleanAnswer: true,
        selectedOptionIds: true,
        responseTimeMs: true,
        score: true,
        maxScore: true,
        isCorrect: true,
      },
    },
    question: {
      select: {
        id: true,
        title: true,
        content: true,
        type: true,
        difficulty: true,
        explanation: true,
        correctBoolean: true,
        referenceAnswer: true,
        acceptableAnswers: true,
        isCaseSensitive: true,
        status: true,
        deletedAt: true,
        options: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          select: {
            id: true,
            label: true,
            content: true,
            sortOrder: true,
            isCorrect: true,
          },
        },
        knowledgePointLinks: {
          orderBy: { knowledgePointId: "asc" },
          select: {
            knowledgePoint: { select: { id: true, name: true } },
          },
        },
      },
    },
  });

export type RecommendationViewRecord =
  Prisma.PersonalizedRecommendationGetPayload<{
    select: typeof recommendationViewSelect;
  }>;

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

export async function buildRecommendationRequest(
  actor: AuthenticatedUser,
  input: RecommendationGenerationApiInput,
): Promise<RecommendationRequest> {
  if (actor.role === Role.ADMIN) {
    throw new AuthorizationError("当前角色不能生成学生练习推荐");
  }

  const selectForStudent = {
    teacherId: true,
    status: true,
    memberships: {
      where: { studentId: input.studentId },
      take: 1,
      select: { status: true },
    },
  } satisfies Prisma.ClassroomSelect;

  let classroom: {
    id: string;
    teacherId: string;
    status: ClassroomStatus;
    memberships: Array<{ status: MembershipStatus }>;
  } | null;

  if (input.classroomId) {
    classroom = await prisma.classroom.findUnique({
      where: { id: input.classroomId },
      select: { id: true, ...selectForStudent },
    });
  } else {
    if (actor.role === Role.STUDENT && actor.id !== input.studentId) {
      throw new ResourceNotFoundError("学生或班级不存在");
    }
    const classrooms = await prisma.classroom.findMany({
      where: {
        status: ClassroomStatus.ACTIVE,
        ...(actor.role === Role.TEACHER ? { teacherId: actor.id } : {}),
        memberships: {
          some: {
            studentId: input.studentId,
            status: MembershipStatus.ACTIVE,
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 2,
      select: { id: true, ...selectForStudent },
    });
    if (classrooms.length > 1) {
      throw new RecommendationOperationError(
        "学生属于多个有效班级，请指定 classroomId",
        400,
      );
    }
    classroom = classrooms[0] ?? null;
  }

  const access = classroom
    ? {
        teacherId: classroom.teacherId,
        status: classroom.status,
        membershipStatus: classroom.memberships[0]?.status ?? null,
      }
    : null;
  assertCanRecommendForStudent(actor, input.studentId, access);
  if (!classroom) throw new ResourceNotFoundError("班级不存在");

  const candidateQuestions = await prisma.question.findMany({
    where: {
      status: QuestionStatus.ACTIVE,
      deletedAt: null,
      type: { in: AUTO_GRADABLE_QUESTION_TYPES },
      OR: [
        { creatorId: classroom.teacherId },
        { visibility: QuestionVisibility.PUBLIC },
      ],
    },
    orderBy: { id: "asc" },
    take: MAX_RECOMMENDATION_CANDIDATE_IDS,
    select: { id: true },
  });
  if (candidateQuestions.length === 0) {
    throw new RecommendationOperationError("当前没有可用于推荐的题目", 422);
  }

  return {
    studentId: input.studentId,
    classroomId: classroom.id,
    recommendedDifficulty: input.recommendedDifficulty,
    count: input.limit,
    teacherScope: {
      candidateQuestionIds: candidateQuestions.map((question) => question.id),
      knowledgePointIds: [],
      types: [],
      tags: [],
    },
  };
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

  const [
    masteries,
    recentAssignmentAnswers,
    recentRecommendationAnswers,
    latestAnalysis,
  ] = await Promise.all([
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
          status: SubmissionStatus.PUBLISHED,
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
    prisma.recommendationPracticeAnswer.findMany({
      where: { recommendation: { studentId: request.studentId } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: RECENT_ANSWER_LIMIT,
      select: {
        questionId: true,
        isCorrect: true,
        updatedAt: true,
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
  const recentAnswers = [
    ...recentAssignmentAnswers.map((answer) => ({
      questionId: answer.assignmentQuestion.questionId,
      isCorrect: answer.isCorrect,
      updatedAt: answer.updatedAt,
    })),
    ...recentRecommendationAnswers,
  ]
    .sort(
      (left, right) =>
        right.updatedAt.getTime() - left.updatedAt.getTime() ||
        left.questionId.localeCompare(right.questionId),
    )
    .slice(0, RECENT_ANSWER_LIMIT);
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
      ...new Set(recentAnswers.map((answer) => answer.questionId)),
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
  const allowedTypes =
    request.teacherScope.types.length === 0
      ? AUTO_GRADABLE_QUESTION_TYPES
      : AUTO_GRADABLE_QUESTION_TYPES.filter((type) =>
          request.teacherScope.types.includes(type),
        );
  if (allowedTypes.length === 0) return [];
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
      type: { in: allowedTypes },
      difficulty: { gte: minimumDifficulty, lte: maximumDifficulty },
      OR: [{ creatorId: teacherId }, { visibility: QuestionVisibility.PUBLIC }],
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
}): Promise<{
  questionIds: string[];
  createdCount: number;
  expiresAt: Date;
}> {
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
          const existingInCycle =
            await transaction.personalizedRecommendation.findMany({
              where: {
                studentId: input.studentId,
                cycleKey: input.cycleKey,
                questionId: {
                  in: acceptedItems.map((item) => item.questionId),
                },
              },
              select: { questionId: true },
            });
          const existingQuestionIds = new Set(
            existingInCycle.map((record) => record.questionId),
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
          return {
            questionIds: acceptedItems.map((item) => item.questionId),
            createdCount: acceptedItems.filter(
              (item) => !existingQuestionIds.has(item.questionId),
            ).length,
            expiresAt,
          };
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
  return { questionIds: [], createdCount: 0, expiresAt };
}

export async function loadRecommendationsByCycle(
  studentId: string,
  cycleKey: string,
): Promise<RecommendationViewRecord[]> {
  return prisma.personalizedRecommendation.findMany({
    where: { studentId, cycleKey },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: recommendationViewSelect,
  });
}

export async function expireStudentRecommendations(
  studentId: string,
  now: Date,
): Promise<void> {
  await prisma.personalizedRecommendation.updateMany({
    where: {
      studentId,
      status: {
        in: [RecommendationStatus.PENDING, RecommendationStatus.STARTED],
      },
      expiresAt: { lte: now },
    },
    data: { status: RecommendationStatus.EXPIRED },
  });
}

export async function recommendationCursorBelongsToStudent(
  studentId: string,
  cursor: string,
): Promise<boolean> {
  return (
    (await prisma.personalizedRecommendation.count({
      where: { id: cursor, studentId },
    })) === 1
  );
}

export async function loadRecommendationPage(
  studentId: string,
  query: RecommendationListQuery,
): Promise<RecommendationViewRecord[]> {
  return prisma.personalizedRecommendation.findMany({
    where: {
      studentId,
      ...(query.status ? { status: query.status } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    take: query.limit + 1,
    select: recommendationViewSelect,
  });
}

export async function loadRecommendationById(
  recommendationId: string,
): Promise<RecommendationViewRecord | null> {
  return prisma.personalizedRecommendation.findUnique({
    where: { id: recommendationId },
    select: recommendationViewSelect,
  });
}

export async function startPendingRecommendation(input: {
  recommendationId: string;
  studentId: string;
  now: Date;
}): Promise<boolean> {
  const updated = await prisma.personalizedRecommendation.updateMany({
    where: {
      id: input.recommendationId,
      studentId: input.studentId,
      status: RecommendationStatus.PENDING,
      OR: [{ expiresAt: null }, { expiresAt: { gt: input.now } }],
      question: {
        status: QuestionStatus.ACTIVE,
        deletedAt: null,
      },
    },
    data: {
      status: RecommendationStatus.STARTED,
      startedAt: input.now,
    },
  });
  return updated.count === 1;
}
