import { Role } from "@prisma/client";
import {
  ArrowLeft,
  CalendarCheck,
  ClipboardCheck,
  ClipboardList,
  GitBranch,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { StudentCourseLearningCenterView } from "@/components/learner-profiles/student-course-learning-center";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import { getStudentCourseLearningCenter } from "@/services/learner-profiles/learning-center";

import { listStudentCourseEvaluationContexts } from "@/services/gradebook/service";

export default async function StudentCourseLearningCenterPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const student = await requirePageRole(Role.STUDENT);
  const parsed = courseIdSchema.safeParse((await params).courseId);
  if (!parsed.success) notFound();

  const query = await searchParams;
  const contexts = (
    await listStudentCourseEvaluationContexts(student.id)
  ).filter((item) => item.course.id === parsed.data);
  if (!contexts.length) notFound();
  if (
    query.classroomId !== undefined &&
    (typeof query.classroomId !== "string" ||
      !contexts.some((item) => item.classroom.id === query.classroomId))
  )
    notFound();
  const classroomId =
    typeof query.classroomId === "string"
      ? query.classroomId
      : contexts.length === 1
        ? contexts[0].classroom.id
        : undefined;
  if (!classroomId) redirect("/student/courses");
  const classQuery = `classroomId=${encodeURIComponent(classroomId)}`;
  let data;
  try {
    data = await getStudentCourseLearningCenter(
      student.id,
      parsed.data,
      classroomId,
    );
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }

  return (
    <section className="space-y-6">
      <header className="relative overflow-hidden rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-4 text-slate-900 shadow-sm shadow-sky-100/60 sm:p-5">
        <div
          aria-hidden="true"
          className="absolute -top-24 -right-16 size-64 rounded-full bg-sky-200/60 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-32 left-1/3 size-64 rounded-full bg-emerald-100/80 blur-3xl"
        />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full border border-sky-200 bg-white/80 px-3 py-1 text-sky-700">
              学生课程空间
            </span>
            <span>画像 #{data.profileRevision}</span>
            <span>·</span>
            <span>图谱版本 {data.graphVersion ?? "未发布"}</span>
          </div>
          <h1 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
            {data.course.name}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            当前教学班：{data.classroom?.name}
            。作业、成绩和教学进度按本班查看；知识画像汇总本课程的学习证据。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              className="inline-flex items-center gap-2 rounded-lg border border-sky-100 bg-white/80 px-4 py-2.5 text-sm text-slate-700 transition hover:border-sky-200 hover:bg-white hover:text-sky-700"
              href="/student/courses"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              返回我的课程
            </Link>
            <Link
              className="inline-flex items-center gap-2 rounded-lg border border-sky-100 bg-white/80 px-4 py-2.5 text-sm text-slate-700 transition hover:border-sky-200 hover:bg-white hover:text-sky-700"
              href={`/student/courses/${data.course.id}/knowledge-graph${data.classroom ? `?classroomId=${encodeURIComponent(data.classroom.id)}` : ""}`}
            >
              <GitBranch aria-hidden="true" className="size-4" />
              知识图谱
            </Link>
            <Link
              className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-sky-700 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:outline-none"
              href={`/student/recommendations?view=generate&courseId=${encodeURIComponent(data.course.id)}&${classQuery}`}
            >
              <Sparkles aria-hidden="true" className="size-4" />
              开始练习
            </Link>
          </div>
          <div className="mt-4 border-t border-sky-100 pt-5">
            <p className="text-sm font-medium text-slate-700">本班任务</p>
            <nav
              aria-label="本班任务入口"
              className="mt-3 grid gap-2 sm:grid-cols-3"
            >
              <CourseTaskLink
                classroomId={classroomId}
                courseId={data.course.id}
                hrefBase="/student/assignments"
                icon={ClipboardList}
                label="本班作业"
              />
              <CourseTaskLink
                classroomId={classroomId}
                courseId={data.course.id}
                hrefBase="/student/attendance"
                icon={CalendarCheck}
                label="本班签到与出勤"
              />
              <CourseTaskLink
                classroomId={classroomId}
                courseId={data.course.id}
                hrefBase="/student/surveys"
                icon={ClipboardCheck}
                label="本班问卷"
              />
            </nav>
          </div>
          <p className="mt-4 border-t border-sky-100 pt-4 text-xs text-slate-500">
            数据更新时间：{data.generatedAt.toLocaleString("zh-CN")}
          </p>
        </div>
      </header>
      <StudentCourseLearningCenterView data={data} />
    </section>
  );
}

function CourseTaskLink({
  courseId,
  classroomId,
  hrefBase,
  icon: Icon,
  label,
}: {
  courseId: string;
  classroomId: string;
  hrefBase: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Link
      className="inline-flex items-center gap-2 rounded-lg border border-sky-100 bg-white/80 px-3 py-2.5 text-sm text-slate-700 transition hover:border-sky-200 hover:bg-white hover:text-sky-700 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
      href={`${hrefBase}?courseId=${encodeURIComponent(courseId)}&classroomId=${encodeURIComponent(classroomId)}`}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {label}
    </Link>
  );
}
