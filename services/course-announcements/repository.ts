import "server-only";

import {
  MembershipStatus,
  NotificationSourceType,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

type Database = Prisma.TransactionClient | typeof prisma;

export const courseAnnouncementSelect =
  Prisma.validator<Prisma.AnnouncementSelect>()({
    id: true,
    title: true,
    content: true,
    status: true,
    batchId: true,
    publishedAt: true,
    expiresAt: true,
    revokedAt: true,
    createdAt: true,
    updatedAt: true,
    classroom: {
      select: {
        id: true,
        name: true,
        courseId: true,
        teacherId: true,
        status: true,
      },
    },
  });

export type CourseAnnouncementRecord = Prisma.AnnouncementGetPayload<{
  select: typeof courseAnnouncementSelect;
}>;

export function findCourseAnnouncementById(
  id: string,
  database: Database = prisma,
) {
  return database.announcement.findUnique({
    where: { id },
    select: courseAnnouncementSelect,
  });
}

export async function loadCourseAnnouncementPage(
  where: Prisma.AnnouncementWhereInput,
  page: number,
  pageSize: number,
) {
  const [total, records] = await prisma.$transaction([
    prisma.announcement.count({ where }),
    prisma.announcement.findMany({
      where,
      select: courseAnnouncementSelect,
      orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { total, records };
}

/** 校验课程归属。教师越权时统一按「不存在」处理，避免暴露他人课程是否存在。 */
export async function findTeacherCourse(
  database: Database,
  teacherId: string,
  courseId: string,
) {
  return database.course.findFirst({
    where: { id: courseId, teacherId },
    select: { id: true, name: true },
  });
}

/** 校验班级同时属于该教师与该课程。 */
export async function findTeacherCourseClassroom(
  database: Database,
  teacherId: string,
  courseId: string,
  classroomId: string,
) {
  return database.classroom.findFirst({
    where: {
      id: classroomId,
      courseId,
      teacherId,
      course: { teacherId },
    },
    select: { id: true, name: true, status: true },
  });
}

export function countClassroomAudience(
  database: Database,
  classroomId: string,
) {
  return database.classMembership.count({
    where: { classroomId, status: MembershipStatus.ACTIVE },
  });
}

export async function loadClassroomAudienceCounts(
  classroomIds: string[],
): Promise<Map<string, number>> {
  if (classroomIds.length === 0) return new Map();
  const rows = await prisma.classMembership.groupBy({
    by: ["classroomId"],
    where: {
      classroomId: { in: classroomIds },
      status: MembershipStatus.ACTIVE,
    },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.classroomId, row._count._all]));
}

/** 已读人数：只统计该公告已产生且已读的站内通知。 */
export async function loadReadCounts(
  announcementIds: string[],
): Promise<Map<string, number>> {
  if (announcementIds.length === 0) return new Map();
  const rows = await prisma.notification.groupBy({
    by: ["sourceId"],
    where: {
      sourceType: NotificationSourceType.ANNOUNCEMENT,
      sourceId: { in: announcementIds },
      readAt: { not: null },
    },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.sourceId, row._count._all]));
}

export async function listClassroomStudentIds(
  database: Database,
  classroomId: string,
): Promise<string[]> {
  const rows = await database.classMembership.findMany({
    where: { classroomId, status: MembershipStatus.ACTIVE },
    select: { studentId: true },
    orderBy: { joinedAt: "asc" },
  });
  return rows.map((row) => row.studentId);
}

/** 取同批的全部公告记录（含自身），用于「同批 N 个班级」标记与整批操作。 */
export async function listAnnouncementsByBatch(
  database: Database,
  batchId: string,
) {
  return database.announcement.findMany({
    where: { batchId },
    select: courseAnnouncementSelect,
    orderBy: { createdAt: "asc" },
  });
}
