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
} from "@prisma/client";

import {
  STUDENT_ROSTER_FILE_KEY,
  STUDENT_ROSTER_TITLE,
} from "@/services/course-files/config";
import {
  executeAdminStudentImportBatch,
  executeTeacherStudentImportBatch,
  previewTeacherStudentImportFromFile,
} from "@/services/student-imports/service";
import { studentImportPreviewRequestSchema } from "@/services/student-imports/schemas";
import type { StorageService } from "@/services/storage/types";
import {
  buildCsvFixture,
  officialStudentRosterHeaders,
} from "../helpers/student-import-fixtures";

const prisma = new PrismaClient();
const auditContext = {
  ipAddress: "127.0.0.1",
  userAgent: "student-import-execution-test",
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

interface ImportExecutionContext {
  adminId: string;
  teacherId: string;
  teacherTwoId: string;
  courseId: string;
  classroomId: string;
  courseNo: string;
  studentNoPrefix: string;
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
  confirmMapping?: boolean;
  fieldMappings?: Record<string, number>;
}) {
  return studentImportPreviewRequestSchema.parse({
    classroomId: input.classroomId,
    confirmMapping: input.confirmMapping ?? true,
    fieldMappings: input.fieldMappings,
    page: 1,
    pageSize: 100,
  });
}

async function createImportContext(): Promise<ImportExecutionContext> {
  const suffix = uniqueSuffix();
  const [admin, teacher, teacherTwo, template] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { email: "admin@example.com" },
      select: { id: true },
    }),
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
  const courseNo = `SIE-${suffix}`;
  const course = await prisma.course.create({
    data: {
      templateId: template.id,
      teacherId: teacher.id,
      courseNo,
      term: "2026-2027-1",
      name: `学生正式导入测试 ${suffix}`,
      description: "用于学生名单正式导入测试",
    },
    select: { id: true },
  });
  const classroom = await prisma.classroom.create({
    data: {
      teacherId: teacher.id,
      courseId: course.id,
      joinCode: `SIE${suffix}`,
      name: "学生正式导入班级",
      description: "用于学生名单正式导入测试",
      status: ClassroomStatus.ACTIVE,
      allowStudentLeave: true,
    },
    select: { id: true },
  });

  return {
    adminId: admin.id,
    teacherId: teacher.id,
    teacherTwoId: teacherTwo.id,
    courseId: course.id,
    classroomId: classroom.id,
    courseNo,
    studentNoPrefix: `98${suffix}`,
    storage: new MemoryStorage(),
    courseIds: [course.id],
    classroomIds: [classroom.id],
    fileIds: [],
    batchIds: [],
    userIds: [],
  };
}

async function createRosterFile(context: ImportExecutionContext, data: Buffer) {
  const storageKey = `student-import-execution-tests/${randomBytes(12).toString(
    "hex",
  )}.csv`;
  await context.storage.save(storageKey, data);
  const file = await prisma.courseFileVersion.create({
    data: {
      courseId: context.courseId,
      uploadedById: context.teacherId,
      fileKind: CourseFileKind.IMPORT_SOURCE,
      fileKey: STUDENT_ROSTER_FILE_KEY,
      title: STUDENT_ROSTER_TITLE,
      versionNumber: context.fileIds.length + 1,
      originalFileName: "students.csv",
      storageKey,
      mimeType: "text/csv",
      sizeBytes: data.length,
      checksumSha256: sha256(data),
      metadata: { detectedFormat: "csv", parsedRowCount: null },
    },
    select: { id: true },
  });
  context.fileIds.push(file.id);
  return file;
}

