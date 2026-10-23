import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { Role } from "@prisma/client";
import { FileChartColumn, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TeacherCourseAnalyticsView } from "@/components/courses/teacher-course-analytics";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { requirePageRole } from "@/services/auth/page-authorization";
import { getTeacherCourseAnalytics } from "@/services/course-analytics/service";
import { courseIdSchema } from "@/services/courses/schemas";
import { getTeacherCourseClassroomForPage } from "@/services/courses/page-context";
import { withClassroomQuery } from "@/lib/course-classroom";

type Props = {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ classroomId?: string }>;
};

export default async function TeacherCourseAnalyticsPage({
  params,
  searchParams,
}: Props) {
  const teacher = await requirePageRole(Role.TEACHER);
  const parsedCourseId = courseIdSchema.safeParse((await params).courseId);
  if (!parsedCourseId.success) notFound();
  const classroom = await getTeacherCourseClassroomForPage(
    teacher.id,
    parsedCourseId.data,
    (await searchParams).classroomId,
  );

  try {
    const data = await getTeacherCourseAnalytics(
      teacher.id,
      parsedCourseId.data,
      classroom?.id,
    );
    return (
      <section className="space-y-6">
        <header className="overflow-hidden rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-emerald-50 px-6 py-7 shadow-sm sm:px-8 sm:py-9">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span className="rounded-full border border-sky-200 bg-white/80 px-3 py-1 font-medium text-sky-800">
              教师课程分析中心
            </span>
            <span>{data.course.courseNo}</span>
            <span aria-hidden="true">·</span>
            <span>{data.course.term}</span>
          </div>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-5">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                {data.course.name}
                {classroom && (
                  <span className="ml-3 text-xl text-slate-600">
                    {classroom.name}
                  </span>
                )}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
                按“课程建设—教学实施—学情证据—结课评价”的顺序查看进展，并直接处理当前最需要关注的事项。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <TeacherBackLink href={`/teacher/courses/${data.course.id}`}>
                返回课程
              </TeacherBackLink>
              <Link
                href={withClassroomQuery(
                  `/teacher/courses/${data.course.id}/profiles`,
                  classroom?.id,
                )}
                className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-sky-700"
              >
                <Users aria-hidden="true" className="size-4" />
                学生画像
              </Link>
              <Link
                href={withClassroomQuery(
                  `/teacher/courses/${data.course.id}/quality-report`,
                  classroom?.id,
                )}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
              >
                <FileChartColumn aria-hidden="true" className="size-4" />
                质量报告
              </Link>
            </div>
          </div>
        </header>

        <TeacherCourseAnalyticsView data={data} classroomId={classroom?.id} />
      </section>
    );
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
