import "server-only";

import {
  AuditAction,
  AuditTargetType,
  Role,
  Prisma,
  QuestionStatus,
  QuestionType,
  QuestionVisibility,
} from "@prisma/client";

import { createProgrammingConfigInTransaction } from "@/services/programming-questions/service";
import { prisma } from "@/lib/prisma";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import { extractQuestionFile } from "@/services/question-import/file-extractor";
import { QuestionImportError } from "@/services/question-import/errors";
import {
  parseQuestionImportText,
  validateImportDraft,
} from "@/services/question-import/parser";
import type { QuestionImportCommitData } from "@/services/question-import/schemas";
import type { QuestionImportPreview } from "@/services/question-import/types";
import {
  questionUpsertSchema,
  type QuestionUpsertData,
} from "@/services/questions/schemas";

const IMPORT_RULE_VERSION = "question-file-import-v5";

function persistenceFields(
  input: QuestionUpsertData,
  visibility: QuestionVisibility,
) {
  const base = {
    title: input.title,
    content: input.content,
    type: input.type,
    difficulty: input.difficulty,
    visibility,
    status: QuestionStatus.ACTIVE,
    explanation: input.explanation,
    tags: input.tags,
    correctBoolean: null as boolean | null,
    referenceAnswer: null as string | null,
    acceptableAnswers: [] as string[],
    isCaseSensitive: false,
    gradingConfig: { mode: "EXACT_SET" } satisfies Prisma.InputJsonObject,
  };
  if (input.answer.kind === "BOOLEAN") {
    return {
      ...base,
      correctBoolean: input.answer.value,
      gradingConfig: { mode: "EXACT_BOOLEAN" },
    };
  }
  if (input.answer.kind === "TEXT") {
    return {
      ...base,
      acceptableAnswers: input.answer.acceptableAnswers,
      isCaseSensitive: input.answer.caseSensitive,
      gradingConfig: { mode: "EXACT_TEXT", trimWhitespace: true },
    };
  }
  if (input.answer.kind === "REFERENCE") {
    return {
      ...base,
      referenceAnswer: input.answer.value,
      gradingConfig: { mode: "MANUAL", manualReviewRequired: true },
    };
  }
  return base;
}

function optionCreateData(input: QuestionUpsertData) {
  if (input.answer.kind !== "CHOICE") return [];
  const correct = new Set(input.answer.correctOptionLabels);
  return input.options.map((option) => ({
    label: option.label,
    content: option.content,
    sortOrder: option.sortOrder,
    isCorrect: correct.has(option.label),
  }));
}

function duplicateKey(title: string, content: string): string {
  return `${title.trim().toLocaleLowerCase()}\u0000${content.trim().toLocaleLowerCase()}`;
}

async function previewQuestionImport(
  file: File,
): Promise<QuestionImportPreview> {
  const source = await extractQuestionFile(file);
  let questions;
  try {
    questions = parseQuestionImportText(
      source.text,
      source.format,
      source.fileName,
    );
  } catch (error: unknown) {
    throw new QuestionImportError(
      error instanceof Error
        ? `无法解析题目：${error.message}`
        : "无法解析题目。",
      400,
      "QUESTION_PARSE_FAILED",
    );
  }
  if (!questions.length) {
    throw new QuestionImportError(
      "文件中没有识别到题目，请检查题号、题型和答案标记。",
      400,
      "QUESTION_NOT_FOUND",
    );
  }
  const duplicates = questions.filter((item) => item.duplicate).length;
  const needsReview = questions.filter(
    (item) => validateImportDraft(item).length > 0 && !item.duplicate,
  ).length;
  const warnings = [
    ...(questions.some((item) => item.type === QuestionType.PYTHON_PROGRAMMING)
      ? [
          "编程题保持自动评分题型。JSON 文件或 Word 题块含有效判题配置时将一并保存参考代码、公开及隐藏用例；只含题干的文档保留为可编辑草稿，补齐配置后启用。章节标签不等于正式课程知识点绑定，请在题目编辑中确认。",
        ]
      : []),
    ...(source.format === "PDF"
      ? ["扫描版 PDF 无法提取文字；当前预览只支持文本型 PDF。"]
      : []),
    ...(questions.length >= 500
      ? ["单次最多预览 500 道题，超出部分请拆分文件后继续导入。"]
      : []),
    ...(needsReview > 0
      ? [
          `有 ${needsReview} 道题需要核对题干、答案或选项，请查看逐题提示并修正后导入。`,
        ]
      : []),
    "重复题将在确认导入时按所选课程检查，同一文件可分别导入不同课程。",
    ...(duplicates > 0
      ? [`检测到 ${duplicates} 道重复题，确认导入时会自动跳过。`]
      : []),
  ];
  return {
    source: {
      fileName: source.fileName,
      format: source.format,
      size: source.size,
      checksum: source.checksum,
    },
    questions,
    warnings,
    suggestedKnowledgePointIds: [],
    summary: {
      total: questions.length,
      ready: questions.length - needsReview - duplicates,
      needsReview,
      duplicates,
    },
  };
}

