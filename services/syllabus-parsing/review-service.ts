import {
  AuditAction,
  AuditTargetType,
  Prisma,
  SyllabusParseStatus,
} from "@prisma/client";
import { ZodError } from "zod";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import { SyllabusParseOperationError } from "@/services/syllabus-parsing/errors";
import { SYLLABUS_PARSER_VERSION } from "@/services/syllabus-parsing/constants";
import {
  publishableSyllabusStructureSchema,
  storedPublishableSyllabusStructureSchema,
  storedSyllabusParseOutputSchema,
  type SaveSyllabusReviewInput,
  type SyllabusParseOutput,
} from "@/services/syllabus-parsing/schemas";

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function invalidStructure(error: ZodError): never {
  const details = error.issues
    .slice(0, 20)
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("；");
  throw new SyllabusParseOperationError(
    details || "教学大纲结构校验失败。",
    400,
    "SYLLABUS_STRUCTURE_INVALID",
  );
}

function validateSourcePages(
  structure: SyllabusParseOutput,
  pageCount: number,
) {
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.sourceRefs)) {
      for (const candidate of record.sourceRefs) {
        if (!candidate || typeof candidate !== "object") continue;
        const page = (candidate as { page?: unknown }).page;
        if (typeof page !== "number" || page < 1 || page > pageCount) {
          throw new SyllabusParseOperationError(
            `字段来源页码必须在 1 到 ${pageCount} 之间。`,
            400,
            "SOURCE_PAGE_OUT_OF_RANGE",
          );
        }
      }
    }
    Object.values(record).forEach(visit);
  };
  visit(structure);
}

function sourceRefsByPath(
  structure: SyllabusParseOutput,
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.sourceRefs)) {
      result.set(
        path,
        new Set(
          record.sourceRefs.map((ref) =>
            JSON.stringify(ref, Object.keys(ref as object).sort()),
          ),
        ),
      );
    }
    for (const [key, child] of Object.entries(record)) {
      if (key !== "sourceRefs") visit(child, path ? `${path}.${key}` : key);
    }
  };
  visit(structure, "");
  return result;
}

function validateReviewSourceRefs(
  structure: SyllabusParseOutput,
  original: SyllabusParseOutput,
) {
  const allowed = sourceRefsByPath(original);
  for (const [path, refs] of sourceRefsByPath(structure)) {
    const allowedAtPath = allowed.get(path) ?? new Set<string>();
    for (const ref of refs) {
      if (!allowedAtPath.has(ref)) {
        throw new SyllabusParseOperationError(
          "字段来源只能保留原始解析中已核验或已标记待核验的引用。",
          400,
          "SOURCE_REFERENCE_MODIFIED",
        );
      }
    }
  }
}

function pageCountFromMetadata(value: unknown): number {
  if (
    value &&
    typeof value === "object" &&
    "pageCount" in value &&
    typeof value.pageCount === "number" &&
    Number.isInteger(value.pageCount) &&
    value.pageCount > 0
  ) {
    return value.pageCount;
  }
  throw new SyllabusParseOperationError(
    "解析草稿缺少有效 PDF 页数，无法校验字段来源。",
    409,
    "SOURCE_METADATA_MISSING",
  );
}

