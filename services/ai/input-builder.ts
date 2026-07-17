import "server-only";

import { AIRecordStatus, SubmissionStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  MAX_RECENT_ERRORS,
  MAX_TUTORING_SUMMARIES,
} from "@/services/ai/constants";
import { AIAnalysisOperationError } from "@/services/ai/errors";
import {
  createAnonymousStudentId,
  scrubSensitiveText,
} from "@/services/ai/privacy";
import {
  studentAnalysisInputSchema,
  type StudentAnalysisInput,
} from "@/services/ai/schemas";
import { ResourceNotFoundError } from "@/services/auth/policy";

export interface StudentAnalysisBatch {
  input: StudentAnalysisInput;
  sampleSize: number;
  basedOnFrom: Date;
  basedOnTo: Date;
  overallAccuracy: number;
}

function pseudonymSalt(): string {
  const configured = process.env.AI_PSEUDONYM_SALT?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("生产环境必须配置 AI_PSEUDONYM_SALT");
  }
  return "smart-learning-local-pseudonym-salt";
}

function formatChoices(
  choices: Array<{ labelSnapshot: string; contentSnapshot: string }>,
): string {
  if (choices.length === 0) return "未作答";
  return choices
    .map((choice) => `${choice.labelSnapshot}. ${choice.contentSnapshot}`)
    .join("；");
}

function formatStudentAnswer(answer: {
  textAnswer: string | null;
  booleanAnswer: boolean | null;
  assignmentQuestion: { typeSnapshot: string };
  selectedOptions: Array<{
    assignmentQuestionOption: {
      labelSnapshot: string;
      contentSnapshot: string;
    };
  }>;
}): string {
  if (
    answer.assignmentQuestion.typeSnapshot === "SINGLE_CHOICE" ||
    answer.assignmentQuestion.typeSnapshot === "MULTIPLE_CHOICE"
  ) {
    return formatChoices(
      answer.selectedOptions.map((item) => item.assignmentQuestionOption),
    );
  }
  if (answer.assignmentQuestion.typeSnapshot === "TRUE_FALSE") {
    if (answer.booleanAnswer === null) return "未作答";
    return answer.booleanAnswer ? "正确" : "错误";
  }
  return answer.textAnswer?.trim() || "未作答";
}

function formatStandardAnswer(question: {
  typeSnapshot: string;
  correctBooleanSnapshot: boolean | null;
  referenceAnswerSnapshot: string | null;
  acceptableAnswersSnapshot: string[];
  optionSnapshots: Array<{
    labelSnapshot: string;
    contentSnapshot: string;
    isCorrectSnapshot: boolean;
  }>;
}): string {
  if (
    question.typeSnapshot === "SINGLE_CHOICE" ||
    question.typeSnapshot === "MULTIPLE_CHOICE"
  ) {
    return formatChoices(
      question.optionSnapshots.filter((option) => option.isCorrectSnapshot),
    );
  }
  if (question.typeSnapshot === "TRUE_FALSE") {
    if (question.correctBooleanSnapshot === null) return "未设置";
    return question.correctBooleanSnapshot ? "正确" : "错误";
  }
  if (question.typeSnapshot === "FILL_BLANK") {
    return question.acceptableAnswersSnapshot.join("；") || "未设置";
  }
  return question.referenceAnswerSnapshot?.trim() || "未设置参考答案";
}

