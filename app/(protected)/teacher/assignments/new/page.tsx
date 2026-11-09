import Link from "next/link";
import { FilePenLine } from "lucide-react";
import { getAssignmentCreationContext } from "@/services/assignments/creation-context";
import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { Role } from "@prisma/client";
import { notFound } from "next/navigation";

import { AssignmentForm } from "@/components/assignments/assignment-form";
import { requirePageRole } from "@/services/auth/page-authorization";
import { getTeacherAssignmentEditorOptions } from "@/services/assignments/service";
import { getSystemConfigValue } from "@/services/system-config/service";

export default async function NewAssignmentPage({
  searchParams,
}: {
  searchParams: Promise<{ classroomId?: string }>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const { classroomId } = await searchParams;
  if (classroomId !== undefined && typeof classroomId !== "string") notFound();
  const [options, defaultDueDays, { recentDrafts, lastPublishedByClassroom }] =
    await Promise.all([
      getTeacherAssignmentEditorOptions(teacher.id),
      getSystemConfigValue("assignmentDefaultDueDays"),
      getAssignmentCreationContext(teacher.id, classroomId),
    ]);
  const selectedClassroom = classroomId
    ? options.classrooms.find((item) => item.id === classroomId)
    : null;
  if (classroomId && !selectedClassroom) notFound();
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <TeacherBackLink
            href={
              selectedClassroom?.courseId
                ? `/teacher/courses/${selectedClassroom.courseId}`
                : "/teacher/assignments"
            }
          >
            {selectedClassroom ? "返回课程" : "返回作业管理"}
          </TeacherBackLink>
          <h1 className="sr-only">创建作业</h1>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {recentDrafts[0] ? (
            <Link
              className="font-medium text-sky-800 hover:underline"
              href={`/teacher/assignments/${recentDrafts[0].id}/edit`}
            >
              继续编辑最近草稿
            </Link>
          ) : (
            <span className="text-slate-500">最近草稿（0）</span>
          )}
          <Link
            className="text-sky-800 hover:underline"
            href={`/teacher/assignments?status=DRAFT${selectedClassroom ? `&classroomId=${selectedClassroom.id}` : ""}`}
          >
            全部草稿
          </Link>
        </div>
      </div>
      {options.classrooms.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-gray-500">
          请先创建一个有效班级，再创建作业。
        </div>
      ) : (
        <>
          {recentDrafts.length > 0 && (
            <section
              aria-labelledby="recent-drafts"
              className="space-y-3 rounded-xl border bg-white p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2
                  id="recent-drafts"
                  className="flex items-center gap-2 font-semibold"
                >
                  <FilePenLine
                    aria-hidden="true"
                    className="size-4 text-sky-700"
                  />
                  最近草稿
                </h2>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <Link
                    className="text-sky-800 underline-offset-4 hover:underline"
                    href={`/teacher/assignments?status=DRAFT${selectedClassroom ? `&classroomId=${selectedClassroom.id}` : ""}`}
                  >
                    全部草稿
                  </Link>
                </div>
              </div>
              {recentDrafts.length ? (
                <ul className="grid gap-3 lg:grid-cols-3">
                  {recentDrafts.map((draft) => (
                    <li
                      key={draft.id}
                      className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border border-slate-100 px-3 py-2"
                    >
                      <div className="min-w-0 text-sm">
                        <p className="font-medium [overflow-wrap:anywhere]">
                          {draft.title}
                        </p>
                        <p className="mt-1 text-xs [overflow-wrap:anywhere] text-slate-600">
                          {draft.classroom.name} · 更新于{" "}
                          <time dateTime={draft.updatedAt.toISOString()}>
                            {draft.updatedAt.toLocaleString("zh-CN", {
                              timeZone: "Asia/Shanghai",
                              hour12: false,
                            })}
                          </time>
                        </p>
                      </div>
                      <Link
                        href={`/teacher/assignments/${draft.id}/edit`}
                        aria-label={`继续编辑：${draft.title} · ${draft.classroom.name}`}
                        className="inline-flex min-h-9 shrink-0 items-center rounded-lg bg-sky-50 px-3 text-sm font-medium text-sky-800 hover:bg-sky-100"
                      >
                        继续编辑
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-600">
                  {selectedClassroom
                    ? "该班暂无草稿。"
                    : "暂无可继续编辑的草稿。"}
                </p>
              )}
            </section>
          )}
          <div id="assignment-editor" className="scroll-mt-24">
            <AssignmentForm
              defaultDueDays={defaultDueDays}
              initialClassroomId={selectedClassroom?.id}
              lastPublishedByClassroom={lastPublishedByClassroom}
              mode="create"
              {...options}
            />
          </div>
        </>
      )}
    </section>
  );
}
