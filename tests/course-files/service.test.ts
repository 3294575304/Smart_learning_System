import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  AuditAction,
  AuditTargetType,
  ClassroomStatus,
  PrismaClient,
} from "@prisma/client";

import { courseFileUploadConfig } from "@/services/course-files/config";
import {
  downloadTeacherCourseFileVersion,
  listTeacherCourseStudentRosterFiles,
  uploadTeacherClassroomStudentRosterFile,
  uploadTeacherCourseStudentRosterFile,
} from "@/services/course-files/service";
import type { CourseFileUploadFile } from "@/services/course-files/types";
import {
  createTeacherCourse,
  listTeacherCourseTemplates,
} from "@/services/courses/service";
import { LocalStorageService } from "@/services/storage/local-storage";
import type { StorageService } from "@/services/storage/types";

const prisma = new PrismaClient();
const auditContext = {
  ipAddress: "127.0.0.1",
  userAgent: "course-file-service-test",
};

process.on("exit", () => {
  void prisma.$disconnect();
});

function bufferArrayBuffer(buffer: Buffer): ArrayBuffer {
  return Uint8Array.from(buffer).buffer;
}

function uploadFile(
  name: string,
  type: string,
  data: Buffer,
  size = data.length,
): CourseFileUploadFile {
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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "zhixue-course-file-"));
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
      courseNo: `FILE-${suffix.toUpperCase()}`,
      term: "2026-2027-1",
      name: `课程文件测试 ${suffix}`,
      description: "用于课程文件服务测试",
    },
    auditContext,
  );
}

function csvRoster(rowCount: number): Buffer {
  const rows = [
    "学年学期(文本),课程号(文本),学号(文本),姓名(文本),班级(文本),成绩标识(文本),期末成绩(100.0%)(文本),特殊原因(文本),等级成绩类型(文本),备注(文本)",
  ];
  for (let index = 1; index < rowCount; index += 1) {
    rows.push(
      `2026-2027-1,PYTHON-${index},202600${index},学生${index},软件${index}班,,,,,`,
    );
  }
  return Buffer.from(`${rows.join("\n")}\n`, "utf8");
}

const crcTable = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZip(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const checksum = crc32(entry.data);
    const local = Buffer.alloc(30 + name.length + entry.data.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    entry.data.copy(local, 30 + name.length);
    locals.push(local);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralDirectory, end]);
}

function minimalXlsx(rowCount: number): Buffer {
  const rows = Array.from(
    { length: rowCount },
    (_, index) =>
      `<row r="${index + 1}"><c r="A${index + 1}"><v>${index}</v></c></row>`,
  ).join("");

  return buildZip([
    {
      name: "[Content_Types].xml",
      data: Buffer.from(
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
        "utf8",
      ),
    },
    {
      name: "xl/workbook.xml",
      data: Buffer.from(
        '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"></workbook>',
        "utf8",
      ),
    },
    {
      name: "xl/worksheets/sheet1.xml",
      data: Buffer.from(
        `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`,
        "utf8",
      ),
    },
  ]);
}

function oleDirectoryEntry(
  name: string,
  type: number,
  startingSector: number,
  streamSize: number,
): Buffer {
  const entry = Buffer.alloc(128);
  const encodedName = Buffer.from(`${name}\u0000`, "utf16le");
  encodedName.copy(entry, 0);
  entry.writeUInt16LE(encodedName.length, 64);
  entry.writeUInt8(type, 66);
  entry.writeInt32LE(startingSector, 116);
  entry.writeBigUInt64LE(BigInt(streamSize), 120);
  return entry;
}

function biffRow(rowIndex: number): Buffer {
  const record = Buffer.alloc(20);
  record.writeUInt16LE(0x0208, 0);
  record.writeUInt16LE(16, 2);
  record.writeUInt16LE(rowIndex, 4);
  return record;
}

