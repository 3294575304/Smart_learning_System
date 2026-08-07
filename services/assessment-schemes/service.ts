import { createHash } from "node:crypto";
import {
  AuditAction,
  AuditTargetType,
  Prisma,
  type AssessmentSchemeDraft,
} from "@prisma/client";
import { ZodError } from "zod";

import { prisma } from "@/lib/prisma";
import {
  ASSESSMENT_SCHEME_RULE_VERSION,
  ASSESSMENT_SOURCE_EXTRACTOR_VERSION,
} from "@/services/assessment-schemes/constants";
import { AssessmentSchemeOperationError } from "@/services/assessment-schemes/errors";
import {
  assessmentSchemeStructureSchema,
  publishableAssessmentSchemeSchema,
  type AssessmentSchemeStructure,
  type SaveAssessmentSchemeInput,
} from "@/services/assessment-schemes/schemas";
import {
  buildAssessmentSchemeFromSyllabus,
  emptyAssessmentScheme,
} from "@/services/assessment-schemes/source-extractor";
import type { AuditRequestContext } from "@/services/audit/types";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { extractTextFromPdf } from "@/services/syllabus-parsing/pdf-extractor";
import { storedPublishableSyllabusStructureSchema } from "@/services/syllabus-parsing/schemas";
import { getStorageService } from "@/services/storage";
import type { StorageService } from "@/services/storage/types";

interface AssessmentSchemeDependencies {
  storage?: StorageService;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function fingerprint(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

function invalidStructure(error: ZodError): never {
  const details = error.issues
    .slice(0, 20)
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("；");
  throw new AssessmentSchemeOperationError(
    details || "考核方案结构校验失败。",
    400,
    "ASSESSMENT_SCHEME_STRUCTURE_INVALID",
  );
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
      currentPublishedAssessmentSchemeId: true,
      currentPublishedSyllabusStructure: {
        select: {
          id: true,
          versionNumber: true,
          structureJson: true,
          syllabus: {
            select: {
              id: true,
              versionNumber: true,
              originalName: true,
              checksumSha256: true,
              storageKey: true,
            },
          },
        },
      },
    },
  });
  if (!course) throw new ResourceNotFoundError("课程不存在。");
  return course;
}

function allowedSourceRefs(value: unknown): Set<string> {
  const refs = new Set<string>();
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (!candidate || typeof candidate !== "object") return;
    const record = candidate as Record<string, unknown>;
    if (Array.isArray(record.sourceRefs)) {
      record.sourceRefs.forEach((ref) =>
        refs.add(JSON.stringify(stableValue(ref))),
      );
    }
    Object.values(record).forEach(visit);
  };
  visit(value);
  return refs;
}

function validateSourceRefs(
  structure: AssessmentSchemeStructure,
  original: unknown,
) {
  const allowed = allowedSourceRefs(original);
  for (const ref of allowedSourceRefs(structure)) {
    if (!allowed.has(ref)) {
      throw new AssessmentSchemeOperationError(
        "大纲来源页码和原文证据不可新增或篡改。",
        400,
        "ASSESSMENT_SOURCE_REFERENCE_MODIFIED",
      );
    }
  }
}

function parseStructure(value: Prisma.JsonValue): AssessmentSchemeStructure {
  const parsed = assessmentSchemeStructureSchema.safeParse(value);
  if (!parsed.success) {
    throw new AssessmentSchemeOperationError(
      "已保存的考核方案无法读取。",
      500,
      "STORED_ASSESSMENT_SCHEME_INVALID",
    );
  }
  return parsed.data;
}