function reviewView(record: {
  id: string;
  parseDraftId: string;
  revisionNumber: number;
  structureJson: Prisma.JsonValue;
  editedById: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  const parsed = storedSyllabusParseOutputSchema.safeParse(
    record.structureJson,
  );
  if (!parsed.success) {
    throw new SyllabusParseOperationError(
      "已保存的审核修订无法读取。",
      500,
      "STORED_REVIEW_INVALID",
    );
  }
  return { ...record, structure: parsed.data };
}

function publishedView(
  record: {
    id: string;
    courseId: string;
    syllabusId: string;
    parseDraftId: string;
    reviewRevisionId: string;
    publishedById: string;
    versionNumber: number;
    structureJson: Prisma.JsonValue;
    publishedAt: Date;
    createdAt: Date;
    updatedAt: Date;
    syllabus: { versionNumber: number; originalName: string };
  },
  currentSyllabusId: string | null,
) {
  const parsed = storedPublishableSyllabusStructureSchema.safeParse(
    record.structureJson,
  );
  if (!parsed.success) {
    throw new SyllabusParseOperationError(
      "已发布的教学大纲结构无法读取。",
      500,
      "STORED_PUBLISHED_STRUCTURE_INVALID",
    );
  }
  return {
    ...record,
    sourceReviewRevisionId: record.reviewRevisionId,
    structure: parsed.data,
    isFromCurrentSyllabus: record.syllabusId === currentSyllabusId,
  };
}

async function ownedCourseOrThrow(
  teacherId: string,
  courseId: string,
  client: typeof prisma | Prisma.TransactionClient = prisma,
) {
  const course = await client.course.findFirst({
    where: { id: courseId, teacherId },
    select: {
      id: true,
      name: true,
      currentPublishedSyllabusStructureId: true,
      syllabi: {
        orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: { id: true, versionNumber: true, originalName: true },
      },
    },
  });
  if (!course) throw new ResourceNotFoundError("课程不存在。");
  return course;
}

async function editableDraftOrThrow(
  teacherId: string,
  courseId: string,
  draftId: string,
  client: typeof prisma | Prisma.TransactionClient = prisma,
) {
  const course = await ownedCourseOrThrow(teacherId, courseId, client);
  const currentSyllabus = course.syllabi[0];
  if (!currentSyllabus) {
    throw new SyllabusParseOperationError(
      "当前课程尚未上传教学大纲。",
      409,
      "SYLLABUS_MISSING",
    );
  }
  const draft = await client.syllabusParseDraft.findFirst({
    where: { id: draftId, courseId },
  });
  if (!draft) throw new ResourceNotFoundError("教学大纲解析稿不存在。");
  if (draft.syllabusId !== currentSyllabus.id) {
    throw new SyllabusParseOperationError(
      "历史教学大纲解析稿只能查看，不能编辑或发布。",
      409,
      "HISTORICAL_SYLLABUS_READ_ONLY",
    );
  }
  if (draft.status !== SyllabusParseStatus.SUCCEEDED) {
    throw new SyllabusParseOperationError(
      "只有解析成功的教学大纲草稿可以审核或发布。",
      409,
      "SYLLABUS_PARSE_NOT_SUCCEEDED",
    );
  }
  if (draft.parserVersion === "syllabus-parser-v1") {
    throw new SyllabusParseOperationError(
      "此旧解析版本不支持编辑，请使用当前解析器重新解析。",
      409,
      "LEGACY_PARSE_READ_ONLY",
    );
  }
  const original = storedSyllabusParseOutputSchema.safeParse(
    draft.structuredResult,
  );
  if (!original.success) {
    throw new SyllabusParseOperationError(
      "解析草稿结构无效，请重新解析。",
      409,
      "PARSE_DRAFT_INVALID",
    );
  }
  return { course, currentSyllabus, draft, original: original.data };
}

export async function saveTeacherSyllabusReview(
  teacherId: string,
  courseId: string,
  draftId: string,
  input: SaveSyllabusReviewInput,
  context: AuditRequestContext,
) {
  return prisma.$transaction(async (transaction) => {
    const { draft, currentSyllabus, original } = await editableDraftOrThrow(
      teacherId,
      courseId,
      draftId,
      transaction,
    );
    const latest = await transaction.syllabusReviewRevision.findFirst({
      where: { parseDraftId: draft.id },
      orderBy: [{ revisionNumber: "desc" }, { createdAt: "desc" }],
    });
    const currentRevision = latest?.revisionNumber ?? 0;
    if (currentRevision !== input.expectedRevisionNumber) {
      throw new SyllabusParseOperationError(
        "审核稿已被更新，请重新加载最新修订后再保存。",
        409,
        "REVIEW_REVISION_CONFLICT",
      );
    }
    const structure =
      input.expectedRevisionNumber === 0
        ? (input.structure ?? original)
        : input.structure;
    validateSourcePages(
      structure,
      pageCountFromMetadata(draft.extractedTextMetadata),
    );
    validateReviewSourceRefs(structure, original);
    const saved = await transaction.syllabusReviewRevision.create({
      data: {
        courseId,
        syllabusId: currentSyllabus.id,
        parseDraftId: draft.id,
        editedById: teacherId,
        revisionNumber: currentRevision + 1,
        structureJson: jsonValue(structure),
      },
    });
    await writeGovernanceAuditLog(transaction, {
      actorId: teacherId,
      action: AuditAction.SYLLABUS_REVIEW_SAVED,
      targetType: AuditTargetType.SYLLABUS_REVIEW,
      targetId: saved.id,
      summary: `保存教学大纲审核修订 ${saved.revisionNumber}`,
      beforeData: latest
        ? { parseDraftId: draft.id, revisionNumber: latest.revisionNumber }
        : null,
      afterData: {
        courseId,
        syllabusId: currentSyllabus.id,
        parseDraftId: draft.id,
        revisionNumber: saved.revisionNumber,
      },
      context,
    });
    return reviewView(saved);
  });
}

async function publishTransaction(
  teacherId: string,
  courseId: string,
  draftId: string,
  reviewRevisionId: string,
  context: AuditRequestContext,
) {
  return prisma.$transaction(
    async (transaction) => {
      let course = await ownedCourseOrThrow(teacherId, courseId, transaction);
      await transaction.$queryRaw`SELECT "id" FROM "Course" WHERE "id" = ${courseId} FOR UPDATE`;
      course = await ownedCourseOrThrow(teacherId, courseId, transaction);
      const { draft, currentSyllabus } = await editableDraftOrThrow(
        teacherId,
        courseId,
        draftId,
        transaction,
      );
      const review = await transaction.syllabusReviewRevision.findFirst({
        where: { id: reviewRevisionId, parseDraftId: draft.id, courseId },
      });
      if (!review) throw new ResourceNotFoundError("教学大纲审核修订不存在。");
      const latest = await transaction.syllabusReviewRevision.findFirst({
        where: { parseDraftId: draft.id },
        orderBy: [{ revisionNumber: "desc" }, { createdAt: "desc" }],
        select: { id: true },
      });
      if (latest?.id !== review.id) {
        throw new SyllabusParseOperationError(
          "该审核修订已过期，请发布最新修订。",
          409,
          "REVIEW_REVISION_STALE",
        );
      }
      const existing = await transaction.publishedSyllabusStructure.findUnique({
        where: { reviewRevisionId: review.id },
        include: {
          syllabus: { select: { versionNumber: true, originalName: true } },
        },
      });
      if (existing) {
        if (
          existing.courseId !== courseId ||
          existing.syllabusId !== currentSyllabus.id
        ) {
          throw new SyllabusParseOperationError(
            "已发布结构与当前教学大纲来源不一致。",
            409,
            "PUBLISHED_STRUCTURE_SOURCE_MISMATCH",
          );
        }
        if (course.currentPublishedSyllabusStructureId !== existing.id) {
          await transaction.course.update({
            where: { id: courseId },
            data: { currentPublishedSyllabusStructureId: existing.id },
          });
          await writeGovernanceAuditLog(transaction, {
            actorId: teacherId,
            action: AuditAction.SYLLABUS_STRUCTURE_PUBLISHED,
            targetType: AuditTargetType.SYLLABUS_STRUCTURE,
            targetId: existing.id,
            summary: `修复课程当前正式大纲结构指针（版本 ${existing.versionNumber}）`,
            beforeData: course.currentPublishedSyllabusStructureId
              ? {
                  currentPublishedSyllabusStructureId:
                    course.currentPublishedSyllabusStructureId,
                }
              : null,
            afterData: {
              courseId,
              currentPublishedSyllabusStructureId: existing.id,
              reviewRevisionId: review.id,
              repaired: true,
            },
            context,
          });
        }
        return publishedView(existing, currentSyllabus.id);
      }
      const parsed = publishableSyllabusStructureSchema.safeParse(
        review.structureJson,
      );
      if (!parsed.success) invalidStructure(parsed.error);
      validateSourcePages(
        parsed.data,
        pageCountFromMetadata(draft.extractedTextMetadata),
      );
      const latestPublished =
        await transaction.publishedSyllabusStructure.findFirst({
          where: { courseId },
          orderBy: [{ versionNumber: "desc" }, { publishedAt: "desc" }],
          select: { versionNumber: true },
        });
      const published = await transaction.publishedSyllabusStructure.create({
        data: {
          courseId,
          syllabusId: currentSyllabus.id,
          parseDraftId: draft.id,
          reviewRevisionId: review.id,
          publishedById: teacherId,
          versionNumber: (latestPublished?.versionNumber ?? 0) + 1,
          structureJson: jsonValue(parsed.data),
        },
        include: {
          syllabus: { select: { versionNumber: true, originalName: true } },
        },
      });
      await transaction.course.update({
        where: { id: courseId },
        data: { currentPublishedSyllabusStructureId: published.id },
      });
      await writeGovernanceAuditLog(transaction, {
        actorId: teacherId,
        action: AuditAction.SYLLABUS_STRUCTURE_PUBLISHED,
        targetType: AuditTargetType.SYLLABUS_STRUCTURE,
        targetId: published.id,
        summary: `发布课程大纲结构版本 ${published.versionNumber}`,
        beforeData: course.currentPublishedSyllabusStructureId
          ? {
              currentPublishedSyllabusStructureId:
                course.currentPublishedSyllabusStructureId,
            }
          : null,
        afterData: {
          courseId,
          syllabusId: currentSyllabus.id,
          parseDraftId: draft.id,
          reviewRevisionId: review.id,
          versionNumber: published.versionNumber,
        },
        context,
      });
      return publishedView(published, currentSyllabus.id);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function publishTeacherSyllabusReview(
  teacherId: string,
  courseId: string,
  draftId: string,
  reviewRevisionId: string,
  context: AuditRequestContext,
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await publishTransaction(
        teacherId,
        courseId,
        draftId,
        reviewRevisionId,
        context,
      );
    } catch (error: unknown) {
      if (
        attempt === 0 &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2034" || error.code === "P2002")
      )
        continue;
      throw error;
    }
  }
  throw new SyllabusParseOperationError(
    "发布发生并发冲突，请重试。",
    409,
    "PUBLISH_CONFLICT",
  );
}

export async function getTeacherPublishedSyllabi(
  teacherId: string,
  courseId: string,
  knownCurrentReviewRevisionId?: string | null,
) {
  const course = await ownedCourseOrThrow(teacherId, courseId);
  const currentSyllabusId = course.syllabi[0]?.id ?? null;
  const [history, discoveredCurrentReview] = await Promise.all([
    prisma.publishedSyllabusStructure.findMany({
      where: { courseId },
      include: {
        syllabus: { select: { versionNumber: true, originalName: true } },
      },
      orderBy: [{ versionNumber: "desc" }, { publishedAt: "desc" }],
    }),
    knownCurrentReviewRevisionId === undefined && currentSyllabusId
      ? prisma.syllabusReviewRevision.findFirst({
          where: {
            courseId,
            syllabusId: currentSyllabusId,
            parseDraft: { parserVersion: SYLLABUS_PARSER_VERSION },
          },
          orderBy: [{ revisionNumber: "desc" }, { createdAt: "desc" }],
          select: { id: true },
        })
      : null,
  ]);
  const views = history.map((record) =>
    publishedView(record, currentSyllabusId),
  );
  const currentPublishedStructure =
    views.find(
      (item) => item.id === course.currentPublishedSyllabusStructureId,
    ) ?? null;
  const currentReviewRevisionId =
    knownCurrentReviewRevisionId === undefined
      ? (discoveredCurrentReview?.id ?? null)
      : knownCurrentReviewRevisionId;
  const sourceReviewRevisionId =
    currentPublishedStructure?.sourceReviewRevisionId ?? null;
  const isCurrentPublishedStructureStale = Boolean(
    currentPublishedStructure &&
    !currentPublishedStructure.isFromCurrentSyllabus,
  );
  return {
    currentPublishedStructure,
    currentPublishedSyllabusStructureId:
      course.currentPublishedSyllabusStructureId,
    sourceReviewRevisionId,
    currentReviewRevisionId,
    isCurrentReviewRevisionPublished: Boolean(
      currentReviewRevisionId &&
      views.some(
        (item) =>
          item.sourceReviewRevisionId === currentReviewRevisionId &&
          item.syllabusId === currentSyllabusId,
      ),
    ),
    isCurrentPublishedStructureStale,
    current: currentPublishedStructure,
    history: views,
  };
}

export async function getLatestTeacherSyllabusReview(
  teacherId: string,
  courseId: string,
  draftId: string,
) {
  await editableDraftOrThrow(teacherId, courseId, draftId);
  const latest = await prisma.syllabusReviewRevision.findFirst({
    where: { parseDraftId: draftId, courseId },
    orderBy: [{ revisionNumber: "desc" }, { createdAt: "desc" }],
  });
  return latest ? reviewView(latest) : null;
}
