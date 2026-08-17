import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StudentSurveyForm } from "@/components/course-surveys/student-survey-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseSurveyIdSchema } from "@/services/course-surveys/schemas";
import { getStudentCourseSurvey } from "@/services/course-surveys/service";

export default async function StudentSurveyPage({
  params,
}: {
  params: Promise<{ surveyId: string }>;
}) {
  const student = await requirePageRole(Role.STUDENT);
  const surveyId = courseSurveyIdSchema.safeParse((await params).surveyId);
  if (!surveyId.success) notFound();
  try {
    const survey = await getStudentCourseSurvey(student.id, surveyId.data);
    return (
      <section className="space-y-6">
        <PageHeader
          actions={
            <Link
              className="rounded-md border bg-white px-4 py-2 text-sm"
              href="/student/surveys"
            >
              返回问卷列表
            </Link>
          }
          description={`${survey.course.name} · ${survey.classroom.name} · 截止 ${survey.dueAt.toLocaleString("zh-CN")}`}
          title={survey.title}
        />
        {survey.submittedAt ? (
          <div className="rounded-xl border bg-emerald-50 p-8 text-center">
            <h2 className="font-semibold text-emerald-800">问卷已提交</h2>
            <p className="mt-2 text-sm text-emerald-700">
              提交时间：{survey.submittedAt.toLocaleString("zh-CN")}
              。回答不能再次修改。
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-xl border bg-white p-5">
              <p className="text-sm text-gray-700">{survey.instructions}</p>
              {survey.description ? (
                <p className="mt-2 text-sm text-gray-600">
                  {survey.description}
                </p>
              ) : null}
            </div>
            <StudentSurveyForm
              mode={survey.mode}
              questions={survey.questions}
              surveyId={survey.id}
            />
          </>
        )}
      </section>
    );
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
