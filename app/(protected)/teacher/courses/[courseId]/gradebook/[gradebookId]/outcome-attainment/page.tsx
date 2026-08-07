import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OutcomeAttainmentWorkspace } from "@/components/courses/outcome-attainment-workspace";
import { PageHeader } from "@/components/dashboard/page-header";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import { gradebookIdSchema } from "@/services/gradebook/schemas";
export default async function Page({
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
        title="课程目标达成度"
        description="从正式教学大纲目标和映射下钻到考核项目及学生成绩证据。"
        actions={
          <Link
            className="rounded-md border bg-white px-4 py-2 text-sm"
            href={`/teacher/courses/${courseId.data}/gradebook/${gradebookId.data}`}
          >
            返回成绩台账
          </Link>
        }
      />
      <OutcomeAttainmentWorkspace gradebookId={gradebookId.data} />
    </section>
  );
}
