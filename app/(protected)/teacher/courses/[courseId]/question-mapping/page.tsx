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
    return (
      <section className="space-y-6">
        <header>
          <Link
            className="text-muted-foreground text-sm underline"
            href={`/teacher/courses/${path.data.courseId}`}
          >
            返回课程
          </Link>
          <h1 className="mt-3 text-2xl font-semibold">
            {result.course.name} · 批量题目映射
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            候选与正式绑定分离；已有人工确认绑定永不被覆盖，未确认候选不会进入作业快照、画像或推荐。
          </p>
        </header>
        <BatchMappingPanel
          courseId={path.data.courseId}
          questions={result.questions}
        />
      </section>
    );
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
