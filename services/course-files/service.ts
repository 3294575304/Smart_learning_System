import {
  AuditAction,
  AuditTargetType,
  CourseFileKind,
  Prisma,
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import type {
  AuditConfigSnapshot,
  AuditRequestContext,
} from "@/services/audit/types";
import {
  STUDENT_ROSTER_FILE_KEY,
  STUDENT_ROSTER_TITLE,
} from "@/services/course-files/config";
import { CourseFileOperationError } from "@/services/course-files/errors";
import {
  createCourseFileVersionRecord,
  findAdminCourseFileVersionById,
  findLatestCourseFileVersion,
  findTeacherClassroomFileTarget,
  findTeacherCourseFileTarget,
  findTeacherCourseFileVersionById,
  listCourseFileVersions,
  type CourseFileTargetClassroomRecord,
  type CourseFileTargetCourseRecord,
  type CourseFileVersionRecord,
} from "@/services/course-files/repository";
import type {
  CourseFileDownload,
  CourseFileResource,
  CourseFileResourceView,
  CourseFileUploadFile,
  CourseFileVersionView,
} from "@/services/course-files/types";
import { validateStudentRosterFile } from "@/services/course-files/validation";
import { getStorageService } from "@/services/storage";
import type { StorageService } from "@/services/storage/types";

export interface CourseFileUploadDependencies {
  storage?: StorageService;
  storageKeyFactory?: (input: {
    resource: CourseFileResource;
    fileKind: CourseFileKind;
    fileKey: string;
    extension: string;
  }) => string;
  logger?: Pick<Console, "error">;
}

function isKnownPrismaError(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

function fileKindStorageSegment(fileKind: CourseFileKind): string {
  return fileKind.toLowerCase().replace(/_/gu, "-");
}

function generatedCourseFileStorageKey(
  resource: CourseFileResource,
  fileKind: CourseFileKind,
  fileKey: string,
  extension: string,
): string {
  const resourceSegment =
    resource.type === "COURSE"
      ? `course/${resource.courseId}`
      : `classroom/${resource.classroomId}`;
  return [
    "course-files",
    resourceSegment,
    fileKindStorageSegment(fileKind),
    fileKey,
    `${randomUUID()}.${extension}`,
  ].join("/");
}

function resourceViewFromRecord(
  record: CourseFileVersionRecord,
): CourseFileResourceView {
  if (record.course) {
    return {
      type: "COURSE",
      id: record.course.id,
      name: record.course.name,
      courseNo: record.course.courseNo,
      term: record.course.term,
    };
  }

  if (record.classroom) {
    return {
      type: "CLASSROOM",
      id: record.classroom.id,
      name: record.classroom.name,
      courseNo: null,
      term: null,
    };
  }

  throw new Error("Course file version has no resource.");
}

function courseFileVersionViewFromRecord(
  record: CourseFileVersionRecord,
): CourseFileVersionView {
  return {
    id: record.id,
    resource: resourceViewFromRecord(record),
    fileKind: record.fileKind,
    fileKey: record.fileKey,
    title: record.title,
    versionNumber: record.versionNumber,
    originalFileName: record.originalFileName,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    checksumSha256: record.checksumSha256,
    metadata: record.metadata,
    createdAt: record.createdAt,
    uploadedBy: {
      id: record.uploadedBy.id,
      displayName: record.uploadedBy.profile?.displayName ?? null,
      email: record.uploadedBy.email,
    },
  };
}

function primitiveMetadataValue(
  metadata: Prisma.JsonValue | null,
  key: string,
): string | number | boolean | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = metadata[key];
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
    ? value
    : null;
}

function courseFileSnapshot(
  record: CourseFileVersionRecord,
): AuditConfigSnapshot {
  const resource = resourceViewFromRecord(record);
  return {
    resourceType: resource.type,
    resourceId: resource.id,
    resourceName: resource.name,
    fileKind: record.fileKind,
    fileKey: record.fileKey,
    title: record.title,
    versionNumber: record.versionNumber,
    originalFileName: record.originalFileName,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    checksumSha256: record.checksumSha256,
    uploadedById: record.uploadedById,
    uploadedAt: record.createdAt.toISOString(),
    detectedFormat: primitiveMetadataValue(record.metadata, "detectedFormat"),
    parsedRowCount: primitiveMetadataValue(record.metadata, "parsedRowCount"),
  };
}

function uploadResourceSummary(
  resource: CourseFileTargetCourseRecord | CourseFileTargetClassroomRecord,
): string {
  return "courseNo" in resource
    ? `${resource.name}（${resource.courseNo} / ${resource.term}）`
    : resource.name;
}

async function requireTeacherResource(
  teacherId: string,
  resource: CourseFileResource,
  client: typeof prisma | Prisma.TransactionClient = prisma,
): Promise<CourseFileTargetCourseRecord | CourseFileTargetClassroomRecord> {
  const target =
    resource.type === "COURSE"
      ? await findTeacherCourseFileTarget(teacherId, resource.courseId, client)
      : await findTeacherClassroomFileTarget(
          teacherId,
          resource.classroomId,
          client,
        );

  if (!target) {
    throw new ResourceNotFoundError(
      resource.type === "COURSE" ? "课程不存在" : "班级不存在",
    );
  }

  return target;
}

async function cleanupSavedFile(
  storage: StorageService,
  storageKey: string,
  logger: Pick<Console, "error">,
): Promise<void> {
  try {
    await storage.delete(storageKey);
  } catch (cleanupError: unknown) {
    logger.error("Failed to clean uploaded course file", cleanupError);
  }
}

async function uploadStudentRosterFile(
  teacherId: string,
  resource: CourseFileResource,
  file: CourseFileUploadFile | null | undefined,
  context: AuditRequestContext,
  dependencies: CourseFileUploadDependencies = {},
): Promise<CourseFileVersionView> {
  await requireTeacherResource(teacherId, resource);

  const upload = await validateStudentRosterFile(file);
  const storage = dependencies.storage ?? getStorageService();
  const logger = dependencies.logger ?? console;
  const storageKey =
    dependencies.storageKeyFactory?.({
      resource,
      fileKind: CourseFileKind.IMPORT_SOURCE,
      fileKey: STUDENT_ROSTER_FILE_KEY,
      extension: upload.extension,
    }) ??
    generatedCourseFileStorageKey(
      resource,
      CourseFileKind.IMPORT_SOURCE,
      STUDENT_ROSTER_FILE_KEY,
      upload.extension,
    );

  try {
    await storage.save(storageKey, upload.data);
  } catch (error: unknown) {
    logger.error("Failed to save course file", error);
    throw new CourseFileOperationError("文件保存失败，请稍后重试。", 500);
  }

  try {
    const saved = await prisma.$transaction(async (transaction) => {
      const target = await requireTeacherResource(
        teacherId,
        resource,
        transaction,
      );
      const previous = await findLatestCourseFileVersion(
        resource,
        CourseFileKind.IMPORT_SOURCE,
        STUDENT_ROSTER_FILE_KEY,
        transaction,
      );
      const nextVersion = (previous?.versionNumber ?? 0) + 1;
      const record = await createCourseFileVersionRecord(
        {
          resource,
          uploadedById: teacherId,
          fileKind: CourseFileKind.IMPORT_SOURCE,
          fileKey: STUDENT_ROSTER_FILE_KEY,
          title: STUDENT_ROSTER_TITLE,
          versionNumber: nextVersion,
          originalFileName: upload.originalFileName,
          storageKey,
          mimeType: upload.mimeType,
          sizeBytes: upload.sizeBytes,
          checksumSha256: upload.checksumSha256,
          metadata: upload.metadata,
        },
        transaction,
      );

      await writeGovernanceAuditLog(transaction, {
        actorId: teacherId,
        action: AuditAction.COURSE_FILE_UPLOADED,
        targetType: AuditTargetType.COURSE_FILE,
        targetId: record.id,
        summary: `上传${STUDENT_ROSTER_TITLE}：${uploadResourceSummary(target)} v${record.versionNumber}`,
        beforeData: previous ? courseFileSnapshot(previous) : null,
        afterData: courseFileSnapshot(record),
        context,
      });

      return record;
    });

    return courseFileVersionViewFromRecord(saved);
  } catch (error: unknown) {
    await cleanupSavedFile(storage, storageKey, logger);
    if (isKnownPrismaError(error, "P2002")) {
      throw new CourseFileOperationError("文件版本冲突，请重试。", 409);
    }
    throw error;
  }
}

async function listStudentRosterFiles(
  teacherId: string,
  resource: CourseFileResource,
): Promise<CourseFileVersionView[]> {
  await requireTeacherResource(teacherId, resource);
  const records = await listCourseFileVersions(
    resource,
    CourseFileKind.IMPORT_SOURCE,
    STUDENT_ROSTER_FILE_KEY,
  );
  return records.map(courseFileVersionViewFromRecord);
}

async function readCourseFileData(
  record: CourseFileVersionRecord,
  storage: StorageService,
  logger: Pick<Console, "error">,
): Promise<Buffer> {
  try {
    return await storage.read(record.storageKey);
  } catch (error: unknown) {
    logger.error("Failed to read course file", error);
    throw new CourseFileOperationError("文件暂时无法下载，请稍后重试。", 500);
  }
}

async function writeCourseFileDownloadAudit(
  actorId: string,
  record: CourseFileVersionRecord,
  context: AuditRequestContext,
): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    await writeGovernanceAuditLog(transaction, {
      actorId,
      action: AuditAction.COURSE_FILE_DOWNLOADED,
      targetType: AuditTargetType.COURSE_FILE,
      targetId: record.id,
      summary: `下载${record.title}：${resourceViewFromRecord(record).name} v${record.versionNumber}`,
      beforeData: null,
      afterData: courseFileSnapshot(record),
      context,
    });
  });
}

