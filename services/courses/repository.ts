import { ClassroomStatus, MembershipStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const courseTemplateSelect = Prisma.validator<Prisma.CourseTemplateSelect>()({
  id: true,
  code: true,
  name: true,
  description: true,
  version: true,
  isBuiltin: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      courses: true,
    },
  },
});

export type CourseTemplateRecord = Prisma.CourseTemplateGetPayload<{
  select: typeof courseTemplateSelect;
}>;

const teacherCourseSelect = Prisma.validator<Prisma.CourseSelect>()({
  id: true,
  templateId: true,
  teacherId: true,
  courseNo: true,
  term: true,
  name: true,
  description: true,
  status: true,
  publishedAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  template: {
    select: {
      id: true,
      code: true,
      name: true,
      version: true,
      isBuiltin: true,
    },
  },
  classrooms: {
    where: { status: { not: ClassroomStatus.ARCHIVED } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      status: true,
      _count: {
        select: {
          memberships: {
            where: {
              status: MembershipStatus.ACTIVE,
            },
          },
        },
      },
    },
  },
});

export type TeacherCourseRecord = Prisma.CourseGetPayload<{
  select: typeof teacherCourseSelect;
}>;

const teacherCourseClassroomSelect = Prisma.validator<Prisma.ClassroomSelect>()(
  {
    id: true,
    name: true,
    description: true,
    status: true,
    allowStudentLeave: true,
    createdAt: true,
    updatedAt: true,
    courseId: true,
    course: {
      select: {
        id: true,
        name: true,
        courseNo: true,
        term: true,
        status: true,
      },
    },
    _count: {
      select: {
        memberships: {
          where: {
            status: MembershipStatus.ACTIVE,
          },
        },
      },
    },
  },
);

export type TeacherCourseClassroomRecord = Prisma.ClassroomGetPayload<{
  select: typeof teacherCourseClassroomSelect;
}>;

const courseSyllabusSelect = Prisma.validator<Prisma.CourseSyllabusSelect>()({
  id: true,
  courseId: true,
  uploadedById: true,
  versionNumber: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  checksumSha256: true,
  storageKey: true,
  createdAt: true,
  updatedAt: true,
  uploadedBy: {
    select: {
      id: true,
      email: true,
      profile: {
        select: {
          displayName: true,
        },
      },
    },
  },
});

export type CourseSyllabusRecord = Prisma.CourseSyllabusGetPayload<{
  select: typeof courseSyllabusSelect;
}>;

type DatabaseClient = typeof prisma | Prisma.TransactionClient;

interface CreateCourseSyllabusData {
  courseId: string;
  uploadedById: string;
  versionNumber: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  storageKey: string;
}

export async function loadCourseTemplates(
  client: DatabaseClient = prisma,
  onlyActive = false,
): Promise<CourseTemplateRecord[]> {
  return client.courseTemplate.findMany({
    where: onlyActive ? { isActive: true } : undefined,
    select: courseTemplateSelect,
    orderBy: [
      { isBuiltin: "desc" },
      { isActive: "desc" },
      { name: "asc" },
      { code: "asc" },
    ],
  });
}

export function findCourseTemplateById(
  templateId: string,
  client: DatabaseClient = prisma,
): Promise<CourseTemplateRecord | null> {
  return client.courseTemplate.findUnique({
    where: { id: templateId },
    select: courseTemplateSelect,
  });
}

export function findActiveCourseTemplateById(
  templateId: string,
  client: DatabaseClient = prisma,
): Promise<CourseTemplateRecord | null> {
  return client.courseTemplate.findFirst({
    where: { id: templateId, isActive: true },
    select: courseTemplateSelect,
  });
}

export function findActiveCourseTemplateByCode(
  code: string,
  client: DatabaseClient = prisma,
): Promise<CourseTemplateRecord | null> {
  return client.courseTemplate.findFirst({
    where: { code, isActive: true },
    select: courseTemplateSelect,
  });
}

export async function loadTeacherCourses(
  teacherId: string,
  client: DatabaseClient = prisma,
): Promise<TeacherCourseRecord[]> {
  return client.course.findMany({
    where: { teacherId },
    select: teacherCourseSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

export function findTeacherCourseById(
  teacherId: string,
  courseId: string,
  client: DatabaseClient = prisma,
): Promise<TeacherCourseRecord | null> {
  return client.course.findFirst({
    where: { id: courseId, teacherId },
    select: teacherCourseSelect,
  });
}

export async function loadTeacherClassroomsForCourseLink(
  teacherId: string,
  client: DatabaseClient = prisma,
): Promise<TeacherCourseClassroomRecord[]> {
  return client.classroom.findMany({
    where: { teacherId, status: { not: ClassroomStatus.ARCHIVED } },
    select: teacherCourseClassroomSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

export function findTeacherClassroomById(
  teacherId: string,
  classroomId: string,
  client: DatabaseClient = prisma,
): Promise<TeacherCourseClassroomRecord | null> {
  return client.classroom.findFirst({
    where: {
      id: classroomId,
      teacherId,
      status: { not: ClassroomStatus.ARCHIVED },
    },
    select: teacherCourseClassroomSelect,
  });
}

export function findTeacherCourseSyllabus(
  teacherId: string,
  courseId: string,
  client: DatabaseClient = prisma,
): Promise<CourseSyllabusRecord | null> {
  return client.courseSyllabus.findFirst({
    where: {
      courseId,
      course: { teacherId },
    },
    select: courseSyllabusSelect,
    orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
  });
}

export function findCourseSyllabusByCourseId(
  courseId: string,
  client: DatabaseClient = prisma,
): Promise<CourseSyllabusRecord | null> {
  return client.courseSyllabus.findFirst({
    where: { courseId },
    select: courseSyllabusSelect,
    orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
  });
}

export function createCourseSyllabusRecord(
  data: CreateCourseSyllabusData,
  client: DatabaseClient = prisma,
): Promise<CourseSyllabusRecord> {
  return client.courseSyllabus.create({
    data,
    select: courseSyllabusSelect,
  });
}
