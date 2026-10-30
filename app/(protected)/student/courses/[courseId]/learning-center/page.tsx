import { StudentBackLink } from "@/components/dashboard/student-back-link";
import { StudentCourseDashboard } from "@/components/learner-profiles/student-course-dashboard";
import { getStudentClassAnalytics } from "@/services/dashboard/student-class-analytics";
import { Role } from "@prisma/client";
import {
  ChartNoAxesCombined,
  BookOpen,
  GraduationCap,
  CalendarCheck,
  ClipboardCheck,
  ClipboardList,
  GitBranch,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CourseWorkspaceTabs } from "@/components/learner-profiles/course-workspace-tabs";
import { LearnerProfileDetail } from "@/components/learner-profiles/profile-detail";
import { getStudentLearnerProfile } from "@/services/learner-profiles/service";
import {
  parseStudentCourseTab,
  STUDENT_COURSE_TABS,
  studentCourseTabHref,
} from "@/services/courses/student-workspace";
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
  const tab = parseStudentCourseTab(query.tab);
  if (!tab) notFound();
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
  if (query.tab !== undefined && query.tab !== tab)
    redirect(studentCourseTabHref(parsed.data, classroomId, tab));
  const classQuery = `classroomId=${encodeURIComponent(classroomId)}`;
  let data;
  let analysis;
  try {
    data = await getStudentCourseLearningCenter(
      student.id,
      parsed.data,
      classroomId,
    );
    if (tab === "overview") {
      analysis = (
        await getStudentClassAnalytics(student.id, {
          courseId: parsed.data,
          classroomId,
        })
      ).classes[0];
      if (!analysis) notFound();
    }
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }

  const profile =
    tab === "profile"
      ? await getStudentLearnerProfile(student.id, parsed.data)
      : null;
  const scoped = new URLSearchParams({ courseId: data.course.id, classroomId });
  const button =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600";
  return (
    <section className="min-w-0 space-y-5">
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-sky-100 pb-4">
        <div className="min-w-0">
          <p className="text-xs text-sky-700">我的课程 / 教学班空间</p>
          <h1 className="mt-1 text-xl font-semibold [overflow-wrap:anywhere] text-slate-950 sm:text-2xl">
            {data.course.name}
          </h1>
          <p className="mt-1 text-sm [overflow-wrap:anywhere] text-slate-500">
            当前教学班：{data.classroom?.name}
          </p>
        </div>
        <StudentBackLink href="/student/courses">返回我的课程</StudentBackLink>
      </header>
      <CourseWorkspaceTabs
        courseId={data.course.id}
        classroomId={classroomId}
        tab={tab}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          {STUDENT_COURSE_TABS.find((item) => item.id === tab)?.description}
        </p>
        <span className="text-xs text-slate-400">
          画像更新于 {data.generatedAt.toLocaleString("zh-CN")}
        </span>
      </div>
      {tab === "overview" && (
        <section className="rounded-xl border border-sky-100 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">
            课程功能
          </h2>
          <p className="mb-2 text-xs text-slate-500">本班事务</p>
          <nav
            aria-label="本班任务入口"
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          >
            <CourseTaskLink
              courseId={data.course.id}
              classroomId={classroomId}
              hrefBase="/student/assignments"
              icon={ClipboardList}
              label="本班作业"
              description="查看本班作业与提交状态"
            />
            <CourseTaskLink
              courseId={data.course.id}
              classroomId={classroomId}
              hrefBase="/student/attendance"
              icon={CalendarCheck}
              label="本班签到与出勤"
              description="参加本班签到，查看出勤记录"
            />
            <CourseTaskLink
              courseId={data.course.id}
              classroomId={classroomId}
              hrefBase="/student/surveys"
              icon={ClipboardCheck}
              label="本班问卷"
              description="完成课程自评，不计课程成绩"
            />
            <a
              className={button}
              href={`/student/results?view=course&${scoped}`}
            >
              <GraduationCap className="size-5 shrink-0" aria-hidden="true" />
              <span>
                课程总评
                <span className="sr-only">查看本班已发布成绩与构成</span>
              </span>
            </a>
          </nav>
          <div className="mt-4 border-t border-sky-100 pt-3">
            <p className="mb-2 text-xs text-slate-500">自主学习</p>
            <nav
              aria-label="自主学习入口"
              className="grid grid-cols-2 gap-2 sm:grid-cols-3"
            >
              <a
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-sky-600 bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
                href={`/student/recommendations?view=generate&${scoped}`}
              >
                <Sparkles className="size-4" aria-hidden="true" />
                开始练习
              </a>
              <a
                className={button}
                href={`/student/wrong-questions?courseId=${encodeURIComponent(data.course.id)}&backCourseId=${encodeURIComponent(data.course.id)}&backClassroomId=${encodeURIComponent(classroomId)}`}
              >
                <BookOpen className="size-4" aria-hidden="true" />
                课程复习
              </a>
              <a className={button} href={`/student/analytics?${scoped}`}>
                <ChartNoAxesCombined className="size-4" aria-hidden="true" />
                本班学情
              </a>
            </nav>
          </div>
        </section>
      )}
      {tab === "overview" && analysis && (
        <StudentCourseDashboard data={data} analysis={analysis} />
      )}
      {tab === "profile" && profile ? (
        <>
          <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-4 text-sm leading-6 text-slate-600">
            我的画像汇总本课程的学习证据，不等同于本班成绩。出勤、活跃、自我反思与知识掌握分别呈现，证据不足不按零分处理。
          </div>
          <LearnerProfileDetail profile={profile} />
          <details className="rounded-xl border border-sky-100 bg-white p-4">
            <summary className="cursor-pointer rounded-lg text-sm font-medium text-sky-700 focus-visible:outline-2 focus-visible:outline-sky-600">
              查看学习趋势与记录
            </summary>
            <div className="mt-4">
              <StudentCourseLearningCenterView data={data} tab="activity" />
            </div>
          </details>
        </>
      ) : tab !== "profile" ? (
        <>
          {tab === "knowledge" && (
            <a
              className={button}
              href={`/student/courses/${data.course.id}/knowledge-graph?${classQuery}`}
            >
              <GitBranch className="size-4" aria-hidden="true" />
              打开知识图谱
            </a>
          )}
          {tab === "knowledge" && (
            <details className="rounded-xl border border-sky-100 bg-white p-4">
              <summary className="cursor-pointer rounded-lg text-sm font-medium text-sky-700 focus-visible:outline-2 focus-visible:outline-sky-600">
                查看我的学习路径
              </summary>
              <div className="mt-4">
                <StudentCourseLearningCenterView data={data} tab="path" />
              </div>
            </details>
          )}
          {tab === "knowledge" && (
            <StudentCourseLearningCenterView data={data} tab={tab} />
          )}
        </>
      ) : null}
    </section>
  );
}

function CourseTaskLink({
  courseId,
  classroomId,
  hrefBase,
  icon: Icon,
  label,
  description,
}: {
  courseId: string;
  classroomId: string;
  hrefBase: string;
  icon: LucideIcon;
  label: string;
  description: string;
}) {
  return (
    <Link
      className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-sky-100 bg-sky-50/40 px-3 py-2 text-sm font-medium text-sky-800 transition hover:border-sky-300 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
      href={`${hrefBase}?courseId=${encodeURIComponent(courseId)}&classroomId=${encodeURIComponent(classroomId)}`}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span>
        {label}
        <span className="sr-only">{description}</span>
      </span>
    </Link>
  );
}
