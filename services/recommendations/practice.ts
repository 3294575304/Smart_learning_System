import "server-only";

import {
  Prisma,
  QuestionStatus,
  QuestionType,
  RecommendationStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  gradeAnswer,
  isAutoGradableQuestionType,
} from "@/services/assignments/grading";
import type { SavedAnswerInput } from "@/services/assignments/schemas";
import { ResourceNotFoundError } from "@/services/auth/policy";
import type { AuthenticatedUser } from "@/services/auth/types";
import { ensureLearnerProfileSnapshot } from "@/services/learner-profiles/service";
import { appendRecommendationPracticeLearningEvent } from "@/services/learning-events/recommendation-practice";
import { RecommendationOperationError } from "@/services/recommendations/errors";
import { applyRecommendationMasteryUpdates } from "@/services/recommendations/mastery";
import { assertCanAccessRecommendation } from "@/services/recommendations/policy";
import { practiceResultFromRecord } from "@/services/recommendations/practice-presentation";
import { loadRecommendationById } from "@/services/recommendations/repository";
import {
  recommendationIdSchema,
  recommendationPracticeSubmitSchema,
  type RecommendationPracticeAnswerInput,
} from "@/services/recommendations/schemas";
import type { RecommendationPracticeResultView } from "@/services/recommendations/types";

const practiceSubmissionSelect =
  Prisma.validator<Prisma.PersonalizedRecommendationSelect>()({
    id: true,
    studentId: true,
    status: true,
    expiresAt: true,
    questionId: true,
    practiceAnswer: { select: { id: true } },
    question: {
      select: {
        type: true,
        status: true,
        deletedAt: true,
        correctBoolean: true,
        acceptableAnswers: true,
        isCaseSensitive: true,
        options: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          select: { id: true, isCorrect: true },
        },
        knowledgePointLinks: {
          orderBy: { knowledgePointId: "asc" },
          select: {
            knowledgePointId: true,
            weight: true,
            knowledgePoint: { select: { isActive: true } },
          },
        },
      },
    },
  });

type PracticeSubmissionRecord = Prisma.PersonalizedRecommendationGetPayload<{
  select: typeof practiceSubmissionSelect;
}>;

function validatedSavedAnswer(
  recommendation: PracticeSubmissionRecord,
  answer: RecommendationPracticeAnswerInput,
): SavedAnswerInput {
  if (answer.questionId !== recommendation.questionId) {
    throw new RecommendationOperationError("提交包含不属于当前推荐的题目", 400);
  }
  const type = recommendation.question.type;
  if (
    (type === QuestionType.SINGLE_CHOICE ||
      type === QuestionType.MULTIPLE_CHOICE) &&
    answer.kind === "CHOICE"
  ) {
    const validOptionIds = new Set(
      recommendation.question.options.map((option) => option.id),
    );
    if (answer.optionIds.some((optionId) => !validOptionIds.has(optionId))) {
      throw new RecommendationOperationError("提交包含无效的题目选项", 400);
    }
    if (type === QuestionType.SINGLE_CHOICE && answer.optionIds.length !== 1) {
      throw new RecommendationOperationError("单选题只能提交一个选项", 400);
    }
    return {
      assignmentQuestionId: recommendation.questionId,
      kind: answer.kind,
      optionIds: answer.optionIds,
      responseTimeMs: answer.responseTimeMs,
    };
  }
  if (type === QuestionType.TRUE_FALSE && answer.kind === "BOOLEAN") {
    return {
      assignmentQuestionId: recommendation.questionId,
      kind: answer.kind,
      value: answer.value,
      responseTimeMs: answer.responseTimeMs,
    };
  }
  if (type === QuestionType.FILL_BLANK && answer.kind === "TEXT") {
    return {
      assignmentQuestionId: recommendation.questionId,
      kind: answer.kind,
      value: answer.value,
      responseTimeMs: answer.responseTimeMs,
    };
  }
  throw new RecommendationOperationError("题型与提交答案不匹配", 400);
}

async function applyWrongQuestionUpdate(
  transaction: Prisma.TransactionClient,
  input: {
    recommendationAnswerId: string;
    studentId: string;
    questionId: string;
    isCorrect: boolean;
    now: Date;
  },
): Promise<void> {
  if (input.isCorrect) {
    await transaction.wrongQuestion.updateMany({
      where: {
        studentId: input.studentId,
        questionId: input.questionId,
        isResolved: false,
      },
      data: {
        isResolved: true,
        reviewCount: { increment: 1 },
        lastReviewedAt: input.now,
        resolvedAt: input.now,
      },
    });
    return;
  }
  await transaction.wrongQuestion.upsert({
    where: {
      studentId_questionId: {
        studentId: input.studentId,
        questionId: input.questionId,
      },
    },
    update: {
      recommendationAnswerId: input.recommendationAnswerId,
      isResolved: false,
      reviewCount: { increment: 1 },
      wrongCount: { increment: 1 },
      lastWrongAt: input.now,
      resolvedAt: null,
    },
    create: {
      studentId: input.studentId,
      recommendationAnswerId: input.recommendationAnswerId,
      questionId: input.questionId,
      isResolved: false,
      wrongCount: 1,
      firstWrongAt: input.now,
      lastWrongAt: input.now,
    },
  });
}