export function uploadTeacherCourseStudentRosterFile(
  teacherId: string,
  courseId: string,
  file: CourseFileUploadFile | null | undefined,
  context: AuditRequestContext,
  dependencies: CourseFileUploadDependencies = {},
): Promise<CourseFileVersionView> {
  return uploadStudentRosterFile(
    teacherId,
    { type: "COURSE", courseId },
    file,
    context,
    dependencies,
  );
}

export function uploadTeacherClassroomStudentRosterFile(
  teacherId: string,
  classroomId: string,
  file: CourseFileUploadFile | null | undefined,
  context: AuditRequestContext,
  dependencies: CourseFileUploadDependencies = {},
): Promise<CourseFileVersionView> {
  return uploadStudentRosterFile(
    teacherId,
    { type: "CLASSROOM", classroomId },
    file,
    context,
    dependencies,
  );
}

export function listTeacherCourseStudentRosterFiles(
  teacherId: string,
  courseId: string,
): Promise<CourseFileVersionView[]> {
  return listStudentRosterFiles(teacherId, { type: "COURSE", courseId });
}

export function listTeacherClassroomStudentRosterFiles(
  teacherId: string,
  classroomId: string,
): Promise<CourseFileVersionView[]> {
  return listStudentRosterFiles(teacherId, {
    type: "CLASSROOM",
    classroomId,
  });
}

