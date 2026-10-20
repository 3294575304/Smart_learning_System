import "server-only";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { getTeacherCourseClassroom } from "@/services/courses/classroom-context";

export async function listTeacherClassroomRandomCandidates(
  teacherId: string,
  courseId: string,
  classroomId: string,
) {
  const classroom = await getTeacherCourseClassroom(
    teacherId,
    courseId,
    classroomId,
  );
  if (!classroom || classroom.status !== "ACTIVE")
    throw new ResourceNotFoundError("班级不存在");

  const memberships = await prisma.classMembership.findMany({
    where: {
      classroomId,
      status: "ACTIVE",
      classroom: { courseId, teacherId, status: "ACTIVE" },
      student: { role: "STUDENT", status: "ACTIVE" },
    },
    select: {
      studentId: true,
      student: {
        select: {
          profile: {
            select: { displayName: true, studentNo: true },
          },
        },
      },
    },
  });
  return memberships
    .map((membership) => ({
      id: membership.studentId,
      name: membership.student.profile?.displayName ?? "未设置姓名",
      studentNo: membership.student.profile?.studentNo ?? "",
    }))
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name, "zh-CN") ||
        left.studentNo.localeCompare(right.studentNo, "zh-CN"),
    );
}
