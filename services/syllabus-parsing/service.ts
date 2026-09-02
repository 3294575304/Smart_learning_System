import {
  Prisma,
  SyllabusParseStatus,
  type SyllabusParseDraft,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { AIProvider } from "@/services/ai/provider";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { getStorageService } from "@/services/storage";
import type { StorageService } from "@/services/storage/types";
import {
  DEFAULT_SYLLABUS_AI_TIMEOUT_MS,
  MAX_SYLLABUS_AI_TIMEOUT_MS,
  SYLLABUS_PARSE_JOB_TYPE,
  SYLLABUS_PARSER_VERSION,
  SYLLABUS_PROMPT_VERSION,
  SYLLABUS_RULE_VERSION,
} from "@/services/syllabus-parsing/constants";
import { SyllabusParseOperationError } from "@/services/syllabus-parsing/errors";
import { extractTextFromPdf } from "@/services/syllabus-parsing/pdf-extractor";
import {
  parseSyllabusStructure,
  verifyAndEnrichObjectiveTexts,
} from "@/services/syllabus-parsing/parser";
import {
  claimParseDraft,
  createPendingParseDraft,
  findCurrentOwnedSyllabus,
  findParseDraft,
  listOwnedCourseParseDrafts,
  markInterruptedParseDrafts,
  markParseFailed,
  markParseSucceeded,
} from "@/services/syllabus-parsing/repository";
import {
  syllabusParseOutputV1Schema,
  storedSyllabusParseOutputSchema,
  type SyllabusParseOutput,
  type SyllabusParseOutputV1,
} from "@/services/syllabus-parsing/schemas";
import type { SyllabusParseDraftView } from "@/services/syllabus-parsing/types";

interface ParseDependencies {
  provider?: AIProvider;
  storage?: StorageService;
  timeoutMs?: number;
  logger?: Partial<Pick<Console, "error" | "info">>;
  failSuccessWriteForTest?: boolean;
}

const RETRYABLE_SYLLABUS_PARSE_ERROR_CODES = new Set([
  "PROVIDER_TIMEOUT",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_EMPTY_RESPONSE",
  "SYLLABUS_STORAGE_READ_FAILED",
  "SYLLABUS_PARSE_INTERNAL_ERROR",
  "JOB_INTERRUPTED",
]);

export function isRetryableSyllabusParseFailure(error: unknown): boolean {
  return (
    error instanceof SyllabusParseOperationError &&
    RETRYABLE_SYLLABUS_PARSE_ERROR_CODES.has(error.code)
  );
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function timeoutMs(configured?: number): number {
  const candidate =
    configured ?? Number(process.env.SYLLABUS_AI_TIMEOUT_MS) ?? 0;
  if (!Number.isFinite(candidate) || candidate <= 0) {
    return DEFAULT_SYLLABUS_AI_TIMEOUT_MS;
  }
  return Math.min(Math.trunc(candidate), MAX_SYLLABUS_AI_TIMEOUT_MS);
}

function resultFromDraft(
  draft: SyllabusParseDraft,
): SyllabusParseOutput | SyllabusParseOutputV1 | null {
  if (draft.status !== SyllabusParseStatus.SUCCEEDED) return null;
  const schema =
    draft.parserVersion === "syllabus-parser-v1"
      ? syllabusParseOutputV1Schema
      : storedSyllabusParseOutputSchema;
  const parsed = schema.safeParse(draft.structuredResult);
  if (!parsed.success) {
    throw new SyllabusParseOperationError(
      "已保存的教学大纲解析草稿无法读取，请重新解析。",
      500,
      "STORED_DRAFT_INVALID",
    );
  }
  return parsed.data;
}

function draftView(
  draft: SyllabusParseDraft,
  syllabus: { id: string; versionNumber: number; originalName: string },
  currentSyllabusId: string,
): SyllabusParseDraftView {
  return {
    id: draft.id,
    courseId: draft.courseId,
    syllabus,
    isCurrentSyllabusVersion: syllabus.id === currentSyllabusId,
    status: draft.status,
    parserVersion: draft.parserVersion,
    promptVersion: draft.promptVersion,
    ruleVersion: draft.ruleVersion,
    provider: draft.provider,
    model: draft.model,
    retryCount: draft.retryCount,
    executionCount: draft.executionCount,
    result: resultFromDraft(draft),
    hasFieldSourceRefs: draft.parserVersion !== "syllabus-parser-v1",
    errorCode: draft.errorCode,
    startedAt: draft.startedAt,
    completedAt: draft.completedAt,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  };
}

async function currentSyllabusOrThrow(teacherId: string, courseId: string) {
  const course = await prisma.course.findFirst({
    where: { id: courseId, teacherId },
    select: { id: true },
  });
  if (!course) throw new ResourceNotFoundError("课程不存在。");
  const syllabus = await findCurrentOwnedSyllabus(teacherId, courseId);
  if (!syllabus) {
    throw new SyllabusParseOperationError(
      "当前课程尚未上传教学大纲。",
      409,
      "SYLLABUS_MISSING",
    );
  }
  return syllabus;
}

async function getOrCreateDraft(
  teacherId: string,
  courseId: string,
  syllabusId: string,
): Promise<SyllabusParseDraft> {
  const existing = await findParseDraft(syllabusId, SYLLABUS_PARSER_VERSION);
  if (existing) return existing;
  try {
    return await createPendingParseDraft({
      courseId,
      syllabusId,
      requestedById: teacherId,
      parserVersion: SYLLABUS_PARSER_VERSION,
      promptVersion: SYLLABUS_PROMPT_VERSION,
      ruleVersion: SYLLABUS_RULE_VERSION,
    });
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const concurrent = await findParseDraft(
        syllabusId,
        SYLLABUS_PARSER_VERSION,
      );
      if (concurrent) return concurrent;
    }
    throw error;
  }
}

export async function createTeacherSyllabusParse(
  teacherId: string,
  courseId: string,
  dependencies: ParseDependencies = {},
): Promise<{ draft: SyllabusParseDraftView; reused: boolean }> {
  const logger = dependencies.logger ?? console;
  const syllabus = await currentSyllabusOrThrow(teacherId, courseId);
  let draft = await getOrCreateDraft(teacherId, courseId, syllabus.id);
  if (draft.status === SyllabusParseStatus.SUCCEEDED) {
    return {
      draft: draftView(draft, syllabus, syllabus.id),
      reused: true,
    };
  }
  const attemptId = await claimParseDraft(draft.id, teacherId);
  if (!attemptId) {
    throw new SyllabusParseOperationError(
      "当前版本的教学大纲正在解析，请稍后查询结果。",
      409,
      "SYLLABUS_PARSE_IN_PROGRESS",
    );
  }

  let provider: AIProvider | null = dependencies.provider ?? null;
  try {
    const storage = dependencies.storage ?? getStorageService();
    let data: Buffer;
    try {
      data = await storage.read(syllabus.storageKey);
    } catch (error: unknown) {
      logger.error?.("Failed to read syllabus for parsing", error);
      throw new SyllabusParseOperationError(
        "教学大纲文件暂时无法读取，请稍后重试。",
        500,
        "SYLLABUS_STORAGE_READ_FAILED",
      );
    }
    const extracted = await extractTextFromPdf(data);
    if (!provider) {
      const { createAIProvider } =
        await import("@/services/ai/provider-factory");
      provider = createAIProvider();
    }
    const execution = await parseSyllabusStructure(
      provider,
      {
        courseHint: {
          name: syllabus.course.name,
          courseNo: syllabus.course.courseNo,
          term: syllabus.course.term,
        },
        pages: extracted.pages,
      },
      timeoutMs(dependencies.timeoutMs),
    );
    if (dependencies.failSuccessWriteForTest) {
      throw new Error("Injected success write failure");
    }
    const finalAttempt = execution.attempts.at(-1);
    logger.info?.("Syllabus AI parse completed", {
      draftId: draft.id,
      attemptId,
      attempts: execution.attempts,
      durationMs: execution.latencyMs,
    });
    const write = await markParseSucceeded(draft.id, attemptId, {
      provider: provider.name,
      model: provider.model,
      retryCount: execution.retryCount,
      structuredResult: jsonValue(execution.output),
      extractedTextMetadata: {
        pageCount: extracted.pageCount,
        textPageCount: extracted.pages.length,
        characterCount: extracted.characterCount,
        sourcePages: extracted.pages.map((page) => page.pageNumber),
        latencyMs: execution.latencyMs,
      },
      completedAt: new Date(),
    });
    if (write.count !== 1) {
      throw new SyllabusParseOperationError(
        "A newer parse attempt replaced this result.",
        409,
        "JOB_INTERRUPTED",
        { attempts: execution.attempts },
      );
    }
    await prisma.syllabusParseDraft.updateMany({
      where: { id: draft.id, attemptId },
      data: {
        providerRequestId: finalAttempt?.providerRequestId,
        finishReason: finalAttempt?.finishReason,
        promptTokens: finalAttempt?.promptTokens,
        completionTokens: finalAttempt?.completionTokens,
        totalTokens: finalAttempt?.totalTokens,
        responseLength: finalAttempt?.responseLength,
        providerDurationMs: finalAttempt?.providerDurationMs,
        jsonParseDurationMs: finalAttempt?.jsonParseDurationMs,
        validationDurationMs: finalAttempt?.validationDurationMs,
        errorPhase: finalAttempt?.errorPhase,
      },
    });
    draft =
      (await findParseDraft(syllabus.id, SYLLABUS_PARSER_VERSION)) ?? draft;
    return {
      draft: draftView(draft, syllabus, syllabus.id),
      reused: false,
    };
  } catch (error: unknown) {
    const code =
      error instanceof SyllabusParseOperationError
        ? error.code
        : "SYLLABUS_PARSE_INTERNAL_ERROR";
    try {
      const attempts =
        error instanceof SyllabusParseOperationError &&
        error.diagnostics &&
        typeof error.diagnostics === "object" &&
        "attempts" in error.diagnostics &&
        Array.isArray(error.diagnostics.attempts)
          ? error.diagnostics.attempts
          : [];
      const finalAttempt = attempts.at(-1);
      logger.error?.("Syllabus AI parse failed", {
        draftId: draft.id,
        attemptId,
        failureCode: code,
        attempts,
      });
      await markParseFailed(
        draft.id,
        attemptId,
        code,
        {
          retryCount: Math.max(0, attempts.length - 1),
          providerRequestId: finalAttempt?.providerRequestId ?? null,
          finishReason: finalAttempt?.finishReason ?? null,
          promptTokens: finalAttempt?.promptTokens ?? null,
          completionTokens: finalAttempt?.completionTokens ?? null,
          totalTokens: finalAttempt?.totalTokens ?? null,
          responseLength: finalAttempt?.responseLength ?? 0,
          providerDurationMs: finalAttempt?.providerDurationMs ?? 0,
          jsonParseDurationMs: finalAttempt?.jsonParseDurationMs ?? 0,
          validationDurationMs: finalAttempt?.validationDurationMs ?? 0,
          errorPhase: finalAttempt?.errorPhase ?? "job",
        },
        provider,
      );
    } catch (failureWriteError: unknown) {
      logger.error?.(
        "Failed to persist syllabus parse failure",
        failureWriteError,
      );
    }
    if (error instanceof SyllabusParseOperationError) throw error;
    logger.error?.("Syllabus parse failed", error);
    throw new SyllabusParseOperationError(
      "教学大纲解析失败，请稍后重试。",
      500,
      code,
    );
  }
}

export async function queueTeacherSyllabusParse(
  teacherId: string,
  courseId: string,
): Promise<{
  draft: SyllabusParseDraftView;
  reused: boolean;
  shouldExecute: boolean;
}> {
  const syllabus = await currentSyllabusOrThrow(teacherId, courseId);
  let draft = await getOrCreateDraft(teacherId, courseId, syllabus.id);
  if (draft.status === SyllabusParseStatus.SUCCEEDED) {
    return {
      draft: draftView(draft, syllabus, syllabus.id),
      reused: true,
      shouldExecute: false,
    };
  }
  if (draft.status === SyllabusParseStatus.PROCESSING) {
    return {
      draft: draftView(draft, syllabus, syllabus.id),
      reused: true,
      shouldExecute: false,
    };
  }
  if (draft.status === SyllabusParseStatus.FAILED) {
    draft = await prisma.syllabusParseDraft.update({
      where: { id: draft.id },
      data: {
        status: SyllabusParseStatus.PENDING,
        errorCode: null,
        completedAt: null,
      },
    });
  }
  const { createBackgroundJob } =
    await import("@/services/background-jobs/repository");
  draft = await prisma.$transaction(async (transaction) => {
    const job = await createBackgroundJob(
      {
        type: SYLLABUS_PARSE_JOB_TYPE,
        requestedById: teacherId,
        courseId,
        idempotencyKey: `${draft.id}:${draft.executionCount}`,
        input: { draftId: draft.id, teacherId, courseId },
        maxAttempts: 3,
      },
      transaction,
    );
    return transaction.syllabusParseDraft.update({
      where: { id: draft.id },
      data: { backgroundJobId: job.id },
    });
  });
  return {
    draft: draftView(draft, syllabus, syllabus.id),
    reused: false,
    shouldExecute: true,
  };
}

export async function executeClaimedSyllabusParseJob(
  jobId: string,
  leaseId: string,
  input: { draftId: string; teacherId: string; courseId: string },
) {
  const { completeBackgroundJob, failBackgroundJob } =
    await import("@/services/background-jobs/repository");
  try {
    await prisma.syllabusParseDraft.updateMany({
      where: {
        id: input.draftId,
        backgroundJobId: jobId,
        status: SyllabusParseStatus.PROCESSING,
      },
      data: {
        status: SyllabusParseStatus.PENDING,
        attemptId: null,
      },
    });
    const result = await createTeacherSyllabusParse(
      input.teacherId,
      input.courseId,
    );
    await completeBackgroundJob(jobId, {
      leaseId,
      result: { draftId: input.draftId },
      resourceUsage: {},
    });
    return result;
  } catch (error) {
    await failBackgroundJob(
      jobId,
      {
        leaseId,
        errorCode:
          error instanceof SyllabusParseOperationError
            ? error.code
            : "SYLLABUS_PARSE_INTERNAL_ERROR",
        retryable: isRetryableSyllabusParseFailure(error),
        resourceUsage: {},
      },
      async (transaction, _job, willRetry) =>
        transaction.syllabusParseDraft.updateMany({
          where: { id: input.draftId, backgroundJobId: jobId },
          data: {
            status: willRetry
              ? SyllabusParseStatus.PENDING
              : SyllabusParseStatus.FAILED,
          },
        }),
    );
    throw error;
  }
}

export async function getTeacherSyllabusParses(
  teacherId: string,
  courseId: string,
): Promise<{
  current: SyllabusParseDraftView | null;
  history: SyllabusParseDraftView[];
}> {
  const syllabus = await currentSyllabusOrThrow(teacherId, courseId);
  const staleAfterMs = timeoutMs() + 30_000;
  await markInterruptedParseDrafts(
    courseId,
    new Date(Date.now() - staleAfterMs),
  );
  const drafts = await listOwnedCourseParseDrafts(teacherId, courseId);
  const views = drafts.map((draft) =>
    draftView(
      draft,
      {
        id: draft.syllabusId,
        versionNumber: draft.syllabus.versionNumber,
        originalName: draft.syllabus.originalName,
      },
      syllabus.id,
    ),
  );
  const current =
    views.find(
      (item) =>
        item.isCurrentSyllabusVersion &&
        item.parserVersion === SYLLABUS_PARSER_VERSION,
    ) ?? null;
  if (
    current?.status === SyllabusParseStatus.SUCCEEDED &&
    current.result &&
    current.parserVersion !== "syllabus-parser-v1" &&
    current.result.objectives.some((objective) =>
      /^课程目标\s*\d+$/u.test(objective.title),
    )
  ) {
    try {
      const data = await getStorageService().read(syllabus.storageKey);
      const extracted = await extractTextFromPdf(data);
      current.result = verifyAndEnrichObjectiveTexts(
        storedSyllabusParseOutputSchema.parse(current.result),
        {
          courseHint: {
            name: syllabus.course.name,
            courseNo: syllabus.course.courseNo,
            term: syllabus.course.term,
          },
          pages: extracted.pages,
        },
      );
    } catch {
      // Keep the stored draft readable if a historical source file is unavailable.
    }
  }
  return {
    current,
    history: views,
  };
}
