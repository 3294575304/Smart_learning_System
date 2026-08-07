import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CourseGradebooksWorkspace } from "@/components/courses/course-gradebooks-workspace";
import { PageHeader } from "@/components/dashboard/page-header";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseIdSchema } from "@/services/courses/schemas";

export default async function GradebooksPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  await requirePageRole(Role.TEACHER);
  const id = courseIdSchema.safeParse((await params).courseId);
  if (!id.success) notFound();
  return (
    <section className="space-y-6">
      <PageHeader
        title="课程成绩台账"
        description="汇总平台作业、人工录入和固定模板总评，保存可复算的正式成绩版本。"
        actions={
          <Link
            className="rounded-md border bg-white px-4 py-2 text-sm"
            href={`/teacher/courses/${id.data}`}
          >
            返回课程
          </Link>
        }
      />
      <CourseGradebooksWorkspace courseId={id.data} />
    </section>
  );
}
