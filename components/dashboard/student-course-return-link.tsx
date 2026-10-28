import React from "react";
import { StudentBackLink } from "./student-back-link";
import { studentCourseReturnHref } from "@/services/courses/student-return";

export function StudentCourseReturnLink({
  courseId,
  classroomId,
}: {
  courseId?: unknown;
  classroomId?: unknown;
}) {
  return (
    <StudentBackLink href={studentCourseReturnHref(courseId, classroomId)}>
      返回我的课程
    </StudentBackLink>
  );
}
