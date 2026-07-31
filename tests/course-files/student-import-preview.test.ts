import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import {
  AuditAction,
  AuditTargetType,
  ClassroomStatus,
  CourseFileKind,
  MembershipStatus,
  PrismaClient,
  Role,
  StudentImportBatchStatus,
  StudentImportPreviewStatus,
} from "@prisma/client";

import {
  STUDENT_ROSTER_FILE_KEY,
  STUDENT_ROSTER_TITLE,
} from "@/services/course-files/config";
import {
  getTeacherStudentImportPreview,
  previewTeacherStudentImportFromFile,
} from "@/services/student-imports/service";
import { studentImportPreviewRequestSchema } from "@/services/student-imports/schemas";
import type { StorageService } from "@/services/storage/types";
import {
  buildCsvFixture,
  buildXlsxFixture,
  officialStudentRosterHeaders,
} from "../helpers/student-import-fixtures";

const prisma = new PrismaClient();
const auditContext = {
  ipAddress: "127.0.0.1",
  userAgent: "student-import-preview-test",
};

process.on("exit", () => {
  void prisma.$disconnect();
});

class MemoryStorage implements StorageService {
  readonly files = new Map<string, Buffer>();

  async save(storageKey: string, data: Buffer): Promise<void> {
    this.files.set(storageKey, data);
  }

  async read(storageKey: string): Promise<Buffer> {
    const data = this.files.get(storageKey);
    if (!data) throw new Error("missing test file");
    return data;
  }

  async delete(storageKey: string): Promise<void> {
    this.files.delete(storageKey);
  }
}

interface ImportTestContext {
  teacherId: string;
  teacherTwoId: string;
  courseId: string;
  classroomId: string;
  courseNo: string;
  storage: MemoryStorage;
  courseIds: string[];
  classroomIds: string[];
  fileIds: string[];
  batchIds: string[];
  userIds: string[];
}

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function uniqueSuffix(): string {
  return randomBytes(5).toString("hex").toUpperCase();
}

function previewInput(input: {
  classroomId: string;
  sheetName?: string;
  headerRowNumber?: number;
  fieldMappings?: Record<string, number>;
  confirmMapping?: boolean;
  page?: number;
  pageSize?: number;
}) {
  return studentImportPreviewRequestSchema.parse({
    page: 1,
    pageSize: 25,
    ...input,
  });
}

async function createImportContext(): Promise<ImportTestContext> {
  const suffix = uniqueSuffix();
  const [teacher, teacherTwo, template] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { email: "teacher@example.com" },
      select: { id: true },
    }),
    prisma.user.findUniqueOrThrow({
      where: { email: "teacher2@example.com" },
      select: { id: true },
    }),
    prisma.courseTemplate.findFirstOrThrow({
      where: { code: "python-programming-v1" },
      select: { id: true },
    }),
  ]);
  const courseNo = `SIP-${suffix}`;
  const course = await prisma.course.create({
    data: {
      templateId: template.id,
      teacherId: teacher.id,
      courseNo,
      term: "2026-2027-1",
      name: `学生导入预览测试 ${suffix}`,
      description: "用于学生名单导入预览测试",
    },
    select: { id: true },
  });
  const classroom = await prisma.classroom.create({
    data: {
      teacherId: teacher.id,
      courseId: course.id,
      joinCode: `SIP${suffix}`,
      name: "学生导入预览班级",
      description: "用于学生名单导入预览测试",
      status: ClassroomStatus.ACTIVE,
      allowStudentLeave: true,
    },
    select: { id: true },
  });

  return {
    teacherId: teacher.id,
    teacherTwoId: teacherTwo.id,
    courseId: course.id,
    classroomId: classroom.id,
    courseNo,
    storage: new MemoryStorage(),
    courseIds: [course.id],
    classroomIds: [classroom.id],
    fileIds: [],
    batchIds: [],
    userIds: [],
  };
}

