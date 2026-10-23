import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { Role } from "@prisma/client";
import { BookOpenCheck, Sparkles } from "lucide-react";

import { TeacherQuestionFileImport } from "@/components/admin/admin-question-file-import";
import { requirePageRole } from "@/services/auth/page-authorization";
import { listQuestionImportCourses } from "@/services/question-import/courses";

export default async function TeacherQuestionImportPage() {
  await requirePageRole(Role.TEACHER);
  const courses = await listQuestionImportCourses();
  return (
    <section className="mx-auto max-w-5xl space-y-4 pb-8">
      <header className="relative overflow-hidden rounded-2xl border border-sky-100 bg-gradient-to-br from-white via-sky-50 to-cyan-50 px-5 py-5 shadow-sm sm:px-6 sm:py-6">
        <div className="pointer-events-none absolute -top-20 -right-16 h-56 w-56 rounded-full bg-sky-200/30 blur-3xl" />
        <div className="relative">
          <TeacherBackLink href="/teacher/questions">返回题库</TeacherBackLink>
          <div className="mt-4 flex items-start gap-3">
            <div className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-500 text-white shadow-md shadow-sky-200 sm:flex">
              <BookOpenCheck aria-hidden="true" className="size-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
                  多格式文件导入题库
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700">
                  <Sparkles aria-hidden="true" className="size-3.5" />
                  自动识别
                </span>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                上传已有 Word、PDF、文本或 JSON
                题库，系统会拆分题目、识别答案并生成知识点标签。所有内容先进入审核预览，确认后保存到“我的题目”。
              </p>
            </div>
          </div>
        </div>
      </header>
      <TeacherQuestionFileImport courses={courses} />
    </section>
  );
}
