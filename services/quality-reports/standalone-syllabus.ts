import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { AuditAction, AuditTargetType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import { ResourceNotFoundError } from "@/services/auth/policy";
import {
  completeBackgroundJob,
  createBackgroundJob,
  failBackgroundJob,
} from "@/services/background-jobs/repository";
import { createAIProvider } from "@/services/ai/provider-factory";
import { getStorageService } from "@/services/storage";
import { extractSyllabusText } from "@/services/syllabus-parsing/source-extractor";
import { parseSyllabusStructure } from "@/services/syllabus-parsing/parser";
import { SyllabusParseOperationError } from "@/services/syllabus-parsing/errors";
import {
  DEFAULT_SYLLABUS_AI_TIMEOUT_MS,
  SYLLABUS_PARSER_VERSION,
  SYLLABUS_PROMPT_VERSION,
} from "@/services/syllabus-parsing/constants";
import { QualityReportOperationError } from "./errors";

export const STANDALONE_SYLLABUS_JOB_TYPE = "STANDALONE_REPORT_SYLLABUS_PARSE";
const MAX_BYTES = 10 * 1024 * 1024;
const hintSchema = z
  .object({
    courseName: z.string().trim().max(100).default(""),
    courseNo: z.string().trim().max(50).default(""),
    term: z.string().trim().max(50).default(""),
  })
  .strict();
export const standaloneSyllabusJobInputSchema = z
  .object({
    fileVersionId: z.string().cuid(),
    teacherId: z.string().cuid(),
    hint: hintSchema,
  })
  .strict();
export const standaloneSyllabusReferenceSchema = z
  .object({
    jobId: z.string().cuid(),
    fileVersionId: z.string().cuid(),
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

const checksum = (data: Buffer) =>
  createHash("sha256").update(data).digest("hex");
const scopeKey = (hash: string) => `standalone-report-syllabus-${hash}`;

export async function queueStandaloneSyllabusParse(
  teacherId: string,
  file: File,
  rawHint: unknown,
  context: AuditRequestContext,
) {
  const hint = hintSchema.parse(rawHint);
  if (
    !/\.(pdf|docx)$/iu.test(file.name) ||
    file.size < 1 ||
    file.size > MAX_BYTES
  )
    throw new QualityReportOperationError(
      "请选择 10 MB 以内的文本型 PDF 或 DOCX 教学大纲。",
      400,
    );
  const data = Buffer.from(await file.arrayBuffer());
  if (data.length !== file.size || data.length > MAX_BYTES)
    throw new QualityReportOperationError("教学大纲文件大小无效。", 400);
  const isPdf = file.name.toLowerCase().endsWith(".pdf");
  if (
    isPdf
      ? data.subarray(0, 5).toString("ascii") !== "%PDF-"
      : data.subarray(0, 4).toString("hex") !== "504b0304"
  )
    throw new QualityReportOperationError(
      "教学大纲文件内容与 PDF/DOCX 格式不符。",
      400,
    );
  const hash = checksum(data);
  const fileKey = scopeKey(hash);
  const existing = await prisma.courseFileVersion.findFirst({
    where: {
      courseId: null,
      uploadedById: teacherId,
      fileKind: "OTHER",
      fileKey,
      checksumSha256: hash,
    },
    select: { id: true },
  });
  let fileVersionId = existing?.id;
  if (!fileVersionId) {
    const storageKey = `quality-reports/standalone/${teacherId}/syllabi/${randomUUID()}.${file.name.toLowerCase().endsWith(".pdf") ? "pdf" : "docx"}`;
    await getStorageService().save(storageKey, data);
    try {
      const created = await prisma.$transaction(async (transaction) => {
        const record = await transaction.courseFileVersion.create({
          data: {
            courseId: null,
            uploadedById: teacherId,
            fileKind: "OTHER",
            fileKey,
            title: "独立教学质量报告大纲",
            originalFileName: file.name
              .replace(/[\\/\r\n]/gu, "_")
              .slice(0, 255),
            storageKey,
            mimeType: file.name.toLowerCase().endsWith(".pdf")
              ? "application/pdf"
              : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            sizeBytes: data.length,
            checksumSha256: hash,
            metadata: { purpose: "STANDALONE_REPORT_SYLLABUS" },
          },
        });
        await writeGovernanceAuditLog(transaction, {
          actorId: teacherId,
          action: AuditAction.COURSE_FILE_UPLOADED,
          targetType: AuditTargetType.COURSE_FILE,
          targetId: record.id,
          summary: "上传独立教学质量报告大纲",
          beforeData: null,
          afterData: {
            checksumSha256: hash,
            purpose: "STANDALONE_REPORT_SYLLABUS",
          },
          context,
        });
        return record;
      });
      fileVersionId = created.id;
    } catch (error) {
      await getStorageService().delete(storageKey);
      throw error;
    }
  }
  const baseKey = createHash("sha256")
    .update(JSON.stringify([teacherId, hash, hint, SYLLABUS_PARSER_VERSION]))
    .digest("hex");
  const priorJob = await prisma.backgroundJob.findUnique({
    where: {
      type_idempotencyKey: {
        type: STANDALONE_SYLLABUS_JOB_TYPE,
        idempotencyKey: baseKey,
      },
    },
    select: { status: true },
  });
  const key =
    priorJob?.status === "FAILED" || priorJob?.status === "CANCELLED"
      ? createHash("sha256").update(`${baseKey}:${randomUUID()}`).digest("hex")
      : baseKey;
  const job = await createBackgroundJob({
    type: STANDALONE_SYLLABUS_JOB_TYPE,
    requestedById: teacherId,
    courseId: null,
    idempotencyKey: key,
    input: { fileVersionId, teacherId, hint },
    maxAttempts: 3,
  });
  return {
    jobId: job.id,
    status: job.status,
    reused: Boolean(priorJob && key === baseKey),
    shouldExecute: job.status === "PENDING",
  };
}

export async function getStandaloneSyllabusParse(
  teacherId: string,
  jobId: string,
) {
  const job = await prisma.backgroundJob.findFirst({
    where: {
      id: jobId,
      requestedById: teacherId,
      type: STANDALONE_SYLLABUS_JOB_TYPE,
    },
    select: {
      id: true,
      status: true,
      progress: true,
      attemptCount: true,
      errorCode: true,
      result: true,
    },
  });
  if (!job) throw new ResourceNotFoundError("大纲解析任务不存在。");
  return {
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    attemptCount: job.attemptCount,
    errorCode: job.errorCode,
    result: job.status === "SUCCEEDED" ? job.result : null,
  };
}

export async function verifyStandaloneSyllabusReference(
  teacherId: string,
  rawReference: unknown,
) {
  const reference = standaloneSyllabusReferenceSchema.parse(rawReference);
  const job = await prisma.backgroundJob.findFirst({
    where: {
      id: reference.jobId,
      requestedById: teacherId,
      type: STANDALONE_SYLLABUS_JOB_TYPE,
      status: "SUCCEEDED",
    },
    select: { result: true },
  });
  const result = job?.result as Record<string, unknown> | null | undefined;
  if (
    !result ||
    result.fileVersionId !== reference.fileVersionId ||
    result.checksumSha256 !== reference.checksumSha256
  )
    throw new ResourceNotFoundError("大纲解析来源不存在或无权访问。");
  return {
    ...reference,
    parserVersion:
      typeof result.parserVersion === "string"
        ? result.parserVersion
        : SYLLABUS_PARSER_VERSION,
    promptVersion:
      typeof result.promptVersion === "string"
        ? result.promptVersion
        : SYLLABUS_PROMPT_VERSION,
    provider: typeof result.provider === "string" ? result.provider : "unknown",
    model: typeof result.model === "string" ? result.model : "unknown",
  };
}

export async function executeClaimedStandaloneSyllabusParseJob(
  jobId: string,
  leaseId: string,
  rawInput: unknown,
) {
  const input = standaloneSyllabusJobInputSchema.parse(rawInput);
  try {
    const file = await prisma.courseFileVersion.findFirst({
      where: {
        id: input.fileVersionId,
        courseId: null,
        uploadedById: input.teacherId,
        fileKind: "OTHER",
        metadata: { path: ["purpose"], equals: "STANDALONE_REPORT_SYLLABUS" },
      },
    });
    if (!file) throw new ResourceNotFoundError("教学大纲文件不存在。");
    const data = await getStorageService().read(file.storageKey);
    if (checksum(data) !== file.checksumSha256)
      throw new QualityReportOperationError(
        "教学大纲文件完整性校验失败。",
        409,
      );
    const extracted = await extractSyllabusText(data, file.originalFileName);
    const provider = createAIProvider({
      capability: "syllabus_parse",
      actorId: input.teacherId,
      requestId: jobId,
    });
    const execution = await parseSyllabusStructure(
      provider,
      {
        courseHint: {
          name: input.hint.courseName || "Python 程序设计",
          courseNo: input.hint.courseNo || "待填写",
          term: input.hint.term || "待填写",
        },
        pages: extracted.pages,
      },
      DEFAULT_SYLLABUS_AI_TIMEOUT_MS,
    );
    const parsed = execution.output;
    const result = {
      fileVersionId: file.id,
      checksumSha256: file.checksumSha256,
      fileName: file.originalFileName,
      parserVersion: SYLLABUS_PARSER_VERSION,
      promptVersion: SYLLABUS_PROMPT_VERSION,
      provider: provider.name,
      model: provider.model,
      courseInfo: parsed.courseInfo,
      assessments: parsed.assessments,
      objectives: parsed.objectives,
      objectiveAssessmentMappings: parsed.objectiveAssessmentMappings,
      teachingContent: parsed.chapters.map((chapter) => chapter.title),
      warnings: parsed.warnings,
    };
    await completeBackgroundJob(jobId, {
      leaseId,
      result: result as unknown as Record<string, unknown>,
      resourceUsage: {
        pageCount: extracted.pageCount,
        characterCount: extracted.characterCount,
        retries: execution.retryCount,
      },
    });
  } catch (error) {
    await failBackgroundJob(jobId, {
      leaseId,
      errorCode:
        error instanceof SyllabusParseOperationError
          ? error.code
          : error instanceof QualityReportOperationError
            ? error.code
            : "STANDALONE_SYLLABUS_PARSE_FAILED",
      retryable:
        error instanceof SyllabusParseOperationError && error.status >= 500,
      resourceUsage: {},
    });
  }
}
