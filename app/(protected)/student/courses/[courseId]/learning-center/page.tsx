import { Role } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import {
  BookOpen,
  ArrowUpRight,
  CalendarCheck,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  FileClock,
  GitBranch,
  GraduationCap,
  Sparkles,
} from "lucide-react";
import { StudentBackLink } from "@/components/dashboard/student-back-link";
import { StudentPageLink } from "@/components/dashboard/student-page-link";
import { StudentHomeTasks } from "@/components/dashboard/student-home-tasks";
import { HomeKnowledgeMatrix } from "@/components/dashboard/home-knowledge-matrix";
import { ScoreChart } from "@/components/dashboard/student-analysis-workspace";
import { SurveyAvailabilityRefresh } from "@/components/course-surveys/survey-availability-refresh";
import { CourseWorkspaceTabs } from "@/components/learner-profiles/course-workspace-tabs";
import { LearnerProfileDetail } from "@/components/learner-profiles/profile-detail";
import { StudentCourseLearningCenterView } from "@/components/learner-profiles/student-course-learning-center";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { courseIdSchema } from "@/services/courses/schemas";
import { studentEnrollmentStatus } from "@/services/courses/student-enrollment";
import {
  parseStudentCourseLocation,
  studentCourseTabHref,
  STUDENT_GROWTH_SECTIONS,
  type StudentCourseLocation,
} from "@/services/courses/student-workspace";
import { getStudentTaskOverview } from "@/services/dashboard/student-task-service";
import { getStudentClassAnalytics } from "@/services/dashboard/student-class-analytics";
import { listStudentCourseEvaluationContexts } from "@/services/gradebook/service";
import { getStudentCourseLearningCenter } from "@/services/learner-profiles/learning-center";
import { getStudentLearnerProfile } from "@/services/learner-profiles/service";

const action =
  "inline-flex min-h-10 items-center gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900 hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700";
const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700";
const panel = "min-w-0 rounded-2xl border border-sky-100 bg-white p-4 sm:p-5";

export default async function StudentCourseLearningCenterPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const student = await requirePageRole(Role.STUDENT);
  const courseId = courseIdSchema.safeParse((await params).courseId);
  if (!courseId.success) notFound();
  const query = await searchParams;
  const location = parseStudentCourseLocation(query.tab, query.section);
  if (!location) notFound();
  const contexts = (
    await listStudentCourseEvaluationContexts(student.id)
  ).filter((item) => item.course.id === courseId.data);
  if (!contexts.length) notFound();
  const context =
    query.classroomId === undefined
      ? contexts.length === 1
        ? contexts[0]
        : undefined
      : contexts.find((item) => item.classroom.id === query.classroomId);
  if (!context) {
    if (query.classroomId !== undefined) notFound();
    redirect("/student/courses");
  }
  const { course, classroom } = context;
  const scope = { courseId: course.id, classroomId: classroom.id };
  const section = location.tab === "growth" ? location.section : undefined;
  if (
    (query.tab !== undefined && query.tab !== location.tab) ||
    (location.tab === "growth" && query.section !== section)
  )
    redirect(
      studentCourseTabHref(course.id, classroom.id, location.tab, section),
    );
  const { label, readOnly } = studentEnrollmentStatus(
    course.status,
    classroom.status,
  );
  return (
    <section className="mx-auto max-w-6xl min-w-0 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold [overflow-wrap:anywhere] text-slate-950 sm:text-2xl">
            {course.name}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-700">
            <span className="rounded-md bg-sky-100 px-2 py-1 font-medium [overflow-wrap:anywhere] text-sky-900">
              {classroom.name}
            </span>
            <span>{course.term}</span>
            {readOnly && (
              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs">
                {label} · 仅查看记录
              </span>
            )}
          </p>
        </div>
        <StudentBackLink href="/student/courses">返回我的课程</StudentBackLink>
      </header>
      <CourseWorkspaceTabs
        courseId={course.id}
        classroomId={classroom.id}
        tab={location.tab}
      />
      {await courseContent(student.id, scope, location, readOnly)}
    </section>
  );
}

