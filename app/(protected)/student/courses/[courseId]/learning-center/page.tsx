import { StudentAnalysisReturnLink } from "@/components/dashboard/student-analysis-return-link";
import { studentAnalysisHref } from "@/services/student-experience/analysis-navigation";
import { Role } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
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
import { StatFunnel } from "@/components/ui/stat-funnel";
import { StatusChip } from "@/components/ui/status-chip";
import { StudentHomeTasks } from "@/components/dashboard/student-home-tasks";
import { ChapterMasteryPanel } from "@/components/learner-profiles/chapter-mastery-panel";
import { KnowledgeDistribution } from "@/components/learner-profiles/knowledge-distribution";
import { ScoreChart } from "@/components/dashboard/student-analysis-workspace";
import { SurveyAvailabilityRefresh } from "@/components/course-surveys/survey-availability-refresh";
import { CourseWorkspaceTabs } from "@/components/learner-profiles/course-workspace-tabs";
import {
  GrowthKnowledgeSections,
  GrowthSectionNavigation,
} from "@/components/learner-profiles/growth-section-navigation";
import { LearnerProfileDetail } from "@/components/learner-profiles/profile-detail";
import { GrowthKnowledgeTabs } from "@/components/learner-profiles/growth-knowledge-tabs";
import { GrowthSummaryStrip } from "@/components/learner-profiles/growth-summary-strip";
import { GrowthRangeTabs } from "@/components/learner-profiles/growth-range-tabs";
import { ProfileEvidenceFocus } from "@/components/learner-profiles/profile-evidence-focus";
import { WeeklyPlan } from "@/components/learner-profiles/weekly-plan";
import { ObjectiveMasteryGrid } from "@/components/learner-profiles/objective-mastery";
import { StudentCourseLearningCenterView } from "@/components/learner-profiles/student-course-learning-center";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { courseIdSchema } from "@/services/courses/schemas";
import { studentEnrollmentStatus } from "@/services/courses/student-enrollment";
import {
  growthRangeSince,
  parseGrowthRange,
  parseStudentCourseLocation,
  studentCourseTabHref,
  type StudentCourseLocation,
  type StudentGrowthRange,
} from "@/services/courses/student-workspace";
import { getStudentTaskOverview } from "@/services/dashboard/student-task-service";
import { getStudentClassAnalytics } from "@/services/dashboard/student-class-analytics";
import { listStudentCourseEvaluationContexts } from "@/services/gradebook/service";
import { getStudentCourseLearningCenter } from "@/services/learner-profiles/learning-center";
import { getStudentGrowthSummary } from "@/services/learner-profiles/growth-summary";
import { filterActivitySince } from "@/services/learner-profiles/learning-center-format";
import { getStudentLearnerProfileView } from "@/services/learner-profiles/service";

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
  const range: StudentGrowthRange = parseGrowthRange(query.range);
  if (
    (query.tab !== undefined && query.tab !== location.tab) ||
    (location.tab === "growth" && query.section !== section) ||
    (query.range !== undefined && query.range !== range)
  ) {
    const href = studentCourseTabHref(
      course.id,
      classroom.id,
      location.tab,
      section,
    );
    redirect(
      location.tab === "growth" && section === "trends"
        ? `${href}&range=${range}`
        : href,
    );
  }
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
        <div className="flex flex-wrap items-center gap-2">
          {query.analysisReturn && (
            <StudentAnalysisReturnLink href={query.analysisReturn} />
          )}
          <StudentPageLink
            className="border-line bg-card text-ink-body hover:bg-muted inline-flex min-h-11 w-fit max-w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
            href="/student/courses"
          >
            <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
            我的课程
          </StudentPageLink>
        </div>
      </header>
      <CourseWorkspaceTabs
        courseId={course.id}
        classroomId={classroom.id}
        tab={location.tab}
      />
      {/*
        说明行只在「学习概况 / 课程任务」保留：growth 的文案曾逐字重复下面四个标签
        （章节掌握、学习路径、我的画像、趋势与记录），等于让人先读目录再看目录。
      */}
      {location.tab === "overview" ? (
        <p className="text-ink-soft -mt-2 text-xs">
          本课程概览、下一步建议与知识掌握汇总
        </p>
      ) : null}
      {location.tab === "tasks" ? (
        <p className="text-ink-soft -mt-2 text-xs">本课程待办与课程记录入口</p>
      ) : null}
      {location.tab === "growth" && (
        <>
          <GrowthSectionNavigation
            courseId={course.id}
            classroomId={classroom.id}
            initialSection={location.section}
          />
          <Suspense fallback={null}>
            <GrowthSummary
              studentId={student.id}
              courseId={course.id}
              section={location.section}
            />
          </Suspense>
        </>
      )}
      {location.tab === "growth" && readOnly && (
        <p className="border-line bg-muted/50 text-ink-body rounded-lg border px-3 py-2 text-xs">
          当前教学班{label}，知识与成长仅可查看记录；「去练」类入口已隐藏。
        </p>
      )}
      <div className="mt-2 min-w-0 space-y-4">
        <Suspense
          key={`${classroom.id}:${location.tab}:${section ?? ""}`}
          fallback={
            <p role="status" className={`${panel} text-ink-soft text-sm`}>
              正在加载课程内容…
            </p>
          }
        >
          <CourseContent
            studentId={student.id}
            scope={scope}
            location={location}
            focusConceptId={
              typeof query.conceptId === "string" ? query.conceptId : undefined
            }
            readOnly={readOnly}
          />
        </Suspense>
      </div>
    </section>
  );
}

