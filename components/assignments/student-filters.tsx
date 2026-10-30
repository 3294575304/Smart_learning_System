"use client";
import { useEffect } from "react";
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
}: {
  courses: { id: string; name: string; term: string }[];
  classrooms: { id: string; courseId: string | null }[];
  courseId?: string;
  classroomId?: string;
  section: string;
  notice: boolean;
  studentQuery?: TeacherStudentQuery;
}) {
  useEffect(() => {
    if (notice) {
      const url = new URL(location.href);
      url.searchParams.delete("scopeChanged");
      history.replaceState(history.state, "", url.pathname + url.search);
    }
  }, [notice]);
  return (
    <div>
      <form
        className="flex flex-wrap items-center gap-3"
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
        <input type="hidden" name="section" value={section} />
        <input
          type="hidden"
          name="classroomId"
          defaultValue={classroomId ?? ""}
        />
        <input type="hidden" name="scopeChanged" defaultValue="0" />
        <label className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium">
          课程
          <select
            className="h-10 w-full max-w-sm min-w-0 rounded-lg border bg-white px-3 text-sm sm:w-80"
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
  const control = "h-10 min-w-0 rounded-lg border bg-white px-3 text-sm";
  return (
    <form
      aria-label="学生作业查询"
      className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-3 sm:p-4"
    >
      <input type="hidden" name="view" value="STUDENTS" />
      <input type="hidden" name="section" value="ALL" />
      <input type="hidden" name="pageSize" value={query.pageSize} />
      {query.courseId && (
        <input type="hidden" name="courseId" value={query.courseId} />
      )}
      <label className="flex w-full min-w-0 items-center gap-2 text-sm sm:w-auto">
        <span className="shrink-0">班级</span>
        <select
          name="classroomId"
          className={`${control} w-full sm:w-[220px]`}
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
      <label className="w-full min-w-0 sm:w-[280px]">
        <span className="sr-only">姓名或学号</span>
        <input
          name="studentKeyword"
          maxLength={120}
          placeholder="搜索学生学号／姓名"
          defaultValue={query.studentKeyword}
          className={`${control} w-full`}
        />
      </label>
      <button
        type="submit"
        className="h-10 rounded-lg bg-sky-700 px-4 text-sm font-medium text-white hover:bg-sky-800"
      >
        搜索
      </button>
      {(query.classroomId || query.studentKeyword) && (
        <a
          className="inline-flex h-10 items-center px-1 text-sm text-slate-500 hover:text-sky-700"
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
          清空
        </a>
      )}
    </form>
  );
}
