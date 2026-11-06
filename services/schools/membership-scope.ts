import "server-only";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";

export async function assertSchoolMembership(
  classroomId: string,
  studentId: string,
  client: typeof prisma | Prisma.TransactionClient = prisma,
) {
  const [classroom, student] = await Promise.all([
    client.classroom.findUnique({
      where: { id: classroomId },
      select: { teacher: { select: { schoolId: true } } },
    }),
    client.user.findUnique({
      where: { id: studentId },
      select: { schoolId: true, role: true },
    }),
  ]);
  if (
    !classroom?.teacher.schoolId ||
    student?.role !== Role.STUDENT ||
    student.schoolId !== classroom.teacher.schoolId
  ) {
    throw new ResourceNotFoundError("班级或学生不存在");
  }
}