async function GrowthSummary({
  studentId,
  courseId,
  section,
}: {
  studentId: string;
  courseId: string;
  section: "knowledge" | "path" | "profile" | "trends";
}) {
  const summary = await getStudentGrowthSummary(studentId, courseId);
  return summary ? (
    <GrowthSummaryStrip summary={summary} section={section} />
  ) : null;
}

async function CourseContent({
  studentId,
  scope,
  location,
  focusConceptId,
  readOnly,
}: {
  studentId: string;
  scope: { courseId: string; classroomId: string };
  location: StudentCourseLocation;
  focusConceptId?: string;
  readOnly: boolean;
}) {
  const { courseId, classroomId } = scope;
  const scoped = new URLSearchParams(scope);
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
                href={studentAnalysisHref(scope, { fromCourseCenter: true })}
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
    if (section === "profile") {
      const profile = await getStudentLearnerProfileView(studentId, courseId, {
        includeEvidence: false,
      });
      /*
       * 旧 /profile 页已收敛为跳转层，带 conceptId 的深链由这里承接：
       * 展开对应知识点的证据明细，并在挂载后滚动聚焦。
       * conceptId 只参与 DOM 定位与比较，不进数据库查询。
       */
      const focus = focusConceptId || undefined;
      const evidenceHref = studentCourseTabHref(
        courseId,
        classroomId,
        "growth",
        "profile",
      );
      return (
        <>
          <p className="text-ink-body max-w-[52ch] text-sm leading-6">
            五个维度分别取自出勤、评分记录、近期学习事件、学生自述与判题结果。
            自述与活跃度只作辅助理解，不进入客观掌握度。
          </p>
          <LearnerProfileDetail
            evidenceHref={evidenceHref}
            focusConceptId={focus}
            links={{
              knowledge: studentCourseTabHref(
                courseId,
                classroomId,
                "growth",
                "knowledge",
              ),
              practice: `/student/recommendations?${new URLSearchParams({
                view: "generate",
                courseId,
                classroomId,
              }).toString()}`,
              attendance: `/student/attendance?${new URLSearchParams({
                courseId,
                classroomId,
              }).toString()}`,
            }}
            profile={profile}
            reflectionHref={`/student/recommendations?${new URLSearchParams({
              view: "assistant",
              courseId,
              classroomId,
            }).toString()}`}
            studentView
          />
          <ProfileEvidenceFocus conceptId={focus} />
        </>
      );
    }
    const [data, analysis] = await Promise.all([
      getStudentCourseLearningCenter(
        studentId,
        courseId,
        classroomId,
        section === "trends" ? "activity" : "knowledge",
      ),
      section === "trends"
        ? getStudentClassAnalytics(studentId, scope, now)
        : null,
    ]);
    function renderTrend(range: StudentGrowthRange) {
      const since = growthRangeSince(range, now);
      const scorePoints =
        section === "trends"
          ? (analysis?.classes[0]?.scoreHistory ?? []).filter(
              (point) =>
                !since || !point.submittedAt || point.submittedAt >= since,
            )
          : [];
      const scoreDelta =
        scorePoints.length >= 2 &&
        typeof scorePoints.at(-1)?.percentage === "number" &&
        typeof scorePoints.at(-2)?.percentage === "number"
          ? Number(
              (
                (scorePoints.at(-1)!.percentage as number) -
                (scorePoints.at(-2)!.percentage as number)
              ).toFixed(1),
            )
          : null;
      return (
        <>
          {analysis?.classes[0] && (
            <section className={panel}>
              <header className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-ink text-[15px] font-semibold">
                  我的作业成绩
                </h2>
                {scoreDelta !== null ? (
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs tabular-nums ${
                      scoreDelta >= 0
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-amber-200 bg-amber-50 text-amber-800"
                    }`}
                  >
                    较上一组 {scoreDelta >= 0 ? "+" : ""}
                    {scoreDelta} 分
                  </span>
                ) : null}
              </header>
              <div className="mt-3">
                <ScoreChart compactSmallSample points={scorePoints} />
              </div>
              <p className="text-ink-soft mt-3 border-t pt-3 text-xs leading-5">
                这里画的是每次作答的得分率；下方「稳定掌握度」按知识点聚合，
                两者取样不同，不能直接比较高低。
              </p>
            </section>
          )}
          <StudentCourseLearningCenterView
            data={{
              ...data,
              masteryTrend: data.masteryTrend.filter(
                (point) => !since || Date.parse(point.at) >= since.getTime(),
              ),
              /*
               * 区间必须同时作用于时间线：只过滤图表会出现「切到近 30 天，
               * 图上只剩 30 天，下面学习记录一条没少」，看起来像筛选失效。
               */
              recentActivity: filterActivitySince(data.recentActivity, since),
            }}
            scoreTrend={false}
            tab="activity"
          />
        </>
      );
    }
    return (
      <>
        {(section === "knowledge" || section === "path") && (
          <GrowthKnowledgeSections
            knowledge={
              <GrowthKnowledgeTabs
                chapterView={
                  <section
                    className={panel}
                    aria-labelledby="course-chapter-matrix"
                  >
                    <header className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2
                          id="course-chapter-matrix"
                          className="text-ink text-[15px] font-semibold"
                        >
                          我的知识掌握
                        </h2>
                        <p className="text-ink-soft mt-1 text-xs">
                          未评估不等于零分；评分记录较少时只给状态，不给结论。
                        </p>
                      </div>
                      <StudentPageLink
                        className={action}
                        href={`/student/courses/${courseId}/knowledge-graph?${new URLSearchParams({ classroomId })}`}
                      >
                        <GitBranch aria-hidden="true" className="size-4" />
                        打开知识图谱
                      </StudentPageLink>
                    </header>
                    <div className="mt-4">
                      <KnowledgeDistribution chapters={data.heatmap} />
                      <ChapterMasteryPanel
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
                        practiceBase={
                          readOnly
                            ? null
                            : `/student/recommendations?${new URLSearchParams({
                                view: "generate",
                                courseId,
                                classroomId,
                              }).toString()}`
                        }
                        profileHref={studentCourseTabHref(
                          courseId,
                          classroomId,
                          "growth",
                          "profile",
                        )}
                        readOnly={readOnly}
                        generatedAt={data.generatedAt.toISOString()}
                        profileRevision={data.profileRevision}
                      />
                    </div>
                  </section>
                }
                objectiveCount={data.objectives.length}
                objectiveNotice="目标维度按正式考核方案聚合，与章节维度口径不同：同一知识点可能同时计入多个目标，因此两边的数量不必相等。"
                objectiveView={
                  <ObjectiveMasteryGrid
                    classroomId={classroomId}
                    courseId={courseId}
                    objectives={data.objectives}
                    readOnly={readOnly}
                  />
                }
              />
            }
            path={
              /*
               * 「本周计划」和「优先巩固」原先取的是同一份数据（learningPath.current
               * 前 6 项），同页出现两组同样的知识点、两套「练习」按钮。
               * 现在由本周计划承担主导航（有序、可勾选、带进度），右侧只留
               * 已掌握与尚无评分记录两类参考信息。
               *
               * 高度按视口收敛而不是写死：窗口矮时自动变矮，最高 420px。
               * 两卡共用同一行高，超出部分在各自列表区内滚动，底边始终对齐。
               */
              <div className="grid gap-4 lg:h-[clamp(340px,46vh,420px)] lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-stretch">
                <WeeklyPlan
                  classroomId={classroomId}
                  courseId={courseId}
                  items={data.learningPath.current.slice(0, 6)}
                  readOnly={readOnly}
                />
                <StudentCourseLearningCenterView
                  data={data}
                  readOnly={readOnly}
                  tab="path"
                />
              </div>
            }
          />
        )}
        {section === "trends" && (
          <GrowthRangeTabs
            classroomId={classroomId}
            courseId={courseId}
            panels={{
              "30d": renderTrend("30d"),
              "90d": renderTrend("90d"),
              all: renderTrend("all"),
            }}
          />
        )}
      </>
    );
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
