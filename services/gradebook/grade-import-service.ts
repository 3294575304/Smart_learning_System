import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  AuditAction,
  AuditTargetType,
  CourseFileKind,
  GradeImportBatchStatus,
  GradeImportExecutionStatus,
  GradeImportPreviewStatus,
  GradeSourceType,
  GradeValueStatus,
  MembershipStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { CourseFileUploadFile } from "@/services/course-files/types";
import {
  GRADE_TEMPLATE_HEADERS,
  GRADE_TEMPLATE_MAX_BYTES,
  GRADE_TEMPLATE_VERSION,
} from "@/services/gradebook/constants";
import { GradebookOperationError } from "@/services/gradebook/errors";
import {
  appendFinalGradeOverrideRevision,
  calculateStudentGradeInTransaction,
  gradeFingerprint,
} from "@/services/gradebook/service";
import { buildGradeTemplateXlsx } from "@/services/gradebook/xlsx-writer";
import { parseSpreadsheetWorkbook } from "@/services/student-imports/spreadsheet-parser";
import { getStorageService } from "@/services/storage";
import type { StorageService } from "@/services/storage/types";
import { ResourceNotFoundError } from "@/services/auth/policy";
import type { AuditRequestContext } from "@/services/audit/types";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import { createHash } from "node:crypto";

interface GradeImportDependencies {
  storage?: StorageService;
  storageKeyFactory?: (gradebookId: string, extension: string) => string;
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\uFEFF/gu, "")
    .trim();
}

function checksum(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function extensionOf(fileName: string): "xls" | "xlsx" {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".xls") return "xls";
  if (extension === ".xlsx") return "xlsx";
  throw new GradebookOperationError(
    "成绩模板只支持 .xls 或 .xlsx 文件。",
    400,
    "GRADE_TEMPLATE_EXTENSION_INVALID",
  );
}

function specialStatus(value: string): GradeValueStatus | null | undefined {
  const normalized = normalize(value);
  if (!normalized) return null;
  const mapping: Record<string, GradeValueStatus> = {
    缺考: GradeValueStatus.ABSENT,
    缓考: GradeValueStatus.DEFERRED,
    请假: GradeValueStatus.LEAVE,
    免修: GradeValueStatus.EXEMPT,
    不参与计算: GradeValueStatus.EXEMPT,
    作弊: GradeValueStatus.CHEATING,
    其他: GradeValueStatus.OTHER,
  };
  return mapping[normalized];
}

function statusLabel(status: GradeValueStatus, reason: string | null): string {
  const labels: Partial<Record<GradeValueStatus, string>> = {
    ABSENT: "缺考",
    DEFERRED: "缓考",
    LEAVE: "请假",
    EXEMPT: "免修",
    CHEATING: "作弊",
    OTHER: reason || "其他",
  };
  return labels[status] ?? "";
}

async function ownedGradebookOrThrow(teacherId: string, gradebookId: string) {
  const gradebook = await prisma.courseGradebook.findFirst({
    where: {
      id: gradebookId,
      course: { teacherId },
      classroom: { teacherId },
    },
    include: {
      course: { select: { id: true, name: true, courseNo: true, term: true } },
      classroom: { select: { id: true, name: true, courseId: true } },
    },
  });
  if (!gradebook) throw new ResourceNotFoundError("成绩台账不存在。");
  return gradebook;
}

function rowValues(row: {
  cells: Array<{ columnIndex: number; value: string }>;
}): string[] {
  const byColumn = new Map(
    row.cells.map((cell) => [cell.columnIndex, normalize(cell.value)]),
  );
  return Array.from({ length: GRADE_TEMPLATE_HEADERS.length }, (_, index) =>
    normalize(byColumn.get(index) ?? ""),
  );
}