function draftView(record: {
  id: string;
  courseId: string;
  sourcePublishedSyllabusStructureId: string | null;
  revisionNumber: number;
  structureJson: Prisma.JsonValue;
  sourceFingerprint: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return { ...record, structure: parseStructure(record.structureJson) };
}

function publishedView(
  record: {
    id: string;
    courseId: string;
    sourcePublishedSyllabusStructureId: string | null;
    reviewRevisionId: string;
    versionNumber: number;
    structureJson: Prisma.JsonValue;
    sourceFingerprint: string;
    calculationRuleVersion: string;
    publishedAt: Date;
    createdAt: Date;
    updatedAt: Date;
  },
  currentSyllabusStructureId: string | null,
) {
  return {
    ...record,
    structure: parseStructure(record.structureJson),
    isSourceOutdated:
      record.sourcePublishedSyllabusStructureId !== currentSyllabusStructureId,
  };
}

async function buildSource(
  teacherId: string,
  courseId: string,
  dependencies: AssessmentSchemeDependencies,
) {
  const course = await ownedCourseOrThrow(teacherId, courseId);
  const source = course.currentPublishedSyllabusStructure;
  if (!source) {
    const structure = emptyAssessmentScheme();
    return {
      course,
      sourceId: null,
      structure,
      sourceFingerprint: fingerprint({
        courseId,
        extractorVersion: ASSESSMENT_SOURCE_EXTRACTOR_VERSION,
        structure,
      }),
    };
  }
  const parsed = storedPublishableSyllabusStructureSchema.safeParse(
    source.structureJson,
  );
  if (!parsed.success) {
    throw new AssessmentSchemeOperationError(
      "当前正式教学大纲结构无法读取。",
      409,
      "PUBLISHED_SYLLABUS_INVALID",
    );
  }
  let pages: Awaited<ReturnType<typeof extractTextFromPdf>>["pages"] = [];
  let extractionWarning: string | null = null;
  try {
    const storage = dependencies.storage ?? getStorageService();
    pages = (
      await extractTextFromPdf(await storage.read(source.syllabus.storageKey))
    ).pages;
  } catch {
    extractionWarning =
      "无法读取正式大纲原文中的数值比例或评分标准，请教师对照原文件补充。";
  }
  const structure = buildAssessmentSchemeFromSyllabus(parsed.data, pages);
  if (extractionWarning) structure.warnings.push(extractionWarning);
  return {
    course,
    sourceId: source.id,
    structure,
    sourceFingerprint: fingerprint({
      extractorVersion: ASSESSMENT_SOURCE_EXTRACTOR_VERSION,
      publishedSyllabusStructureId: source.id,
      syllabusVersion: source.syllabus.versionNumber,
      syllabusChecksum: source.syllabus.checksumSha256,
      structure: parsed.data,
      assessmentStructure: structure,
    }),
  };
}

async function generateTransaction(
  teacherId: string,
  courseId: string,
  structure: AssessmentSchemeStructure,
  sourceId: string | null,
  sourceFingerprint: string,
  force: boolean,
  context: AuditRequestContext,
) {
  return prisma.$transaction(
    async (transaction) => {
      await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Course"
        WHERE "id" = ${courseId} AND "teacherId" = ${teacherId}
        FOR UPDATE
      `;
      await ownedCourseOrThrow(teacherId, courseId, transaction);
      const existing = await transaction.assessmentSchemeDraft.findUnique({
        where: { courseId },
      });
      if (
        existing &&
        existing.sourceFingerprint === sourceFingerprint &&
        !force
      ) {
        return draftView(existing);
      }
      const revisionNumber = (existing?.revisionNumber ?? 0) + 1;
      const draft = existing
        ? await transaction.assessmentSchemeDraft.update({
            where: { id: existing.id },
            data: {
              sourcePublishedSyllabusStructureId: sourceId,
              revisionNumber,
              structureJson: jsonValue(structure),
              sourceFingerprint,
            },
          })
        : await transaction.assessmentSchemeDraft.create({
            data: {
              courseId,
              sourcePublishedSyllabusStructureId: sourceId,
              createdById: teacherId,
              revisionNumber,
              structureJson: jsonValue(structure),
              sourceFingerprint,
            },
          });
      const review = await transaction.assessmentSchemeReviewRevision.create({
        data: {
          draftId: draft.id,
          courseId,
          sourcePublishedSyllabusStructureId: sourceId,
          editedById: teacherId,
          revisionNumber,
          structureJson: jsonValue(structure),
          sourceFingerprint,
        },
      });
      await writeGovernanceAuditLog(transaction, {
        actorId: teacherId,
        action: AuditAction.ASSESSMENT_SCHEME_DRAFT_GENERATED,
        targetType: AuditTargetType.ASSESSMENT_SCHEME_DRAFT,
        targetId: draft.id,
        summary: `从正式教学大纲生成考核方案草稿修订 ${revisionNumber}`,
        beforeData: existing
          ? { revisionNumber: existing.revisionNumber }
          : null,
        afterData: {
          courseId,
          revisionNumber,
          reviewRevisionId: review.id,
          sourcePublishedSyllabusStructureId: sourceId,
          sourceFingerprint,
        },
        context,
      });
      return draftView(draft);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function generateTeacherAssessmentSchemeDraft(
  teacherId: string,
  courseId: string,
  force: boolean,
  context: AuditRequestContext,
  dependencies: AssessmentSchemeDependencies = {},
) {
  const source = await buildSource(teacherId, courseId, dependencies);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await generateTransaction(
        teacherId,
        courseId,
        source.structure,
        source.sourceId,
        source.sourceFingerprint,
        force,
        context,
      );
    } catch (error: unknown) {
      if (
        attempt < 2 &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2034" || error.code === "P2002")
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new AssessmentSchemeOperationError(
    "生成考核方案发生并发冲突，请重试。",
    409,
    "ASSESSMENT_SCHEME_GENERATE_CONFLICT",
  );
}

export async function saveTeacherAssessmentSchemeDraft(
  teacherId: string,
  courseId: string,
  input: SaveAssessmentSchemeInput,
  context: AuditRequestContext,
) {
  return prisma.$transaction(async (transaction) => {
    await ownedCourseOrThrow(teacherId, courseId, transaction);
    const draft = await transaction.assessmentSchemeDraft.findUnique({
      where: { courseId },
    });
    if (!draft) {
      throw new AssessmentSchemeOperationError(
        "请先生成考核方案草稿。",
        409,
        "ASSESSMENT_SCHEME_DRAFT_REQUIRED",
      );
    }
    await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "AssessmentSchemeDraft"
      WHERE "id" = ${draft.id}
      FOR UPDATE
    `;
    const current = await transaction.assessmentSchemeDraft.findUniqueOrThrow({
      where: { id: draft.id },
    });
    if (current.revisionNumber !== input.expectedRevisionNumber) {
      throw new AssessmentSchemeOperationError(
        "考核方案已被其他操作更新，请刷新后重试。",
        409,
        "ASSESSMENT_SCHEME_REVISION_CONFLICT",
      );
    }
    validateSourceRefs(input.structure, current.structureJson);
    const revisionNumber = current.revisionNumber + 1;
    const updated = await transaction.assessmentSchemeDraft.update({
      where: { id: current.id },
      data: {
        revisionNumber,
        structureJson: jsonValue(input.structure),
      },
    });
    const review = await transaction.assessmentSchemeReviewRevision.create({
      data: {
        draftId: current.id,
        courseId,
        sourcePublishedSyllabusStructureId:
          current.sourcePublishedSyllabusStructureId,
        editedById: teacherId,
        revisionNumber,
        structureJson: jsonValue(input.structure),
        sourceFingerprint: current.sourceFingerprint,
      },
    });
    await writeGovernanceAuditLog(transaction, {
      actorId: teacherId,
      action: AuditAction.ASSESSMENT_SCHEME_REVIEW_SAVED,
      targetType: AuditTargetType.ASSESSMENT_SCHEME_REVIEW,
      targetId: review.id,
      summary: `保存考核方案审核修订 ${revisionNumber}`,
      beforeData: { revisionNumber: current.revisionNumber },
      afterData: {
        courseId,
        draftId: current.id,
        revisionNumber,
        sourceFingerprint: current.sourceFingerprint,
      },
      context,
    });
    return { ...draftView(updated), reviewRevisionId: review.id };
  });
}

async function publishedByReview(
  teacherId: string,
  courseId: string,
  reviewRevisionId: string,
) {
  const course = await ownedCourseOrThrow(teacherId, courseId);
  const record = await prisma.publishedAssessmentScheme.findFirst({
    where: { courseId, reviewRevisionId },
  });
  if (!record) return null;
  if (course.currentPublishedAssessmentSchemeId !== record.id) {
    await prisma.course.update({
      where: { id: courseId },
      data: { currentPublishedAssessmentSchemeId: record.id },
    });
  }
  return publishedView(record, course.currentPublishedSyllabusStructureId);
}

async function publishTransaction(
  teacherId: string,
  courseId: string,
  reviewRevisionId: string,
  context: AuditRequestContext,
) {
  return prisma.$transaction(
    async (transaction) => {
      await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Course"
        WHERE "id" = ${courseId} AND "teacherId" = ${teacherId}
        FOR UPDATE
      `;
      const course = await ownedCourseOrThrow(teacherId, courseId, transaction);
      const existing = await transaction.publishedAssessmentScheme.findUnique({
        where: { reviewRevisionId },
      });
      if (existing) {
        await transaction.course.update({
          where: { id: courseId },
          data: { currentPublishedAssessmentSchemeId: existing.id },
        });
        return publishedView(
          existing,
          course.currentPublishedSyllabusStructureId,
        );
      }
      const review = await transaction.assessmentSchemeReviewRevision.findFirst(
        {
          where: { id: reviewRevisionId, courseId },
          include: { draft: { select: { revisionNumber: true } } },
        },
      );
      if (!review) throw new ResourceNotFoundError("考核方案审核修订不存在。");
      if (review.revisionNumber !== review.draft.revisionNumber) {
        throw new AssessmentSchemeOperationError(
          "只能发布当前最新的考核方案审核修订。",
          409,
          "ASSESSMENT_SCHEME_REVIEW_OUTDATED",
        );
      }
      if (
        review.sourcePublishedSyllabusStructureId !==
        course.currentPublishedSyllabusStructureId
      ) {
        throw new AssessmentSchemeOperationError(
          "考核方案来源已过期，请从当前正式教学大纲重新生成草稿。",
          409,
          "ASSESSMENT_SCHEME_SOURCE_OUTDATED",
        );
      }
      const parsed = publishableAssessmentSchemeSchema.safeParse(
        review.structureJson,
      );
      if (!parsed.success) invalidStructure(parsed.error);
      const latest = await transaction.publishedAssessmentScheme.findFirst({
        where: { courseId },
        orderBy: [{ versionNumber: "desc" }, { publishedAt: "desc" }],
        select: { versionNumber: true },
      });
      const scheme = await transaction.publishedAssessmentScheme.create({
        data: {
          courseId,
          sourcePublishedSyllabusStructureId:
            review.sourcePublishedSyllabusStructureId,
          reviewRevisionId: review.id,
          publishedById: teacherId,
          versionNumber: (latest?.versionNumber ?? 0) + 1,
          structureJson: jsonValue(parsed.data),
          sourceFingerprint: review.sourceFingerprint,
          calculationRuleVersion: ASSESSMENT_SCHEME_RULE_VERSION,
        },
      });
      const outcomeIds = new Map<string, string>();
      for (const outcome of parsed.data.outcomes) {
        const created = await transaction.publishedCourseOutcome.create({
          data: {
            schemeId: scheme.id,
            code: outcome.code,
            title: outcome.title,
            description: outcome.description,
            attainmentThreshold: new Prisma.Decimal(
              outcome.attainmentThreshold!,
            ),
            sortOrder: outcome.sortOrder,
            sourceJson: jsonValue(outcome.sourceRefs),
          },
        });
        outcomeIds.set(outcome.code, created.id);
      }
      for (const component of parsed.data.components) {
        const created = await transaction.publishedAssessmentComponent.create({
          data: {
            schemeId: scheme.id,
            code: component.code,
            name: component.name,
            type: component.type,
            fullScore: new Prisma.Decimal(component.fullScore!),
            weight: new Prisma.Decimal(component.weight!),
            sourceType: component.sourceType!,
            sortOrder: component.sortOrder,
            enabled: component.enabled,
            sourceJson: jsonValue(component.sourceRefs),
            rubricJson: jsonValue(component.rubricBands),
          },
        });
        for (const mapping of component.mappings) {
          const outcomeId = outcomeIds.get(mapping.objectiveCode);
          if (!outcomeId) {
            throw new AssessmentSchemeOperationError(
              "考核方案课程目标映射无效。",
              400,
              "ASSESSMENT_OUTCOME_MAPPING_INVALID",
            );
          }
          await transaction.publishedAssessmentOutcomeMapping.create({
            data: {
              schemeId: scheme.id,
              componentId: created.id,
              outcomeId,
              allocationRate: new Prisma.Decimal(mapping.allocationRate!),
              sourceJson: jsonValue(mapping.sourceRefs),
            },
          });
        }
      }
      await transaction.course.update({
        where: { id: courseId },
        data: { currentPublishedAssessmentSchemeId: scheme.id },
      });
      await writeGovernanceAuditLog(transaction, {
        actorId: teacherId,
        action: AuditAction.ASSESSMENT_SCHEME_PUBLISHED,
        targetType: AuditTargetType.ASSESSMENT_SCHEME_VERSION,
        targetId: scheme.id,
        summary: `发布考核方案版本 ${scheme.versionNumber}`,
        beforeData: course.currentPublishedAssessmentSchemeId
          ? {
              currentPublishedAssessmentSchemeId:
                course.currentPublishedAssessmentSchemeId,
            }
          : null,
        afterData: {
          courseId,
          reviewRevisionId: review.id,
          versionNumber: scheme.versionNumber,
          sourcePublishedSyllabusStructureId:
            review.sourcePublishedSyllabusStructureId,
          calculationRuleVersion: ASSESSMENT_SCHEME_RULE_VERSION,
        },
        context,
      });
      return publishedView(scheme, course.currentPublishedSyllabusStructureId);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function publishTeacherAssessmentScheme(
  teacherId: string,
  courseId: string,
  reviewRevisionId: string,
  context: AuditRequestContext,
) {
  const replay = await publishedByReview(teacherId, courseId, reviewRevisionId);
  if (replay) return replay;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await publishTransaction(
        teacherId,
        courseId,
        reviewRevisionId,
        context,
      );
    } catch (error: unknown) {
      if (
        attempt < 2 &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2034" || error.code === "P2002")
      ) {
        const existing = await publishedByReview(
          teacherId,
          courseId,
          reviewRevisionId,
        );
        if (existing) return existing;
        continue;
      }
      throw error;
    }
  }
  throw new AssessmentSchemeOperationError(
    "发布考核方案发生并发冲突，请重试。",
    409,
    "ASSESSMENT_SCHEME_PUBLISH_CONFLICT",
  );
}

export async function getTeacherAssessmentSchemeWorkspace(
  teacherId: string,
  courseId: string,
) {
  const course = await ownedCourseOrThrow(teacherId, courseId);
  const [draft, reviews, published] = await Promise.all([
    prisma.assessmentSchemeDraft.findUnique({ where: { courseId } }),
    prisma.assessmentSchemeReviewRevision.findMany({
      where: { courseId },
      orderBy: [{ revisionNumber: "desc" }, { createdAt: "desc" }],
      take: 30,
      select: {
        id: true,
        revisionNumber: true,
        sourcePublishedSyllabusStructureId: true,
        sourceFingerprint: true,
        createdAt: true,
      },
    }),
    prisma.publishedAssessmentScheme.findMany({
      where: { courseId },
      orderBy: [{ versionNumber: "desc" }, { publishedAt: "desc" }],
    }),
  ]);
  const history = published.map((item) =>
    publishedView(item, course.currentPublishedSyllabusStructureId),
  );
  return {
    course: { id: course.id, name: course.name },
    currentPublishedSyllabusStructureId:
      course.currentPublishedSyllabusStructureId,
    currentPublishedAssessmentSchemeId:
      course.currentPublishedAssessmentSchemeId,
    draft: draft ? draftView(draft) : null,
    reviews,
    current:
      history.find(
        (item) => item.id === course.currentPublishedAssessmentSchemeId,
      ) ?? null,
    history,
  };
}

export type AssessmentSchemeDraftRecord = AssessmentSchemeDraft;
