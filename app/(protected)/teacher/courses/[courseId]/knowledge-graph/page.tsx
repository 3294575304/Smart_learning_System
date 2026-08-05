import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { KnowledgeGraphWorkspace } from "@/components/courses/knowledge-graph-workspace";
import { PageHeader } from "@/components/dashboard/page-header";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseIdSchema } from "@/services/courses/schemas";
export default async function Page({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  await requirePageRole(Role.TEACHER);
  const parsed = courseIdSchema.safeParse((await params).courseId);
  if (!parsed.success) notFound();
  return (
    <section className="space-y-6">
      <PageHeader
        title="Python 课程知识图谱"
        description="基于正式教学大纲生成、审核并显式发布不可变图谱版本。"
        actions={
          <Link
            className="rounded-md border bg-white px-4 py-2 text-sm"
            href={`/teacher/courses/${parsed.data}`}
          >
            返回课程
          </Link>
        }
      />
      <KnowledgeGraphWorkspace courseId={parsed.data} />
    </section>
  );
}
