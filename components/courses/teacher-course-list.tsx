"use client";

import { CourseStatus } from "@prisma/client";
import {
  ArrowUpRight,
  BookOpenCheck,
  CheckCircle2,
  LoaderCircle,
  School,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import React, { useState } from "react";

import { requestApi } from "@/components/courses/request-api";
import { EmptyState } from "@/components/dashboard/empty-state";
import type {
  TeacherCourseDeletionResult,
  TeacherCourseListItem,
} from "@/services/courses/types";

const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  DRAFT: "草稿",
  ACTIVE: "启用",
  ARCHIVED: "归档",
};

const COURSE_STATUS_STYLES: Record<CourseStatus, string> = {
  DRAFT: "bg-sky-100/70 text-gray-700",
  ACTIVE: "bg-emerald-50 text-emerald-700",
  ARCHIVED: "bg-sky-100/70 text-slate-600",
};

function CourseDeleteAction({
  course,
  onDeleted,
}: {
  course: TeacherCourseListItem;
  onDeleted: (result: TeacherCourseDeletionResult) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDialog() {
    setError(null);
    setDialogOpen(true);
  }

  function closeDialog() {
    if (isDeleting) return;
    setDialogOpen(false);
    setError(null);
  }

  async function confirmDelete() {
    if (isDeleting) return;
    setIsDeleting(true);
    setError(null);

    const result = await requestApi<TeacherCourseDeletionResult>(
      `/api/teacher/courses/${course.id}`,
      { method: "DELETE" },
    );

    if (!result.success) {
      setError(result.error);
      setIsDeleting(false);
      return;
    }

    setDialogOpen(false);
    setIsDeleting(false);
    onDeleted(result.data);
  }

  return (
    <>
      <button
        aria-label={`删除课程“${course.name}”`}
        className="text-muted-foreground hover:bg-destructive/5 hover:text-destructive inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
        onClick={openDialog}
        type="button"
      >
        <Trash2 className="h-4 w-4" />
        删除课程
      </button>

      {dialogOpen ? (
        <div
          aria-labelledby={`delete-course-title-${course.id}`}
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-sky-950/25 p-4 backdrop-blur-[1px]"
          role="alertdialog"
        >
          <div className="w-full max-w-md rounded-xl border bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  className="text-lg font-semibold"
                  id={`delete-course-title-${course.id}`}
                >
                  确认删除课程
                </h2>
                <p className="text-muted-foreground mt-2 text-sm">
                  课程将从课程管理中移除；关联班级、作业、成绩和其他历史教学数据会完整保留。
                </p>
              </div>
              <button
                aria-label="关闭删除确认框"
                className="rounded-md p-1 text-gray-500 hover:bg-sky-100/70 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isDeleting}
                onClick={closeDialog}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 rounded-lg border bg-sky-50/70 p-4 text-sm">
              <p className="font-medium">{course.name}</p>
              <p className="text-muted-foreground mt-1">
                课程号：{course.courseNo}
              </p>
            </div>

            <p className="text-destructive mt-4 text-sm font-medium">
              当前不提供恢复入口，请确认不再使用此课程开展教学。
            </p>

            {error ? (
              <div
                aria-live="polite"
                className="bg-destructive/10 text-destructive mt-4 rounded-md p-3 text-sm"
              >
                {error}
              </div>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <button
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-sky-50/70 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isDeleting}
                onClick={closeDialog}
                type="button"
              >
                取消
              </button>
              <button
                className="bg-destructive text-destructive-foreground inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isDeleting}
                onClick={() => void confirmDelete()}
                type="button"
              >
                {isDeleting ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    删除中...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    确认删除
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function TeacherCourseList({
  initialCourses,
}: {
  initialCourses: TeacherCourseListItem[];
}) {
  const [courses, setCourses] = useState(initialCourses);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function handleDeleted(result: TeacherCourseDeletionResult) {
    setCourses((items) => items.filter((course) => course.id !== result.id));
    setSuccessMessage(`课程“${result.name}”已删除，历史教学数据已保留。`);
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">我的课程</h2>
        <span className="text-muted-foreground text-sm">
          共 {courses.length} 门
        </span>
      </div>

      {successMessage ? (
        <div
          aria-live="polite"
          className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"
        >
          <CheckCircle2 className="h-4 w-4" />
          {successMessage}
        </div>
      ) : null}

      {courses.length === 0 ? (
        <EmptyState
          description="先基于课程模板创建一门课程，再把班级关联进来。"
          icon={School}
          title="暂无课程"
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {courses.map((course) => (
            <article
              key={course.id}
              className="min-w-0 rounded-xl border bg-white p-4 transition hover:border-sky-300"
            >
              <div className="flex items-start justify-between gap-3">
                <Link
                  className="flex min-w-0 items-center gap-2 rounded text-slate-950 hover:text-sky-700 focus-visible:outline-2 focus-visible:outline-sky-600"
                  href={`/teacher/courses/${course.id}`}
                >
                  <BookOpenCheck
                    aria-hidden="true"
                    className="size-5 shrink-0 text-sky-600"
                  />
                  <h3 className="text-base font-semibold break-words">
                    {course.name}
                  </h3>
                </Link>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-xs ${COURSE_STATUS_STYLES[course.status]}`}
                >
                  {COURSE_STATUS_LABELS[course.status]}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                {course.courseNo} · {course.term}
              </p>
              {course.description && (
                <p className="mt-1 line-clamp-1 text-xs text-slate-500">
                  {course.description}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-sky-50/70 px-3 py-2 text-xs text-slate-600">
                <span>
                  <strong className="text-slate-900">
                    {course.classroomCount}
                  </strong>{" "}
                  个关联班级
                </span>
                <span>
                  <strong className="text-slate-900">
                    {course.activeClassroomCount}
                  </strong>{" "}
                  个开课班级
                </span>
                <span>
                  <strong className="text-slate-900">
                    {course.activeStudentCount}
                  </strong>{" "}
                  学生人次
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link
                  className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-sky-600"
                  href={`/teacher/courses/${course.id}`}
                >
                  进入课程
                  <ArrowUpRight aria-hidden="true" className="size-3.5" />
                </Link>
                <div className="ml-auto">
                  <CourseDeleteAction
                    course={course}
                    onDeleted={handleDeleted}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
