import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { Role } from "@prisma/client";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/dashboard/page-header";
import { QualityReportWorkspace } from "@/components/quality-reports/quality-report-workspace";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import { getTeacherCourseClassroomForPage } from "@/services/courses/page-context";
import { gradebookIdSchema } from "@/services/gradebook/schemas";
import { z } from "zod";
import { PageContainer } from "@/components/ui/workspace";

export default async function QualityReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{
    classroomId?: string;
    gradebookId?: string;
    reportId?: string;
  }>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const courseId = courseIdSchema.safeParse((await params).courseId);
  if (!courseId.success) notFound();
  const query = await searchParams;
  const gradebookId = gradebookIdSchema.optional().safeParse(query.gradebookId);
  const reportId = z.string().cuid().optional().safeParse(query.reportId);
  if (!gradebookId.success || !reportId.success) notFound();
  const classroom = await getTeacherCourseClassroomForPage(
    teacher.id,
    courseId.data,
    query.classroomId,
  );
  return (
    <PageContainer density="compact">
      <PageHeader
        actions={
          <TeacherBackLink href={`/teacher/courses/${courseId.data}`}>
            返回课程
          </TeacherBackLink>
        }
        description="汇总课程成绩、目标达成与教学反馈，支持自定义 Word 模板。"
        title="教学质量报告"
      />
      <QualityReportWorkspace
        key={`${courseId.data}:${classroom?.id ?? "all"}:${gradebookId.data ?? ""}:${reportId.data ?? ""}`}
        courseId={courseId.data}
        classroomId={classroom?.id}
        initialGradebookId={gradebookId.data}
        focusedReportId={reportId.data}
      />
    </PageContainer>
  );
}