async function createRosterFile(
  context: ImportTestContext,
  input: {
    data: Buffer;
    format: "csv" | "xls" | "xlsx";
    fileName?: string;
    versionNumber?: number;
  },
) {
  const mimeTypes = {
    csv: "text/csv",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  } as const;
  const storageKey = `student-import-tests/${randomBytes(12).toString("hex")}.${
    input.format
  }`;
  await context.storage.save(storageKey, input.data);
  const file = await prisma.courseFileVersion.create({
    data: {
      courseId: context.courseId,
      uploadedById: context.teacherId,
      fileKind: CourseFileKind.IMPORT_SOURCE,
      fileKey: STUDENT_ROSTER_FILE_KEY,
      title: STUDENT_ROSTER_TITLE,
      versionNumber: input.versionNumber ?? 1,
      originalFileName: input.fileName ?? `students.${input.format}`,
      storageKey,
      mimeType: mimeTypes[input.format],
      sizeBytes: input.data.length,
      checksumSha256: sha256(input.data),
      metadata: {
        detectedFormat: input.format,
        parsedRowCount: null,
      },
    },
    select: { id: true },
  });
  context.fileIds.push(file.id);
  return file;
}

async function createUserWithProfile(
  context: ImportTestContext,
  input: {
    role: Role;
    email: string;
    displayName: string;
    studentNo?: string;
  },
) {
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash: "student-import-preview-test",
      role: input.role,
      profile: {
        create: {
          displayName: input.displayName,
          studentNo: input.studentNo,
        },
      },
    },
    select: { id: true },
  });
  context.userIds.push(user.id);
  return user;
}

async function cleanup(context: ImportTestContext): Promise<void> {
  if (context.batchIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: {
        targetId: { in: context.batchIds },
        targetType: AuditTargetType.STUDENT_IMPORT_BATCH,
      },
    });
    await prisma.studentImportRow.deleteMany({
      where: { batchId: { in: context.batchIds } },
    });
    await prisma.studentImportBatch.deleteMany({
      where: { id: { in: context.batchIds } },
    });
  }
  if (context.fileIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { targetId: { in: context.fileIds } },
    });
    await prisma.courseFileVersion.deleteMany({
      where: { id: { in: context.fileIds } },
    });
  }
  if (context.classroomIds.length > 0) {
    await prisma.classMembership.deleteMany({
      where: { classroomId: { in: context.classroomIds } },
    });
    await prisma.auditLog.deleteMany({
      where: { targetId: { in: context.classroomIds } },
    });
    await prisma.classroom.deleteMany({
      where: { id: { in: context.classroomIds } },
    });
  }
  if (context.courseIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { targetId: { in: context.courseIds } },
    });
    await prisma.course.deleteMany({
      where: { id: { in: context.courseIds } },
    });
  }
  if (context.userIds.length > 0) {
    await prisma.userProfile.deleteMany({
      where: { userId: { in: context.userIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: context.userIds } },
    });
  }
}

function rowIssueCodes(
  preview: Awaited<ReturnType<typeof previewTeacherStudentImportFromFile>>,
  rowNumber: number,
): string[] {
  return (
    preview.rows
      .find((row) => row.rowNumber === rowNumber)
      ?.issues.map((issue) => issue.code) ?? []
  );
}

