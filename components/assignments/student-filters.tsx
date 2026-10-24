"use client";
import { useEffect } from "react";
import { reportingClassroomMatches } from "@/services/assignments/reporting";
import {
  studentFilterLabels,
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
}: {
  courses: { id: string; name: string; term: string }[];
  classrooms: { id: string; courseId: string | null }[];
  courseId?: string;
  classroomId?: string;
  section: string;
  notice: boolean;
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
        className="flex flex-wrap items-center justify-between gap-3"
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
        {courseId && (
          <a
            className="text-sm text-sky-700 hover:underline"
            href={`/teacher?courseId=${courseId}`}
          >
            返回课程工作台
          </a>
        )}
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
  courses,
  classrooms,
  notice,
}: {
  query: TeacherStudentQuery;
  courses: { id: string; name: string; term: string }[];
  classrooms: Classroom[];
  notice: boolean;
}) {
  useEffect(() => {
    if (notice) {
      const url = new URL(location.href);
      url.searchParams.delete("scopeChanged");
      history.replaceState(history.state, "", url.pathname + url.search);
    }
  }, [notice]);
  const control = "h-10 w-full min-w-0 rounded-lg border bg-white px-3 text-sm";
  return (
    <div className="space-y-3">
      <form
        className="space-y-4 rounded-xl border bg-white p-4"
        onSubmit={(event) => {
          const form = event.currentTarget;
          const course = form.elements.namedItem("courseId");
          const classroom = form.elements.namedItem("classroomId");
          const changed = form.elements.namedItem("scopeChanged");
          const section = form.elements.namedItem("section");
          if (
            course instanceof HTMLSelectElement &&
            classroom instanceof HTMLSelectElement &&
            changed instanceof HTMLInputElement &&
            section instanceof HTMLSelectElement
          ) {
            const selected = classrooms.find(
              (item) => item.id === classroom.value,
            );
            if (
              selected &&
              ((course.value && selected.courseId !== course.value) ||
                !reportingClassroomMatches(
                  selected,
                  section.value === "HISTORY" ? "HISTORY" : "CURRENT",
                ))
            ) {
              classroom.value = "";
              changed.value = "1";
            }
          }
        }}
      >
        <input type="hidden" name="view" value="STUDENTS" />
        <input type="hidden" name="pageSize" value={query.pageSize} />
        <input type="hidden" name="scopeChanged" defaultValue="0" />
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 pb-4">
          <label className="block w-full max-w-xs space-y-1.5 text-xs font-medium">
            课程
            <select
              name="courseId"
              className={control}
              defaultValue={query.courseId ?? ""}
              onChange={(event) => event.currentTarget.form?.requestSubmit()}
            >
              <option value="">全部本人课程</option>
              {courses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.term}
                </option>
              ))}
            </select>
          </label>
          {query.courseId && (
            <a
              className="pb-2 text-sm text-sky-700 hover:underline"
              href={`/teacher?courseId=${query.courseId}`}
            >
              返回课程工作台
            </a>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[8rem_minmax(9rem,13rem)_minmax(11rem,1fr)_11rem_auto] xl:items-end">
          <label className="min-w-0 space-y-1.5 text-xs font-medium">
            教学范围
            <select
              name="section"
              className={control}
              defaultValue={query.section}
              onChange={(event) => event.currentTarget.form?.requestSubmit()}
            >
              <option value="CURRENT">当前作业</option>
              <option value="HISTORY">历史作业</option>
            </select>
          </label>
          <label className="min-w-0 space-y-1.5 text-xs font-medium">
            班级
            <select
              name="classroomId"
              className={control}
              defaultValue={query.classroomId ?? ""}
            >
              <option value="">全部班级</option>
              {classrooms
                .filter(
                  (item) =>
                    (!query.courseId || item.courseId === query.courseId) &&
                    reportingClassroomMatches(item, query.section),
                )
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.status !== "ACTIVE" ? " · 历史班级" : ""}
                  </option>
                ))}
            </select>
          </label>
          <label className="min-w-0 space-y-1.5 text-xs font-medium">
            姓名或学号
            <input
              name="studentKeyword"
              maxLength={120}
              placeholder="输入学生姓名或学号"
              defaultValue={query.studentKeyword}
              className={control}
            />
          </label>
          <label className="min-w-0 space-y-1.5 text-xs font-medium">
            提交情况
            <select
              name="submissionFilter"
              defaultValue={query.submissionFilter}
              className={control}
            >
              {Object.entries(studentFilterLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button className="h-10 rounded-lg bg-sky-700 px-4 text-sm text-white">
              查询
            </button>
            <a
              className="inline-flex h-10 items-center rounded-lg border px-4 text-sm"
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
              重置
            </a>
          </div>
        </div>
      </form>
      {notice && (
        <p role="status" className="text-sm text-sky-800">
          原班级不属于所选课程或教学范围，已切换为全部班级。
        </p>
      )}
    </div>
  );
}
