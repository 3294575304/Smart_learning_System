"use client";

import { CourseStatus } from "@prisma/client";
import {
  CheckCircle2,
  LoaderCircle,
  MoreVertical,
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
  DRAFT: "bg-gray-100 text-gray-700",
  ACTIVE: "bg-emerald-50 text-emerald-700",
  ARCHIVED: "bg-slate-100 text-slate-600",
};

function CourseDeleteAction({
  course,
  onDeleted,
}: {
  course: TeacherCourseListItem;
  onDeleted: (result: TeacherCourseDeletionResult) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDialog() {
    setMenuOpen(false);
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
      <div className="relative shrink-0">
        <button
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label={`打开“${course.name}”课程操作菜单`}
          className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          onClick={() => setMenuOpen((open) => !open)}
          type="button"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {menuOpen ? (
          <div
            aria-label="课程操作"
            className="absolute top-10 right-0 z-20 min-w-36 rounded-md border bg-white p-1 shadow-lg"
            role="menu"
          >
            <button
              className="text-destructive hover:bg-destructive/10 flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm"
              onClick={openDialog}
              role="menuitem"
              type="button"
            >
              <Trash2 className="h-4 w-4" />
              删除课程
            </button>
          </div>
        ) : null}
      </div>

      {dialogOpen ? (
        <div
          aria-labelledby={`delete-course-title-${course.id}`}
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
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
                  此操作只适用于尚未产生正式教学数据的草稿课程。
                </p>
              </div>
              <button
                aria-label="关闭删除确认框"
                className="rounded-md p-1 text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isDeleting}
                onClick={closeDialog}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 rounded-lg border bg-gray-50 p-4 text-sm">
              <p className="font-medium">{course.name}</p>
              <p className="text-muted-foreground mt-1">
                课程号：{course.courseNo}
              </p>
            </div>

            <p className="text-destructive mt-4 text-sm font-medium">
              删除后无法恢复。
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
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
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
    setSuccessMessage(`课程“${result.name}”已删除。`);
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
        <div className="grid gap-4 md:grid-cols-2">
          {courses.map((course) => (
            <article
              className="bg-card rounded-xl border p-5 transition-colors hover:bg-gray-50"
              key={course.id}
            >
              <div className="flex items-start justify-between gap-3">
                <Link
                  className="min-w-0 flex-1 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                  href={`/teacher/courses/${course.id}`}
                >
                  <h3 className="truncate font-semibold">{course.name}</h3>
                  <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                    {course.description ?? "暂无课程说明"}
                  </p>
                </Link>
                <div className="flex items-start gap-1">
                  <span
                    className={`mt-1 shrink-0 rounded-full px-2.5 py-1 text-xs ${COURSE_STATUS_STYLES[course.status]}`}
                  >
                    {COURSE_STATUS_LABELS[course.status]}
                  </span>
                  <CourseDeleteAction
                    course={course}
                    onDeleted={handleDeleted}
                  />
                </div>
              </div>

              <Link
                className="block rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                href={`/teacher/courses/${course.id}`}
              >
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-muted-foreground text-xs">课程号</p>
                    <p className="mt-1 font-medium">{course.courseNo}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">学期</p>
                    <p className="mt-1 font-medium">{course.term}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">关联班级</p>
                    <p className="mt-1 font-medium">{course.classroomCount}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">学生人数</p>
                    <p className="mt-1 font-medium">
                      {course.activeStudentCount}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 text-xs">
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">
                    {course.template.name}
                  </span>
                  <span className="text-muted-foreground">
                    {course.activeClassroomCount} 个开课班级
                  </span>
                </div>
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
