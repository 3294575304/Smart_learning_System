import Link from "next/link";
import { Role } from "@prisma/client";
import { TeacherQuestionFileImport } from "@/components/admin/admin-question-file-import";
import { requirePageRole } from "@/services/auth/page-authorization";
import { listQuestionImportCourses } from "@/services/question-import/courses";

export default async function ExamPaperImportPage() {
  await requirePageRole(Role.TEACHER);
  const courses = await listQuestionImportCourses();
  return (
    <section className="mx-auto max-w-5xl space-y-4">
      <Link className="text-sky-700" href="/teacher/exams/new">
        ← 返回考试组卷
      </Link>
      <h1 className="text-2xl font-semibold">上传试卷文件</h1>
      <p className="text-sm text-slate-600">
        识别后逐题核对答案与解析，确认加入共享题库；返回组卷页重新查询可用题。三年禁重将在组卷和发布时再次检查。
      </p>
      <TeacherQuestionFileImport
        courses={courses}
        returnHref="/teacher/exams/new"
      />
    </section>
  );
}
