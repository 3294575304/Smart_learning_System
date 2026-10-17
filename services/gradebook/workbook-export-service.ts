import "server-only";

import {
  AuditAction,
  AuditTargetType,
  QualityReportSourceType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import { GradebookOperationError } from "./errors";
import { getTeacherQualityReportPlatformSource } from "@/services/quality-reports/service";
import { buildQualityReportWorkbook } from "@/services/quality-reports/xlsx-writer";

export async function exportTeacherGradeWorkbook(
  teacherId: string,
  gradebookId: string,
  context: AuditRequestContext,
) {
  const gradebook = await prisma.courseGradebook.findFirst({
    where: { id: gradebookId, course: { teacherId }, classroom: { teacherId } },
    select: { courseId: true, currentPublicationId: true },
  });
  if (!gradebook) throw new ResourceNotFoundError("成绩台账不存在。");
  if (!gradebook.currentPublicationId) {
    throw new GradebookOperationError(
      "请先发布正式成绩版本再导出。",
      409,
      "GRADEBOOK_PUBLICATION_REQUIRED",
    );
  }
  // 与质量报告共用发布快照和工作簿，不读取尚未发布的成绩修订。
  const source = await getTeacherQualityReportPlatformSource(
    teacherId,
    gradebook.courseId,
    {
      sourceType: QualityReportSourceType.PLATFORM,
      gradebookId,
    },
  );
  const data = buildQualityReportWorkbook(source);
  await prisma.$transaction(async (transaction) => {
    await writeGovernanceAuditLog(transaction, {
      actorId: teacherId,
      action: AuditAction.GRADE_EXPORT_DOWNLOADED,
      targetType: AuditTargetType.GRADEBOOK,
      targetId: gradebookId,
      summary: "导出完整课程成绩工作簿",
      beforeData: null,
      afterData: {
        publicationId: String(source.sourceReference.gradebookPublicationId),
        publicationVersion: Number(source.sourceReference.publicationVersion),
        rowCount: source.students.length,
        componentCount: source.components.length,
        format: "quality-report-workbook-v2",
      },
      context,
    });
  });
  return {
    data,
    fileName: `${source.course.courseNo}-${source.classroom.name}-完整成绩单-v${source.sourceReference.publicationVersion}.xlsx`,
    rowCount: source.students.length,
  };
}
