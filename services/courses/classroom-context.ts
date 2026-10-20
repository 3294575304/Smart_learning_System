import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { classroomIdSchema } from "@/services/courses/schemas";

export async function getTeacherCourseClassroom(
  teacherId: string,
  courseId: string,
  classroomId?: unknown,
) {
  if (classroomId === undefined || classroomId === null || classroomId === "")
    return null;
  const parsed = classroomIdSchema.safeParse(classroomId);
  if (!parsed.success) throw new ResourceNotFoundError("班级不存在");
  const classroom = await prisma.classroom.findFirst({
    where: { id: parsed.data, courseId, teacherId, course: { teacherId } },
    select: { id: true, name: true, status: true },
  });
  if (!classroom) throw new ResourceNotFoundError("班级不存在");
  return classroom;
}
