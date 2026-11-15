"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import Link from "next/link";
import type { ClassroomStatus } from "@prisma/client";
import { CLASSROOM_STATUS_LABELS } from "@/services/classrooms/presentation";
import {
  reportingClassroomMatches,
  REPORTING_SECTION_LABELS,
} from "@/services/assignments/reporting";
import type { TeacherResultsOverviewQuery } from "@/services/assignment-results/schemas";

type Classroom = {
  id: string;
  name: string;
  status: ClassroomStatus;
  courseId: string | null;
  historicalAssignmentCount: number;
};

export function TeacherResultsFilters({
  courses,
  classrooms,
  query,
  scopeChanged,
}: {
  courses: { id: string; name: string; term: string }[];
  classrooms: Classroom[];
  query: TeacherResultsOverviewQuery;
  scopeChanged: boolean;
}) {
  useEffect(() => {
    if (!scopeChanged) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("scopeChanged");
    window.history.replaceState(
      window.history.state,
      "",
      url.pathname + url.search + url.hash,
    );
  }, [scopeChanged]);
  const options = classrooms.filter(
    (classroom) =>
      (!query.courseId || classroom.courseId === query.courseId) &&
      reportingClassroomMatches(classroom, query.section),
  );
  const control = "max-w-full sm:max-w-72";
  return (
    <div className="max-w-full min-w-0 space-y-2">
      <form
        aria-label="成绩统计筛选"
        className="tt-fbar"
        onChange={(event) => {
          const form = event.currentTarget;
          const course = form.elements.namedItem("courseId");
          const section = form.elements.namedItem("section");
          const classroom = form.elements.namedItem("classroomId");
          const notice = form.elements.namedItem("scopeChanged");
          if (
            !(course instanceof HTMLSelectElement) ||
            !(section instanceof HTMLSelectElement) ||
            !(classroom instanceof HTMLSelectElement) ||
            !(notice instanceof HTMLInputElement)
          )
            return;
          const selected = classrooms.find(
            (item) => item.id === classroom.value,
          );
          const nextSection =
            section.value === "CURRENT" || section.value === "HISTORY"
              ? section.value
              : "ALL";
          if (
            selected &&
            ((course.value && selected.courseId !== course.value) ||
              !reportingClassroomMatches(selected, nextSection))
          ) {
            classroom.value = "";
            notice.value = "1";
          } else {
            notice.value = "0";
          }
          form.requestSubmit();
        }}
      >
        <label className="max-w-full min-w-0">
          <span className="sr-only">课程</span>
          <select
            className={control}
            defaultValue={query.courseId ?? ""}
            name="courseId"
          >
            <option value="">全部课程</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name} · {course.term}
              </option>
            ))}
          </select>
        </label>
        <label className="max-w-full min-w-0">
          <span className="sr-only">教学范围</span>
          <select
            className={control}
            defaultValue={query.section}
            name="section"
          >
            {(["ALL", "CURRENT", "HISTORY"] as const).map((section) => (
              <option key={section} value={section}>
                {REPORTING_SECTION_LABELS[section]}
              </option>
            ))}
          </select>
        </label>
        <label className="max-w-full min-w-0">
          <span className="sr-only">班级</span>
          <select
            className={control}
            defaultValue={query.classroomId ?? ""}
            name="classroomId"
          >
            <option value="">全部班级</option>
            {options.map((classroom) => (
              <option key={classroom.id} value={classroom.id}>
                {classroom.name}
                {classroom.status !== "ACTIVE"
                  ? ` · ${CLASSROOM_STATUS_LABELS[classroom.status]}`
                  : ""}
              </option>
            ))}
          </select>
        </label>
        <input name="pageSize" type="hidden" value={query.pageSize} />
        <input name="scopeChanged" type="hidden" defaultValue="0" />
        {query.courseId || query.classroomId || query.section !== "ALL" ? (
          <Link className="tt-btn-ghost shrink-0" href="/teacher/results">
            <RotateCcw aria-hidden="true" className="size-3.5" />
            重置
          </Link>
        ) : null}
      </form>
      {scopeChanged && (
        <p role="status" className="text-sm text-sky-800">
          原班级不属于新的课程或教学范围，已切换为该范围的全部班级。
        </p>
      )}
    </div>
  );
}
