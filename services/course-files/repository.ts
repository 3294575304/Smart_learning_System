import { Prisma, type CourseFileKind } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { CourseFileResource } from "@/services/course-files/types";

const courseFileVersionSelect =
  Prisma.validator<Prisma.CourseFileVersionSelect>()({
    id: true,
    courseId: true,
    classroomId: true,
    uploadedById: true,
    fileKind: true,
    fileKey: true,
    title: true,
    versionNumber: true,
    originalFileName: true,
    storageKey: true,
    mimeType: true,
    sizeBytes: true,
    checksumSha256: true,
    metadata: true,
    createdAt: true,
    updatedAt: true,
    uploadedBy: {
      select: {
        id: true,
        email: true,
        profile: { select: { displayName: true } },
      },
    },
    course: {
      select: {
        id: true,
        name: true,
        courseNo: true,
        term: true,
        teacherId: true,
      },
    },
    classroom: {
      select: {
        id: true,
        name: true,
        teacherId: true,
        courseId: true,
      },
    },
  });

const courseFileTargetCourseSelect = Prisma.validator<Prisma.CourseSelect>()({
  id: true,
  name: true,
  courseNo: true,
  term: true,
  teacherId: true,
});

const courseFileTargetClassroomSelect =
  Prisma.validator<Prisma.ClassroomSelect>()({
    id: true,
    name: true,
    teacherId: true,
    courseId: true,
  });

export type CourseFileVersionRecord = Prisma.CourseFileVersionGetPayload<{
  select: typeof courseFileVersionSelect;
}>;

export type CourseFileTargetCourseRecord = Prisma.CourseGetPayload<{
  select: typeof courseFileTargetCourseSelect;
}>;

export type CourseFileTargetClassroomRecord = Prisma.ClassroomGetPayload<{
  select: typeof courseFileTargetClassroomSelect;
}>;

type DatabaseClient = typeof prisma | Prisma.TransactionClient;

interface CreateCourseFileVersionRecordData {
  resource: CourseFileResource;
  uploadedById: string;
  fileKind: CourseFileKind;
  fileKey: string;
  title: string;
  versionNumber: number;
  originalFileName: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  metadata: Prisma.InputJsonObject;
}

function courseFileResourceWhere(
  resource: CourseFileResource,
): Prisma.CourseFileVersionWhereInput {
  return resource.type === "COURSE"
    ? { courseId: resource.courseId, classroomId: null }
    : { classroomId: resource.classroomId, courseId: null };
}

function courseFileResourceCreateData(
  resource: CourseFileResource,
): Pick<
  Prisma.CourseFileVersionUncheckedCreateInput,
  "courseId" | "classroomId"
> {
  return resource.type === "COURSE"
    ? { courseId: resource.courseId, classroomId: null }
    : { classroomId: resource.classroomId, courseId: null };
}

export function findTeacherCourseFileTarget(
  teacherId: string,
  courseId: string,
  client: DatabaseClient = prisma,
): Promise<CourseFileTargetCourseRecord | null> {
  return client.course.findFirst({
    where: { id: courseId, teacherId },
    select: courseFileTargetCourseSelect,
  });
}

export function findTeacherClassroomFileTarget(
  teacherId: string,
  classroomId: string,
  client: DatabaseClient = prisma,
): Promise<CourseFileTargetClassroomRecord | null> {
  return client.classroom.findFirst({
    where: { id: classroomId, teacherId },
    select: courseFileTargetClassroomSelect,
  });
}

export function listCourseFileVersions(
  resource: CourseFileResource,
  fileKind: CourseFileKind,
  fileKey: string,
  client: DatabaseClient = prisma,
): Promise<CourseFileVersionRecord[]> {
  return client.courseFileVersion.findMany({
    where: {
      ...courseFileResourceWhere(resource),
      fileKind,
      fileKey,
    },
    select: courseFileVersionSelect,
    orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }, { id: "desc" }],
  });
}

export function findLatestCourseFileVersion(
  resource: CourseFileResource,
  fileKind: CourseFileKind,
  fileKey: string,
  client: DatabaseClient = prisma,
): Promise<CourseFileVersionRecord | null> {
  return client.courseFileVersion.findFirst({
    where: {
      ...courseFileResourceWhere(resource),
      fileKind,
      fileKey,
    },
    select: courseFileVersionSelect,
    orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }, { id: "desc" }],
  });
}

export function createCourseFileVersionRecord(
  data: CreateCourseFileVersionRecordData,
  client: DatabaseClient = prisma,
): Promise<CourseFileVersionRecord> {
  return client.courseFileVersion.create({
    data: {
      ...courseFileResourceCreateData(data.resource),
      uploadedById: data.uploadedById,
      fileKind: data.fileKind,
      fileKey: data.fileKey,
      title: data.title,
      versionNumber: data.versionNumber,
      originalFileName: data.originalFileName,
      storageKey: data.storageKey,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      checksumSha256: data.checksumSha256,
      metadata: data.metadata,
    },
    select: courseFileVersionSelect,
  });
}

export function findTeacherCourseFileVersionById(
  teacherId: string,
  fileId: string,
  client: DatabaseClient = prisma,
): Promise<CourseFileVersionRecord | null> {
  return client.courseFileVersion.findFirst({
    where: {
      id: fileId,
      OR: [{ course: { teacherId } }, { classroom: { teacherId } }],
    },
    select: courseFileVersionSelect,
  });
}

export function findAdminCourseFileVersionById(
  fileId: string,
  client: DatabaseClient = prisma,
): Promise<CourseFileVersionRecord | null> {
  return client.courseFileVersion.findUnique({
    where: { id: fileId },
    select: courseFileVersionSelect,
  });
}
