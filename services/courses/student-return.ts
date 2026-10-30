import { z } from "zod";
import {
  studentCourseTabHref,
  type StudentCourseTab,
} from "./student-workspace";

// A navigation hint never grants access; the destination verifies membership again.
export function studentCourseReturnHref(
  courseId: unknown,
  classroomId: unknown,
  tab: StudentCourseTab = "overview",
) {
  const course = z.string().cuid().safeParse(courseId);
  const classroom = z.string().cuid().safeParse(classroomId);
  return course.success && classroom.success
    ? studentCourseTabHref(course.data, classroom.data, tab)
    : "/student/courses";
}