function minimalXls(rowCount: number): Buffer {
  const header = Buffer.alloc(512);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(header, 0);
  for (let offset = 76; offset < 512; offset += 4) {
    header.writeInt32LE(-1, offset);
  }
  header.writeUInt16LE(0x003e, 24);
  header.writeUInt16LE(3, 26);
  header.writeUInt16LE(0xfffe, 28);
  header.writeUInt16LE(9, 30);
  header.writeUInt16LE(6, 32);
  header.writeUInt32LE(1, 44);
  header.writeInt32LE(1, 48);
  header.writeUInt32LE(4096, 56);
  header.writeInt32LE(-2, 60);
  header.writeInt32LE(-2, 68);
  header.writeInt32LE(0, 76);

  const fat = Buffer.alloc(512);
  for (let offset = 0; offset < 512; offset += 4) {
    fat.writeInt32LE(-1, offset);
  }
  fat.writeInt32LE(-3, 0);
  fat.writeInt32LE(-2, 4);
  fat.writeInt32LE(-2, 8);

  const workbookRecords = [
    ...Array.from({ length: rowCount }, (_, index) => biffRow(index)),
    Buffer.from([0x0a, 0x00, 0x00, 0x00]),
  ];
  const workbook = Buffer.concat(workbookRecords);
  const workbookSector = Buffer.alloc(512);
  workbook.copy(workbookSector, 0);

  const directory = Buffer.alloc(512);
  oleDirectoryEntry("Root Entry", 5, -2, 0).copy(directory, 0);
  oleDirectoryEntry("Workbook", 2, 2, workbook.length).copy(directory, 128);

  return Buffer.concat([header, fat, directory, workbookSector]);
}