async function createUserWithProfile(
  context: ImportExecutionContext,
  input: {
    role: Role;
    email?: string | null;
    displayName: string;
    studentNo?: string;
    passwordHash?: string;
    mustChangePassword?: boolean;
  },
) {
  const user = await prisma.user.create({
    data: {
      email: input.email ?? null,
      passwordHash: input.passwordHash ?? "student-import-execution-test",
      role: input.role,
      mustChangePassword: input.mustChangePassword ?? false,
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

async function createConfirmedBatch(
  context: ImportExecutionContext,
  rows: readonly string[][],
  headers: readonly string[] = officialStudentRosterHeaders,
  fieldMappings?: Record<string, number>,
) {
  const data = buildCsvFixture({ headers, rows });
  const file = await createRosterFile(context, data);
  const preview = await previewTeacherStudentImportFromFile(
    context.teacherId,
    file.id,
    previewInput({
      classroomId: context.classroomId,
      confirmMapping: true,
      fieldMappings,
    }),
    auditContext,
    { storage: context.storage },
  );
  context.batchIds.push(preview.batch.id);
  return { preview, data };
}

async function importedUserIdsByPrefix(prefix: string): Promise<string[]> {
  const profiles = await prisma.userProfile.findMany({
    where: { studentNo: { startsWith: prefix } },
    select: { userId: true },
  });
  return profiles.map((profile) => profile.userId);
}

async function cleanup(context: ImportExecutionContext): Promise<void> {
  const prefixedUserIds = await importedUserIdsByPrefix(
    context.studentNoPrefix,
  );
  const userIds = [...new Set([...context.userIds, ...prefixedUserIds])];

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
  if (userIds.length > 0) {
    await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userProfile.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

function rosterRow(
  context: ImportExecutionContext,
  studentNoSuffix: string,
  name: string,
): string[] {
  return [
    "2026-2027-1",
    context.courseNo,
    `${context.studentNoPrefix}${studentNoSuffix}`,
    name,
    "软件1班",
    "",
    "",
    "",
    "",
    "",
  ];
}

test("正式导入创建账号、匹配账号、跳过已入班并保持审计脱敏", async () => {
  const context = await createImportContext();
  try {
    const existingPasswordHash = "existing-password-hash";
    const existing = await createUserWithProfile(context, {
      role: Role.STUDENT,
      email: `existing-${context.studentNoPrefix}@example.test`,
      displayName: "原姓名",
      studentNo: `${context.studentNoPrefix}002`,
      passwordHash: existingPasswordHash,
      mustChangePassword: false,
    });
    const enrolled = await createUserWithProfile(context, {
      role: Role.STUDENT,
      email: `enrolled-${context.studentNoPrefix}@example.test`,
      displayName: "已入班原姓名",
      studentNo: `${context.studentNoPrefix}003`,
      passwordHash: "enrolled-password-hash",
      mustChangePassword: false,
    });
    await prisma.classMembership.create({
      data: {
        classroomId: context.classroomId,
        studentId: enrolled.id,
        status: MembershipStatus.ACTIVE,
      },
    });

    const { preview, data } = await createConfirmedBatch(context, [
      rosterRow(context, "001", "新建学生"),
      rosterRow(context, "002", "名单姓名不覆盖"),
      rosterRow(context, "003", "已入班学生"),
      ["", "", "", "", "", "", "", "", "", ""],
    ]);
    assert.equal(preview.batch.status, StudentImportBatchStatus.CONFIRMED);

    const result = await executeTeacherStudentImportBatch(
      context.teacherId,
      preview.batch.id,
      auditContext,
      { passwordGenerator: () => "ImportPass123A" },
    );
    assert.equal(result.status, StudentImportBatchStatus.SUCCEEDED);
    assert.deepEqual(result.summary, {
      totalRows: 4,
      createdUserRows: 1,
      matchedExistingUserRows: 1,
      alreadyEnrolledRows: 1,
      skippedRows: 1,
      failedRows: 0,
      importedRows: 2,
    });

    const newUser = await prisma.user.findFirstOrThrow({
      where: { profile: { studentNo: `${context.studentNoPrefix}001` } },
      include: { profile: true },
    });
    assert.equal(newUser.role, Role.STUDENT);
    assert.equal(newUser.email, null);
    assert.equal(newUser.mustChangePassword, true);
    assert.equal(newUser.passwordHash.includes("ImportPass123A"), false);
    assert.equal(newUser.profile?.displayName, "新建学生");

    const existingAfter = await prisma.user.findUniqueOrThrow({
      where: { id: existing.id },
      include: { profile: true },
    });
    assert.equal(existingAfter.passwordHash, existingPasswordHash);
    assert.equal(existingAfter.mustChangePassword, false);
    assert.equal(existingAfter.profile?.displayName, "原姓名");

    assert.equal(
      await prisma.classMembership.count({
        where: {
          classroomId: context.classroomId,
          status: MembershipStatus.ACTIVE,
        },
      }),
      3,
    );

    const repeat = await executeTeacherStudentImportBatch(
      context.teacherId,
      preview.batch.id,
      auditContext,
    );
    assert.deepEqual(repeat.summary, result.summary);
    assert.equal(
      await prisma.auditLog.count({
        where: {
          targetId: preview.batch.id,
          action: AuditAction.STUDENT_IMPORT_EXECUTED,
        },
      }),
      1,
    );

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        targetId: preview.batch.id,
        action: AuditAction.STUDENT_IMPORT_EXECUTED,
      },
      select: { afterData: true },
    });
    const auditJson = JSON.stringify(audit.afterData);
    assert.equal(auditJson.includes("ImportPass123A"), false);
    assert.equal(auditJson.includes("新建学生"), false);
    assert.equal(auditJson.includes(`${context.studentNoPrefix}001`), false);

    const secondFile = await createRosterFile(context, data);
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
    const secondResult = await executeTeacherStudentImportBatch(
      context.teacherId,
      secondPreview.batch.id,
      auditContext,
    );
    assert.equal(secondResult.summary.createdUserRows, 0);
    assert.equal(secondResult.summary.matchedExistingUserRows, 0);
    assert.equal(secondResult.summary.alreadyEnrolledRows, 3);
    assert.equal(secondResult.summary.skippedRows, 1);
  } finally {
    await cleanup(context);
  }
});

test("同一批次并发执行只产生一次正式写入", async () => {
  const context = await createImportContext();
  try {
    const { preview } = await createConfirmedBatch(context, [
      rosterRow(context, "101", "并发学生"),
    ]);

    const [left, right] = await Promise.all([
      executeTeacherStudentImportBatch(
        context.teacherId,
        preview.batch.id,
        auditContext,
      ),
      executeTeacherStudentImportBatch(
        context.teacherId,
        preview.batch.id,
        auditContext,
      ),
    ]);

    assert.equal(left.status, StudentImportBatchStatus.SUCCEEDED);
    assert.equal(right.status, StudentImportBatchStatus.SUCCEEDED);
    assert.equal(
      await prisma.userProfile.count({
        where: { studentNo: `${context.studentNoPrefix}101` },
      }),
      1,
    );
    assert.equal(
      await prisma.classMembership.count({
        where: { classroomId: context.classroomId },
      }),
      1,
    );
    assert.equal(
      await prisma.auditLog.count({
        where: {
          targetId: preview.batch.id,
          action: AuditAction.STUDENT_IMPORT_EXECUTED,
        },
      }),
      1,
    );
  } finally {
    await cleanup(context);
  }
});

test("正式导入重新校验标识与角色冲突并回滚整个批次", async () => {
  const context = await createImportContext();
  try {
    const { preview } = await createConfirmedBatch(context, [
      rosterRow(context, "201", "应回滚学生"),
      rosterRow(context, "202", "角色冲突学生"),
    ]);
    await createUserWithProfile(context, {
      role: Role.TEACHER,
      email: `role-conflict-${context.studentNoPrefix}@example.test`,
      displayName: "教师冲突账号",
      studentNo: `${context.studentNoPrefix}202`,
    });

    await assert.rejects(
      () =>
        executeTeacherStudentImportBatch(
          context.teacherId,
          preview.batch.id,
          auditContext,
        ),
      /非学生账号/u,
    );

    assert.equal(
      await prisma.userProfile.count({
        where: { studentNo: `${context.studentNoPrefix}201` },
      }),
      0,
    );
    assert.equal(
      await prisma.classMembership.count({
        where: { classroomId: context.classroomId },
      }),
      0,
    );
    const failedBatch = await prisma.studentImportBatch.findUniqueOrThrow({
      where: { id: preview.batch.id },
      select: { status: true, failedRows: true },
    });
    assert.equal(failedBatch.status, StudentImportBatchStatus.FAILED);
    assert.equal(failedBatch.failedRows, 1);
    assert.equal(
      await prisma.auditLog.count({
        where: {
          targetId: preview.batch.id,
          action: AuditAction.STUDENT_IMPORT_FAILED,
        },
      }),
      1,
    );
  } finally {
    await cleanup(context);
  }
});

test("正式导入阻断执行期邮箱标识冲突", async () => {
  const context = await createImportContext();
  try {
    const headers = [
      "学年学期(文本)",
      "课程号(文本)",
      "学号(文本)",
      "姓名(文本)",
      "班级(文本)",
      "邮箱",
    ];
    const conflictEmail = `email-conflict-${context.studentNoPrefix}@example.test`;
    const { preview } = await createConfirmedBatch(
      context,
      [
        [
          "2026-2027-1",
          context.courseNo,
          `${context.studentNoPrefix}301`,
          "邮箱冲突学生",
          "软件1班",
          conflictEmail,
        ],
      ],
      headers,
      {
        academicTerm: 0,
        courseNo: 1,
        studentNo: 2,
        studentName: 3,
        className: 4,
        email: 5,
      },
    );
    assert.equal(
      preview.batch.mappingConfig.fieldMappings.some(
        (mapping) => mapping.field === "email",
      ),
      true,
    );
    const savedRow = await prisma.studentImportRow.findFirstOrThrow({
      where: { batchId: preview.batch.id },
      select: { sourceRow: true },
    });
    assert.equal(
      (savedRow.sourceRow as { mappedValues?: { email?: string } }).mappedValues
        ?.email,
      conflictEmail,
    );
    await createUserWithProfile(context, {
      role: Role.STUDENT,
      email: conflictEmail,
      displayName: "占用邮箱账号",
      studentNo: `${context.studentNoPrefix}399`,
    });

    await assert.rejects(
      () =>
        executeTeacherStudentImportBatch(
          context.teacherId,
          preview.batch.id,
          auditContext,
        ),
      /邮箱/u,
    );
    assert.equal(
      await prisma.userProfile.count({
        where: { studentNo: `${context.studentNoPrefix}301` },
      }),
      0,
    );
  } finally {
    await cleanup(context);
  }
});

test("非法批次和跨教师越权不能执行", async () => {
  const context = await createImportContext();
  try {
    const data = buildCsvFixture({
      rows: [rosterRow(context, "401", "非法批次学生")],
    });
    const file = await createRosterFile(context, data);
    const preview = await previewTeacherStudentImportFromFile(
      context.teacherId,
      file.id,
      previewInput({
        classroomId: context.classroomId,
        confirmMapping: false,
      }),
      auditContext,
      { storage: context.storage },
    );
    context.batchIds.push(preview.batch.id);
    assert.equal(preview.batch.status, StudentImportBatchStatus.PREVIEW_READY);

    await assert.rejects(
      () =>
        executeTeacherStudentImportBatch(
          context.teacherId,
          preview.batch.id,
          auditContext,
        ),
      /有效预览确认/u,
    );
    await assert.rejects(
      () =>
        executeTeacherStudentImportBatch(
          context.teacherTwoId,
          preview.batch.id,
          auditContext,
        ),
      /导入批次不存在/u,
    );
  } finally {
    await cleanup(context);
  }
});

test("管理员可以执行已确认导入批次", async () => {
  const context = await createImportContext();
  try {
    const { preview } = await createConfirmedBatch(context, [
      rosterRow(context, "501", "管理员执行学生"),
    ]);
    const result = await executeAdminStudentImportBatch(
      context.adminId,
      preview.batch.id,
      auditContext,
    );
    assert.equal(result.status, StudentImportBatchStatus.SUCCEEDED);
    assert.equal(result.summary.createdUserRows, 1);
  } finally {
    await cleanup(context);
  }
});
