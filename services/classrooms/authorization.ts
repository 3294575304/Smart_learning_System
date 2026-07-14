import "server-only";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/authorization";

export interface TeacherClassroomSummary {
  id: string;
  name: string;
  description: string | null;
  joinCode: string;
  status: string;
  studentCount: number;
}

export async function getTeacherOwnedClassroom(
  teacherId: string,
  classroomId: string,
): Promise<TeacherClassroomSummary> {
  const classroom = await prisma.classroom.findFirst({
    where: {
      id: classroomId,
      teacherId,
    },
    select: {
      id: true,
      name: true,
      description: true,
      joinCode: true,
      status: true,
      _count: {
        select: { memberships: true },
      },
    },
  });

  if (!classroom) {
    throw new ResourceNotFoundError("班级不存在");
  }

  return {
    id: classroom.id,
    name: classroom.name,
    description: classroom.description,
    joinCode: classroom.joinCode,
    status: classroom.status,
    studentCount: classroom._count.memberships,
  };
}
