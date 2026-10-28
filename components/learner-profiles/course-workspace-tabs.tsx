import React from "react";
import { BookOpen, GitBranch, UserRound } from "lucide-react";
import {
  STUDENT_COURSE_TABS,
  studentCourseTabHref,
  type StudentCourseTab,
} from "@/services/courses/student-workspace";
const icons = [BookOpen, GitBranch, UserRound];
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
    <nav
      aria-label="课程学习中心页面导航"
      className="max-w-full overflow-x-auto pb-1"
    >
      <div className="inline-flex min-w-max gap-1 rounded-xl border border-sky-100 bg-white p-1">
        {STUDENT_COURSE_TABS.map((item, index) => {
          const Icon = icons[index];
          return (
            <a
              key={item.id}
              href={studentCourseTabHref(courseId, classroomId, item.id)}
              aria-current={tab === item.id ? "page" : undefined}
              className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${tab === item.id ? "bg-sky-50 text-sky-700 ring-1 ring-sky-200" : "text-slate-500 hover:bg-slate-50 hover:text-sky-700"}`}
            >
              <Icon aria-hidden="true" className="size-4" />
              {item.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
