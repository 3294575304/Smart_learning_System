import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AuditAction, AuditTargetType, PrismaClient } from "@prisma/client";
import { PDFDocument } from "pdf-lib";

import {
  createTeacherCourse,
  getTeacherCourseSyllabus,
  listTeacherCourseTemplates,
  uploadTeacherCourseSyllabus,
  type CourseSyllabusUploadFile,
} from "@/services/courses/service";
import { LocalStorageService } from "@/services/storage/local-storage";
import type { StorageService } from "@/services/storage/types";

const prisma = new PrismaClient();
const auditContext = {
  ipAddress: "127.0.0.1",
  userAgent: "course-syllabus-service-test",
};
process.on("exit", () => {
  void prisma.$disconnect();
});

async function testPdf(title: string): Promise<Buffer> {
  const document = await PDFDocument.create();
  document.setTitle(title);
  document.addPage([595, 842]);
  return Buffer.from(await document.save());
}

function bufferArrayBuffer(buffer: Buffer): ArrayBuffer {
  return Uint8Array.from(buffer).buffer;
}

function uploadFile(
  name: string,
  type: string,
  data: Buffer,
  size = data.length,
): CourseSyllabusUploadFile {
  return {
    name,
    type,
    size,
    arrayBuffer: async () => bufferArrayBuffer(data),
  };
}

