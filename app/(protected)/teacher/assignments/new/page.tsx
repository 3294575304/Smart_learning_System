import Link from "next/link";
import { FilePenLine } from "lucide-react";
import { getRecentAssignmentDrafts } from "@/services/assignments/creation-context";
import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { Role } from "@prisma/client";
import { notFound } from "next/navigation";

import { AssignmentForm } from "@/components/assignments/assignment-form";
import { requirePageRole } from "@/services/auth/page-authorization";
import { getTeacherAssignmentEditorOptions } from "@/services/assignments/service";
import { getTeacherTeachingPreferences } from "@/services/dashboard/teacher-settings";
import { getSystemConfigValue } from "@/services/system-config/service";

export default async function NewAssignmentPage({
  searchParams,
}: {
  searchParams: Promise<{ classroomId?: string }>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const { classroomId } = await searchParams;
  if (classroomId !== undefined && typeof classroomId !== "string") notFound();
  const [options, platformDueDays, preferences, recentDrafts] =
    await Promise.all([
      getTeacherAssignmentEditorOptions(teacher.id),
      getSystemConfigValue("assignmentDefaultDueDays"),
      getTeacherTeachingPreferences(teacher.id),
      getRecentAssignmentDrafts(teacher.id, classroomId),
    ]);
  const selectedClassroom = classroomId
    ? options.classrooms.find((item) => item.id === classroomId)
    : null;
  if (classroomId && !selectedClassroom) notFound();
  return (
    <section className="space-y-5">
      <header className="workspace-page-header flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-1">
          {!selectedClassroom?.courseId && (
            <TeacherBackLink href="/teacher/assignments">
              返回作业管理
            </TeacherBackLink>
          )}
          <h1 className="mt-1">创建作业</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="border-border bg-card text-brand-strong hover:bg-muted inline-flex min-h-11 items-center rounded-lg border px-4 py-2 text-sm font-medium"
            href={`/teacher/assignments?status=DRAFT${selectedClassroom ? `&classroomId=${selectedClassroom.id}` : ""}`}
          >
            草稿管理
          </Link>
          {selectedClassroom?.courseId && (
            <TeacherBackLink
              href={`/teacher/courses/${selectedClassroom.courseId}`}
            >
              返回课程
            </TeacherBackLink>
          )}
        </div>
      </header>
      {options.classrooms.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-gray-500">
          请先创建一个有效班级，再创建作业。
        </div>
      ) : (
        <>
          {recentDrafts.length > 0 && (
            <section
              aria-labelledby="recent-drafts"
              className="workspace-panel space-y-3"
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
              </div>
              <ul className="divide-border divide-y">
                {recentDrafts.map((draft) => (
                  <li
                    key={draft.id}
                    className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 text-sm">
                      <p className="font-medium [overflow-wrap:anywhere]">
                        {draft.title}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-xs [overflow-wrap:anywhere]">
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
                      className="border-border bg-card text-brand-strong hover:bg-muted inline-flex min-h-8 shrink-0 items-center rounded-md border px-3 text-xs font-medium"
                    >
                      继续编辑
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div id="assignment-editor" className="scroll-mt-24">
            <AssignmentForm
              defaultDueDays={preferences.assignmentDueDays ?? platformDueDays}
              defaultAllowResubmission={preferences.allowAssignmentResubmission}
              initialClassroomId={selectedClassroom?.id}
              mode="create"
              {...options}
            />
          </div>
        </>
      )}
    </section>
  );
}
