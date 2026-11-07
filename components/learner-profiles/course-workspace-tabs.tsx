import React from "react";
import { BookOpen, ClipboardList, GitBranch } from "lucide-react";
import {
  STUDENT_COURSE_TABS,
  studentCourseTabHref,
  type StudentCourseTab,
} from "@/services/courses/student-workspace";
import {
  SECTION_TABS_LIST,
  sectionTabClass,
} from "@/components/ui/section-tabs";
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
          <a
            key={item.id}
            href={studentCourseTabHref(courseId, classroomId, item.id)}
            aria-current={tab === item.id ? "page" : undefined}
            className={sectionTabClass(tab === item.id)}
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}
