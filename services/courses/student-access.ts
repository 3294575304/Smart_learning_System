import "server-only";

import { MembershipStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";

export async function getStudentCourseContext(
  studentId: string,
  courseId: string,
) {
  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      classrooms: {
        some: {
          memberships: {
            some: { studentId, status: MembershipStatus.ACTIVE },
          },
        },
      },
    },
    select: { id: true, name: true, courseNo: true, term: true },
  });
  if (!course) throw new ResourceNotFoundError("课程不存在。");
  return course;
}

export async function getStudentClassroomContext(
  studentId: string,
  classroomId: string,
  courseId?: string,
) {
  const member = await prisma.classMembership.findFirst({
    where: {
      studentId,
      classroomId,
      status: MembershipStatus.ACTIVE,
      classroom: courseId ? { courseId } : { courseId: { not: null } },
    },
    select: {
      classroom: {
        select: { id: true, name: true, status: true, courseId: true },
      },
    },
  });
  if (!member) throw new ResourceNotFoundError("教学班不存在。");
  return member.classroom;
}

/** 筛选项来自本人入班关系，不依赖当前是否有作业或签到记录。 */
export async function listStudentTaskClassrooms(
  studentId: string,
  courseId?: string,
) {
  const memberships = await prisma.classMembership.findMany({
    where: {
      studentId,
      status: MembershipStatus.ACTIVE,
      ...(courseId ? { classroom: { courseId } } : {}),
    },
    select: {
      classroom: {
        select: {
          id: true,
          name: true,
          course: { select: { id: true, name: true, term: true } },
        },
      },
    },
    orderBy: [{ classroom: { name: "asc" } }, { classroomId: "asc" }],
  });
  return memberships.map(({ classroom }) => ({
    id: classroom.id,
    name: classroom.name,
    courseName: classroom.course?.name ?? null,
    term: classroom.course?.term ?? null,
  }));
}
