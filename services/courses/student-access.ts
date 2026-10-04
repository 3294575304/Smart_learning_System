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