async function courseContent(
  studentId: string,
  scope: { courseId: string; classroomId: string },
  location: StudentCourseLocation,
  readOnly: boolean,
) {
  const { courseId, classroomId } = scope;
  const scoped = new URLSearchParams(scope);
  const courseUrl = (
    tab: "overview" | "tasks" | "growth",
    section?: (typeof STUDENT_GROWTH_SECTIONS)[number]["id"],
  ) => studentCourseTabHref(courseId, classroomId, tab, section);
  const now = new Date();
  try {
    if (location.tab === "tasks") {
      const overview = readOnly
        ? null
        : await getStudentTaskOverview(studentId, now, scope);
      return (
        <div
          className={`grid items-start gap-4 ${overview ? "lg:grid-cols-[minmax(0,1fr)_17rem]" : ""}`}
        >
          {overview && (
            <>
              <SurveyAvailabilityRefresh
                at={overview.nextChangeAt?.toISOString()}
              />
              <StudentHomeTasks overview={overview} scope={scope} />
            </>
          )}
          <section className={panel} aria-labelledby="class-task-records">
            <h2
              id="class-task-records"
              className="font-semibold text-slate-950"
            >
              课程记录与成绩
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              仅显示当前教学班的个人待办与课程记录。
            </p>
            {readOnly && (
              <p className="mt-1 text-sm text-slate-600">
                当前教学班已停止作答，可查看已有记录。
              </p>
            )}
            <nav
              aria-label="课程记录入口"
              className={`mt-3 grid gap-1.5 ${readOnly ? "sm:grid-cols-2 lg:grid-cols-4" : ""}`}
            >
              {[
                {
                  href: `/student/assignments?${scoped}`,
                  label: "我的作业",
                  Icon: ClipboardList,
                },
                {
                  href: `/student/exams?${scoped}`,
                  label: "我的考试",
                  Icon: FileClock,
                },
                {
                  href: `/student/attendance?${scoped}`,
                  label: "签到与出勤",
                  Icon: CalendarCheck,
                },
                {
                  href: `/student/surveys?${scoped}`,
                  label: "课程问卷",
                  Icon: ClipboardCheck,
                },
                {
                  href: `/student/results?view=course&${scoped}`,
                  label: "课程总评",
                  Icon: GraduationCap,
                },
              ].map(({ href, label, Icon }) => (
                <StudentPageLink key={href} href={href} className={action}>
                  <Icon aria-hidden="true" className="size-4 shrink-0" />
                  {label}
                  <ArrowUpRight
                    aria-hidden="true"
                    className="ml-auto size-4 shrink-0"
                  />
                </StudentPageLink>
              ))}
            </nav>
          </section>
        </div>
      );
    }
    if (location.tab === "overview") {
      const [
        data,
        {
          classes: [analysis],
        },
      ] = await Promise.all([
        getStudentCourseLearningCenter(studentId, courseId, classroomId),
        getStudentClassAnalytics(studentId, scope, now),
      ]);
      if (!analysis) notFound();
      return (
        <>
          <section
            className={`${panel} flex flex-wrap items-center justify-between gap-3`}
            aria-labelledby="course-next-action"
          >
            <div className="min-w-0 flex-1 basis-72">
              <h2
                id="course-next-action"
                className="font-semibold text-slate-950"
              >
                接下来学什么
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {data.nextAction}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!readOnly && (
                <StudentPageLink
                  className={primary}
                  href={`/student/recommendations?view=generate&${scoped}`}
                >
                  <Sparkles aria-hidden="true" className="size-4" />
                  自主练习
                </StudentPageLink>
              )}
              <StudentPageLink
                className={action}
                href={`/student/wrong-questions?${new URLSearchParams({ courseId, backCourseId: courseId, backClassroomId: classroomId })}`}
              >
                <BookOpen aria-hidden="true" className="size-4" />
                本课程题库
              </StudentPageLink>
            </div>
          </section>
          <div
            className={`${panel} grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]`}
          >
            <section className="min-w-0">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-slate-950">我的作业与出勤</h2>
                <StudentPageLink
                  className={action}
                  href={`/student/analytics?${scoped}`}
                >
                  我的学习分析
                  <ArrowUpRight aria-hidden="true" className="size-4" />
                </StudentPageLink>
              </header>
              <p className="mt-1 text-xs text-slate-600">仅统计当前教学班</p>
              <dl className="mt-3 grid grid-cols-2 divide-x divide-slate-100">
                <div className="pr-3">
                  <dt className="text-xs text-slate-600">正式作业</dt>
                  <dd className="mt-1 text-lg font-semibold text-slate-950 tabular-nums">
                    {analysis.total
                      ? `已交 ${analysis.submitted}/${analysis.total}`
                      : "暂无作业"}
                  </dd>
                  <dd className="text-xs text-slate-600">
                    {analysis.overdue} 项逾期未交
                  </dd>
                </div>
                <div className="pl-3">
                  <dt className="text-xs text-slate-600">出勤记录</dt>
                  <dd className="mt-1 text-lg font-semibold text-slate-950 tabular-nums">
                    {analysis.attendance.total
                      ? `${analysis.attendance.total} 条`
                      : "暂无记录"}
                  </dd>
                  <dd className="text-xs text-slate-600">
                    正常 {analysis.attendance.present} · 待确认{" "}
                    {analysis.attendance.pending}
                  </dd>
                </div>
              </dl>
            </section>
            <section className="min-w-0 border-t border-slate-100 pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5">
              <h2 className="font-semibold text-slate-950">我的知识掌握</h2>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                汇总我在这门课的评分记录，已授范围按当前教学班统计。
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4">
                {data.progressSteps.map((step) => (
                  <div key={step.key} className="min-w-0">
                    <dt className="text-xs text-slate-600">
                      {step.key === "teaching-progress"
                        ? "课程已授范围"
                        : step.label}
                    </dt>
                    <dd
                      className="mt-1 text-lg font-semibold text-slate-950 tabular-nums"
                      title={step.detail}
                    >
                      {step.denominator
                        ? `${step.numerator} / ${step.denominator}`
                        : "—"}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-slate-600">
                课程已授范围以全部知识点为分母，其余各项依次缩小统计范围。
              </p>
            </section>
          </div>
        </>
      );
    }
    if (location.tab !== "growth") return null;
    const section = location.section;
    const growthNav = (
      <nav
        aria-label="知识与成长内容"
        className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-sky-100 bg-white p-1"
      >
        {STUDENT_GROWTH_SECTIONS.map((item) => (
          <StudentPageLink
            key={item.id}
            href={courseUrl("growth", item.id)}
            aria-current={section === item.id ? "page" : undefined}
            className={`inline-flex min-h-10 items-center rounded-lg px-3 py-2 text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-700 ${section === item.id ? "bg-sky-100 font-semibold text-sky-900" : "font-medium text-slate-700 hover:bg-sky-50 hover:text-sky-900"}`}
          >
            {item.label}
          </StudentPageLink>
        ))}
      </nav>
    );
    if (section === "profile") {
      const profile = await getStudentLearnerProfile(studentId, courseId);
      return (
        <>
          {growthNav}
          <p className="text-sm leading-6 text-slate-700">
            汇总我在这门课的评分记录。出勤、自我反思和知识掌握分别展示。
          </p>
          <LearnerProfileDetail profile={profile} studentView />
        </>
      );
    }
    const [data, analysis] = await Promise.all([
      getStudentCourseLearningCenter(studentId, courseId, classroomId),
      section === "trends"
        ? getStudentClassAnalytics(studentId, scope, now)
        : null,
    ]);
    return (
      <>
        {growthNav}
        {section === "knowledge" && (
          <section className={panel} aria-labelledby="course-chapter-matrix">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h2
                id="course-chapter-matrix"
                className="font-semibold text-slate-950"
              >
                我的知识掌握
              </h2>
              <StudentPageLink
                className={action}
                href={`/student/courses/${courseId}/knowledge-graph?${new URLSearchParams({ classroomId })}`}
              >
                <GitBranch aria-hidden="true" className="size-4" />
                打开知识图谱
              </StudentPageLink>
            </header>
            <HomeKnowledgeMatrix
              chapters={data.heatmap.map((chapter) => ({
                key: chapter.key,
                name: chapter.name,
                concepts: chapter.concepts.map((c) => ({
                  key: c.key,
                  conceptId: c.conceptId,
                  name: c.name,
                  status: c.status,
                  evidenceCount: c.evidenceCount,
                  masteryScore: c.masteryScore,
                })),
              }))}
              profileHref={`/student/courses/${courseId}/profile?${new URLSearchParams({ classroomId })}`}
              generatedAt={data.generatedAt.toISOString()}
              profileRevision={data.profileRevision}
            />
          </section>
        )}
        {section === "path" && (
          <StudentCourseLearningCenterView data={data} tab="path" />
        )}
        {section === "trends" && (
          <>
            {analysis?.classes[0] && (
              <section className={panel}>
                <h2 className="mb-3 font-semibold text-slate-950">
                  我的作业成绩
                </h2>
                <ScoreChart points={analysis.classes[0].scoreHistory} />
              </section>
            )}
            <details className={`${panel} group`}>
              <summary className="-my-1 flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 rounded-md font-medium text-sky-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 [&::-webkit-details-marker]:hidden">
                其他学习趋势与记录
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 shrink-0 group-open:rotate-180"
                />
              </summary>
              <div className="mt-4 border-t border-slate-100 pt-4">
                <StudentCourseLearningCenterView data={data} tab="activity" />
              </div>
            </details>
          </>
        )}
      </>
    );
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
