import { SurveyAvailabilityRefresh } from "@/components/course-surveys/survey-availability-refresh";
import {
  COURSE_SURVEY_AVAILABILITY_LABELS,
  nextCourseSurveyChangeAt,
} from "@/services/course-surveys/availability";
import { StudentClassroomFilter } from "@/components/dashboard/student-classroom-filter";
import { listStudentTaskClassrooms } from "@/services/courses/student-access";
import { Role } from "@prisma/client";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/dashboard/empty-state";
import { StudentPageHeader as PageHeader } from "@/components/dashboard/student-page-header";
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
  if (
    raw.classroomId !== undefined &&
    (typeof raw.classroomId !== "string" ||
      !courseIdSchema.safeParse(raw.classroomId).success)
  )
    notFound();
  const classroomId =
    typeof raw.classroomId === "string" ? raw.classroomId : undefined;
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
  let surveys: Awaited<ReturnType<typeof listStudentCourseSurveys>>;
  try {
    surveys = await listStudentCourseSurveys(
      student.id,
      course?.id,
      classroomId,
    );
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
  const classrooms = (
    await listStudentTaskClassrooms(student.id, course?.id)
  ).filter((item) => item.courseName !== null);
  const now = new Date();
  const nextChange = nextCourseSurveyChangeAt(surveys, now);
  return (
    <section className="space-y-4">
      <SurveyAvailabilityRefresh at={nextChange?.toISOString()} />
      <PageHeader
        actions={
          <Link
            className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50"
            href={
              course
                ? `/student/courses/${course.id}/learning-center${classroomId ? `?classroomId=${encodeURIComponent(classroomId)}` : ""}`
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
      <StudentClassroomFilter
        classrooms={classrooms}
        selectedId={classroomId}
        summary={`共 ${surveys.length} 份问卷 · ${surveys.filter((item) => item.isOpen && !item.submittedAt).length} 份待完成 · ${surveys.filter((item) => item.availability === "SCHEDULED").length} 份待开放`}
      />
      {surveys.length === 0 ? (
        <EmptyState
          description="当前教学班范围内暂无可查看的问卷，可切换全部教学班。"
          icon={ClipboardCheck}
          title="暂无问卷"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {surveys.map((survey) => (
            <Link
              className="rounded-xl border bg-white p-4 transition-colors hover:border-sky-300 hover:bg-sky-50/40 focus-visible:outline-2 focus-visible:outline-sky-600"
              href={`/student/surveys/${survey.id}`}
              key={survey.id}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold">{survey.title}</h2>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs ${survey.submittedAt ? "bg-gray-100 text-gray-600" : survey.isOpen ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
                >
                  {COURSE_SURVEY_AVAILABILITY_LABELS[survey.availability]}
                </span>
              </div>
              <p className="mt-2 text-sm text-gray-600">
                {survey.course.name} · {survey.classroom.name} ·{" "}
                {survey.mode === "ANONYMOUS" ? "匿名" : "实名"}
              </p>
              {survey.availability === "SCHEDULED" ? (
                <p className="mt-2 text-sm font-medium text-amber-800">
                  开放时间：{survey.opensAt.toLocaleString("zh-CN")}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-gray-500">
                {survey._count.questions} 题 · 截止{" "}
                {survey.dueAt.toLocaleString("zh-CN")}
              </p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-blue-700">
                {survey.submittedAt
                  ? "查看完成状态"
                  : survey.isOpen
                    ? "开始填写"
                    : survey.availability === "SCHEDULED"
                      ? "查看开放安排"
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
