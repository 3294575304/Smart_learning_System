import "server-only";

import { notFound } from "next/navigation";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { getTeacherCourseClassroom } from "@/services/courses/classroom-context";

export async function getTeacherCourseClassroomForPage(
  teacherId: string,
  courseId: string,
  classroomId?: unknown,
) {
  try {
    return await getTeacherCourseClassroom(teacherId, courseId, classroomId);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
