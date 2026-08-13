import "server-only";

import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

import {
  AuditAction,
  AuditTargetType,
  GradeValueStatus,
  Prisma,
  QualityReportSourceType,
  QualityReportStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import { ResourceNotFoundError } from "@/services/auth/policy";
import {
  claimBackgroundJobById,
  completeBackgroundJob,
  createBackgroundJob,
  failBackgroundJob,
  heartbeatBackgroundJob,
} from "@/services/background-jobs/repository";
import { backgroundJobFingerprint } from "@/services/background-jobs/fingerprint";
import {
  buildDeterministicNarrative,
  calculateQualityReportStatistics,
} from "@/services/quality-reports/calculation";
import {
  QUALITY_REPORT_JOB_TYPE,
  QUALITY_REPORT_MAX_SOURCE_BYTES,
  QUALITY_REPORT_PROMPT_VERSION,
  QUALITY_REPORT_RULE_VERSION,
  QUALITY_REPORT_TEMPLATE_CHECKSUM,
  QUALITY_REPORT_TEMPLATE_VERSION,
} from "@/services/quality-reports/constants";
import { buildQualityReportDocx } from "@/services/quality-reports/docx-writer";
import { QualityReportOperationError } from "@/services/quality-reports/errors";
import {
  qualityReportPlatformInputSchema,
  qualityReportSourceSnapshotSchema,
  qualityReportUploadMetadataSchema,
  type QualityReportSourceSnapshot,
} from "@/services/quality-reports/schemas";
import { parseUploadedGradeWorkbook } from "@/services/quality-reports/upload-parser";
import { buildQualityReportWorkbook } from "@/services/quality-reports/xlsx-writer";
import { getStorageService } from "@/services/storage";

const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const sha256 = (data: Buffer | string) =>
  createHash("sha256").update(data).digest("hex");

interface ReportUploadFile {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

function extensionFor(name: string): "xls" | "xlsx" | "csv" {
  const extension = path.extname(name).toLowerCase().slice(1);
  if (extension === "xls" || extension === "xlsx" || extension === "csv")
    return extension;
  throw new QualityReportOperationError(
    "成绩文件仅支持 XLS、XLSX 或 CSV。",
    400,
    "SOURCE_TYPE_INVALID",
  );
}

async function ownedCourse(teacherId: string, courseId: string) {
  const course = await prisma.course.findFirst({
    where: { id: courseId, teacherId },
    select: {
      id: true,
      name: true,
      courseNo: true,
      term: true,
      teacher: { select: { profile: { select: { displayName: true } } } },
    },
  });
  if (!course) throw new ResourceNotFoundError("课程不存在。");
  return course;
}

function componentResults(value: Prisma.JsonValue) {
  const parsed = Array.isArray(value) ? value : [];
  return parsed.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    return typeof record.code === "string"
      ? [
          {
            code: record.code,
            score:
              typeof record.score === "string" ? Number(record.score) : null,
          },
        ]
      : [];
  });
}

