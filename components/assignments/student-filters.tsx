"use client";
import { useEffect } from "react";
import { RotateCcw, Search } from "lucide-react";
import {
  studentListHref,
  type TeacherStudentQuery,
} from "@/services/assignments/student-query";
type Classroom = {
  id: string;
  name: string;
  courseId: string | null;
  status: string;
  historicalAssignmentCount: number;
};
export function AssignmentCourseFilter({
  courses,
  classrooms,
  courseId,
  classroomId,
  section,
  notice,
  studentQuery,
  category,
  compact = false,
}: {
  courses: { id: string; name: string; term: string }[];
  classrooms: { id: string; courseId: string | null }[];
  courseId?: string;
  classroomId?: string;
  section: string;
  notice: boolean;
  studentQuery?: TeacherStudentQuery;
  category?: string;
  compact?: boolean;
}) {
  useEffect(() => {
    if (notice) {
      const url = new URL(location.href);
      url.searchParams.delete("scopeChanged");
      history.replaceState(history.state, "", url.pathname + url.search);
    }
  }, [notice]);
  return (
    <div className={compact ? "assignment-course-inline" : undefined}>
      <form
        className={compact ? "assignment-course-inline-form" : "tt-fbar"}
        onSubmit={(event) => {
          const form = event.currentTarget;
          const course = form.elements.namedItem("courseId");
          const classroom = form.elements.namedItem("classroomId");
          const changed = form.elements.namedItem("scopeChanged");
          if (
            course instanceof HTMLSelectElement &&
            classroom instanceof HTMLInputElement &&
            changed instanceof HTMLInputElement
          ) {
            const selected = classrooms.find(
              (item) => item.id === classroom.value,
            );
            if (
              selected &&
              course.value &&
              selected.courseId !== course.value
            ) {
              classroom.value = "";
              changed.value = "1";
            }
          }
        }}
      >
        {studentQuery && (
          <>
            <input type="hidden" name="view" value="STUDENTS" />
            <input
              type="hidden"
              name="studentKeyword"
              value={studentQuery.studentKeyword}
            />
            <input
              type="hidden"
              name="pageSize"
              value={studentQuery.pageSize}
            />
          </>
        )}
        {category && !studentQuery && (
          <input type="hidden" name="category" value={category} />
        )}
        <input type="hidden" name="section" value={section} />
        <input
          type="hidden"
          name="classroomId"
          defaultValue={classroomId ?? ""}
        />
        <input type="hidden" name="scopeChanged" defaultValue="0" />
        <label className="flex max-w-full min-w-0 items-center gap-2 text-xs font-medium">
          课程
          <select
            className="max-w-full sm:max-w-80"
            name="courseId"
            defaultValue={courseId ?? ""}
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
          >
            <option value="">全部本人课程</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name} · {course.term}
              </option>
            ))}
          </select>
        </label>
      </form>
      {notice && (
        <p role="status" className="mt-2 text-sm text-sky-800">
          原班级不属于所选课程或教学范围，已切换为全部班级。
        </p>
      )}
    </div>
  );
}
export function StudentAssignmentFilters({
  query,
  classrooms,
}: {
  query: TeacherStudentQuery;
  classrooms: Classroom[];
}) {
  return (
    <form aria-label="学生作业查询" className="tt-fbar">
      <input type="hidden" name="view" value="STUDENTS" />
      <input type="hidden" name="section" value="ALL" />
      <input type="hidden" name="pageSize" value={query.pageSize} />
      {query.courseId && (
        <input type="hidden" name="courseId" value={query.courseId} />
      )}
      <div className="tt-search" style={{ flex: "1 1 16rem" }}>
        <Search
          aria-hidden="true"
          className="size-3.5 shrink-0 text-slate-400"
        />
        <input
          aria-label="姓名或学号"
          name="studentKeyword"
          maxLength={120}
          placeholder="搜索学生学号／姓名"
          defaultValue={query.studentKeyword}
          type="search"
        />
        <button
          type="submit"
          className="shrink-0 text-xs font-medium text-sky-700 hover:text-sky-900"
        >
          搜索
        </button>
      </div>
      <label className="max-w-full min-w-0">
        <span className="sr-only">班级</span>
        <select
          name="classroomId"
          className="max-w-full sm:max-w-56"
          defaultValue={query.classroomId ?? ""}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
        >
          <option value="">全部班级</option>
          {classrooms
            .filter(
              (item) => !query.courseId || item.courseId === query.courseId,
            )
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.status !== "ACTIVE" ? " · 历史班级" : ""}
              </option>
            ))}
        </select>
      </label>
      {(query.classroomId || query.studentKeyword) && (
        <a
          className="tt-btn-ghost shrink-0"
          href={studentListHref(
            {
              ...query,
              classroomId: undefined,
              studentKeyword: "",
              submissionFilter: "ALL",
            },
            1,
          )}
        >
          <RotateCcw aria-hidden="true" className="size-3.5" />
          重置
        </a>
      )}
    </form>
  );
}