test("学生名单预览只写入导入暂存区并生成分页错误清单", async () => {
  const context = await createImportContext();
  try {
    const suffix = uniqueSuffix().toLowerCase();
    const existingStudent = await createUserWithProfile(context, {
      role: Role.STUDENT,
      email: `existing-${suffix}@example.test`,
      displayName: "已注册学生",
      studentNo: "20260030",
    });
    const enrolledStudent = await createUserWithProfile(context, {
      role: Role.STUDENT,
      email: `enrolled-${suffix}@example.test`,
      displayName: "已入班学生",
      studentNo: "20260031",
    });
    await prisma.classMembership.create({
      data: {
        classroomId: context.classroomId,
        studentId: enrolledStudent.id,
        status: MembershipStatus.ACTIVE,
      },
    });
    const conflictUser = await createUserWithProfile(context, {
      role: Role.STUDENT,
      email: `conflict-${suffix}@example.test`,
      displayName: "邮箱冲突账号",
    });
    const roleConflictUser = await createUserWithProfile(context, {
      role: Role.TEACHER,
      email: `role-conflict-${suffix}@example.test`,
      displayName: "非学生账号",
      studentNo: "20260032",
    });
    assert.ok(existingStudent.id);
    assert.ok(conflictUser.id);
    assert.ok(roleConflictUser.id);

    const headers = [
      "学年学期(文本)",
      "课程号(文本)",
      "学号(文本)",
      "姓名(文本)",
      "班级(文本)",
      "邮箱",
      "联系方式",
      "备注",
    ];
    const data = buildCsvFixture({
      headers,
      rows: [
        [
          "2026-2027-1",
          context.courseNo,
          "20260010",
          "学生甲",
          "软件1班",
          `new-${suffix}@example.test`,
          "+8613800138000",
          "",
        ],
        [
          "2026-2027-1",
          context.courseNo,
          "20260030",
          "学生乙",
          "软件1班",
          "",
          "",
          "",
        ],
        [
          "2026-2027-1",
          context.courseNo,
          "20260031",
          "学生丙",
          "软件1班",
          "",
          "",
          "",
        ],
        ["2025-2026-2", "OTHER", "20260011", "学生丁", "软件1班", "", "", ""],
        ["", "", "", "", "", "", "", ""],
        ["2026-2027-1", context.courseNo, "", "", "软件1班", "", "", ""],
        [
          "2026-2027-1",
          context.courseNo,
          "20260012",
          "学生戊",
          "软件1班",
          "",
          "",
          "",
        ],
        [
          "2026-2027-1",
          context.courseNo,
          "20260012",
          "学生己",
          "软件1班",
          "",
          "",
          "",
        ],
        [
          "2026-2027-1",
          context.courseNo,
          "20260013",
          "学生庚",
          "软件1班",
          "bad@",
          "12",
          "x".repeat(501),
        ],
        [
          "2026-2027-1",
          context.courseNo,
          "20260014",
          "学生辛",
          "软件1班",
          `conflict-${suffix}@example.test`,
          "",
          "",
        ],
        [
          "2026-2027-1",
          context.courseNo,
          "20260032",
          "学生壬",
          "软件1班",
          "",
          "",
          "",
        ],
      ],
    });
    const file = await createRosterFile(context, { data, format: "csv" });

    const userCountBefore = await prisma.user.count();
    const profileCountBefore = await prisma.userProfile.count();
    const membershipCountBefore = await prisma.classMembership.count({
      where: { classroomId: context.classroomId },
    });
    const preview = await previewTeacherStudentImportFromFile(
      context.teacherId,
      file.id,
      previewInput({
        classroomId: context.classroomId,
        confirmMapping: true,
        pageSize: 20,
      }),
      auditContext,
      { storage: context.storage },
    );
    context.batchIds.push(preview.batch.id);

    assert.equal(preview.batch.status, StudentImportBatchStatus.PREVIEW_READY);
    assert.equal(preview.batch.summary.totalRows, 11);
    assert.equal(preview.batch.summary.validRows, 4);
    assert.equal(preview.batch.summary.emptyRows, 1);
    assert.equal(preview.batch.summary.duplicateRows, 2);
    assert.equal(preview.batch.summary.invalidRows, 4);
    assert.equal(preview.batch.summary.canImport, false);
    assert.equal(preview.pagination.totalRows, 11);
    assert.equal(preview.rows.length, 11);
    assert.equal(
      preview.batch.mappingConfig.fieldMappings.some(
        (mapping) =>
          mapping.field === "email" && mapping.sourceColumnIndex === 5,
      ),
      true,
    );

    assert.equal(
      preview.rows[0]?.previewStatus,
      StudentImportPreviewStatus.NEW_USER,
    );
    assert.equal(
      preview.rows[1]?.previewStatus,
      StudentImportPreviewStatus.EXISTING_USER,
    );
    assert.equal(
      preview.rows[2]?.previewStatus,
      StudentImportPreviewStatus.ALREADY_ENROLLED,
    );
    assert.equal(
      preview.rows[3]?.previewStatus,
      StudentImportPreviewStatus.COURSE_MISMATCH,
    );
    assert.equal(
      preview.rows[4]?.previewStatus,
      StudentImportPreviewStatus.PENDING,
    );
    assert.equal(
      preview.rows[6]?.previewStatus,
      StudentImportPreviewStatus.DUPLICATE,
    );

    assert.equal(rowIssueCodes(preview, 6).includes("EMPTY_ROW"), true);
    assert.equal(
      rowIssueCodes(preview, 7).includes("MISSING_REQUIRED_FIELD"),
      true,
    );
    assert.equal(
      rowIssueCodes(preview, 8).includes("DUPLICATE_STUDENT_NO_IN_FILE"),
      true,
    );
    assert.equal(rowIssueCodes(preview, 10).includes("INVALID_EMAIL"), true);
    assert.equal(rowIssueCodes(preview, 10).includes("INVALID_PHONE"), true);
    assert.equal(rowIssueCodes(preview, 10).includes("FIELD_TOO_LONG"), true);
    assert.equal(
      rowIssueCodes(preview, 11).includes("EMAIL_ACCOUNT_CONFLICT"),
      true,
    );
    assert.equal(
      rowIssueCodes(preview, 12).includes("STUDENT_NO_ACCOUNT_ROLE_CONFLICT"),
      true,
    );

    assert.equal(await prisma.user.count(), userCountBefore);
    assert.equal(await prisma.userProfile.count(), profileCountBefore);
    assert.equal(
      await prisma.classMembership.count({
        where: { classroomId: context.classroomId },
      }),
      membershipCountBefore,
    );

    const auditCount = await prisma.auditLog.count({
      where: {
        targetId: preview.batch.id,
        targetType: AuditTargetType.STUDENT_IMPORT_BATCH,
        action: AuditAction.STUDENT_IMPORT_PREVIEWED,
      },
    });
    assert.equal(auditCount, 1);
  } finally {
    await cleanup(context);
  }
});

