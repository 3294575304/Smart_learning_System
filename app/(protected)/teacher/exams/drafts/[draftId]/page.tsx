import Link from "next/link";
import { Role } from "@prisma/client";
import { notFound } from "next/navigation";

import { PaperDraftEditor } from "@/components/exams/paper-draft-editor";
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
      <section className="mx-auto max-w-5xl space-y-5">
        <Link className="text-sm text-sky-700" href="/teacher/exams/import">
          ← 返回试卷草稿
        </Link>
        <h1 className="text-2xl font-semibold">审核在线考试草稿</h1>
        <PaperDraftEditor initial={draft} classrooms={options.classrooms} />
      </section>
    );
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
