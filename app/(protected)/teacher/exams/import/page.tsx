import { Role } from "@prisma/client";
import { PaperUpload } from "@/components/exams/paper-upload";
import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { requirePageRole } from "@/services/auth/page-authorization";
import { getTeacherAssignmentEditorOptions } from "@/services/assignments/service";
import { listPaperDrafts } from "@/services/exams/paper-drafts";

export default async function ExamPaperImportPage() {
  const teacher = await requirePageRole(Role.TEACHER);
  const [options, drafts] = await Promise.all([
    getTeacherAssignmentEditorOptions(teacher.id),
    listPaperDrafts(teacher.id),
  ]);
  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <TeacherBackLink href="/teacher/exams">返回考试管理</TeacherBackLink>
        <h1 className="text-2xl font-semibold text-slate-950">上传试卷</h1>
      </header>
      <PaperUpload courses={options.publicationCourses} drafts={drafts} />
    </section>
  );
}
