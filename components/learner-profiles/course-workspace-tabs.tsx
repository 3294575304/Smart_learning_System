import React from "react";
import { BookOpen, ClipboardList, GitBranch } from "lucide-react";
import {
  STUDENT_COURSE_TABS,
  studentCourseTabHref,
  type StudentCourseTab,
} from "@/services/courses/student-workspace";
import { SECTION_TABS_LIST } from "@/components/ui/section-tabs";
import { CourseWorkspaceTabLink } from "./course-workspace-tab-link";
const icons = [BookOpen, ClipboardList, GitBranch];
export function CourseWorkspaceTabs({
  courseId,
  classroomId,
  tab,
}: {
  courseId: string;
  classroomId: string;
  tab: StudentCourseTab;
}) {
  return (
    <nav aria-label="课程学习中心页面导航" className={SECTION_TABS_LIST}>
      {STUDENT_COURSE_TABS.map((item, index) => {
        const Icon = icons[index];
        return (
          <CourseWorkspaceTabLink
            key={item.id}
            href={studentCourseTabHref(courseId, classroomId, item.id)}
            active={tab === item.id}
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            {item.label}
          </CourseWorkspaceTabLink>
        );
      })}
    </nav>
  );
}
