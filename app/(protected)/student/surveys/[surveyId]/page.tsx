import { CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { StudentSurveyListBackLink } from "@/components/course-surveys/student-survey-list-back-link";
import {
  studentTaskScopeSchema,
  studentTaskHref,
} from "@/services/student-experience/task-scope";
import { SurveyAvailabilityRefresh } from "@/components/course-surveys/survey-availability-refresh";
import { StatusChip } from "@/components/ui/status-chip";
import { Role } from "@prisma/client";
import { notFound } from "next/navigation";

import { StudentSurveyForm } from "@/components/course-surveys/student-survey-form";
import { StudentPageHeader as PageHeader } from "@/components/dashboard/student-page-header";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseSurveyIdSchema } from "@/services/course-surveys/schemas";
import { getStudentCourseSurvey } from "@/services/course-surveys/service";

export default async function StudentSurveyPage({
  params,
  searchParams,
}: {
  params: Promise<{ surveyId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const student = await requirePageRole(Role.STUDENT);
  const surveyId = courseSurveyIdSchema.safeParse((await params).surveyId);
  if (!surveyId.success) notFound();
  const scope = studentTaskScopeSchema.safeParse(await searchParams);
  if (!scope.success) notFound();
  try {
    const survey = await getStudentCourseSurvey(student.id, surveyId.data);
    if (
      (scope.data.courseId && scope.data.courseId !== survey.course.id) ||
      (scope.data.classroomId && scope.data.classroomId !== survey.classroom.id)
    )
      notFound();
    return (
      <section className="space-y-6">
        <StudentSurveyListBackLink scope={scope.data} />
        <PageHeader
          description={`${survey.course.name} · ${survey.classroom.name} · 截止 ${survey.dueAt.toLocaleString("zh-CN")}`}
          title={survey.title}
        />
        {survey.submittedAt ? (
          /*
           * 「查看完成状态」的落点。
           * 原来只有一句绿色提示，学生看不出交了什么、什么时候交的、匿名还是实名。
           * 这里补齐状态、时间、题量、作答形式与后续动作。
           */
          <section className="border-line bg-card overflow-hidden rounded-xl border">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <CheckCircle2 aria-hidden="true" className="size-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-ink text-[15px] font-semibold">
                    问卷已完成
                  </h2>
                  <p className="text-ink-soft mt-1 text-sm leading-6">
                    回答已提交，不能再次修改。本问卷不计入课程成绩。
                  </p>
                </div>
              </div>
              <StatusChip tone="ok">已完成</StatusChip>
            </div>
            <dl className="grid gap-4 px-5 py-4 sm:grid-cols-3">
              <div>
                <dt className="text-ink-soft text-xs">提交时间</dt>
                <dd className="text-ink mt-1 text-sm font-medium tabular-nums">
                  {survey.submittedAt.toLocaleString("zh-CN")}
                </dd>
              </div>
              <div>
                <dt className="text-ink-soft text-xs">问卷题量</dt>
                <dd className="text-ink mt-1 text-sm font-medium tabular-nums">
                  {survey.questionCount} 题
                </dd>
              </div>
              <div>
                <dt className="text-ink-soft text-xs">作答形式</dt>
                <dd className="text-ink mt-1 text-sm font-medium">
                  {survey.mode === "ANONYMOUS" ? "匿名提交" : "实名提交"}
                </dd>
              </div>
            </dl>
            <div className="border-line flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">
              <p className="text-ink-soft text-xs leading-5">
                {survey.mode === "ANONYMOUS"
                  ? "匿名问卷：教师端只能看到汇总结果，无法把你的回答关联到个人。"
                  : "实名问卷：教师可以看到你本人的提交记录。"}
              </p>
              <Link
                className="text-brand-strong border-line hover:bg-muted inline-flex min-h-10 items-center rounded-lg border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                href={studentTaskHref("/student/surveys", scope.data)}
              >
                返回问卷列表
              </Link>
            </div>
          </section>
        ) : !survey.isOpen ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
            <h2 className="font-semibold text-amber-900">
              {survey.availability === "SCHEDULED"
                ? "问卷已发布，等待开放"
                : survey.availability === "CLOSED"
                  ? "问卷已关闭"
                  : "问卷已截止"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-amber-900">
              {survey.availability === "SCHEDULED"
                ? `将于 ${survey.opensAt.toLocaleString("zh-CN")} 开放，到时可在本页填写，也会出现在学习任务中。`
                : "当前不能继续提交，请联系任课教师了解后续安排。"}
            </p>
            <p className="mt-2 text-sm text-amber-800">
              共 {survey.questionCount} 题 · 本问卷不计入课程成绩。
            </p>
            {survey.availability === "SCHEDULED" ? (
              <SurveyAvailabilityRefresh at={survey.opensAt.toISOString()} />
            ) : null}
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