export async function downloadTeacherCourseFileVersion(
  teacherId: string,
  fileId: string,
  context: AuditRequestContext,
  dependencies: Pick<CourseFileUploadDependencies, "storage" | "logger"> = {},
): Promise<CourseFileDownload> {
  const record = await findTeacherCourseFileVersionById(teacherId, fileId);
  if (!record) {
    throw new ResourceNotFoundError("文件不存在");
  }

  const storage = dependencies.storage ?? getStorageService();
  const logger = dependencies.logger ?? console;
  const data = await readCourseFileData(record, storage, logger);
  await writeCourseFileDownloadAudit(teacherId, record, context);

  return {
    file: courseFileVersionViewFromRecord(record),
    data,
  };
}

export async function downloadAdminCourseFileVersion(
  adminId: string,
  fileId: string,
  context: AuditRequestContext,
  dependencies: Pick<CourseFileUploadDependencies, "storage" | "logger"> = {},
): Promise<CourseFileDownload> {
  const record = await findAdminCourseFileVersionById(fileId);
  if (!record) {
    throw new ResourceNotFoundError("文件不存在");
  }

  const storage = dependencies.storage ?? getStorageService();
  const logger = dependencies.logger ?? console;
  const data = await readCourseFileData(record, storage, logger);
  await writeCourseFileDownloadAudit(adminId, record, context);

  return {
    file: courseFileVersionViewFromRecord(record),
    data,
  };
}