export async function previewAdminQuestionImport(
  file: File,
): Promise<QuestionImportPreview> {
  return previewQuestionImport(file);
}

export async function previewTeacherQuestionImport(
  _teacherId: string,
  file: File,
): Promise<QuestionImportPreview> {
  return previewQuestionImport(file);
}

async function commitQuestionImport(
  actorId: string,
  input: QuestionImportCommitData,
  context: AuditRequestContext,
  options: {
    visibility: QuestionVisibility;
    duplicateOwnerId?: string;
    targetLabel: string;
  },
): Promise<{
  createdCount: number;
  skippedCount: number;
  questionIds: string[];
}> {
  const actor = await prisma.user.findFirst({
    where: {
      id: actorId,
      role: options.duplicateOwnerId ? Role.TEACHER : Role.ADMIN,
    },
    select: { id: true },
  });
  if (!actor)
    throw new QuestionImportError("无权导入题目。", 403, "IMPORT_FORBIDDEN");
  const activeKnowledgePoints = await prisma.knowledgePoint.count({
    where: { id: { in: input.knowledgePointIds }, isActive: true },
  });
  if (activeKnowledgePoints !== input.knowledgePointIds.length) {
    throw new QuestionImportError(
      "所选兼容知识点不存在或已停用，请刷新后重试。",
      400,
      "KNOWLEDGE_POINT_INVALID",
    );
  }
  const questions: QuestionUpsertData[] = input.questions.map((item, index) => {
    const parsed = questionUpsertSchema.safeParse({
      ...item,
      knowledgePointIds: input.knowledgePointIds,
      tags: item.tags.length ? item.tags : ["题库导入"],
      visibility: options.visibility,
    });
    if (!parsed.success) {
      throw new QuestionImportError(
        `第 ${index + 1} 道题未通过校验：${parsed.error.issues[0]?.message ?? "请检查题目内容"}`,
        400,
        "QUESTION_VALIDATION_FAILED",
      );
    }
    return parsed.data;
  });

  return prisma.$transaction(
    async (transaction) => {
      if (input.courseId) {
        const course = await transaction.course.findFirst({
          where: {
            id: input.courseId,
            status: { not: "ARCHIVED" },
            ...(options.duplicateOwnerId ? { teacherId: actorId } : {}),
          },
          select: { id: true },
        });
        if (!course)
          throw new QuestionImportError(
            "课程不存在或无权访问，请刷新后重新选择。",
            404,
            "COURSE_NOT_FOUND",
          );
      }
      const existing = await transaction.question.findMany({
        where: {
          deletedAt: null,
          ...(input.courseId ? { categoryCourseId: input.courseId } : {}),
          ...(options.duplicateOwnerId
            ? { creatorId: options.duplicateOwnerId }
            : {}),
          title: { in: [...new Set(questions.map((item) => item.title))] },
        },
        select: { title: true, content: true },
      });
      const keys = new Set(
        existing.map((item) => duplicateKey(item.title, item.content)),
      );
      const ids: string[] = [];
      let skippedCount = 0;
      for (const [index, question] of questions.entries()) {
        const key = duplicateKey(question.title, question.content);
        if (keys.has(key)) {
          skippedCount += 1;
          continue;
        }
        const created = await transaction.question.create({
          data: {
            creatorId: actorId,
            categoryCourseId: input.courseId ?? null,
            ...persistenceFields(question, options.visibility),
            ...(question.type === QuestionType.PYTHON_PROGRAMMING
              ? {
                  status: QuestionStatus.DRAFT,
                  gradingConfig: {
                    mode: "ASYNC_PROGRAMMING",
                    manualReviewRequired: false,
                  },
                }
              : {}),
            options: { create: optionCreateData(question) },
            knowledgePointLinks: {
              create: question.knowledgePointIds.map((knowledgePointId) => ({
                knowledgePointId,
                weight: 1,
              })),
            },
          },
          select: { id: true },
        });
        const config = input.questions[index]?.programmingConfig;
        if (question.type === QuestionType.PYTHON_PROGRAMMING && config) {
          await createProgrammingConfigInTransaction(
            transaction,
            actorId,
            created.id,
            config,
            context,
          );
        }
        ids.push(created.id);
        keys.add(key);
      }
      await writeGovernanceAuditLog(transaction, {
        actorId,
        action: AuditAction.QUESTION_BULK_IMPORTED,
        targetType: AuditTargetType.QUESTION,
        targetId: `bulk:${input.source.checksum.slice(0, 24)}`,
        summary: `批量导入${options.targetLabel}：${input.source.fileName}，新增 ${ids.length} 道，跳过 ${skippedCount} 道`,
        beforeData: null,
        afterData: {
          fileName: input.source.fileName,
          checksum: input.source.checksum,
          requestedCount: questions.length,
          createdCount: ids.length,
          skippedCount,
          visibility: options.visibility,
          courseId: input.courseId ?? null,
          ruleVersion: IMPORT_RULE_VERSION,
        },
        context,
      });
      return { createdCount: ids.length, skippedCount, questionIds: ids };
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}

export async function commitAdminQuestionImport(
  actorId: string,
  input: QuestionImportCommitData,
  context: AuditRequestContext,
) {
  return commitQuestionImport(actorId, input, context, {
    visibility: QuestionVisibility.PUBLIC,
    targetLabel: "公共题目",
  });
}

export async function commitTeacherQuestionImport(
  teacherId: string,
  input: QuestionImportCommitData,
  context: AuditRequestContext,
) {
  return commitQuestionImport(teacherId, input, context, {
    visibility: QuestionVisibility.PRIVATE,
    duplicateOwnerId: teacherId,
    targetLabel: "教师私有题目",
  });
}

// Repair the previous import classification without rewriting published assignment snapshots.
export async function restoreImportedProgrammingTypes(teacherId: string) {
  return prisma.$transaction(async (transaction) => {
    const records = await transaction.question.findMany({
      where: {
        creatorId: teacherId,
        type: QuestionType.SHORT_ANSWER,
        deletedAt: null,
        tags: { hasEvery: ["题库导入", "编程实践", "教师评分"] },
        assignmentQuestions: { none: {} },
      },
    });
    const ids: string[] = [];
    for (const question of records) {
      await transaction.question.update({
        where: { id: question.id },
        data: {
          type: QuestionType.PYTHON_PROGRAMMING,
          status: QuestionStatus.DRAFT,
          referenceAnswer: null,
          gradingConfig: { mode: "ASYNC_PROGRAMMING" },
          tags: question.tags.filter(
            (tag) => tag !== "编程实践" && tag !== "教师评分",
          ),
        },
      });
      await writeGovernanceAuditLog(transaction, {
        actorId: teacherId,
        action: AuditAction.QUESTION_BULK_IMPORTED,
        targetType: AuditTargetType.QUESTION,
        targetId: question.id,
        summary: "纠正导入题型为编程题，保留题干与评分要点",
        beforeData: { type: question.type, status: question.status },
        afterData: { type: "PYTHON_PROGRAMMING", status: "DRAFT" },
        context: { ipAddress: null, userAgent: "programming-import-repair" },
      });
      ids.push(question.id);
    }
    return ids;
  });
}
