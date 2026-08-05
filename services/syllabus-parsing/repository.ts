import {
  Prisma,
  SyllabusParseStatus,
  type SyllabusParseDraft,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { randomUUID } from "node:crypto";

export type DatabaseClient = typeof prisma | Prisma.TransactionClient;

export function findCurrentOwnedSyllabus(
  teacherId: string,
  courseId: string,
  client: DatabaseClient = prisma,
) {
  return client.courseSyllabus.findFirst({
    where: { courseId, course: { teacherId } },
    select: {
      id: true,
      courseId: true,
      versionNumber: true,
      storageKey: true,
      mimeType: true,
      sizeBytes: true,
      originalName: true,
      course: {
        select: {
          id: true,
          name: true,
          courseNo: true,
          term: true,
          teacherId: true,
        },
      },
    },
    orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
  });
}

export function findParseDraft(
  syllabusId: string,
  parserVersion: string,
  client: DatabaseClient = prisma,
) {
  return client.syllabusParseDraft.findUnique({
    where: { syllabusId_parserVersion: { syllabusId, parserVersion } },
  });
}

export function listOwnedCourseParseDrafts(
  teacherId: string,
  courseId: string,
  client: DatabaseClient = prisma,
) {
  return client.syllabusParseDraft.findMany({
    where: { courseId, course: { teacherId } },
    include: {
      syllabus: {
        select: {
          versionNumber: true,
          originalName: true,
          createdAt: true,
        },
      },
    },
    orderBy: [{ syllabus: { versionNumber: "desc" } }, { createdAt: "desc" }],
  });
}

export function markInterruptedParseDrafts(
  courseId: string,
  staleBefore: Date,
  client: DatabaseClient = prisma,
) {
  return client.syllabusParseDraft.updateMany({
    where: {
      courseId,
      status: SyllabusParseStatus.PROCESSING,
      startedAt: { lt: staleBefore },
    },
    data: {
      status: SyllabusParseStatus.FAILED,
      errorCode: "JOB_INTERRUPTED",
      errorPhase: "job",
      completedAt: new Date(),
    },
  });
}

export function createPendingParseDraft(
  data: {
    courseId: string;
    syllabusId: string;
    requestedById: string;
    parserVersion: string;
    promptVersion: string;
    ruleVersion: string;
  },
  client: DatabaseClient = prisma,
) {
  return client.syllabusParseDraft.create({ data });
}

export async function claimParseDraft(
  id: string,
  requestedById: string,
  client: DatabaseClient = prisma,
): Promise<string | null> {
  const attemptId = randomUUID();
  const result = await client.syllabusParseDraft.updateMany({
    where: {
      id,
      status: { in: [SyllabusParseStatus.PENDING, SyllabusParseStatus.FAILED] },
    },
    data: {
      status: SyllabusParseStatus.PROCESSING,
      requestedById,
      executionCount: { increment: 1 },
      startedAt: new Date(),
      completedAt: null,
      errorCode: null,
      attemptId,
      structuredResult: Prisma.JsonNull,
      extractedTextMetadata: Prisma.JsonNull,
    },
  });
  return result.count === 1 ? attemptId : null;
}

export function markParseSucceeded(
  id: string,
  attemptId: string,
  data: Pick<
    SyllabusParseDraft,
    "provider" | "model" | "retryCount" | "completedAt"
  > & {
    structuredResult: Prisma.InputJsonValue;
    extractedTextMetadata: Prisma.InputJsonValue;
  },
  client: DatabaseClient = prisma,
) {
  return client.syllabusParseDraft.updateMany({
    where: { id, attemptId, status: SyllabusParseStatus.PROCESSING },
    data: {
      ...data,
      status: SyllabusParseStatus.SUCCEEDED,
      errorCode: null,
    },
  });
}

export function markParseFailed(
  id: string,
  attemptId: string,
  errorCode: string,
  diagnostics: {
    retryCount?: number;
    providerRequestId?: string | null;
    finishReason?: string | null;
    promptTokens?: number | null;
    completionTokens?: number | null;
    totalTokens?: number | null;
    responseLength?: number;
    providerDurationMs?: number;
    jsonParseDurationMs?: number;
    validationDurationMs?: number;
    errorPhase?: string | null;
  } = {},
  provider?: { name: string; model: string } | null,
  client: DatabaseClient = prisma,
) {
  return client.syllabusParseDraft.updateMany({
    where: { id, attemptId, status: SyllabusParseStatus.PROCESSING },
    data: {
      status: SyllabusParseStatus.FAILED,
      provider: provider?.name,
      model: provider?.model,
      errorCode,
      ...diagnostics,
      completedAt: new Date(),
      structuredResult: Prisma.JsonNull,
    },
  });
}
