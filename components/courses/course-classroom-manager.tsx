"use client";

import { Link2, School, Unlink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { requestApi } from "@/components/courses/request-api";
import { EmptyState } from "@/components/dashboard/empty-state";
import type { TeacherCourseClassroomView } from "@/services/courses/types";

export function CourseClassroomManager({
  courseId,
  linkedClassrooms,
  classrooms,
}: {
  courseId: string;
  linkedClassrooms: TeacherCourseClassroomView[];
  classrooms: TeacherCourseClassroomView[];
}) {
  const router = useRouter();
  const [pendingClassroomId, setPendingClassroomId] = useState<string | null>(
    null,
  );

  async function linkClassroom(classroomId: string) {
    const classroom = classrooms.find((item) => item.id === classroomId);
    const currentCourse = classroom?.currentCourse;
    const message = currentCourse
      ? `确认将班级“${classroom?.name ?? classroomId}”从课程“${currentCourse.name}”重新关联到当前课程吗？`
      : `确认将班级“${classroom?.name ?? classroomId}”关联到当前课程吗？`;
    if (!window.confirm(message)) return;

    setPendingClassroomId(classroomId);
    const result = await requestApi<{ id: string }>(
      `/api/teacher/courses/${courseId}/classrooms/${classroomId}`,
      { method: "POST" },
    );
    setPendingClassroomId(null);
    if (!result.success) {
      window.alert(result.error);
      return;
    }
    router.refresh();
  }

  async function unlinkClassroom(classroomId: string) {
    const classroom = classrooms.find((item) => item.id === classroomId);
    if (
      !window.confirm(
        `确认解除班级“${classroom?.name ?? classroomId}”与当前课程的关联吗？`,
      )
    ) {
      return;
    }

    setPendingClassroomId(classroomId);
    const result = await requestApi<{ id: string }>(
      `/api/teacher/courses/${courseId}/classrooms/${classroomId}`,
      { method: "DELETE" },
    );
    setPendingClassroomId(null);
    if (!result.success) {
      window.alert(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="bg-card rounded-xl border p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">已关联班级</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              当前课程下的班级会一起显示在这里。
            </p>
          </div>
          <span className="text-muted-foreground text-sm">
            {linkedClassrooms.length} 个
          </span>
        </div>
        {linkedClassrooms.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              compact
              description="先从下方列表把自己的班级关联到这门课程。"
              icon={School}
              title="暂无关联班级"
            />
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {linkedClassrooms.map((classroom) => (
              <article className="rounded-lg border p-4" key={classroom.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-medium">{classroom.name}</h3>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {classroom.description ?? "暂无班级说明"}
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700">
                    已关联
                  </span>
                </div>
                <p className="text-muted-foreground mt-3 text-xs">
                  班级成员 {classroom.studentCount} 名
                </p>
                <button
                  className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-red-600 disabled:text-gray-400"
                  disabled={pendingClassroomId === classroom.id}
                  onClick={() => void unlinkClassroom(classroom.id)}
                  type="button"
                >
                  {pendingClassroomId === classroom.id ? (
                    "处理中..."
                  ) : (
                    <>
                      <Unlink className="h-4 w-4" />
                      解除关联
                    </>
                  )}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="bg-card rounded-xl border p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">我的班级</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              关联到其他课程的班级也会显示当前去向，方便重新调整。
            </p>
          </div>
          <span className="text-muted-foreground text-sm">
            {classrooms.length} 个
          </span>
        </div>
        {classrooms.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              compact
              description="先创建班级，再回来把它们挂到课程下面。"
              icon={School}
              title="暂无班级"
            />
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {classrooms.map((classroom) => {
              const isLinked = classroom.currentCourse?.id === courseId;
              return (
                <div
                  className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                  key={classroom.id}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-medium">{classroom.name}</h3>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs ${
                          isLinked
                            ? "bg-emerald-50 text-emerald-700"
                            : classroom.currentCourse
                              ? "bg-amber-50 text-amber-700"
                              : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {isLinked
                          ? "当前课程"
                          : classroom.currentCourse
                            ? "已关联其他课程"
                            : "未关联"}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {classroom.description ?? "暂无班级说明"}
                    </p>
                    <p className="text-muted-foreground mt-2 text-xs">
                      班级成员 {classroom.studentCount} 名
                      {classroom.currentCourse ? (
                        <>
                          {" "}
                          · 当前课程：{classroom.currentCourse.name}（
                          {classroom.currentCourse.courseNo} /{" "}
                          {classroom.currentCourse.term}）
                        </>
                      ) : null}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {isLinked ? (
                      <button
                        className="inline-flex items-center gap-2 text-sm font-medium text-red-600 disabled:text-gray-400"
                        disabled={pendingClassroomId === classroom.id}
                        onClick={() => void unlinkClassroom(classroom.id)}
                        type="button"
                      >
                        {pendingClassroomId === classroom.id ? (
                          "处理中..."
                        ) : (
                          <>
                            <Unlink className="h-4 w-4" />
                            解除关联
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 disabled:text-gray-400"
                        disabled={pendingClassroomId === classroom.id}
                        onClick={() => void linkClassroom(classroom.id)}
                        type="button"
                      >
                        {pendingClassroomId === classroom.id ? (
                          "处理中..."
                        ) : (
                          <>
                            <Link2 className="h-4 w-4" />
                            关联到此课程
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
