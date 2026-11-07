import Link from "next/link";
import { Role } from "@prisma/client";
import { PaperUpload } from "@/components/exams/paper-upload";
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
    <section className="mx-auto max-w-5xl space-y-4">
      <Link className="text-sky-700" href="/teacher/exams/new">
        ← 返回考试组卷
      </Link>
      <h1 className="text-2xl font-semibold">AI 解析试卷</h1>
      <p className="text-sm text-slate-600">
        上传后生成在线考试草稿，核对题目并设置考试规则即可发布。
      </p>
      <PaperUpload courses={options.publicationCourses} drafts={drafts} />
    </section>
  );
}
