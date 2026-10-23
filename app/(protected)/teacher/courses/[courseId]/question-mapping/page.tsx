import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BatchMappingPanel } from "@/components/question-mapping/batch-mapping-panel";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseQuestionMappingPathSchema } from "@/services/question-mapping/schemas";
import { listUnboundTeacherQuestions } from "@/services/question-mapping/service";

type Props = { params: Promise<{ courseId: string }> };

export default async function QuestionMappingPage({ params }: Props) {
  const teacher = await requirePageRole(Role.TEACHER);
  const path = courseQuestionMappingPathSchema.safeParse(await params);
  if (!path.success) notFound();
  try {
    const result = await listUnboundTeacherQuestions(
      teacher.id,
      path.data.courseId,
    );
    if (!result.ready) {
      const courseBase = `/teacher/courses/${path.data.courseId}`;
      return (
        <section className="space-y-6">
          <TeacherBackLink href={courseBase}>返回课程</TeacherBackLink>
          <div className="rounded-xl border bg-white p-6 shadow-sm sm:p-8">
            <h1 className="text-2xl font-semibold">
              {result.course.name} · 题目知识点映射
            </h1>
            <p className="text-muted-foreground mt-3">
              这门课程尚未发布正式知识图谱，暂时无法将题目关联到课程知识点。
            </p>
            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-5">
              <h2 className="font-semibold text-amber-950">请先完成课程准备</h2>
              <ol className="mt-3 list-inside list-decimal space-y-2 text-sm text-amber-950">
                <li>上传教学大纲，审核解析结果并发布正式大纲。</li>
                <li>基于正式大纲生成知识图谱，审核后发布正式版本。</li>
                <li>返回此页面，选择题目并确认知识点关联。</li>
              </ol>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                className="inline-flex min-h-11 items-center rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                href={`${courseBase}/knowledge-graph`}
              >
                前往知识图谱
              </Link>
              <Link
                className="inline-flex min-h-11 items-center rounded-lg border border-sky-200 px-4 py-2 text-sm font-medium text-sky-800 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
                href={`${courseBase}/syllabus`}
              >
                查看教学大纲
              </Link>
            </div>
          </div>
        </section>
      );
    }
    return (
      <section className="space-y-6">
        <header>
          <TeacherBackLink href={`/teacher/courses/${path.data.courseId}`}>
            返回课程
          </TeacherBackLink>
          <h1 className="mt-3 text-2xl font-semibold">
            {result.course.name} · 一键关联绑定题目
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            为未绑定题目匹配课程知识点。逐题选择“仅关联最合适的”或“关联所有匹配项”，预览后由教师确认；已有人工绑定不会被覆盖。
          </p>
        </header>
        <BatchMappingPanel
          courseId={path.data.courseId}
          totalQuestions={result.total}
          questionLimit={result.limit}
          catalog={result.catalog}
        />
      </section>
    );
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