export async function buildStudentAnalysisInput(
  studentId: string,
  submissionId: string,
): Promise<StudentAnalysisBatch> {
  const submission = await prisma.submission.findFirst({
    where: { id: submissionId, studentId },
    include: {
      student: { include: { profile: true } },
      answers: {
        orderBy: { assignmentQuestion: { sortOrder: "asc" } },
        include: {
          selectedOptions: {
            orderBy: { assignmentQuestionOption: { sortOrder: "asc" } },
            include: { assignmentQuestionOption: true },
          },
          assignmentQuestion: {
            include: {
              optionSnapshots: { orderBy: { sortOrder: "asc" } },
              knowledgePointSnapshots: {
                orderBy: { knowledgePointId: "asc" },
              },
            },
          },
        },
      },
    },
  });
  if (!submission) throw new ResourceNotFoundError("作答记录不存在");
  if (
    submission.status !== SubmissionStatus.GRADED &&
    submission.status !== SubmissionStatus.PUBLISHED
  ) {
    throw new AIAnalysisOperationError("作业完成批改后才能进行学情分析");
  }

  const usableAnswers = submission.answers.filter(
    (answer) =>
      answer.isCorrect !== null &&
      answer.assignmentQuestion.knowledgePointSnapshots.length > 0,
  );
  if (usableAnswers.length === 0) {
    throw new AIAnalysisOperationError("当前作答没有可分析的知识点数据");
  }

  const [masteries, recentErrors, tutoringRecords] = await Promise.all([
    prisma.studentKnowledgeMastery.findMany({
      where: { studentId },
      orderBy: { knowledgePointId: "asc" },
    }),
    prisma.wrongQuestion.findMany({
      where: { studentId },
      orderBy: { firstWrongAt: "desc" },
      take: MAX_RECENT_ERRORS,
      include: {
        assignmentQuestion: { include: { knowledgePointSnapshots: true } },
      },
    }),
    prisma.aITutoringRecord.findMany({
      where: {
        studentId,
        status: { in: [AIRecordStatus.SUCCEEDED, AIRecordStatus.FALLBACK] },
        answer: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_TUTORING_SUMMARIES,
      select: { answer: true },
    }),
  ]);

  const privateValues = [
    submission.student.email,
    submission.student.profile?.displayName ?? "",
    submission.student.profile?.phone ?? "",
    submission.student.profile?.studentNo ?? "",
  ];
  const input = studentAnalysisInputSchema.parse({
    anonymousStudentId: createAnonymousStudentId(studentId, pseudonymSalt()),
    answers: usableAnswers.map((answer) => ({
      knowledgePointIds: answer.assignmentQuestion.knowledgePointSnapshots.map(
        (item) => item.knowledgePointId,
      ),
      difficulty: answer.assignmentQuestion.difficultySnapshot,
      studentAnswer: scrubSensitiveText(
        formatStudentAnswer(answer),
        privateValues,
      ),
      standardAnswer: scrubSensitiveText(
        formatStandardAnswer(answer.assignmentQuestion),
        privateValues,
      ),
      isCorrect: answer.isCorrect === true,
      responseTimeMs: answer.responseTimeMs,
    })),
    historicalKnowledgePointAccuracy: masteries.map((mastery) => ({
      knowledgePointId: mastery.knowledgePointId,
      correctCount: mastery.correctCount,
      answeredCount: mastery.answeredCount,
      accuracy:
        mastery.answeredCount === 0
          ? 0
          : mastery.correctCount / mastery.answeredCount,
    })),
    recentErrors: recentErrors.map((error) => ({
      knowledgePointIds: error.assignmentQuestion.knowledgePointSnapshots.map(
        (item) => item.knowledgePointId,
      ),
      difficulty: error.assignmentQuestion.difficultySnapshot,
      occurredAt: error.firstWrongAt.toISOString(),
    })),
    tutoringSummaries: tutoringRecords.flatMap((record) =>
      record.answer
        ? [scrubSensitiveText(record.answer, privateValues, 1_000)]
        : [],
    ),
  });

  const correctCount = usableAnswers.filter(
    (answer) => answer.isCorrect === true,
  ).length;
  return {
    input,
    sampleSize: usableAnswers.length,
    basedOnFrom: submission.startedAt,
    basedOnTo: submission.gradedAt ?? submission.updatedAt,
    overallAccuracy: correctCount / usableAnswers.length,
  };
}