async function completePracticeTransaction(
  actor: AuthenticatedUser,
  recommendationId: string,
  input: ReturnType<typeof recommendationPracticeSubmitSchema.parse>,
  now: Date,
): Promise<void> {
  await prisma.$transaction(
    async (transaction) => {
      const recommendation =
        await transaction.personalizedRecommendation.findUnique({
          where: { id: recommendationId },
          select: practiceSubmissionSelect,
        });
      if (!recommendation) {
        throw new ResourceNotFoundError("推荐记录不存在");
      }
      assertCanAccessRecommendation(actor, recommendation.studentId);
      if (recommendation.status === RecommendationStatus.COMPLETED) {
        if (!recommendation.practiceAnswer) {
          throw new RecommendationOperationError(
            "推荐完成记录缺少答案结果",
            409,
          );
        }
        return;
      }
      if (recommendation.status !== RecommendationStatus.STARTED) {
        throw new RecommendationOperationError("当前推荐状态不能提交练习", 409);
      }
      if (recommendation.expiresAt && recommendation.expiresAt <= now) {
        throw new RecommendationOperationError("当前推荐已经过期", 409);
      }
      if (
        recommendation.question.status !== QuestionStatus.ACTIVE ||
        recommendation.question.deletedAt !== null
      ) {
        throw new RecommendationOperationError("推荐题目当前不可用", 409);
      }
      if (!isAutoGradableQuestionType(recommendation.question.type)) {
        throw new RecommendationOperationError("当前题型暂不支持自动判分", 409);
      }
      if (input.answers.length !== 1) {
        throw new RecommendationOperationError(
          "当前推荐必须且只能提交一道题的答案",
          400,
        );
      }

      const submittedAnswer = input.answers[0];
      const savedAnswer = validatedSavedAnswer(recommendation, submittedAnswer);
      const grading = gradeAnswer(
        {
          type: recommendation.question.type,
          points: 1,
          correctBoolean: recommendation.question.correctBoolean,
          acceptableAnswers: recommendation.question.acceptableAnswers,
          isCaseSensitive: recommendation.question.isCaseSensitive,
          options: recommendation.question.options,
        },
        savedAnswer,
      );
      if (grading.score === null || grading.isCorrect === null) {
        throw new RecommendationOperationError("当前题目无法自动判分", 409);
      }

      const updated = await transaction.personalizedRecommendation.updateMany({
        where: {
          id: recommendationId,
          studentId: actor.id,
          status: RecommendationStatus.STARTED,
        },
        data: {
          status: RecommendationStatus.COMPLETED,
          completedAt: now,
          wasCorrect: grading.isCorrect,
          score: new Prisma.Decimal(grading.score),
          maxScore: new Prisma.Decimal(1),
        },
      });
      if (updated.count !== 1) {
        throw new RecommendationOperationError(
          "推荐状态已发生变化，请刷新后重试",
          409,
        );
      }

      const answer = await transaction.recommendationPracticeAnswer.create({
        data: {
          recommendationId,
          questionId: recommendation.questionId,
          idempotencyKey: input.idempotencyKey,
          textAnswer:
            submittedAnswer.kind === "TEXT" ? submittedAnswer.value : null,
          booleanAnswer:
            submittedAnswer.kind === "BOOLEAN" ? submittedAnswer.value : null,
          selectedOptionIds:
            submittedAnswer.kind === "CHOICE" ? submittedAnswer.optionIds : [],
          responseTimeMs: submittedAnswer.responseTimeMs,
          score: new Prisma.Decimal(grading.score),
          maxScore: new Prisma.Decimal(1),
          isCorrect: grading.isCorrect,
        },
        select: { id: true },
      });

      await applyWrongQuestionUpdate(transaction, {
        recommendationAnswerId: answer.id,
        studentId: actor.id,
        questionId: recommendation.questionId,
        isCorrect: grading.isCorrect,
        now,
      });
      await applyRecommendationMasteryUpdates(transaction, {
        studentId: actor.id,
        knowledgePointWeights: recommendation.question.knowledgePointLinks
          .filter((link) => link.knowledgePoint.isActive)
          .map((link) => ({
            knowledgePointId: link.knowledgePointId,
            weight: link.weight,
          })),
        isCorrect: grading.isCorrect,
        now,
      });
      const projection = await appendRecommendationPracticeLearningEvent(
        transaction,
        answer.id,
      );
      if (projection) {
        await ensureLearnerProfileSnapshot(
          transaction,
          actor.id,
          projection.courseId,
        );
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function submitRecommendationPractice(
  actor: AuthenticatedUser,
  rawRecommendationId: unknown,
  rawInput: unknown,
  now = new Date(),
): Promise<RecommendationPracticeResultView> {
  const recommendationId = recommendationIdSchema.parse(rawRecommendationId);
  const input = recommendationPracticeSubmitSchema.parse(rawInput);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await completePracticeTransaction(actor, recommendationId, input, now);
      break;
    } catch (error: unknown) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034";
      if (retryable && attempt === 0) continue;
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new RecommendationOperationError("幂等标识已被使用", 409);
      }
      throw error;
    }
  }

  const current = await loadRecommendationById(recommendationId);
  if (!current) throw new ResourceNotFoundError("推荐记录不存在");
  assertCanAccessRecommendation(actor, current.studentId);
  const result = practiceResultFromRecord(current);
  if (!result) {
    throw new RecommendationOperationError("推荐练习结果尚未生成", 409);
  }
  return result;
}