async function platformSource(
  teacherId: string,
  courseId: string,
  rawInput: unknown,
): Promise<QualityReportSourceSnapshot> {
  const input = qualityReportPlatformInputSchema.parse(rawInput);
  const gradebook = await prisma.courseGradebook.findFirst({
    where: {
      id: input.gradebookId,
      courseId,
      course: { teacherId },
      classroom: { teacherId },
      currentPublicationId: { not: null },
    },
    include: {
      course: {
        select: {
          id: true,
          name: true,
          courseNo: true,
          term: true,
          teacher: { select: { profile: { select: { displayName: true } } } },
        },
      },
      classroom: { select: { id: true, name: true } },
      scheme: {
        include: {
          components: {
            where: { enabled: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
      currentPublication: {
        include: {
          students: {
            orderBy: { student: { profile: { studentNo: "asc" } } },
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
      },
    },
  });
  if (!gradebook?.currentPublication)
    throw new ResourceNotFoundError("已发布成绩台账不存在。");
  const attainment = input.outcomeAttainmentRunId
    ? await prisma.courseOutcomeAttainmentRun.findFirst({
        where: {
          id: input.outcomeAttainmentRunId,
          gradebookId: gradebook.id,
          gradebookPublicationId: gradebook.currentPublication.id,
          course: { teacherId },
        },
        include: { results: { orderBy: { outcomeCode: "asc" } } },
      })
    : await prisma.courseOutcomeAttainmentRun.findFirst({
        where: {
          gradebookId: gradebook.id,
          gradebookPublicationId: gradebook.currentPublication.id,
        },
        orderBy: { versionNumber: "desc" },
        include: { results: { orderBy: { outcomeCode: "asc" } } },
      });
  if (input.outcomeAttainmentRunId && !attainment)
    throw new ResourceNotFoundError("课程目标达成度版本不存在。");
  const attendance = await prisma.attendanceRecord.findMany({
    where: {
      session: {
        courseId,
        classroomId: gradebook.classroomId,
        status: "CLOSED",
      },
    },
    select: { currentStatus: true, sessionId: true },
  });
  const attended = attendance.filter((item) =>
    ["PRESENT", "LATE", "EARLY_LEAVE"].includes(item.currentStatus),
  ).length;
  return qualityReportSourceSnapshotSchema.parse({
    course: {
      id: gradebook.course.id,
      name: gradebook.course.name,
      courseNo: gradebook.course.courseNo,
      term: gradebook.course.term,
      teacherName:
        gradebook.course.teacher.profile?.displayName ?? "未命名教师",
      courseNature: input.courseNature,
      credits: input.credits,
      majorClass: input.majorClass,
      college: input.college,
      major: input.major,
    },
    classroom: gradebook.classroom,
    sourceType: QualityReportSourceType.PLATFORM,
    components: gradebook.scheme.components.map((component) => ({
      code: component.code,
      name: component.name,
      weight: Number(component.weight),
    })),
    students: gradebook.currentPublication.students.map((row) => ({
      studentId: row.studentId,
      studentNo: row.student.profile?.studentNo ?? row.studentId,
      displayName: row.student.profile?.displayName ?? "未命名学生",
      status: row.gradeRevision.effectiveStatus,
      componentScores: Object.fromEntries(
        componentResults(row.gradeRevision.componentResultsJson).map((item) => [
          item.code,
          item.score,
        ]),
      ),
      totalScore:
        row.gradeRevision.effectiveStatus === GradeValueStatus.SCORED
          ? Number(row.gradeRevision.effectiveScore)
          : null,
    })),
    outcomes:
      attainment?.results.map((result) => ({
        code: result.outcomeCode,
        title: result.outcomeTitle,
        threshold: Number(result.threshold),
        attainmentIndex:
          result.attainmentIndex === null
            ? null
            : Number(result.attainmentIndex),
        participantCount: result.participantCount,
      })) ?? [],
    attendance: {
      sessionCount: new Set(attendance.map((item) => item.sessionId)).size,
      presentRate: attendance.length ? attended / attendance.length : null,
    },
    sourceReference: {
      gradebookId: gradebook.id,
      gradebookPublicationId: gradebook.currentPublication.id,
      outcomeAttainmentRunId: attainment?.id ?? null,
      schemeId: gradebook.schemeId,
    },
  });
}

async function uploadSource(
  teacherId: string,
  courseId: string,
  rawMetadata: unknown,
  file: ReportUploadFile,
) {
  const metadata = qualityReportUploadMetadataSchema.parse(rawMetadata);
  const course = await ownedCourse(teacherId, courseId);
  const extension = extensionFor(file.name);
  if (file.size <= 0 || file.size > QUALITY_REPORT_MAX_SOURCE_BYTES)
    throw new QualityReportOperationError(
      "成绩文件为空或超过 10 MB 限制。",
      400,
      "SOURCE_SIZE_INVALID",
    );
  const data = Buffer.from(await file.arrayBuffer());
  const parsed = parseUploadedGradeWorkbook(extension, data);
  let classroom = {
    id: null as string | null,
    name: metadata.majorClass || "上传成绩班级",
  };
  if (metadata.classroomId) {
    const owned = await prisma.classroom.findFirst({
      where: { id: metadata.classroomId, courseId, teacherId },
      select: { id: true, name: true },
    });
    if (!owned) throw new ResourceNotFoundError("班级不存在。");
    classroom = owned;
  }
  return {
    data,
    extension,
    fileName: file.name,
    mimeType:
      file.type ||
      (extension === "csv"
        ? "text/csv"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    checksum: sha256(data),
    snapshot: qualityReportSourceSnapshotSchema.parse({
      course: {
        id: course.id,
        name: course.name,
        courseNo: course.courseNo,
        term: course.term,
        teacherName: course.teacher.profile?.displayName ?? "未命名教师",
        courseNature: metadata.courseNature,
        credits: metadata.credits,
        majorClass: metadata.majorClass,
        college: metadata.college,
        major: metadata.major,
      },
      classroom,
      sourceType: QualityReportSourceType.UPLOAD,
      ...parsed,
      outcomes: [],
      attendance: { sessionCount: 0, presentRate: null },
      sourceReference: { fileName: file.name, checksumSha256: sha256(data) },
    }),
  };
}

async function queueReport(
  teacherId: string,
  courseId: string,
  source: QualityReportSourceSnapshot,
  context: AuditRequestContext,
  upload?: Awaited<ReturnType<typeof uploadSource>>,
) {
  const inputFingerprint = backgroundJobFingerprint({
    source,
    templateVersion: QUALITY_REPORT_TEMPLATE_VERSION,
    ruleVersion: QUALITY_REPORT_RULE_VERSION,
  });
  const existing = await prisma.courseQualityReport.findUnique({
    where: { courseId_inputFingerprint: { courseId, inputFingerprint } },
    include: { backgroundJob: true },
  });
  if (existing) {
    if (
      existing.backgroundJob &&
      (existing.status === QualityReportStatus.QUEUED ||
        existing.status === QualityReportStatus.FAILED)
    ) {
      const retried = await prisma.$transaction(async (transaction) => {
        await transaction.backgroundJob.update({
          where: { id: existing.backgroundJob!.id },
          data: {
            status: "PENDING",
            progress: 0,
            attemptCount: 0,
            nextAttemptAt: new Date(),
            currentLeaseId: null,
            errorCode: null,
            retryable: null,
            completedAt: null,
          },
        });
        return transaction.courseQualityReport.update({
          where: { id: existing.id },
          data: {
            status: QualityReportStatus.QUEUED,
            errorCode: null,
            completedAt: null,
          },
          include: { backgroundJob: true },
        });
      });
      return { report: retried, reused: true, shouldExecute: true };
    }
    return {
      report: existing,
      reused: true,
      shouldExecute: false,
    };
  }
  const storage = getStorageService();
  const sourceStorageKey = upload
    ? `quality-reports/${courseId}/sources/${randomUUID()}.${upload.extension}`
    : null;
  if (upload && sourceStorageKey)
    await storage.save(sourceStorageKey, upload.data);
  try {
    const created = await prisma.$transaction(async (transaction) => {
      const latest = await transaction.courseQualityReport.findFirst({
        where: { courseId },
        orderBy: { versionNumber: "desc" },
        select: { versionNumber: true },
      });
      let sourceFileVersionId: string | null = null;
      if (upload && sourceStorageKey) {
        const latestFile = await transaction.courseFileVersion.findFirst({
          where: {
            courseId,
            fileKind: "REPORT_GRADE_SOURCE",
            fileKey: "quality-report-grade-source",
          },
          orderBy: { versionNumber: "desc" },
          select: { versionNumber: true },
        });
        const sourceFile = await transaction.courseFileVersion.create({
          data: {
            courseId,
            uploadedById: teacherId,
            fileKind: "REPORT_GRADE_SOURCE",
            fileKey: "quality-report-grade-source",
            title: "教学质量报告成绩源",
            versionNumber: (latestFile?.versionNumber ?? 0) + 1,
            originalFileName: upload.fileName,
            storageKey: sourceStorageKey,
            mimeType: upload.mimeType,
            sizeBytes: upload.data.length,
            checksumSha256: upload.checksum,
            metadata: json({ isolatedFromFormalGradebook: true }),
          },
        });
        sourceFileVersionId = sourceFile.id;
      }
      const report = await transaction.courseQualityReport.create({
        data: {
          courseId,
          classroomId: source.classroom.id,
          gradebookId:
            source.sourceType === QualityReportSourceType.PLATFORM
              ? String(source.sourceReference.gradebookId)
              : null,
          outcomeAttainmentRunId:
            source.sourceType === QualityReportSourceType.PLATFORM &&
            source.sourceReference.outcomeAttainmentRunId
              ? String(source.sourceReference.outcomeAttainmentRunId)
              : null,
          requestedById: teacherId,
          sourceFileVersionId,
          sourceType: source.sourceType,
          versionNumber: (latest?.versionNumber ?? 0) + 1,
          inputFingerprint,
          templateVersion: QUALITY_REPORT_TEMPLATE_VERSION,
          templateChecksumSha256: QUALITY_REPORT_TEMPLATE_CHECKSUM,
          calculationRuleVersion: QUALITY_REPORT_RULE_VERSION,
          promptVersion: QUALITY_REPORT_PROMPT_VERSION,
          sourceSnapshotJson: json(source),
        },
      });
      await writeGovernanceAuditLog(transaction, {
        actorId: teacherId,
        action: AuditAction.QUALITY_REPORT_GENERATION_REQUESTED,
        targetType: AuditTargetType.QUALITY_REPORT,
        targetId: report.id,
        summary: `请求生成课程教学质量分析报告 v${report.versionNumber}`,
        beforeData: null,
        afterData: {
          sourceType: source.sourceType,
          versionNumber: report.versionNumber,
        },
        context,
      });
      return report;
    });
    const job = await createBackgroundJob({
      type: QUALITY_REPORT_JOB_TYPE,
      requestedById: teacherId,
      courseId,
      idempotencyKey: created.id,
      input: { reportId: created.id },
      maxAttempts: 3,
    });
    const report = await prisma.courseQualityReport.update({
      where: { id: created.id },
      data: { backgroundJobId: job.id },
      include: { backgroundJob: true },
    });
    return { report, reused: false, shouldExecute: true };
  } catch (error) {
    if (sourceStorageKey) await storage.delete(sourceStorageKey);
    throw error;
  }
}

export async function queuePlatformQualityReport(
  teacherId: string,
  courseId: string,
  input: unknown,
  context: AuditRequestContext,
) {
  return queueReport(
    teacherId,
    courseId,
    await platformSource(teacherId, courseId, input),
    context,
  );
}

export async function queueUploadedQualityReport(
  teacherId: string,
  courseId: string,
  metadata: unknown,
  file: ReportUploadFile | null,
  context: AuditRequestContext,
) {
  if (!file) throw new QualityReportOperationError("请选择成绩文件。");
  const upload = await uploadSource(teacherId, courseId, metadata, file);
  return queueReport(teacherId, courseId, upload.snapshot, context, upload);
}

export async function processQualityReportJob(
  reportId: string,
  context: AuditRequestContext,
) {
  const report = await prisma.courseQualityReport.findUnique({
    where: { id: reportId },
  });
  if (!report?.backgroundJobId)
    throw new ResourceNotFoundError("报告生成任务不存在。");
  const claimed = await claimBackgroundJobById(report.backgroundJobId, {
    workerId: `quality-report-local-${process.pid}`,
    executorVersion: QUALITY_REPORT_RULE_VERSION,
    acceptedTypes: [QUALITY_REPORT_JOB_TYPE],
    leaseDurationMs: 120_000,
  });
  if (!claimed?.currentLeaseId) return null;
  const leaseId = claimed.currentLeaseId;
  const storage = getStorageService();
  let docxKey: string | null = null;
  let workbookKey: string | null = null;
  try {
    await prisma.courseQualityReport.update({
      where: { id: reportId },
      data: {
        status: QualityReportStatus.PROCESSING,
        startedAt: new Date(),
        errorCode: null,
      },
    });
    const source = qualityReportSourceSnapshotSchema.parse(
      report.sourceSnapshotJson,
    );
    const statistics = calculateQualityReportStatistics(source);
    const narrative = buildDeterministicNarrative(source, statistics);
    await heartbeatBackgroundJob(report.backgroundJobId, {
      leaseId,
      progress: 40,
      leaseDurationMs: 120_000,
    });
    const [docx, workbook] = await Promise.all([
      buildQualityReportDocx(source, statistics, narrative),
      Promise.resolve(buildQualityReportWorkbook(source)),
    ]);
    docxKey = `quality-reports/${report.courseId}/outputs/${report.id}.docx`;
    workbookKey = `quality-reports/${report.courseId}/outputs/${report.id}.xlsx`;
    await storage.save(docxKey, docx);
    await storage.save(workbookKey, workbook);
    await heartbeatBackgroundJob(report.backgroundJobId, {
      leaseId,
      progress: 90,
      leaseDurationMs: 120_000,
    });
    await completeBackgroundJob(
      report.backgroundJobId,
      {
        leaseId,
        result: { reportId },
        resourceUsage: {
          docxBytes: docx.length,
          workbookBytes: workbook.length,
        },
      },
      async (transaction) => {
        const updated = await transaction.courseQualityReport.update({
          where: { id: reportId },
          data: {
            status: QualityReportStatus.SUCCEEDED,
            statisticsSnapshotJson: json(statistics),
            narrativeSnapshotJson: json(narrative),
            aiStatus: "FALLBACK",
            docxStorageKey: docxKey,
            docxFileName: `${source.course.name}-教学质量分析报告-v${report.versionNumber}.docx`,
            docxSizeBytes: docx.length,
            docxChecksumSha256: sha256(docx),
            workbookStorageKey: workbookKey,
            workbookFileName: `${source.course.name}-成绩计算-v${report.versionNumber}.xlsx`,
            workbookSizeBytes: workbook.length,
            workbookChecksumSha256: sha256(workbook),
            completedAt: new Date(),
          },
        });
        await writeGovernanceAuditLog(transaction, {
          actorId: report.requestedById,
          action: AuditAction.QUALITY_REPORT_GENERATED,
          targetType: AuditTargetType.QUALITY_REPORT,
          targetId: reportId,
          summary: `完成课程教学质量分析报告 v${report.versionNumber}`,
          beforeData: { status: QualityReportStatus.PROCESSING },
          afterData: {
            status: QualityReportStatus.SUCCEEDED,
            docxBytes: docx.length,
            workbookBytes: workbook.length,
          },
          context,
        });
        return updated;
      },
    );
    return prisma.courseQualityReport.findUnique({
      where: { id: reportId },
      include: { backgroundJob: true },
    });
  } catch (error) {
    if (docxKey) await storage.delete(docxKey);
    if (workbookKey) await storage.delete(workbookKey);
    await failBackgroundJob(
      report.backgroundJobId,
      {
        leaseId,
        errorCode: "QUALITY_REPORT_GENERATION_FAILED",
        retryable: true,
        resourceUsage: {},
      },
      async (transaction, _job, willRetry) =>
        transaction.courseQualityReport.update({
          where: { id: reportId },
          data: {
            status: willRetry
              ? QualityReportStatus.QUEUED
              : QualityReportStatus.FAILED,
            errorCode: "QUALITY_REPORT_GENERATION_FAILED",
            completedAt: willRetry ? null : new Date(),
          },
        }),
    );
    throw error;
  }
}

export async function getTeacherQualityReports(
  teacherId: string,
  courseId: string,
) {
  await ownedCourse(teacherId, courseId);
  const [gradebooks, reports] = await Promise.all([
    prisma.courseGradebook.findMany({
      where: { courseId, course: { teacherId } },
      include: {
        classroom: { select: { id: true, name: true } },
        currentPublication: {
          select: { id: true, versionNumber: true, publishedAt: true },
        },
        outcomeAttainmentRuns: {
          orderBy: { versionNumber: "desc" },
          select: {
            id: true,
            versionNumber: true,
            gradebookPublicationId: true,
            calculatedAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.courseQualityReport.findMany({
      where: { courseId },
      orderBy: { versionNumber: "desc" },
      include: {
        backgroundJob: {
          select: { status: true, progress: true, errorCode: true },
        },
      },
    }),
  ]);
  return { gradebooks, reports };
}

export async function downloadTeacherQualityReport(
  teacherId: string,
  courseId: string,
  reportId: string,
  artifact: "docx" | "xlsx",
  context: AuditRequestContext,
) {
  const report = await prisma.courseQualityReport.findFirst({
    where: { id: reportId, courseId, course: { teacherId } },
  });
  if (!report || report.status !== QualityReportStatus.SUCCEEDED)
    throw new ResourceNotFoundError("报告文件不存在。");
  const storageKey =
    artifact === "docx" ? report.docxStorageKey : report.workbookStorageKey;
  const fileName =
    artifact === "docx" ? report.docxFileName : report.workbookFileName;
  if (!storageKey || !fileName)
    throw new ResourceNotFoundError("报告文件不存在。");
  const data = await getStorageService().read(storageKey);
  await prisma.$transaction((transaction) =>
    writeGovernanceAuditLog(transaction, {
      actorId: teacherId,
      action: AuditAction.QUALITY_REPORT_DOWNLOADED,
      targetType: AuditTargetType.QUALITY_REPORT,
      targetId: reportId,
      summary: `下载课程教学质量报告${artifact === "docx" ? " DOCX" : "成绩工作簿"}`,
      beforeData: null,
      afterData: { artifact, versionNumber: report.versionNumber },
      context,
    }),
  );
  return { data, fileName };
}
