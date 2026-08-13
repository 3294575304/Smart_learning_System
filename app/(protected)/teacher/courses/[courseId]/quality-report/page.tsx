import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/dashboard/page-header";
import { QualityReportWorkspace } from "@/components/quality-reports/quality-report-workspace";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseIdSchema } from "@/services/courses/schemas";

export default async function QualityReportPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  await requirePageRole(Role.TEACHER);
  const courseId = courseIdSchema.safeParse((await params).courseId);
  if (!courseId.success) notFound();
  return (
    <section className="space-y-6">
      <PageHeader
        actions={
          <Link
            className="rounded-md border bg-white px-4 py-2 text-sm"
            href={`/teacher/courses/${courseId.data}`}
          >
            返回课程
          </Link>
        }
        description="从平台正式数据或独立上传成绩生成不可变报告快照、待审查 DOCX 和可审计成绩工作簿。"
        title="课程教学质量分析"
      />
      <QualityReportWorkspace courseId={courseId.data} />
    </section>
  );
}
