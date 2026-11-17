import "server-only";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { teacherCourseManagementWhere } from "@/services/courses/repository";
import type { TeacherTeachingPreferences } from "./teacher-settings-schemas";

export async function getTeacherWorkbenchPreferences(teacherId: string) {
  const [teacher, courses] = await Promise.all([
    prisma.user.findUnique({
      where: { id: teacherId },
      select: { teacherDefaultCourseId: true },
    }),
    prisma.course.findMany({
      where: teacherCourseManagementWhere(teacherId),
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      select: { id: true, name: true, term: true },
    }),
  ]);
  return {
    courses,
    defaultCourseId:
      courses.find((course) => course.id === teacher?.teacherDefaultCourseId)
        ?.id ?? null,
  };
}

export async function setTeacherDefaultCourse(
  teacherId: string,
  defaultCourseId: string | null,
) {
  await prisma.$transaction(async (tx) => {
    if (
      defaultCourseId &&
      !(await tx.course.findFirst({
        where: {
          ...teacherCourseManagementWhere(teacherId),
          id: defaultCourseId,
        },
        select: { id: true },
      }))
    )
      throw new ResourceNotFoundError("课程不存在或不可选择");
    await tx.user.update({
      where: { id: teacherId, role: "TEACHER" },
      data: { teacherDefaultCourseId: defaultCourseId },
    });
  });
  return { defaultCourseId };
}

export async function getTeacherTeachingPreferences(
  teacherId: string,
): Promise<TeacherTeachingPreferences> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: teacherId, role: "TEACHER" },
    select: {
      teacherAssignmentDueDays: true,
      teacherAssignmentAllowResubmission: true,
      teacherNotifyQualityReportReady: true,
    },
  });
  return {
    assignmentDueDays: user.teacherAssignmentDueDays,
    allowAssignmentResubmission: user.teacherAssignmentAllowResubmission,
    notifyQualityReportReady: user.teacherNotifyQualityReportReady,
  };
}

export async function setTeacherTeachingPreferences(
  teacherId: string,
  preferences: TeacherTeachingPreferences,
) {
  await prisma.user.update({
    where: { id: teacherId, role: "TEACHER" },
    data: {
      teacherAssignmentDueDays: preferences.assignmentDueDays,
      teacherAssignmentAllowResubmission:
        preferences.allowAssignmentResubmission,
      teacherNotifyQualityReportReady: preferences.notifyQualityReportReady,
    },
  });
  return { teachingPreferences: preferences };
}
