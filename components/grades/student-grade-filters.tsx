"use client";

import { withStudentAnalysisReturn } from "@/services/student-experience/analysis-navigation";
import React, { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { studentEnrollmentLabel } from "@/services/courses/student-enrollment";
import type { GradeCardContext } from "@/services/gradebook/student-card-filters";
import { studentGradeFilterHref } from "@/services/gradebook/student-card-filters";

export function StudentGradeFilters({
  contexts,
  courseReturn,
  analysisReturn,
  classroomId,
  publication,
  q,
}: {
  contexts: GradeCardContext[];
  analysisReturn?: string;
  courseReturn?: { courseId: string; classroomId: string };
  courseId: string;
  classroomId: string;
  publication: string;
  q: string;
}) {
  const [classroom, setClassroom] = useState(classroomId);
  const [publicationState, setPublication] = useState(publication);
  const [search, setSearch] = useState(q);
  const router = useRouter();
  const [pending, startNavigation] = useTransition();
  useEffect(() => {
    // Browsers can restore pre-submit form drafts when returning from history.
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      let selected = params.get("classroomId") ?? "";
      const scope = params.get("courseId");
      const matches = contexts.filter((x) => x.course.id === scope);
      if (!selected && scope && matches.length === 1)
        selected = matches[0].classroom.id;
      setClassroom(selected);
      setPublication(params.get("publication") || "ALL");
      setSearch(params.get("q") ?? "");
    };
    restore();
    window.addEventListener("pageshow", restore);
    window.addEventListener("popstate", restore);
    return () => {
      window.removeEventListener("pageshow", restore);
      window.removeEventListener("popstate", restore);
    };
  }, [contexts, classroomId, publication, q]);
  const course =
    contexts.find((x) => x.classroom.id === classroom)?.course.id ?? "";
  function navigate(nextClassroom: string, nextPublication: string, query = q) {
    startNavigation(() => {
      router.push(
        withStudentAnalysisReturn(
          studentGradeFilterHref(
            contexts,
            nextClassroom,
            nextPublication,
            query,
            courseReturn,
          ),
          analysisReturn,
        ),
        { scroll: false },
      );
    });
  }
  const control =
    "min-h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus-visible:outline-2 focus-visible:outline-sky-600";
  return (
    <form
      action="/student/results"
      onSubmit={(event) => {
        event.preventDefault();
        navigate(classroom, publicationState, search);
      }}
      autoComplete="off"
      aria-busy={pending}
      className="grid gap-3 rounded-xl border border-sky-100 bg-white p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_9rem_minmax(0,1fr)_auto]"
    >
      <input type="hidden" name="view" value="course" />
      {analysisReturn && (
        <input type="hidden" name="analysisReturn" value={analysisReturn} />
      )}
      {courseReturn && (
        <>
          <input
            type="hidden"
            name="backCourseId"
            value={courseReturn.courseId}
          />
          <input
            type="hidden"
            name="backClassroomId"
            value={courseReturn.classroomId}
          />
        </>
      )}
      <input type="hidden" name="courseId" value={course} />
      <label className="min-w-0 text-xs text-slate-500">
        课程
        <select
          aria-label="课程"
          name="classroomId"
          className={`${control} mt-1.5`}
          value={classroom}
          disabled={pending}
          onChange={(event) => {
            setClassroom(event.target.value);
            navigate(event.target.value, publicationState);
          }}
        >
          <option value="">全部课程</option>
          {contexts.map((item) => (
            <option key={item.classroom.id} value={item.classroom.id}>
              {studentEnrollmentLabel(item)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-slate-500">
        成绩状态
        <select
          className={`${control} mt-1.5`}
          name="publication"
          value={publicationState}
          disabled={pending}
          onChange={(event) => {
            setPublication(event.target.value);
            navigate(classroom, event.target.value);
          }}
        >
          <option value="ALL">全部状态</option>
          <option value="PUBLISHED">已发布</option>
          <option value="PENDING">待发布</option>
        </select>
      </label>
      <label className="min-w-0 text-xs text-slate-500">
        搜索
        <input
          className={`${control} mt-1.5`}
          name="q"
          maxLength={80}
          disabled={pending}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="课程、班级或课程号"
        />
      </label>
      <button
        className="min-h-11 self-end rounded-lg bg-sky-700 px-5 text-sm font-medium text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
        type="submit"
        disabled={pending}
      >
        搜索
      </button>
    </form>
  );
}
