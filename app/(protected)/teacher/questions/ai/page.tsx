import { Role } from "@prisma/client";
import { notFound } from "next/navigation";

import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { AIQuestionWorkspace } from "@/components/questions/ai-question-workspace";
import { requirePageRole } from "@/services/auth/page-authorization";
import {
  listGenerationOptions,
  listQuestionGenerationBatches,
} from "@/services/ai-question-generation/service";

export default async function AIQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ courseId?: string }>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const [options, batches] = await Promise.all([
    listGenerationOptions(teacher.id),
    listQuestionGenerationBatches(teacher.id),
  ]);
  const { courseId } = await searchParams;
  const initialCourseId = options.courses.find(
    (course) => course.id === courseId,
  )?.id;
  if (courseId !== undefined && !initialCourseId) notFound();
  return (
    <section className="mx-auto max-w-6xl space-y-6 pb-10">
      <header className="rounded-2xl border border-violet-100 bg-gradient-to-r from-white to-violet-50 p-5 sm:p-7">
        <TeacherBackLink href="/teacher/questions">返回题库</TeacherBackLink>
        <h1 className="mt-4 text-2xl font-bold text-slate-950">AI 辅助出题</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          根据正式课程内容、题库原题或上传文件生成候选题。逐题核对答案、依据与判题配置，确认后才会加入共享题库。
        </p>
      </header>
      <AIQuestionWorkspace
        key={initialCourseId ?? "default"}
        options={options}
        initialBatches={batches}
        initialCourseId={initialCourseId}
      />
    </section>
  );
}
