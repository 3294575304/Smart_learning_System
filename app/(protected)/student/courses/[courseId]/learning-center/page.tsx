import { Role } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarCheck,
  ClipboardCheck,
  ClipboardList,
  FileClock,
  GitBranch,
  GraduationCap,
  NotebookPen,
  Target,
} from "lucide-react";
import { StudentPageLink } from "@/components/dashboard/student-page-link";
import {
  SECTION_TABS_LIST,
  sectionTabClass,
} from "@/components/ui/section-tabs";
import { StatFunnel } from "@/components/ui/stat-funnel";
import { StatusChip } from "@/components/ui/status-chip";
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
  "inline-flex min-h-10 items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-sm font-medium text-ink-body hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700";
const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-sky-700 bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700";
const panel = "min-w-0 rounded-xl border border-line bg-card p-4 sm:p-5";
/** 课程记录入口：窄栏里的紧凑宫格，去掉右侧外跳箭头，把宽度留给标签。 */
const tile =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-2 text-xs font-medium text-ink-body hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700";

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
    <section className="mx-auto max-w-7xl min-w-0 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-ink text-[22px] font-semibold [overflow-wrap:anywhere] sm:text-[26px]">
            {course.name}
          </h1>
          <p className="text-ink-body mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="bg-muted text-ink-soft rounded-md px-2 py-1 font-medium [overflow-wrap:anywhere]">
              {classroom.name}
            </span>
            <span>{course.term}</span>
            {readOnly && (
              <span className="bg-muted text-ink-soft rounded-md px-2 py-1 text-xs">
                {label} · 仅查看记录
              </span>
            )}
          </p>
        </div>
        <StudentPageLink
          className="border-line bg-card text-ink-body hover:bg-muted inline-flex min-h-11 w-fit max-w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
          href="/student/courses"
        >
          <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
          我的课程
        </StudentPageLink>
      </header>
      <CourseWorkspaceTabs
        courseId={course.id}
        classroomId={classroom.id}
        tab={location.tab}
      />
      <p className="text-ink-soft -mt-2 text-xs">
        {
          {
            overview: "本课程概览、下一步建议与知识掌握汇总",
            tasks: "本课程待办与课程记录入口",
            growth: "章节掌握、学习路径、我的画像与趋势记录",
          }[location.tab]
        }
      </p>
      <div className="mt-2 min-w-0 space-y-4">
        {await courseContent(student.id, scope, location, readOnly)}
      </div>
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
          className={`grid items-start gap-4 ${overview ? "lg:grid-cols-[minmax(0,1fr)_20rem]" : ""}`}
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
              className="text-ink text-[15px] font-semibold"
            >
              课程记录
            </h2>
            <p className="text-ink-soft mt-1 max-w-[52ch] text-xs leading-5">
              作业、考试、签到、问卷与课程总评的入口，仅统计当前教学班。
            </p>
            {readOnly && (
              <p className="text-ink-body mt-1 text-sm">
                当前教学班已停止作答，可查看已有记录。
              </p>
            )}
            <nav
              aria-label="课程记录入口"
              className={`mt-3 grid grid-cols-2 gap-2 ${readOnly ? "sm:grid-cols-3 lg:grid-cols-5" : ""}`}
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
                <StudentPageLink key={href} href={href} className={tile}>
                  <Icon aria-hidden="true" className="size-4 shrink-0" />
                  {label}
                </StudentPageLink>
              ))}
            </nav>
          </section>
        </div>
      );
    }
    if (location.tab === "overview") {
      const [data, analytics] = await Promise.all([
        getStudentCourseLearningCenter(studentId, courseId, classroomId),
        getStudentClassAnalytics(studentId, scope, now),
      ]);
      const analysis = analytics.classes[0];
      if (!analysis) notFound();
      const { exams } = analytics;
      const masteryStep = data.progressSteps.find(
        (step) => step.key === "mastered-concepts",
      );
      const pendingCount =
        analysis.assignmentProgress.overdue + analysis.attendance.pending;
      const examSummary =
        exams.missed > 0
          ? `缺考 ${exams.missed} 次`
          : exams.scoredCount > 0
            ? `已出分 ${exams.scoredCount} 次`
            : "暂无安排";
      const pendingRows = [
        {
          label: "正式作业",
          value: analysis.assignmentProgress.total
            ? `已交 ${analysis.assignmentProgress.submitted}/${analysis.assignmentProgress.total}`
            : "暂无作业",
          note:
            analysis.assignmentProgress.overdue > 0
              ? `逾期 ${analysis.assignmentProgress.overdue} 项`
              : null,
          muted: analysis.assignmentProgress.total === 0,
        },
        {
          label: "签到与出勤",
          value: analysis.attendance.total
            ? `${analysis.attendance.total} 条记录`
            : "暂无记录",
          note: analysis.attendance.pending
            ? `待确认 ${analysis.attendance.pending} 条`
            : null,
          muted: analysis.attendance.total === 0,
        },
        {
          label: "考试",
          value: examSummary,
          note: null,
          muted: examSummary === "暂无安排",
        },
        {
          label: "成绩公布",
          value: analysis.awaitingRelease
            ? `${analysis.awaitingRelease} 项待公布`
            : "无待公布",
          note: null,
          muted: analysis.awaitingRelease === 0,
        },
      ];
      return (
        <>
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
            <section className={panel} aria-labelledby="course-next-action">
              <h2
                className="text-ink text-[15px] font-semibold"
                id="course-next-action"
              >
                下一步
              </h2>
              <p className="text-ink-body mt-2 max-w-[52ch] text-sm leading-6">
                {data.nextAction}
              </p>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {[
                  masteryStep
                    ? `待巩固 ${Math.max(
                        0,
                        masteryStep.denominator - masteryStep.numerator,
                      )} 个`
                    : null,
                  `逾期 ${analysis.assignmentProgress.overdue} 项`,
                  `待公布 ${analysis.awaitingRelease} 项`,
                ]
                  .filter((chip): chip is string => Boolean(chip))
                  .map((chip) => (
                    <li
                      className="border-line text-ink-soft rounded-md border px-2 py-0.5 text-xs"
                      key={chip}
                    >
                      {chip}
                    </li>
                  ))}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                {!readOnly && (
                  <StudentPageLink
                    className={primary}
                    href={`/student/recommendations?view=generate&${scoped}`}
                  >
                    <Target aria-hidden="true" className="size-4" />
                    自主练习
                  </StudentPageLink>
                )}
                <StudentPageLink
                  className={action}
                  href={`/student/wrong-questions?${new URLSearchParams({ courseId, backCourseId: courseId, backClassroomId: classroomId })}`}
                >
                  <NotebookPen aria-hidden="true" className="size-4" />
                  本课程错题
                </StudentPageLink>
              </div>
            </section>

            <section className={panel} aria-labelledby="course-pending">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <h2
                  className="text-ink text-[15px] font-semibold"
                  id="course-pending"
                >
                  本课程待办
                </h2>
                <StatusChip tone={pendingCount > 0 ? "warn" : "ok"}>
                  {pendingCount > 0 ? `${pendingCount} 项待处理` : "无待办"}
                </StatusChip>
              </header>
              <p className="text-ink-soft mt-1 text-xs">仅统计当前教学班</p>
              <dl className="mt-3 space-y-2.5">
                {pendingRows.map((row) => (
                  <div
                    className="flex min-w-0 items-baseline justify-between gap-3"
                    key={row.label}
                  >
                    <dt className="text-ink-soft shrink-0 text-xs">
                      {row.label}
                    </dt>
                    <dd className="min-w-0 text-right">
                      <span
                        className={
                          row.muted
                            ? "text-ink-muted text-sm font-medium"
                            : "text-ink text-sm font-medium"
                        }
                      >
                        {row.value}
                      </span>
                      {row.note ? (
                        <span className="text-ink-soft ml-2 text-xs">
                          {row.note}
                        </span>
                      ) : null}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>

          <section className={panel} aria-labelledby="course-mastery">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h2
                className="text-ink text-[15px] font-semibold"
                id="course-mastery"
              >
                我的知识掌握
              </h2>
              <StudentPageLink
                className={action}
                href={`/student/analytics?${scoped}`}
              >
                我的学习分析
                <ArrowUpRight aria-hidden="true" className="size-4" />
              </StudentPageLink>
            </header>
            <p className="text-ink-soft mt-1 max-w-[52ch] text-xs leading-5">
              根据已公布的作业、考试成绩和练习结果，看看这门课掌握得怎么样。
            </p>
            <StatFunnel
              className="mt-3"
              dots={
                masteryStep && masteryStep.denominator > 0
                  ? {
                      total: masteryStep.denominator,
                      filled: masteryStep.numerator,
                      caption:
                        masteryStep.numerator === masteryStep.denominator
                          ? `${masteryStep.denominator} 个记录较充分的知识点都已掌握。`
                          : `${masteryStep.denominator} 个记录较充分的知识点中，${masteryStep.numerator} 个已掌握，${Math.max(
                              0,
                              masteryStep.denominator - masteryStep.numerator,
                            )} 个还需巩固。`,
                    }
                  : undefined
              }
              steps={data.progressSteps.map((step) => ({
                key: step.key,
                label: step.label,
                numerator: step.numerator,
                denominator: step.denominator,
                value: step.value,
                detail: step.detail,
              }))}
            />
          </section>
        </>
      );
    }
    if (location.tab !== "growth") return null;
    const section = location.section;
    const growthNav = (
      <nav aria-label="知识与成长内容" className={SECTION_TABS_LIST}>
        {STUDENT_GROWTH_SECTIONS.map((item) => (
          <StudentPageLink
            key={item.id}
            href={courseUrl("growth", item.id)}
            aria-current={section === item.id ? "page" : undefined}
            className={sectionTabClass(section === item.id)}
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
          <p className="text-ink-body max-w-[52ch] text-sm leading-6">
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
                className="text-ink text-[15px] font-semibold"
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
              scroll={false}
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
                <h2 className="text-ink text-[15px] font-semibold">
                  我的作业成绩
                </h2>
                <div className="mt-3">
                  <ScoreChart points={analysis.classes[0].scoreHistory} />
                </div>
              </section>
            )}
            {/*
              原来"其他学习趋势与记录"把掌握度趋势、活动时间线、画像说明
              整屏塞进一个默认收起的 details —— 学生看不到自己有没有在进步。
              这里直接展开，只保留趋势与记录本身的内容。
            */}
            <StudentCourseLearningCenterView
              data={data}
              scoreTrend={false}
              tab="activity"
            />
          </>
        )}
      </>
    );
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
