import "server-only";

import {
  AuditAction,
  AuditTargetType,
  Prisma,
  ProgrammingTestVisibility,
  QuestionStatus,
  QuestionType,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import { PROGRAMMING_JUDGE_RULE_VERSION } from "@/services/programming-questions/constants";
import { programmingConfigFingerprints } from "@/services/programming-questions/fingerprint";
import {
  programmingConfigRevisionInputSchema,
  type ProgrammingConfigRevisionInput,
} from "@/services/programming-questions/schemas";
import { QuestionOperationError } from "@/services/questions/errors";

const revisionInclude = {
  testCases: {
    orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
  },
} satisfies Prisma.ProgrammingQuestionConfigRevisionInclude;

type RevisionRecord = Prisma.ProgrammingQuestionConfigRevisionGetPayload<{
  include: typeof revisionInclude;
}>;

function teacherRevisionDto(record: RevisionRecord) {
  return {
    id: record.id,
    questionId: record.questionId,
    revisionNumber: record.revisionNumber,
    standardCode: record.standardCode,
    starterCode: record.starterCode,
    totalPoints: record.totalPoints.toNumber(),
    limits: {
      cpuTimeMs: record.cpuTimeMs,
      wallTimeMs: record.wallTimeMs,
      memoryBytes: record.memoryBytes,
      outputBytes: record.outputBytes,
      processCount: record.processCount,
    },
    testCasesHash: record.testCasesHash,
    configurationHash: record.configurationHash,
    executorRuleVersion: record.executorRuleVersion,
    testCases: record.testCases.map((testCase) => ({
      id: testCase.id,
      visibility: testCase.visibility,
      name: testCase.name,
      stdin: testCase.stdin,
      expectedOutput: testCase.expectedOutput,
      points: testCase.points.toNumber(),
      sortOrder: testCase.sortOrder,
    })),
    createdAt: record.createdAt,
  };
}

export function publicProgrammingRevisionDto(record: RevisionRecord) {
  return {
    id: record.id,
    questionId: record.questionId,
    revisionNumber: record.revisionNumber,
    starterCode: record.starterCode,
    limits: {
      cpuTimeMs: record.cpuTimeMs,
      wallTimeMs: record.wallTimeMs,
      memoryBytes: record.memoryBytes,
      outputBytes: record.outputBytes,
      processCount: record.processCount,
    },
    testCases: record.testCases
      .filter(
        (testCase) => testCase.visibility === ProgrammingTestVisibility.PUBLIC,
      )
      .map((testCase, index) => ({
        index: index + 1,
        name: testCase.name,
        stdin: testCase.stdin,
        expectedOutput: testCase.expectedOutput,
        sortOrder: testCase.sortOrder,
      })),
  };
}

async function requireOwnedProgrammingQuestion(
  transaction: Prisma.TransactionClient,
  teacherId: string,
  questionId: string,
) {
  const question = await transaction.question.findFirst({
    where: { id: questionId, deletedAt: null, status: QuestionStatus.ACTIVE },
    select: { id: true, creatorId: true, type: true },
  });
  if (!question || question.creatorId !== teacherId) {
    throw new ResourceNotFoundError("题目不存在");
  }
  if (question.type !== QuestionType.PYTHON_PROGRAMMING) {
    throw new QuestionOperationError("只有 Python 编程题可以维护判题配置");
  }
  return question;
}

export async function getLatestProgrammingConfig(
  teacherId: string,
  questionId: string,
) {
  const question = await prisma.question.findFirst({
    where: {
      id: questionId,
      creatorId: teacherId,
      deletedAt: null,
      status: QuestionStatus.ACTIVE,
      type: QuestionType.PYTHON_PROGRAMMING,
    },
    select: { id: true },
  });
  if (!question) throw new ResourceNotFoundError("题目不存在");
  const revision = await prisma.programmingQuestionConfigRevision.findFirst({
    where: { questionId },
    orderBy: [{ revisionNumber: "desc" }, { id: "desc" }],
    include: revisionInclude,
  });
  return revision ? teacherRevisionDto(revision) : null;
}

export async function createProgrammingConfigRevision(
  teacherId: string,
  questionId: string,
  rawInput: ProgrammingConfigRevisionInput,
  context: AuditRequestContext,
) {
  const input = programmingConfigRevisionInputSchema.parse(rawInput);
  const fingerprints = programmingConfigFingerprints(input);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const record = await prisma.$transaction(
        async (transaction) => {
          await requireOwnedProgrammingQuestion(
            transaction,
            teacherId,
            questionId,
          );
          const existing =
            await transaction.programmingQuestionConfigRevision.findUnique({
              where: {
                questionId_configurationHash: {
                  questionId,
                  configurationHash: fingerprints.configurationHash,
                },
              },
              include: revisionInclude,
            });
          if (existing) return existing;
          const latest =
            await transaction.programmingQuestionConfigRevision.findFirst({
              where: { questionId },
              orderBy: { revisionNumber: "desc" },
              select: { revisionNumber: true },
            });
          const created =
            await transaction.programmingQuestionConfigRevision.create({
              data: {
                questionId,
                revisionNumber: (latest?.revisionNumber ?? 0) + 1,
                standardCode: input.standardCode,
                starterCode: input.starterCode,
                totalPoints: input.totalPoints,
                ...input.limits,
                ...fingerprints,
                executorRuleVersion: PROGRAMMING_JUDGE_RULE_VERSION,
                createdById: teacherId,
                testCases: {
                  create: [...input.testCases]
                    .sort((left, right) => left.sortOrder - right.sortOrder)
                    .map((testCase) => ({ ...testCase })),
                },
              },
              include: revisionInclude,
            });
          await writeGovernanceAuditLog(transaction, {
            actorId: teacherId,
            action: AuditAction.PROGRAMMING_CONFIG_REVISION_CREATED,
            targetType: AuditTargetType.QUESTION,
            targetId: questionId,
            summary: `创建 Python 判题配置修订 ${created.revisionNumber}`,
            beforeData: null,
            afterData: {
              revisionNumber: created.revisionNumber,
              configurationHash: created.configurationHash,
              testCasesHash: created.testCasesHash,
              publicCaseCount: created.testCases.filter(
                (item) => item.visibility === ProgrammingTestVisibility.PUBLIC,
              ).length,
              hiddenCaseCount: created.testCases.filter(
                (item) => item.visibility === ProgrammingTestVisibility.HIDDEN,
              ).length,
              executorRuleVersion: created.executorRuleVersion,
            },
            context,
          });
          return created;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return teacherRevisionDto(record);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2002" || error.code === "P2034") &&
        attempt < 2
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new QuestionOperationError("判题配置并发更新失败，请重试", 409);
}

export { revisionInclude };
