import React from "react";
import { StudentBackLink } from "./student-back-link";
import { studentCourseReturnHref } from "@/services/courses/student-return";

export function StudentCourseReturnLink({
  courseId,
  classroomId,
  tab = "overview",
  hideFallback = false,
}: {
  courseId?: unknown;
  classroomId?: unknown;
  tab?: "overview" | "tasks";
  hideFallback?: boolean;
}) {
  const href = studentCourseReturnHref(courseId, classroomId, tab);
  if (hideFallback && href === "/student/courses") return null;
  return (
    <StudentBackLink href={href}>
      {href === "/student/courses"
        ? "返回我的课程"
        : tab === "tasks"
          ? "返回课程任务"
          : "返回课程学习中心"}
    </StudentBackLink>
  );
}
