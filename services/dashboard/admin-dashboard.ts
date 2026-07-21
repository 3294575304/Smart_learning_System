import "server-only";

import { Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export async function getAdminDashboard() {
  const [userCount, teacherCount, studentCount, classroomCount] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: Role.TEACHER } }),
      prisma.user.count({ where: { role: Role.STUDENT } }),
      prisma.classroom.count(),
    ]);

  return { userCount, teacherCount, studentCount, classroomCount };
}