async function withUploadRoot<T>(
  action: (root: string) => Promise<T>,
): Promise<T> {
  const previousRoot = process.env.LOCAL_UPLOAD_ROOT;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "zhixue-syllabus-"));
  process.env.LOCAL_UPLOAD_ROOT = root;
  try {
    return await action(root);
  } finally {
    if (previousRoot === undefined) {
      delete process.env.LOCAL_UPLOAD_ROOT;
    } else {
      process.env.LOCAL_UPLOAD_ROOT = previousRoot;
    }
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function createOwnedCourse(teacherId: string) {
  const suffix = randomBytes(4).toString("hex");
  const template = (await listTeacherCourseTemplates()).find(
    (item) => item.code === "python-programming-v1",
  );
  assert.ok(template);

  return createTeacherCourse(
    teacherId,
    {
      templateId: template.id,
      courseNo: `SYLLABUS-${suffix.toUpperCase()}`,
      term: "2026-2027-1",
      name: `教学大纲上传测试 ${suffix}`,
      description: "用于教学大纲上传服务测试",
    },
    auditContext,
  );
}

test("教师课程教学大纲上传、替换、校验、清理和审计", async () => {
  await withUploadRoot(async (root) => {
    const [pdfA, pdfB] = await Promise.all([
      testPdf("Python 教学大纲"),
      testPdf("Python 教学大纲第二版"),
    ]);
    const createdCourseIds: string[] = [];
    const touchedSyllabusIds: string[] = [];
    const storage = new LocalStorageService(root);

    try {
      const [teacher, teacherTwo] = await Promise.all([
        prisma.user.findUniqueOrThrow({
          where: { email: "teacher@example.com" },
          select: { id: true },
        }),
        prisma.user.findUniqueOrThrow({
          where: { email: "teacher2@example.com" },
          select: { id: true },
        }),
      ]);
      const course = await createOwnedCourse(teacher.id);
      createdCourseIds.push(course.id);

      const uploaded = await uploadTeacherCourseSyllabus(
        teacher.id,
        course.id,
        uploadFile("python-syllabus.pdf", "application/pdf", pdfA),
        auditContext,
      );
      touchedSyllabusIds.push(uploaded.id);
      assert.equal(uploaded.courseId, course.id);
      assert.equal(uploaded.originalName, "python-syllabus.pdf");
      assert.equal(uploaded.sizeBytes, pdfA.length);
      assert.equal(uploaded.mimeType, "application/pdf");
      assert.equal(uploaded.uploadedBy.id, teacher.id);

      const queried = await getTeacherCourseSyllabus(teacher.id, course.id);
      assert.equal(queried?.id, uploaded.id);
      assert.equal(queried?.originalName, "python-syllabus.pdf");

      const firstRecord = await prisma.courseSyllabus.findFirstOrThrow({
        where: { courseId: course.id },
        orderBy: { versionNumber: "desc" },
        select: { id: true, storageKey: true },
      });
      assert.equal(
        (await storage.read(firstRecord.storageKey)).equals(pdfA),
        true,
      );

      const replaced = await uploadTeacherCourseSyllabus(
        teacher.id,
        course.id,
        uploadFile("python-syllabus-v2.pdf", "application/pdf", pdfB),
        auditContext,
      );
      assert.notEqual(replaced.id, uploaded.id);
      assert.equal(replaced.versionNumber, 2);
      touchedSyllabusIds.push(replaced.id);
      assert.equal(replaced.originalName, "python-syllabus-v2.pdf");

      const replacedRecord = await prisma.courseSyllabus.findFirstOrThrow({
        where: { courseId: course.id },
        orderBy: { versionNumber: "desc" },
        select: { id: true, storageKey: true },
      });
      assert.notEqual(replacedRecord.storageKey, firstRecord.storageKey);
      assert.equal(
        (await storage.read(replacedRecord.storageKey)).equals(pdfB),
        true,
      );
      assert.equal(
        (await storage.read(firstRecord.storageKey)).equals(pdfA),
        true,
      );

      const beforeFailureRecord = await prisma.courseSyllabus.findFirstOrThrow({
        where: { courseId: course.id },
        orderBy: { versionNumber: "desc" },
        select: { originalName: true, storageKey: true },
      });
      const failingStorage: StorageService = {
        save: async () => {
          throw new Error("storage unavailable");
        },
        read: async () => Buffer.alloc(0),
        delete: async () => undefined,
      };
      await assert.rejects(() =>
        uploadTeacherCourseSyllabus(
          teacher.id,
          course.id,
          uploadFile("save-failure.pdf", "application/pdf", pdfA),
          auditContext,
          { storage: failingStorage, logger: { error: () => undefined } },
        ),
      );
      const afterSaveFailureRecord =
        await prisma.courseSyllabus.findFirstOrThrow({
          where: { courseId: course.id },
          orderBy: { versionNumber: "desc" },
          select: { originalName: true, storageKey: true },
        });
      assert.deepEqual(afterSaveFailureRecord, beforeFailureRecord);

      const dbFailureStorageKey = "course-syllabi/db-failure.pdf";
      await assert.rejects(() =>
        uploadTeacherCourseSyllabus(
          teacher.id,
          course.id,
          uploadFile(`${"x".repeat(252)}.pdf`, "application/pdf", pdfA),
          auditContext,
          {
            storageKeyFactory: () => dbFailureStorageKey,
            logger: { error: () => undefined },
          },
        ),
      );
      await assert.rejects(() => storage.read(dbFailureStorageKey));
      const afterDbFailureRecord = await prisma.courseSyllabus.findFirstOrThrow(
        {
          where: { courseId: course.id },
          orderBy: { versionNumber: "desc" },
          select: { originalName: true, storageKey: true },
        },
      );
      assert.deepEqual(afterDbFailureRecord, beforeFailureRecord);

      await assert.rejects(() =>
        uploadTeacherCourseSyllabus(
          teacher.id,
          course.id,
          uploadFile("not-pdf.txt", "text/plain", Buffer.from("hello")),
          auditContext,
        ),
      );
      await assert.rejects(() =>
        uploadTeacherCourseSyllabus(
          teacher.id,
          course.id,
          uploadFile("fake.pdf", "application/pdf", Buffer.from("hello")),
          auditContext,
        ),
      );
      await assert.rejects(
        () =>
          uploadTeacherCourseSyllabus(
            teacher.id,
            course.id,
            uploadFile(
              "truncated.pdf",
              "application/pdf",
              Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>"),
            ),
            auditContext,
          ),
        /已损坏、被加密或无法解析/u,
      );
      await assert.rejects(() =>
        uploadTeacherCourseSyllabus(
          teacher.id,
          course.id,
          uploadFile(
            "too-large.pdf",
            "application/pdf",
            pdfA,
            20 * 1024 * 1024 + 1,
          ),
          auditContext,
        ),
      );
      await assert.rejects(() =>
        uploadTeacherCourseSyllabus(
          teacher.id,
          course.id,
          uploadFile("empty.pdf", "application/pdf", Buffer.alloc(0)),
          auditContext,
        ),
      );
      await assert.rejects(() =>
        uploadTeacherCourseSyllabus(
          teacherTwo.id,
          course.id,
          uploadFile("foreign.pdf", "application/pdf", pdfA),
          auditContext,
        ),
      );
      await assert.rejects(() =>
        uploadTeacherCourseSyllabus(
          teacher.id,
          "cm12345678901234567890123",
          uploadFile("missing.pdf", "application/pdf", pdfA),
          auditContext,
        ),
      );

      const auditCount = await prisma.auditLog.count({
        where: {
          action: AuditAction.COURSE_UPDATED,
          targetType: AuditTargetType.COURSE_FILE,
          targetId: { in: touchedSyllabusIds },
        },
      });
      assert.equal(auditCount, 2);
    } finally {
      if (touchedSyllabusIds.length > 0 || createdCourseIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: {
            OR: [
              { targetId: { in: touchedSyllabusIds } },
              { targetId: { in: createdCourseIds } },
            ],
          },
        });
      }
      if (createdCourseIds.length > 0) {
        await prisma.course.deleteMany({
          where: { id: { in: createdCourseIds } },
        });
      }
    }
  });
});
