import "server-only";

import { prisma } from "@/lib/prisma";
import { getPilotAIProvider } from "@/services/ai/gateway";
import { aiAttemptErrorCode } from "@/services/ai/gateway";
import { MAX_AI_TIMEOUT_MS } from "@/services/ai/constants";
import { AssignmentOperationError } from "@/services/assignments/errors";
import { getTeacherSubmissionForGrading } from "@/services/assignments/manual-grading";
import {
  programmingCodeScoreInputSchema,
  programmingCodeScoreReviewSchema,
} from "@/services/programming-scoring/schemas";
import { calculateProgrammingPaperScore } from "@/services/programming-scoring/paper-algorithm";

const DEFAULT_SCORE_TIMEOUT_MS = 8_000;

function scoreTimeoutMs() {
  const parsed = Number(process.env.AI_TIMEOUT_MS);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SCORE_TIMEOUT_MS;
  return Math.min(Math.trunc(parsed), MAX_AI_TIMEOUT_MS);
}

export async function calculateTeacherProgrammingPaperScore(
  teacherId: string,
  assignmentId: string,
  submissionId: string,
  answerId: string,
) {
  const submission = await getTeacherSubmissionForGrading(
    teacherId,
    assignmentId,
    submissionId,
  );
  if (submission.status !== "PENDING_REVIEW")
    throw new AssignmentOperationError("当前提交状态不能计算编程题参考分");
  if (!submission.canManageGrading) {
    throw new AssignmentOperationError(
      submission.gradingBlockedReason ?? "当前提交不可批改",
    );
  }

  const answer = submission.answers.find((item) => item.id === answerId);
  if (!answer) throw new AssignmentOperationError("编程题答案不存在");
  if (answer.type !== "PYTHON_PROGRAMMING")
    throw new AssignmentOperationError("仅编程题支持智能 AI 判题参考分");
  if (answer.programmingAttempt?.status !== "SUCCEEDED")
    throw new AssignmentOperationError(
      "请先完成正式判题，再计算智能 AI 判题参考分",
    );
  if (!answer.studentAnswer.trim() || answer.studentAnswer === "未作答")
    throw new AssignmentOperationError("学生尚未提交可评分的代码");

  const snapshot = await prisma.assignmentProgrammingConfigSnapshot.findUnique({
    where: { assignmentQuestionId: answer.assignmentQuestionId },
    select: {
      configRevision: { select: { standardCode: true } },
    },
  });
  const referenceCode = snapshot?.configRevision.standardCode;
  if (!referenceCode)
    throw new AssignmentOperationError(
      "作业未冻结编程题参考代码，无法计算智能 AI 判题参考分",
    );

  const input = programmingCodeScoreInputSchema.safeParse({
    title: answer.title,
    question: answer.content,
    referenceCode,
    studentCode: answer.studentAnswer,
  });
  if (!input.success)
    throw new AssignmentOperationError(
      "代码内容过长或题目数据不完整，无法计算智能 AI 判题参考分",
      413,
    );

  const selection = await getPilotAIProvider({
    capability: "programming_code_scoring",
    actorId: teacherId,
  });
  const provider = selection.provider;
  if (selection.errorCode === "AI_DISABLED_BY_SYSTEM_CONFIG") {
    throw new AssignmentOperationError(
      "智能 AI 判题未开启，请联系管理员启用 AI 服务。",
      503,
    );
  }
  if (provider?.name === "mock") {
    throw new AssignmentOperationError(
      "当前配置为模拟 AI，不能用于判题；请配置并启用真实 AI 服务。",
      503,
    );
  }
  if (!provider?.scoreProgrammingCode) {
    throw new AssignmentOperationError(
      "智能 AI 判题服务暂不可用；测试用例成绩仍可供选择。",
      503,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new DOMException("评分请求超时", "TimeoutError")),
    scoreTimeoutMs(),
  );
  try {
    const rawReview = await provider.scoreProgrammingCode(input.data, {
      signal: controller.signal,
    });
    const review = programmingCodeScoreReviewSchema.safeParse(rawReview);
    if (!review.success) {
      throw new AssignmentOperationError(
        "智能 AI 判题服务返回格式异常，请重新计算。",
        503,
      );
    }
    return calculateProgrammingPaperScore(
      review.data,
      input.data.studentCode,
      input.data.referenceCode,
      answer.maxScore,
      `${provider.name}/${provider.model}`,
    );
  } catch (error) {
    if (error instanceof AssignmentOperationError) throw error;
    console.warn("Programming AI score request failed", {
      capability: "programming_code_scoring",
      code: aiAttemptErrorCode(error),
    });
    throw new AssignmentOperationError(
      "智能 AI 判题暂时失败，请稍后重试。测试用例成绩仍可供选择。",
      503,
    );
  } finally {
    clearTimeout(timeout);
  }
}