export async function previewTeacherGradeImport(
  teacherId: string,
  gradebookId: string,
  file: CourseFileUploadFile | null | undefined,
  idempotencyKey: string,
  context: AuditRequestContext,
  dependencies: GradeImportDependencies = {},
) {
  if (!file) throw new GradebookOperationError("请选择成绩模板文件。", 400);
  if (file.size <= 0 || file.size > GRADE_TEMPLATE_MAX_BYTES) {
    throw new GradebookOperationError(
      "成绩模板大小必须在 0 到 5MB 之间。",
      413,
    );
  }
  if (idempotencyKey.trim().length < 8 || idempotencyKey.length > 191) {
    throw new GradebookOperationError("导入幂等键格式无效。", 400);
  }
  const gradebook = await ownedGradebookOrThrow(teacherId, gradebookId);
  const extension = extensionOf(file.name);
  const data = Buffer.from(await file.arrayBuffer());
  if (data.length !== file.size) {
    throw new GradebookOperationError("成绩模板文件大小不一致。", 400);
  }
  let workbook;
  try {
    workbook = parseSpreadsheetWorkbook(extension, data);
  } catch {
    throw new GradebookOperationError(
      "成绩模板已损坏或实际格式与扩展名不一致。",
      400,
      "GRADE_TEMPLATE_DAMAGED",
    );
  }
  if (
    workbook.sheets.length !== 1 ||
    workbook.sheets[0]?.name !== "sheet" ||
    workbook.sheets[0].hidden
  ) {
    throw new GradebookOperationError(
      "固定成绩模板必须且只能包含名为 sheet 的可见工作表。",
      422,
      "GRADE_TEMPLATE_SHEET_INVALID",
    );
  }
  const sheet = workbook.sheets[0];
  if (sheet.mergedRanges.length > 0) {
    throw new GradebookOperationError("固定成绩模板不能包含合并单元格。", 422);
  }
  const header = sheet.rows.find((row) => row.rowNumber === 1);
  if (!header) throw new GradebookOperationError("成绩模板缺少表头。", 422);
  const headers = rowValues(header);
  if (
    headers.length !== GRADE_TEMPLATE_HEADERS.length ||
    headers.some((value, index) => value !== GRADE_TEMPLATE_HEADERS[index])
  ) {
    throw new GradebookOperationError(
      "成绩模板表头或列顺序与固定模板不一致。",
      422,
      "GRADE_TEMPLATE_HEADER_INVALID",
    );
  }
  if (sheet.rows.some((row) => row.cells.some((cell) => cell.hasFormula))) {
    throw new GradebookOperationError("固定成绩模板不能包含公式。", 422);
  }
  const memberships = await prisma.classMembership.findMany({
    where: {
      classroomId: gradebook.classroomId,
      status: MembershipStatus.ACTIVE,
    },
    select: {
      studentId: true,
      student: {
        select: {
          profile: { select: { studentNo: true, displayName: true } },
        },
      },
    },
  });
  const studentsByNo = new Map(
    memberships
      .filter((item) => item.student.profile?.studentNo)
      .map(
        (item) => [normalize(item.student.profile!.studentNo!), item] as const,
      ),
  );
  const dataRows = sheet.rows.filter(
    (row) => row.rowNumber > 1 && rowValues(row).some(Boolean),
  );
  const studentNos = dataRows.map((row) => rowValues(row)[2] ?? "");
  const duplicateNos = new Set(
    studentNos.filter(
      (studentNo, index) =>
        studentNo && studentNos.indexOf(studentNo) !== index,
    ),
  );
  const parsedRows = dataRows.map((row) => {
    const values = rowValues(row);
    const [
      term,
      courseNo,
      studentNo,
      studentName,
      className,
      ,
      scoreText,
      reason,
      gradeType,
    ] = values;
    const studentNoCell = row.cells.find((cell) => cell.columnIndex === 2);
    let previewStatus: GradeImportPreviewStatus =
      GradeImportPreviewStatus.VALID;
    let errorCode: string | null = null;
    let errorMessage: string | null = null;
    let finalScore: number | null = null;
    let status: GradeValueStatus = GradeValueStatus.NOT_ENTERED;
    const parsedSpecial = specialStatus(reason ?? "");
    const matched = studentsByNo.get(studentNo ?? "");
    const fail = (
      nextStatus: GradeImportPreviewStatus,
      code: string,
      message: string,
    ) => {
      previewStatus = nextStatus;
      errorCode = code;
      errorMessage = message;
    };
    if (
      term !== normalize(gradebook.course.term) ||
      courseNo?.toUpperCase() !==
        normalize(gradebook.course.courseNo).toUpperCase() ||
      className !== normalize(gradebook.classroom.name)
    ) {
      fail(
        GradeImportPreviewStatus.COURSE_MISMATCH,
        "COURSE_MISMATCH",
        "学期、课程号或班级与当前台账不一致",
      );
    } else if (!studentNo || studentNoCell?.type === "number") {
      fail(
        GradeImportPreviewStatus.INVALID,
        "STUDENT_NO_INVALID",
        "学号必须是非空文本，不能使用数值或科学计数法",
      );
    } else if (duplicateNos.has(studentNo)) {
      fail(
        GradeImportPreviewStatus.DUPLICATE_STUDENT,
        "DUPLICATE_STUDENT",
        "同一文件中学号重复",
      );
    } else if (!matched) {
      fail(
        GradeImportPreviewStatus.UNKNOWN_STUDENT,
        "UNKNOWN_STUDENT",
        "学号不属于当前班级的在读学生",
      );
    } else if (
      normalize(matched.student.profile?.displayName ?? "") !== studentName
    ) {
      fail(
        GradeImportPreviewStatus.INVALID,
        "STUDENT_NAME_MISMATCH",
        "学号对应姓名与当前班级名单不一致",
      );
    } else if (gradeType !== "百分制") {
      fail(
        GradeImportPreviewStatus.INVALID,
        "GRADE_TYPE_INVALID",
        "等级成绩类型必须为百分制",
      );
    } else if (parsedSpecial === undefined) {
      fail(
        GradeImportPreviewStatus.INVALID,
        "SPECIAL_STATUS_UNKNOWN",
        "特殊原因不是系统支持的固定状态",
      );
    } else if (scoreText && parsedSpecial) {
      fail(
        GradeImportPreviewStatus.INVALID,
        "SCORE_STATUS_CONFLICT",
        "数值成绩与特殊原因不能同时填写",
      );
    } else if (!scoreText && !parsedSpecial) {
      fail(
        GradeImportPreviewStatus.INVALID,
        "GRADE_EMPTY",
        "期末成绩和特殊原因不能同时为空",
      );
    } else if (scoreText) {
      if (!/^\d+(?:\.\d{1,4})?$/u.test(scoreText)) {
        fail(
          GradeImportPreviewStatus.INVALID,
          "SCORE_INVALID",
          "期末成绩必须是 0 到 100 的数值",
        );
      } else {
        finalScore = Number(scoreText);
        if (finalScore < 0 || finalScore > 100) {
          fail(
            GradeImportPreviewStatus.INVALID,
            "SCORE_OUT_OF_RANGE",
            "期末成绩必须在 0 到 100 之间",
          );
        } else status = GradeValueStatus.SCORED;
      }
    } else {
      status = parsedSpecial!;
    }
    return {
      rowNumber: row.rowNumber,
      values,
      studentNo: studentNo ?? "",
      studentName: studentName ?? "",
      finalScore,
      specialStatus: status,
      specialReason: reason || null,
      matchedStudentId: matched?.studentId ?? null,
      previewStatus,
      errorCode,
      errorMessage,
    };
  });
  const sourceChecksum = checksum(data);
  const existing = await prisma.gradeImportBatch.findUnique({
    where: { gradebookId_idempotencyKey: { gradebookId, idempotencyKey } },
    include: { rows: { orderBy: { rowNumber: "asc" } } },
  });
  if (existing) {
    if (existing.sourceFileChecksum !== sourceChecksum) {
      throw new GradebookOperationError(
        "相同幂等键已用于其他文件，请刷新后重新选择文件。",
        409,
        "GRADE_IMPORT_IDEMPOTENCY_CONFLICT",
      );
    }
    return existing;
  }
  const storage = dependencies.storage ?? getStorageService();
  const storageKey = dependencies.storageKeyFactory
    ? dependencies.storageKeyFactory(gradebookId, extension)
    : `course-files/course/${gradebook.courseId}/import-source/grade-template/${randomUUID()}.${extension}`;
  await storage.save(storageKey, data);
  try {
    return await prisma.$transaction(
      async (transaction) => {
        const latestFile = await transaction.courseFileVersion.findFirst({
          where: {
            courseId: gradebook.courseId,
            fileKind: CourseFileKind.IMPORT_SOURCE,
            fileKey: `grade-template-${gradebookId}`,
          },
          orderBy: { versionNumber: "desc" },
          select: { versionNumber: true },
        });
        const fileVersion = await transaction.courseFileVersion.create({
          data: {
            courseId: gradebook.courseId,
            uploadedById: teacherId,
            fileKind: CourseFileKind.IMPORT_SOURCE,
            fileKey: `grade-template-${gradebookId}`,
            title: "课程成绩导入模板",
            versionNumber: (latestFile?.versionNumber ?? 0) + 1,
            originalFileName: file.name,
            storageKey,
            mimeType:
              extension === "xls"
                ? "application/vnd.ms-excel"
                : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            sizeBytes: data.length,
            checksumSha256: sourceChecksum,
            metadata: {
              templateVersion: GRADE_TEMPLATE_VERSION,
              sheetName: sheet.name,
              rowCount: parsedRows.length,
            },
          },
        });
        const validRows = parsedRows.filter(
          (row) => row.previewStatus === GradeImportPreviewStatus.VALID,
        ).length;
        const batch = await transaction.gradeImportBatch.create({
          data: {
            courseId: gradebook.courseId,
            classroomId: gradebook.classroomId,
            gradebookId,
            sourceFileVersionId: fileVersion.id,
            createdById: teacherId,
            idempotencyKey,
            sourceFileName: file.name,
            sourceFileChecksum: sourceChecksum,
            sourceSheetName: sheet.name,
            templateVersion: GRADE_TEMPLATE_VERSION,
            totalRows: parsedRows.length,
            validRows,
            invalidRows: parsedRows.length - validRows,
            rows: {
              create: parsedRows.map((row) => ({
                rowNumber: row.rowNumber,
                rawRow: row.values,
                studentNo: row.studentNo,
                studentName: row.studentName,
                finalScore:
                  row.finalScore === null
                    ? null
                    : new Prisma.Decimal(row.finalScore),
                specialStatus: row.specialStatus,
                specialReason: row.specialReason,
                matchedStudentId: row.matchedStudentId,
                previewStatus: row.previewStatus,
                errorCode: row.errorCode,
                errorDetail: row.errorMessage
                  ? { message: row.errorMessage }
                  : Prisma.JsonNull,
              })),
            },
          },
          include: { rows: { orderBy: { rowNumber: "asc" } } },
        });
        await writeGovernanceAuditLog(transaction, {
          actorId: teacherId,
          action: AuditAction.GRADE_IMPORT_PREVIEWED,
          targetType: AuditTargetType.GRADE_IMPORT_BATCH,
          targetId: batch.id,
          summary: "预览固定模板成绩导入",
          beforeData: null,
          afterData: {
            gradebookId,
            sourceFileVersionId: fileVersion.id,
            templateVersion: GRADE_TEMPLATE_VERSION,
            totalRows: parsedRows.length,
            validRows,
            invalidRows: parsedRows.length - validRows,
          },
          context,
        });
        return batch;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error: unknown) {
    await storage.delete(storageKey).catch(() => undefined);
    throw error;
  }
}

async function ownedBatchOrThrow(teacherId: string, batchId: string) {
  const batch = await prisma.gradeImportBatch.findFirst({
    where: {
      id: batchId,
      course: { teacherId },
      classroom: { teacherId },
    },
    include: { rows: { orderBy: { rowNumber: "asc" } } },
  });
  if (!batch) throw new ResourceNotFoundError("成绩导入批次不存在。");
  return batch;
}

export async function getTeacherGradeImportBatch(
  teacherId: string,
  batchId: string,
) {
  return ownedBatchOrThrow(teacherId, batchId);
}

export async function executeTeacherGradeImport(
  teacherId: string,
  batchId: string,
  context: AuditRequestContext,
) {
  const owned = await ownedBatchOrThrow(teacherId, batchId);
  if (owned.status === GradeImportBatchStatus.SUCCEEDED) return owned;
  if (owned.invalidRows > 0) {
    throw new GradebookOperationError(
      "导入预览仍有错误行，修正文件后重新预览。",
      409,
      "GRADE_IMPORT_PREVIEW_HAS_ERRORS",
    );
  }
  try {
    return await prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "GradeImportBatch"
          WHERE "id" = ${batchId}
          FOR UPDATE
        `;
        const batch = await transaction.gradeImportBatch.findUniqueOrThrow({
          where: { id: batchId },
          include: { rows: { orderBy: { rowNumber: "asc" } } },
        });
        if (batch.status === GradeImportBatchStatus.SUCCEEDED) return batch;
        if (
          batch.status !== GradeImportBatchStatus.PREVIEW_READY &&
          batch.status !== GradeImportBatchStatus.FAILED
        ) {
          throw new GradebookOperationError(
            "成绩导入批次状态不允许执行。",
            409,
          );
        }
        await transaction.gradeImportBatch.update({
          where: { id: batchId },
          data: {
            status: GradeImportBatchStatus.PROCESSING,
            startedAt: new Date(),
          },
        });
        let appliedRows = 0;
        for (const row of batch.rows) {
          if (
            row.previewStatus !== GradeImportPreviewStatus.VALID ||
            !row.matchedStudentId
          ) {
            throw new GradebookOperationError(
              "导入批次包含未通过预览的行。",
              409,
            );
          }
          const result = await appendFinalGradeOverrideRevision(transaction, {
            gradebookId: batch.gradebookId,
            studentId: row.matchedStudentId,
            status: row.specialStatus,
            score: row.finalScore,
            sourceType: GradeSourceType.TEMPLATE_IMPORT,
            sourceFingerprint: gradeFingerprint({
              source: "GRADE_TEMPLATE_IMPORT",
              batchId,
              sourceChecksum: batch.sourceFileChecksum,
              rowNumber: row.rowNumber,
              studentId: row.matchedStudentId,
              status: row.specialStatus,
              score: row.finalScore?.toFixed(4) ?? null,
            }),
            sourceImportRowId: row.id,
            changedById: teacherId,
            reason: row.specialReason || "固定模板导入课程总评",
          });
          await transaction.gradeImportRow.update({
            where: { id: row.id },
            data: {
              executionStatus: GradeImportExecutionStatus.APPLIED,
              processedAt: new Date(),
            },
          });
          await calculateStudentGradeInTransaction(
            transaction,
            batch.gradebookId,
            row.matchedStudentId,
            teacherId,
          );
          if (!result.reused) appliedRows += 1;
        }
        const completed = await transaction.gradeImportBatch.update({
          where: { id: batchId },
          data: {
            status: GradeImportBatchStatus.SUCCEEDED,
            appliedRows: batch.rows.length,
            failedRows: 0,
            completedAt: new Date(),
          },
          include: { rows: { orderBy: { rowNumber: "asc" } } },
        });
        await writeGovernanceAuditLog(transaction, {
          actorId: teacherId,
          action: AuditAction.GRADE_IMPORT_EXECUTED,
          targetType: AuditTargetType.GRADE_IMPORT_BATCH,
          targetId: batchId,
          summary: "执行固定模板课程总评导入",
          beforeData: { status: batch.status },
          afterData: {
            status: completed.status,
            appliedRows: completed.appliedRows,
            createdRevisionRows: appliedRows,
            sourceFileChecksum: batch.sourceFileChecksum,
          },
          context,
        });
        return completed;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error: unknown) {
    await prisma.gradeImportBatch.updateMany({
      where: { id: batchId, status: { not: GradeImportBatchStatus.SUCCEEDED } },
      data: {
        status: GradeImportBatchStatus.FAILED,
        failedRows: owned.totalRows,
        completedAt: new Date(),
      },
    });
    throw error;
  }
}

export async function exportTeacherGradeTemplate(
  teacherId: string,
  gradebookId: string,
  context: AuditRequestContext,
) {
  const gradebook = await ownedGradebookOrThrow(teacherId, gradebookId);
  if (!gradebook.currentPublicationId) {
    throw new GradebookOperationError(
      "请先发布正式成绩版本再导出。",
      409,
      "GRADEBOOK_PUBLICATION_REQUIRED",
    );
  }
  const publication = await prisma.gradebookPublication.findUniqueOrThrow({
    where: { id: gradebook.currentPublicationId },
    include: {
      students: {
        include: {
          student: {
            select: {
              profile: { select: { studentNo: true, displayName: true } },
            },
          },
          gradeRevision: true,
        },
      },
    },
  });
  const rows: string[][] = [Array.from(GRADE_TEMPLATE_HEADERS)];
  publication.students
    .sort((left, right) =>
      (left.student.profile?.studentNo ?? "").localeCompare(
        right.student.profile?.studentNo ?? "",
      ),
    )
    .forEach((row) => {
      const result = row.gradeRevision;
      rows.push([
        gradebook.course.term,
        gradebook.course.courseNo,
        row.student.profile?.studentNo ?? "",
        row.student.profile?.displayName ?? "",
        gradebook.classroom.name,
        "",
        result.effectiveStatus === GradeValueStatus.SCORED &&
        result.effectiveScore
          ? result.effectiveScore.toFixed(2).replace(/\.00$/u, "")
          : "",
        statusLabel(result.effectiveStatus, null),
        "百分制",
        "",
      ]);
    });
  const data = buildGradeTemplateXlsx(rows);
  await prisma.$transaction(async (transaction) => {
    await writeGovernanceAuditLog(transaction, {
      actorId: teacherId,
      action: AuditAction.GRADE_EXPORT_DOWNLOADED,
      targetType: AuditTargetType.GRADEBOOK,
      targetId: gradebookId,
      summary: "导出固定格式课程成绩模板",
      beforeData: null,
      afterData: {
        publicationId: publication.id,
        publicationVersion: publication.versionNumber,
        rowCount: publication.students.length,
        templateVersion: GRADE_TEMPLATE_VERSION,
      },
      context,
    });
  });
  return {
    data,
    fileName: `${gradebook.course.courseNo}-${gradebook.classroom.name}-课程成绩.xlsx`,
    rowCount: publication.students.length,
  };
}
