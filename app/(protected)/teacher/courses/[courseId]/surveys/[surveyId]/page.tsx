import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { Role } from "@prisma/client";
import { notFound } from "next/navigation";

import { SurveyEditor } from "@/components/course-surveys/survey-editor";
import { PageHeader } from "@/components/dashboard/page-header";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import { courseSurveyIdSchema } from "@/services/course-surveys/schemas";
import { getTeacherCourseSurvey } from "@/services/course-surveys/service";
import { withClassroomQuery } from "@/lib/course-classroom";

export default async function TeacherCourseSurveyDetailPage({
  params,
}: {
  params: Promise<{ courseId: string; surveyId: string }>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const raw = await params;
  const courseId = courseIdSchema.safeParse(raw.courseId);
  const surveyId = courseSurveyIdSchema.safeParse(raw.surveyId);
  if (!courseId.success || !surveyId.success) notFound();
  try {
    const survey = await getTeacherCourseSurvey(
      teacher.id,
      courseId.data,
      surveyId.data,
    );
    return (
      <section className="space-y-6">
        <PageHeader
          actions={
            <TeacherBackLink
              href={withClassroomQuery(
                `/teacher/courses/${courseId.data}/surveys`,
                survey.classroom.id,
              )}
            >
              返回问卷列表
            </TeacherBackLink>
          }
          description={`${survey.classroom.name} · ${survey.mode === "ANONYMOUS" ? "匿名收集" : "实名收集"} · 不计入课程成绩`}
          title={survey.title}
        />
        <SurveyEditor courseId={courseId.data} initialSurvey={survey} />
      </section>
    );
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
