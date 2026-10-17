import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  AuditAction,
  AuditTargetType,
  CourseFileKind,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { getStorageService } from "@/services/storage";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import { QualityReportOperationError } from "./errors";
import { inspectReportTemplate } from "./template-runtime";
import {
  templateManifestSchema,
  validateTemplateMappings,
  type TemplateSelection,
  type TemplateSnapshot,
} from "./template-schema";

async function owned(teacherId: string, courseId: string) {
  const course = await prisma.course.findFirst({
    where: { id: courseId, teacherId },
    select: { id: true },
  });
  if (!course) throw new ResourceNotFoundError("课程不存在。");
}
export async function listReportTemplates(teacherId: string, courseId: string) {
  await owned(teacherId, courseId);
  const files = await prisma.courseFileVersion.findMany({
    where: { courseId, fileKind: CourseFileKind.REPORT_TEMPLATE },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      originalFileName: true,
      createdAt: true,
      metadata: true,
    },
  });
  return files.flatMap((file) => {
    const manifest = templateManifestSchema.safeParse(file.metadata);
    return manifest.success
      ? [
          {
            id: file.id,
            name: file.originalFileName,
            createdAt: file.createdAt,
            ...manifest.data,
          },
        ]
      : [];
  });
}
export async function uploadReportTemplate(
  teacherId: string,
  courseId: string,
  file: File,
  context: AuditRequestContext,
) {
  await owned(teacherId, courseId);
  if (
    !file.name.toLowerCase().endsWith(".docx") ||
    file.size < 1 ||
    file.size > 10 * 1024 * 1024
  )
    throw new QualityReportOperationError(
      "请上传不超过 10 MB 的 DOCX 报告模板。",
    );
  const data = Buffer.from(await file.arrayBuffer());
  if (data.length !== file.size || data.length > 10 * 1024 * 1024)
    throw new QualityReportOperationError("模板文件大小无效。");
  const manifest = await inspectReportTemplate(data);
  const checksum = createHash("sha256").update(data).digest("hex");
  const existing = await prisma.courseFileVersion.findFirst({
    where: {
      courseId,
      fileKind: CourseFileKind.REPORT_TEMPLATE,
      checksumSha256: checksum,
    },
    select: { id: true },
  });
  if (existing) return { id: existing.id, reused: true };
  const storage = getStorageService(),
    storageKey = `courses/${courseId}/report-templates/${randomUUID()}.docx`;
  await storage.save(storageKey, data);
  try {
    const record = await prisma.$transaction(async (tx) => {
      const created = await tx.courseFileVersion.create({
        data: {
          courseId,
          uploadedById: teacherId,
          fileKind: CourseFileKind.REPORT_TEMPLATE,
          fileKey: `report-template-${checksum}`,
          title: file.name.slice(0, 120),
          originalFileName: file.name.replace(/[\\/\r\n]/g, "_").slice(0, 255),
          storageKey,
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          sizeBytes: data.length,
          checksumSha256: checksum,
          metadata: manifest as Prisma.InputJsonValue,
        },
      });
      await writeGovernanceAuditLog(tx, {
        actorId: teacherId,
        action: AuditAction.COURSE_FILE_UPLOADED,
        targetType: AuditTargetType.COURSE_FILE,
        targetId: created.id,
        summary: "上传教学质量分析报告模板",
        beforeData: null,
        afterData: {
          courseId,
          checksumSha256: checksum,
          slotCount: manifest.slots.length,
        },
        context,
      });
      return created;
    });
    return { id: record.id, reused: false };
  } catch (error) {
    await storage.delete(storageKey);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const duplicate = await prisma.courseFileVersion.findFirst({
        where: {
          courseId,
          fileKind: CourseFileKind.REPORT_TEMPLATE,
          checksumSha256: checksum,
        },
        select: { id: true },
      });
      if (duplicate) return { id: duplicate.id, reused: true };
    }
    throw error;
  }
}
export async function resolveReportTemplate(
  teacherId: string,
  courseId: string,
  selection: TemplateSelection,
): Promise<TemplateSnapshot | undefined> {
  await owned(teacherId, courseId);
  if (!selection.templateFileVersionId) {
    if (
      selection.templateMappings?.length ||
      selection.templateMappingConfirmed
    )
      throw new QualityReportOperationError("请先选择上传的模板。");
    return undefined;
  }
  const file = await prisma.courseFileVersion.findFirst({
    where: {
      id: selection.templateFileVersionId,
      courseId,
      fileKind: CourseFileKind.REPORT_TEMPLATE,
    },
  });
  if (!file) throw new ResourceNotFoundError("报告模板不存在。");
  if (!selection.templateMappingConfirmed)
    throw new QualityReportOperationError("请先核对并确认模板字段对应关系。");
  const manifest = templateManifestSchema.parse(file.metadata);
  try {
    validateTemplateMappings(manifest, selection.templateMappings ?? []);
  } catch (error) {
    throw new QualityReportOperationError(
      error instanceof Error ? error.message : "模板字段对应关系无效。",
    );
  }
  return {
    fileVersionId: file.id,
    name: file.originalFileName,
    checksumSha256: file.checksumSha256,
    mappings: selection.templateMappings ?? [],
  };
}
export async function readFrozenReportTemplate(
  courseId: string,
  snapshot: TemplateSnapshot,
): Promise<Buffer> {
  const file = await prisma.courseFileVersion.findFirst({
    where: {
      id: snapshot.fileVersionId,
      courseId,
      fileKind: CourseFileKind.REPORT_TEMPLATE,
    },
  });
  if (!file || file.checksumSha256 !== snapshot.checksumSha256)
    throw new QualityReportOperationError("报告模板版本已失效。", 409);
  const data = await getStorageService().read(file.storageKey);
  if (
    createHash("sha256").update(data).digest("hex") !== snapshot.checksumSha256
  )
    throw new QualityReportOperationError("报告模板完整性校验失败。", 409);
  return data;
}
