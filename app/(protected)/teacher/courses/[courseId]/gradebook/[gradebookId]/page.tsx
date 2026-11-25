import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { Role } from "@prisma/client";
import { notFound } from "next/navigation";

import { GradebookWorkspace } from "@/components/courses/gradebook-workspace";
import { PageHeader } from "@/components/dashboard/page-header";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import { gradebookIdSchema } from "@/services/gradebook/schemas";
import { getTeacherCourseClassroomForPage } from "@/services/courses/page-context";
import {
  analyticsSearchParams,
  isAnalyticsOrigin,
} from "@/lib/analytics-origin";
import { withClassroomQuery } from "@/lib/course-classroom";

export default async function GradebookPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string; gradebookId: string }>;
  searchParams: Promise<{
    classroomId?: string;
    section?: string;
    from?: string;
  }>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const values = await params;
  const courseId = courseIdSchema.safeParse(values.courseId);
  const gradebookId = gradebookIdSchema.safeParse(values.gradebookId);
  if (!courseId.success || !gradebookId.success) notFound();
  const query = await searchParams;
  const classroom = await getTeacherCourseClassroomForPage(
    teacher.id,
    courseId.data,
    query.classroomId,
  );
  // 学情分析的「最近作业与考试」会直接跳到台账详情，返回入口要回到学情分析。
  const analyticsBackHref = isAnalyticsOrigin(query.from)
    ? `/teacher/results?${analyticsSearchParams({
        courseId: courseId.data,
        classroomId: classroom?.id,
        section: query.section,
      }).toString()}`
    : null;
  return (
    <section className="space-y-6">
      <PageHeader
        title="班级成绩台账"
        description="查看班级成绩，按考核项目录入、核对并发布。"
        actions={
          <TeacherBackLink
            href={
              analyticsBackHref ??
              withClassroomQuery(
                `/teacher/courses/${courseId.data}/gradebook`,
                classroom?.id,
              )
            }
          >
            {analyticsBackHref ? "返回学情分析" : "返回台账列表"}
          </TeacherBackLink>
        }
      />
      <GradebookWorkspace
        key={gradebookId.data}
        gradebookId={gradebookId.data}
        courseId={courseId.data}
      />
    </section>
  );
}
