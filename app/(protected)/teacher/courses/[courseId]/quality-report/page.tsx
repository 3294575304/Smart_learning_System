import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { Role } from "@prisma/client";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/dashboard/page-header";
import { QualityReportWorkspace } from "@/components/quality-reports/quality-report-workspace";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import { getTeacherCourseClassroomForPage } from "@/services/courses/page-context";

export default async function QualityReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ classroomId?: string }>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const courseId = courseIdSchema.safeParse((await params).courseId);
  if (!courseId.success) notFound();
  const classroom = await getTeacherCourseClassroomForPage(
    teacher.id,
    courseId.data,
    (await searchParams).classroomId,
  );
  return (
    <section className="space-y-6">
      <PageHeader
        actions={
          <TeacherBackLink href={`/teacher/courses/${courseId.data}`}>
            返回课程
          </TeacherBackLink>
        }
        description="汇总课程成绩、目标达成与教学反馈，支持自定义 Word 模板。"
        title="课程教学质量分析"
      />
      <QualityReportWorkspace
        key={`${courseId.data}:${classroom?.id ?? "all"}`}
        courseId={courseId.data}
        classroomId={classroom?.id}
      />
    </section>
  );
}
