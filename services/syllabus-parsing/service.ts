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
  SYLLABUS_PARSER_VERSION,
  SYLLABUS_PROMPT_VERSION,
  SYLLABUS_RULE_VERSION,
} from "@/services/syllabus-parsing/constants";
import { SyllabusParseOperationError } from "@/services/syllabus-parsing/errors";
import { extractTextFromPdf } from "@/services/syllabus-parsing/pdf-extractor";
import { parseSyllabusStructure } from "@/services/syllabus-parsing/parser";
import {
  claimParseDraft,
  createPendingParseDraft,
  findCurrentOwnedSyllabus,
  findParseDraft,
  listOwnedCourseParseDrafts,
  markParseFailed,
  markParseSucceeded,
} from "@/services/syllabus-parsing/repository";
import {
  syllabusParseOutputSchema,
  syllabusParseOutputV1Schema,
  type SyllabusParseOutput,
  type SyllabusParseOutputV1,
} from "@/services/syllabus-parsing/schemas";
import type { SyllabusParseDraftView } from "@/services/syllabus-parsing/types";

interface ParseDependencies {
  provider?: AIProvider;
  storage?: StorageService;
  timeoutMs?: number;
  logger?: Pick<Console, "error">;
  failSuccessWriteForTest?: boolean;
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
      : syllabusParseOutputSchema;
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
  const syllabus = await currentSyllabusOrThrow(teacherId, courseId);
  let draft = await getOrCreateDraft(teacherId, courseId, syllabus.id);
  if (draft.status === SyllabusParseStatus.SUCCEEDED) {
    return {
      draft: draftView(draft, syllabus, syllabus.id),
      reused: true,
    };
  }
  if (!(await claimParseDraft(draft.id, teacherId))) {
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
      dependencies.logger?.error("Failed to read syllabus for parsing", error);
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
    draft = await markParseSucceeded(draft.id, {
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
      await markParseFailed(draft.id, code, provider);
    } catch (failureWriteError: unknown) {
      dependencies.logger?.error(
        "Failed to persist syllabus parse failure",
        failureWriteError,
      );
    }
    if (error instanceof SyllabusParseOperationError) throw error;
    dependencies.logger?.error("Syllabus parse failed", error);
    throw new SyllabusParseOperationError(
      "教学大纲解析失败，请稍后重试。",
      500,
      code,
    );
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
  return {
    current:
      views.find(
        (item) =>
          item.isCurrentSyllabusVersion &&
          item.parserVersion === SYLLABUS_PARSER_VERSION,
      ) ?? null,
    history: views,
  };
}