test("无错误预览可以确认字段映射，旧批次按文件和映射保持隔离", async () => {
  const context = await createImportContext();
  try {
    const firstData = buildCsvFixture({
      rows: [
        [
          "2026-2027-1",
          context.courseNo,
          "000000000000000101",
          "学生甲",
          "软件1班",
          "",
          "",
          "",
          "",
          "",
        ],
      ],
    });
    const firstFile = await createRosterFile(context, {
      data: firstData,
      format: "csv",
      versionNumber: 1,
    });
    const firstPreview = await previewTeacherStudentImportFromFile(
      context.teacherId,
      firstFile.id,
      previewInput({
        classroomId: context.classroomId,
        confirmMapping: true,
      }),
      auditContext,
      { storage: context.storage },
    );
    context.batchIds.push(firstPreview.batch.id);
    assert.equal(firstPreview.batch.status, StudentImportBatchStatus.CONFIRMED);
    assert.ok(firstPreview.batch.confirmedAt);
    assert.equal(firstPreview.batch.mappingConfig.confirmedAt !== null, true);
    assert.equal(firstPreview.batch.summary.canImport, true);

    const samePreview = await previewTeacherStudentImportFromFile(
      context.teacherId,
      firstFile.id,
      previewInput({
        classroomId: context.classroomId,
        confirmMapping: true,
      }),
      auditContext,
      { storage: context.storage },
    );
    assert.equal(samePreview.batch.id, firstPreview.batch.id);
    assert.equal(
      await prisma.studentImportRow.count({
        where: { batchId: firstPreview.batch.id },
      }),
      1,
    );

    const remappedPreview = await previewTeacherStudentImportFromFile(
      context.teacherId,
      firstFile.id,
      previewInput({
        classroomId: context.classroomId,
        fieldMappings: {
          academicTerm: 0,
          courseNo: 1,
          studentNo: 2,
          studentName: 9,
          className: 4,
        },
      }),
      auditContext,
      { storage: context.storage },
    );
    context.batchIds.push(remappedPreview.batch.id);
    assert.notEqual(remappedPreview.batch.id, firstPreview.batch.id);
    assert.notEqual(
      remappedPreview.batch.mappingConfig.mappingHash,
      firstPreview.batch.mappingConfig.mappingHash,
    );

    const secondData = buildCsvFixture({
      rows: [
        [
          "2026-2027-1",
          context.courseNo,
          "000000000000000102",
          "学生乙",
          "软件1班",
          "",
          "",
          "",
          "",
          "",
        ],
      ],
    });
    const secondFile = await createRosterFile(context, {
      data: secondData,
      format: "csv",
      versionNumber: 2,
      fileName: "students-v2.csv",
    });
    const secondPreview = await previewTeacherStudentImportFromFile(
      context.teacherId,
      secondFile.id,
      previewInput({
        classroomId: context.classroomId,
        confirmMapping: true,
      }),
      auditContext,
      { storage: context.storage },
    );
    context.batchIds.push(secondPreview.batch.id);
    assert.notEqual(secondPreview.batch.id, firstPreview.batch.id);
    assert.notEqual(
      secondPreview.batch.mappingConfig.contentHash,
      firstPreview.batch.mappingConfig.contentHash,
    );
    assert.equal(secondPreview.batch.sourceFileVersionId, secondFile.id);
  } finally {
    await cleanup(context);
  }
});

