import { Role } from "@prisma/client";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { requirePageRole } from "@/services/auth/page-authorization";
import { listStudentCourseSurveys } from "@/services/course-surveys/service";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { courseIdSchema } from "@/services/courses/schemas";
import { getStudentCourseContext } from "@/services/courses/student-access";

export default async function StudentSurveysPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const student = await requirePageRole(Role.STUDENT);
  const raw = await searchParams;
  const rawCourseId = Array.isArray(raw.courseId)
    ? raw.courseId[0]
    : raw.courseId;
  const parsedCourseId =
    rawCourseId !== undefined ? courseIdSchema.safeParse(rawCourseId) : null;
  if (parsedCourseId && !parsedCourseId.success) notFound();
  let course: Awaited<ReturnType<typeof getStudentCourseContext>> | null = null;
  if (parsedCourseId?.success) {
    try {
      course = await getStudentCourseContext(student.id, parsedCourseId.data);
    } catch (error) {
      if (error instanceof ResourceNotFoundError) notFound();
      throw error;
    }
  }
  const surveys = await listStudentCourseSurveys(student.id, course?.id);
  return (
    <section className="space-y-6">
      <PageHeader
        actions={
          <Link
            className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50"
            href={
              course
                ? `/student/courses/${course.id}/learning-center`
                : "/student/tasks"
            }
          >
            {course ? "返回课程学习中心" : "返回学习任务"}
          </Link>
        }
        description={
          course
            ? `查看「${course.name}」已发布的课程问卷。问卷不计入课程成绩。`
            : "查看各门课程已发布的课程目标自评和教学质量反馈。所有问卷均不计入课程成绩。"
        }
        eyebrow={course?.name}
        title="课程问卷"
      />
      {surveys.length === 0 ? (
        <EmptyState
          description="当前没有待完成的课程问卷。"
          icon={ClipboardCheck}
          title="暂无问卷"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {surveys.map((survey) => (
            <Link
              className="rounded-xl border bg-white p-5 transition-colors hover:bg-gray-50"
              href={`/student/surveys/${survey.id}`}
              key={survey.id}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold">{survey.title}</h2>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs ${survey.submittedAt ? "bg-gray-100 text-gray-600" : survey.isOpen ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
                >
                  {survey.submittedAt
                    ? "已提交"
                    : survey.isOpen
                      ? "待完成"
                      : "未开放"}
                </span>
              </div>
              <p className="mt-2 text-sm text-gray-600">
                {survey.course.name} · {survey.classroom.name} ·{" "}
                {survey.mode === "ANONYMOUS" ? "匿名" : "实名"}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {survey._count.questions} 题 · 截止{" "}
                {survey.dueAt.toLocaleString("zh-CN")}
              </p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-blue-700">
                {survey.submittedAt
                  ? "查看完成状态"
                  : survey.isOpen
                    ? "开始填写"
                    : "查看详情"}
                <ArrowRight aria-hidden="true" className="size-4" />
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