test("学生名单文件上传、版本、下载、权限、格式校验和回滚", async () => {
  await withUploadRoot(async (root) => {
    const createdCourseIds: string[] = [];
    const createdClassroomIds: string[] = [];
    const createdFileIds: string[] = [];
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
      const classroom = await prisma.classroom.create({
        data: {
          teacherId: teacher.id,
          joinCode: `FILE${randomBytes(6).toString("hex").toUpperCase()}`,
          name: "课程文件测试班级",
          description: "用于课程文件服务测试",
          status: ClassroomStatus.ACTIVE,
          allowStudentLeave: true,
        },
        select: { id: true },
      });
      createdClassroomIds.push(classroom.id);

      const csvA = csvRoster(3);
      const first = await uploadTeacherCourseStudentRosterFile(
        teacher.id,
        course.id,
        uploadFile("..\\名单.csv", "text/csv", csvA),
        auditContext,
      );
      createdFileIds.push(first.id);
      assert.equal(first.resource.type, "COURSE");
      assert.equal(first.resource.id, course.id);
      assert.equal(first.versionNumber, 1);
      assert.equal(first.originalFileName, "名单.csv");
      assert.equal(first.sizeBytes, csvA.length);
      assert.equal((first as { storageKey?: string }).storageKey, undefined);

      const firstRecord = await prisma.courseFileVersion.findUniqueOrThrow({
        where: { id: first.id },
        select: { storageKey: true, checksumSha256: true },
      });
      assert.equal(
        (await storage.read(firstRecord.storageKey)).equals(csvA),
        true,
      );

      const duplicate = await uploadTeacherCourseStudentRosterFile(
        teacher.id,
        course.id,
        uploadFile("名单.csv", "text/csv", csvA),
        auditContext,
      );
      createdFileIds.push(duplicate.id);
      assert.equal(duplicate.versionNumber, 2);
      assert.equal(duplicate.checksumSha256, first.checksumSha256);
      assert.notEqual(duplicate.id, first.id);

      const csvB = csvRoster(4);
      const third = await uploadTeacherCourseStudentRosterFile(
        teacher.id,
        course.id,
        uploadFile("名单-v3.csv", "text/csv", csvB),
        auditContext,
      );
      createdFileIds.push(third.id);
      assert.equal(third.versionNumber, 3);

      const versions = await listTeacherCourseStudentRosterFiles(
        teacher.id,
        course.id,
      );
      assert.deepEqual(
        versions.map((item) => item.versionNumber),
        [3, 2, 1],
      );

      const firstDownload = await downloadTeacherCourseFileVersion(
        teacher.id,
        first.id,
        auditContext,
      );
      assert.equal(firstDownload.data.equals(csvA), true);
      const thirdDownload = await downloadTeacherCourseFileVersion(
        teacher.id,
        third.id,
        auditContext,
      );
      assert.equal(thirdDownload.data.equals(csvB), true);

      const xlsx = await uploadTeacherCourseStudentRosterFile(
        teacher.id,
        course.id,
        uploadFile(
          "名单.xlsx",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          minimalXlsx(2),
        ),
        auditContext,
      );
      createdFileIds.push(xlsx.id);
      assert.equal(xlsx.versionNumber, 4);

      const xls = await uploadTeacherCourseStudentRosterFile(
        teacher.id,
        course.id,
        uploadFile("名单.xls", "application/vnd.ms-excel", minimalXls(2)),
        auditContext,
      );
      createdFileIds.push(xls.id);
      assert.equal(xls.versionNumber, 5);

      const classroomFile = await uploadTeacherClassroomStudentRosterFile(
        teacher.id,
        classroom.id,
        uploadFile("班级名单.csv", "text/csv", csvA),
        auditContext,
      );
      createdFileIds.push(classroomFile.id);
      assert.equal(classroomFile.resource.type, "CLASSROOM");
      assert.equal(classroomFile.resource.id, classroom.id);
      assert.equal(classroomFile.versionNumber, 1);

      await assert.rejects(
        () =>
          uploadTeacherCourseStudentRosterFile(
            teacher.id,
            course.id,
            uploadFile(
              "malware.exe",
              "application/octet-stream",
              Buffer.from("MZ"),
            ),
            auditContext,
          ),
        /仅支持 XLS、XLSX 或 CSV/u,
      );
      await assert.rejects(
        () =>
          uploadTeacherCourseStudentRosterFile(
            teacher.id,
            course.id,
            uploadFile(
              "fake.xlsx",
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              Buffer.from("not a workbook"),
            ),
            auditContext,
          ),
        /不是合法工作簿|不是可解析/u,
      );
      await assert.rejects(
        () =>
          uploadTeacherCourseStudentRosterFile(
            teacher.id,
            course.id,
            uploadFile(
              "too-many.csv",
              "text/csv",
              csvRoster(courseFileUploadConfig.maxStudentRosterRows + 2),
            ),
            auditContext,
          ),
        /不能超过/u,
      );
      await assert.rejects(
        () =>
          uploadTeacherCourseStudentRosterFile(
            teacherTwo.id,
            course.id,
            uploadFile("foreign.csv", "text/csv", csvA),
            auditContext,
          ),
        /课程不存在/u,
      );
      await assert.rejects(
        () =>
          downloadTeacherCourseFileVersion(
            teacherTwo.id,
            first.id,
            auditContext,
          ),
        /文件不存在/u,
      );
      await assert.rejects(
        () =>
          downloadTeacherCourseFileVersion(
            teacher.id,
            "cm12345678901234567890123",
            auditContext,
          ),
        /文件不存在/u,
      );

      const beforeFailureCount = await prisma.courseFileVersion.count({
        where: { courseId: course.id },
      });
      const failingStorage: StorageService = {
        save: async () => {
          throw new Error("storage unavailable");
        },
        read: async () => Buffer.alloc(0),
        delete: async () => undefined,
      };
      await assert.rejects(() =>
        uploadTeacherCourseStudentRosterFile(
          teacher.id,
          course.id,
          uploadFile("save-failure.csv", "text/csv", csvA),
          auditContext,
          { storage: failingStorage, logger: { error: () => undefined } },
        ),
      );
      assert.equal(
        await prisma.courseFileVersion.count({
          where: { courseId: course.id },
        }),
        beforeFailureCount,
      );

      const savedKeys = new Set<string>();
      const memoryStorage: StorageService = {
        save: async (storageKey) => {
          savedKeys.add(storageKey);
        },
        read: async (storageKey) => {
          if (!savedKeys.has(storageKey)) throw new Error("missing");
          return csvA;
        },
        delete: async (storageKey) => {
          savedKeys.delete(storageKey);
        },
      };
      await assert.rejects(() =>
        uploadTeacherCourseStudentRosterFile(
          teacher.id,
          course.id,
          uploadFile("db-failure.csv", "text/csv", csvA),
          auditContext,
          {
            storage: memoryStorage,
            storageKeyFactory: () => "x".repeat(192),
            logger: { error: () => undefined },
          },
        ),
      );
      assert.equal(savedKeys.size, 0);
      assert.equal(
        await prisma.courseFileVersion.count({
          where: { courseId: course.id },
        }),
        beforeFailureCount,
      );

      const auditCount = await prisma.auditLog.count({
        where: {
          targetId: { in: createdFileIds },
          targetType: AuditTargetType.COURSE_FILE,
          action: {
            in: [
              AuditAction.COURSE_FILE_UPLOADED,
              AuditAction.COURSE_FILE_DOWNLOADED,
            ],
          },
        },
      });
      assert.equal(auditCount, createdFileIds.length + 2);
    } finally {
      if (createdFileIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: { targetId: { in: createdFileIds } },
        });
        await prisma.courseFileVersion.deleteMany({
          where: { id: { in: createdFileIds } },
        });
      }
      if (createdClassroomIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: { targetId: { in: createdClassroomIds } },
        });
        await prisma.classroom.deleteMany({
          where: { id: { in: createdClassroomIds } },
        });
      }
      if (createdCourseIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: { targetId: { in: createdCourseIds } },
        });
        await prisma.course.deleteMany({
          where: { id: { in: createdCourseIds } },
        });
      }
    }
  });
});
