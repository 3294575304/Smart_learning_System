import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { Role } from "@prisma/client";
import { notFound } from "next/navigation";

import { SurveyListWorkspace } from "@/components/course-surveys/survey-list-workspace";
import { PageHeader } from "@/components/dashboard/page-header";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import { getTeacherCourse } from "@/services/courses/service";
import { listTeacherCourseSurveys } from "@/services/course-surveys/service";
import { getTeacherCourseClassroomForPage } from "@/services/courses/page-context";
import {
  analyticsSearchParams,
  isAnalyticsOrigin,
} from "@/lib/analytics-origin";

export default async function TeacherCourseSurveysPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{
    classroomId?: string;
    section?: string;
    from?: string;
  }>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const courseId = courseIdSchema.safeParse((await params).courseId);
  if (!courseId.success) notFound();
  const query = await searchParams;
  const classroom = await getTeacherCourseClassroomForPage(
    teacher.id,
    courseId.data,
    query.classroomId,
  );
  const analyticsBackHref = isAnalyticsOrigin(query.from)
    ? `/teacher/results?${analyticsSearchParams({
        courseId: courseId.data,
        classroomId: classroom?.id,
        section: query.section,
      }).toString()}`
    : null;
  try {
    const [course, surveys] = await Promise.all([
      getTeacherCourse(teacher.id, courseId.data),
      listTeacherCourseSurveys(teacher.id, courseId.data, {
        classroomId: classroom?.id,
      }),
    ]);
    return (
      <section className="space-y-6">
        <PageHeader
          actions={
            <TeacherBackLink
              href={analyticsBackHref ?? `/teacher/courses/${courseId.data}`}
            >
              {analyticsBackHref ? "返回学情分析" : "返回课程"}
            </TeacherBackLink>
          }
          description="从正式教学大纲生成可审核问卷，实名或匿名发布，并以小样本保护规则汇总课程目标自评和开放题主题。"
          title="结课教学质量问卷"
        />
        <SurveyListWorkspace
          key={`${courseId.data}:${classroom?.id ?? "all"}`}
          initialClassroomId={classroom?.id}
          classrooms={course.linkedClassrooms
            .filter(
              (item) => item.status === "ACTIVE" || item.status === "COMPLETED",
            )
            .map((item) => ({ id: item.id, name: item.name }))}
          courseId={courseId.data}
          initialSurveys={surveys}
        />
      </section>
    );
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
