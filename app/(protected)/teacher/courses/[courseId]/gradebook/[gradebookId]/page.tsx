import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GradebookWorkspace } from "@/components/courses/gradebook-workspace";
import { PageHeader } from "@/components/dashboard/page-header";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import { gradebookIdSchema } from "@/services/gradebook/schemas";

export default async function GradebookPage({
  params,
}: {
  params: Promise<{ courseId: string; gradebookId: string }>;
}) {
  await requirePageRole(Role.TEACHER);
  const values = await params;
  const courseId = courseIdSchema.safeParse(values.courseId);
  const gradebookId = gradebookIdSchema.safeParse(values.gradebookId);
  if (!courseId.success || !gradebookId.success) notFound();
  return (
    <section className="space-y-6">
      <PageHeader
        title="班级成绩台账"
        description="维护成绩证据、预览导入、复算并发布不可变正式结果。"
        actions={
          <Link
            className="rounded-md border bg-white px-4 py-2 text-sm"
            href={`/teacher/courses/${courseId.data}/gradebook`}
          >
            返回台账列表
          </Link>
        }
      />
      <GradebookWorkspace gradebookId={gradebookId.data} />
    </section>
  );
}
