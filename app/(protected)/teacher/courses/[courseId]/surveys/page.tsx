import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SurveyListWorkspace } from "@/components/course-surveys/survey-list-workspace";
import { PageHeader } from "@/components/dashboard/page-header";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import { getTeacherCourse } from "@/services/courses/service";
import { listTeacherCourseSurveys } from "@/services/course-surveys/service";

export default async function TeacherCourseSurveysPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const courseId = courseIdSchema.safeParse((await params).courseId);
  if (!courseId.success) notFound();
  try {
    const [course, surveys] = await Promise.all([
      getTeacherCourse(teacher.id, courseId.data),
      listTeacherCourseSurveys(teacher.id, courseId.data, {}),
    ]);
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
          description="从正式教学大纲生成可审核问卷，实名或匿名发布，并以小样本保护规则汇总课程目标自评和开放题主题。"
          title="结课教学质量问卷"
        />
        <SurveyListWorkspace
          classrooms={course.linkedClassrooms
            .filter((item) => item.status === "ACTIVE")
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