test("表头合并、隐藏工作表和公式单元格会阻断确认", async () => {
  const context = await createImportContext();
  try {
    const formulaData = buildXlsxFixture([
      {
        name: "Roster",
        headers: officialStudentRosterHeaders,
        rows: [
          [
            "2026-2027-1",
            context.courseNo,
            "000000000000000201",
            "学生甲",
            "软件1班",
            "",
            "",
            "",
            "",
            "",
          ],
        ],
        mergedRanges: ["A1:B1"],
        formulaCells: [
          {
            rowNumber: 2,
            columnIndex: 2,
            formula: "1+1",
            value: "2",
          },
        ],
      },
    ]);
    const formulaFile = await createRosterFile(context, {
      data: formulaData,
      format: "xlsx",
      fileName: "formula.xlsx",
    });
    const preview = await previewTeacherStudentImportFromFile(
      context.teacherId,
      formulaFile.id,
      previewInput({
        classroomId: context.classroomId,
        confirmMapping: true,
      }),
      auditContext,
      { storage: context.storage },
    );
    context.batchIds.push(preview.batch.id);

    assert.equal(preview.batch.status, StudentImportBatchStatus.PREVIEW_READY);
    assert.equal(preview.batch.summary.canImport, false);
    assert.equal(
      preview.batch.batchIssues.some(
        (issue) => issue.code === "MERGED_HEADER_ROW",
      ),
      true,
    );
    assert.equal(rowIssueCodes(preview, 2).includes("FORMULA_CELL"), true);

    const hiddenData = buildXlsxFixture([
      {
        name: "HiddenRoster",
        headers: officialStudentRosterHeaders,
        rows: [],
        hidden: true,
      },
    ]);
    const hiddenFile = await createRosterFile(context, {
      data: hiddenData,
      format: "xlsx",
      fileName: "hidden.xlsx",
      versionNumber: 2,
    });
    await assert.rejects(
      () =>
        previewTeacherStudentImportFromFile(
          context.teacherId,
          hiddenFile.id,
          previewInput({
            classroomId: context.classroomId,
            sheetName: "HiddenRoster",
          }),
          auditContext,
          { storage: context.storage },
        ),
      /隐藏工作表/u,
    );
  } finally {
    await cleanup(context);
  }
});

test("教师只能读取自己课程下的导入预览", async () => {
  const context = await createImportContext();
  try {
    const data = buildCsvFixture({
      rows: [
        [
          "2026-2027-1",
          context.courseNo,
          "000000000000000301",
          "学生甲",
          "软件1班",
          "",
          "",
          "",
          "",
          "",
        ],
      ],
    });
    const file = await createRosterFile(context, { data, format: "csv" });
    const preview = await previewTeacherStudentImportFromFile(
      context.teacherId,
      file.id,
      previewInput({
        classroomId: context.classroomId,
      }),
      auditContext,
      { storage: context.storage },
    );
    context.batchIds.push(preview.batch.id);

    const fetched = await getTeacherStudentImportPreview(
      context.teacherId,
      preview.batch.id,
      1,
      1,
    );
    assert.equal(fetched.batch.id, preview.batch.id);
    assert.equal(fetched.rows.length, 1);

    await assert.rejects(
      () =>
        getTeacherStudentImportPreview(
          context.teacherTwoId,
          preview.batch.id,
          1,
          10,
        ),
      /导入批次不存在/u,
    );
    await assert.rejects(
      () =>
        previewTeacherStudentImportFromFile(
          context.teacherTwoId,
          file.id,
          previewInput({
            classroomId: context.classroomId,
          }),
          auditContext,
          { storage: context.storage },
        ),
      /学生名单文件不存在/u,
    );
  } finally {
    await cleanup(context);
  }
});
