"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCcw, Search } from "lucide-react";
import {
  teacherExamStatusLabels,
  type TeacherExamListScope,
} from "@/services/exams/schemas";

const control =
  "h-10 w-full min-w-0 rounded-lg border border-slate-400 bg-white px-3 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700";

export function ExamListFilters({
  courses,
  classrooms,
  scope,
  archivedCourseSelected,
  archivedClassroomSelected,
}: {
  courses: { id: string; name: string; term: string; courseNo: string }[];
  classrooms: { id: string; name: string; courseId: string }[];
  scope: TeacherExamListScope;
  archivedCourseSelected: boolean;
  archivedClassroomSelected: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function filter(form: HTMLFormElement, courseChanged = false) {
    const query = new URLSearchParams();
    for (const [key, value] of new FormData(form)) {
      if (typeof value === "string" && value.trim())
        query.set(key, value.trim());
    }
    if (
      courseChanged ||
      (query.get("courseId") ?? "") !== (scope.courseId ?? "")
    ) {
      const courseId = query.get("courseId");
      const selected = classrooms.find(
        (item) => item.id === query.get("classroomId"),
      );
      if (!selected || (courseId && selected.courseId !== courseId)) {
        query.delete("classroomId");
        const classroom = form.elements.namedItem("classroomId");
        if (classroom instanceof HTMLSelectElement) classroom.value = "";
      }
    }
    startTransition(() =>
      router.replace(
        query.size ? `/teacher/exams?${query}` : "/teacher/exams",
        { scroll: false },
      ),
    );
  }

  return (
    <form
      action="/teacher/exams"
      aria-label="筛选考试"
      aria-busy={pending}
      onChange={(event) => {
        if (event.target instanceof HTMLSelectElement) {
          filter(event.currentTarget, event.target.name === "courseId");
        }
      }}
      onSubmit={(event) => {
        event.preventDefault();
        filter(event.currentTarget);
      }}
      className="grid items-end gap-3 rounded-2xl border border-sky-100 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-[minmax(10rem,1.4fr)_repeat(2,minmax(8rem,1fr))_repeat(2,minmax(7rem,0.65fr))_auto]"
    >
      <label className="grid min-w-0 gap-1.5 text-sm font-medium">
        考试名称
        <input
          type="search"
          name="keyword"
          defaultValue={scope.keyword}
          placeholder="搜索考试名称"
          maxLength={120}
          className={control}
        />
      </label>
      <label className="grid min-w-0 gap-1.5 text-sm font-medium">
        课程
        <select
          name="courseId"
          defaultValue={scope.courseId ?? ""}
          className={control}
        >
          <option value="">全部本人课程</option>
          {archivedCourseSelected && (
            <option value={scope.courseId}>已归档课程（历史记录）</option>
          )}
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.name} · {course.term}
              {courses.some(
                (other) =>
                  other.id !== course.id &&
                  other.name === course.name &&
                  other.term === course.term,
              )
                ? ` · ${course.courseNo}`
                : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="grid min-w-0 gap-1.5 text-sm font-medium">
        教学班
        <select
          name="classroomId"
          defaultValue={scope.classroomId ?? ""}
          className={control}
        >
          <option value="">全部教学班</option>
          {archivedClassroomSelected && (
            <option value={scope.classroomId}>已归档教学班（历史记录）</option>
          )}
          {classrooms
            .filter(
              (item) => !scope.courseId || item.courseId === scope.courseId,
            )
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
        </select>
      </label>
      <label className="grid min-w-0 gap-1.5 text-sm font-medium">
        考试状态
        <select
          name="status"
          defaultValue={scope.status ?? ""}
          className={control}
        >
          <option value="">全部状态</option>
          {Object.entries(teacherExamStatusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid min-w-0 gap-1.5 text-sm font-medium">
        考试类型
        <select name="type" defaultValue={scope.type ?? ""} className={control}>
          <option value="">全部类型</option>
          <option value="MIDTERM">期中考试</option>
          <option value="FINAL">期末考试</option>
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-sky-700 px-3 text-sm font-medium whitespace-nowrap text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 active:bg-sky-900 motion-safe:transition-colors"
        >
          <Search aria-hidden="true" className="size-4" />
          {pending ? "更新中" : "搜索"}
        </button>
        <Link
          href="/teacher/exams"
          onClick={(event) => {
            event.currentTarget.closest("form")?.reset();
          }}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm whitespace-nowrap text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 active:bg-slate-100 motion-safe:transition-colors"
        >
          <RotateCcw aria-hidden="true" className="size-4" />
          重置
        </Link>
      </div>
    </form>
  );
}
