import { Role } from "@prisma/client";
import { notFound } from "next/navigation";

import { PaperDraftEditor } from "@/components/exams/paper-draft-editor";
import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { getTeacherAssignmentEditorOptions } from "@/services/assignments/service";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { getPaperDraft } from "@/services/exams/paper-drafts";

export default async function ExamDraftPage({
  params,
}: {
  params: Promise<{ draftId: string }>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const { draftId } = await params;
  try {
    const [draft, options] = await Promise.all([
      getPaperDraft(teacher.id, draftId),
      getTeacherAssignmentEditorOptions(teacher.id),
    ]);
    return (
      <section className="space-y-5">
        <header className="flex flex-wrap items-center gap-3">
          <TeacherBackLink href="/teacher/exams">返回考试管理</TeacherBackLink>
          <h1 className="text-2xl font-semibold text-slate-950">
            审核试卷草稿
          </h1>
        </header>
        <PaperDraftEditor
          initial={draft}
          classrooms={options.classrooms}
          courseName={
            options.publicationCourses.find(({ id }) => id === draft.courseId)
              ?.name ?? "原试卷课程"
          }
        />
      </section>
    );
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
