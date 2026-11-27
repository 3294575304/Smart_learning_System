import { StudentAnalysisReturnLink } from "@/components/dashboard/student-analysis-return-link";
import { activityHref } from "@/services/student-experience/activity-query";
import { examTypeLabel } from "@/services/exams/exam-types";
import Link from "next/link";
import { Role } from "@prisma/client";
import { ClipboardCheck } from "lucide-react";
import { requirePageRole } from "@/services/auth/page-authorization";
import { StudentPageHeader } from "@/components/dashboard/student-page-header";
import { StudentCourseReturnLink } from "@/components/dashboard/student-course-return-link";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  StudentActivityFilters,
  StudentActivityPagination,
  activityActionClass,
  activityPrimaryClass,
} from "@/components/dashboard/student-activity-list";
import { SurveyAvailabilityRefresh } from "@/components/course-surveys/survey-availability-refresh";
import {
  readActivityPage,
  readActivityPageQuery,
} from "@/services/student-experience/activity-page";
import {
  listStudentExamClassrooms,
  loadActivityExams,
} from "@/services/student-experience/activity-service";
import { studentTaskHref } from "@/services/student-experience/task-scope";
import { ExamAttemptBadge } from "@/components/exams/exam-attempt-badge";
import { StudentExamNotice } from "@/components/exams/student-exam-notice";
import { StatusChip, type StatusChipTone } from "@/components/ui/status-chip";
import {
  examStateGroupLabels,
  examStateGroupOrder,
  examStateLabels,
  formatScore,
  type ExamRowState,
} from "@/services/exams/exam-state";
import {
  examDurationMinutes,
  formatExamFullTime,
  formatExamWindow,
} from "@/services/exams/exam-time";

const stateTone: Record<
  ExamRowState,
  { tone: StatusChipTone; variant?: "soft" | "outline" }
> = {
  UPCOMING: { tone: "neutral", variant: "outline" },
  IN_PROGRESS: { tone: "brand" },
  RETAKEABLE: { tone: "brand", variant: "outline" },
  SCORED_RETAKEABLE: { tone: "brand", variant: "outline" },
  AWAITING_SCORE: { tone: "warn" },
  SCORED: { tone: "ok" },
  // 缺考/缓考/免修/待说明都不是“错误”，用琥珀而非红色。
  SPECIAL: { tone: "warn" },
  CLOSED_NO_SUBMISSION: { tone: "neutral" },
};

const operableStates = new Set<ExamRowState>([
  "UPCOMING",
  "IN_PROGRESS",
  "RETAKEABLE",
  "SCORED_RETAKEABLE",
]);

const panelClass = "rounded-xl border border-border bg-card";
const dividerRow = "border-b border-border last:border-b-0";

export default async function StudentExamsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const student = await requirePageRole(Role.STUDENT);
  const query = readActivityPageQuery("exams", await searchParams, {
    lenient: true,
  });
  const now = new Date();
  const [result, classrooms] = await Promise.all([
    readActivityPage(() => loadActivityExams(student.id, query, now)),
    listStudentExamClassrooms(student.id, query.courseId),
  ]);
  const scopedClassroom = query.classroomId
    ? classrooms.find((room) => room.id === query.classroomId)
    : undefined;
  const hasFilters =
    query.status !== "ALL" ||
    query.examType !== "ALL" ||
    query.range !== "all" ||
    Boolean(query.q) ||
    Boolean(query.classroomId) ||
    Boolean(query.courseId);
  const groupSummary = Object.entries(result.counts)
    .sort(
      ([left], [right]) =>
        examStateGroupOrder[left as ExamRowState] -
        examStateGroupOrder[right as ExamRowState],
    )
    .map(
      ([state, count]) =>
        `${examStateGroupLabels[state as ExamRowState]} ${count}`,
    )
    .join(" · ");
  let lastGroup: ExamRowState | null = null;
  const pageGroupCounts = result.items.reduce<Record<string, number>>(
    (acc, exam) => {
      acc[exam.state] = (acc[exam.state] ?? 0) + 1;
      return acc;
    },
    {},
  );

  return (
    <section className="space-y-4">
      <SurveyAvailabilityRefresh at={result.nextChangeAt?.toISOString()} />
      <StudentPageHeader
        title="我的考试"
        description="按紧急程度排序：进行中 → 可重考 → 待开考 → 待出分 → 已出分 → 已登记 → 已截止。"
        actions={
          query.analysisReturn ? (
            <StudentAnalysisReturnLink href={query.analysisReturn} />
          ) : query.courseId && query.classroomId ? (
            <StudentCourseReturnLink
              courseId={query.courseId}
              classroomId={query.classroomId}
              tab="tasks"
            />
          ) : undefined
        }
      />
      {scopedClassroom && (
        <div className="border-border bg-muted/40 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
          <p className="min-w-0 break-words text-slate-700">
            <span className="font-medium">当前范围</span>
            <span className="text-slate-500"> · </span>
            {[
              scopedClassroom.courseName,
              scopedClassroom.name,
              scopedClassroom.term,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <Link
            className="text-brand-strong shrink-0 font-medium hover:underline"
            href={activityHref("exams", {
              ...query,
              classroomId: undefined,
              page: 1,
            })}
          >
            查看全部教学班
          </Link>
        </div>
      )}
      {scopedClassroom?.inactive && (
        <p className="text-warn bg-warn-soft rounded-xl border border-amber-200 px-4 py-3 text-sm">
          你已退出「{scopedClassroom.name}
          」，以下为该教学班的历史考试记录，仅可查看。
        </p>
      )}
      <StudentActivityFilters
        view="exams"
        query={query}
        classrooms={classrooms.filter((room) => room.courseName !== null)}
        total={result.pagination.total}
      />
      {groupSummary && (
        <p className="px-1 text-sm text-slate-600" role="status">
          {groupSummary}
        </p>
      )}
      {result.items.length ? (
        <div className={panelClass}>
          {result.items.map((exam) => {
            const returnQuery = new URLSearchParams({
              returnTo: activityHref("exams", {
                ...query,
                page: result.pagination.page,
                focus: exam.id,
              }),
            });
            const recordHref = studentTaskHref(
              `/student/exams/${exam.examId}/record?${returnQuery}`,
              exam.scope,
            );
            const duration = examDurationMinutes(exam.startsAt, exam.dueAt);
            const showGroupHeader = lastGroup !== exam.state;
            lastGroup = exam.state;
            return (
              <div
                key={exam.id}
                id={`exam-${exam.id}`}
                className="scroll-mt-24"
              >
                {showGroupHeader && (
                  <h2 className="bg-muted/60 border-border border-b px-4 py-2 text-xs font-semibold tracking-wide text-slate-600 sm:px-5">
                    {examStateGroupLabels[exam.state]}
                    <span className="ms-1 font-normal text-slate-600">
                      共 {result.counts[exam.state] ?? 0} 场
                      {(pageGroupCounts[exam.state] ?? 0) <
                        (result.counts[exam.state] ?? 0) &&
                        ` · 本页 ${pageGroupCounts[exam.state]}`}
                    </span>
                  </h2>
                )}
                <article
                  className={`${dividerRow} hover:bg-muted/40 focus-within:bg-muted/40 flex flex-col gap-3 px-4 py-4 transition-colors sm:px-5 lg:flex-row lg:items-center lg:justify-between`}
                >
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-start gap-2">
                      <h3 className="min-w-0 text-base font-semibold break-words text-slate-950">
                        {exam.state === "UPCOMING" ? (
                          exam.title
                        ) : (
                          <Link
                            className="underline-offset-4 hover:underline"
                            href={
                              exam.state === "IN_PROGRESS" ||
                              exam.state === "RETAKEABLE"
                                ? exam.href
                                : recordHref
                            }
                          >
                            {exam.title}
                          </Link>
                        )}
                      </h3>
                      <StatusChip
                        tone={stateTone[exam.state].tone}
                        variant={stateTone[exam.state].variant}
                        className="text-xs"
                      >
                        {exam.state === "IN_PROGRESS" && (
                          <span
                            aria-hidden="true"
                            className="bg-brand me-1 inline-block size-1.5 rounded-full align-middle motion-safe:animate-pulse"
                          />
                        )}
                        {examStateLabels[exam.state]}
                      </StatusChip>
                      {exam.specialLabel && (
                        <StatusChip tone="bad" className="text-xs">
                          {exam.specialLabel}
                        </StatusChip>
                      )}
                      {exam.readOnly && (
                        <StatusChip
                          tone="neutral"
                          variant="outline"
                          className="text-xs"
                        >
                          已退出 · 只读
                        </StatusChip>
                      )}
                      {exam.state === "IN_PROGRESS" &&
                        exam.remainingAttempts > 0 && (
                          <ExamAttemptBadge
                            remaining={exam.remainingAttempts}
                          />
                        )}
                    </div>
                    <p className="text-sm text-slate-600">
                      {[
                        exam.courseName,
                        exam.classroomName,
                        examTypeLabel(exam.examType),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="text-sm text-slate-600">
                      <time
                        dateTime={exam.startsAt.toISOString()}
                        title={formatExamFullTime(exam.startsAt)}
                      >
                        {formatExamWindow(exam.startsAt, exam.dueAt, now)}
                      </time>
                      {duration > 0 && (
                        <span className="text-slate-500">
                          {" "}
                          · 限时 {duration} 分钟
                        </span>
                      )}
                    </p>
                    {operableStates.has(exam.state) && (
                      <StudentExamNotice
                        title={exam.title}
                        start={exam.startsAt.toISOString()}
                        end={exam.dueAt.toISOString()}
                        allowedAttempts={exam.allowedAttempts}
                        allowedSwitches={exam.allowedSwitches}
                        autoSubmitOnExit={exam.autoSubmitOnExit}
                      />
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-4 lg:flex-col lg:items-end lg:gap-2">
                    <div className="min-w-0 text-start lg:text-end">
                      {exam.score ? (
                        <>
                          <p className="text-2xl leading-none font-semibold text-slate-950 tabular-nums">
                            {formatScore(exam.score.score)}
                            <span className="text-sm font-normal text-slate-500">
                              {" "}
                              / {formatScore(exam.score.maxScore)}
                            </span>
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {exam.score.percentage === null
                              ? "百分制 —"
                              : `百分制 ${exam.score.percentage}%`}
                            {exam.latestAttemptNumber
                              ? ` · 第 ${exam.latestAttemptNumber} 次`
                              : ""}
                          </p>
                        </>
                      ) : exam.state === "AWAITING_SCORE" ? (
                        <p className="text-sm font-medium text-slate-700">
                          成绩待教师公布
                        </p>
                      ) : exam.state === "SPECIAL" ? (
                        <p className="text-sm font-medium text-slate-700">
                          以教师登记为准
                        </p>
                      ) : exam.attemptCount === 0 &&
                        exam.state === "CLOSED_NO_SUBMISSION" ? (
                        <p className="text-sm text-slate-600">无交卷记录</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!exam.readOnly && exam.state === "IN_PROGRESS" && (
                        <Link className={activityPrimaryClass} href={exam.href}>
                          {exam.hasInProgress ? "继续考试" : "进入考试"}
                        </Link>
                      )}
                      {!exam.readOnly &&
                        (exam.state === "RETAKEABLE" ||
                          exam.state === "SCORED_RETAKEABLE") && (
                          <Link
                            className={activityPrimaryClass}
                            href={exam.href}
                          >
                            {exam.hasInProgress
                              ? "继续考试"
                              : `再次作答（第 ${exam.attemptCount + 1} 次）`}
                          </Link>
                        )}
                      {(exam.state === "AWAITING_SCORE" ||
                        exam.state === "SCORED" ||
                        exam.state === "SPECIAL" ||
                        exam.state === "CLOSED_NO_SUBMISSION") && (
                        <Link className={activityActionClass} href={recordHref}>
                          查看考试记录
                        </Link>
                      )}
                    </div>
                  </div>
                </article>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          compact
          icon={ClipboardCheck}
          title={hasFilters ? "没有符合当前筛选的考试" : "还没有考试安排"}
          description={
            hasFilters
              ? "试试放宽状态，或切换教学班；也可以回到「我的课程」查看全部教学班。"
              : "教师发布考试后会出现在这里。可以先到「我的课程」确认自己已加入教学班。"
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {hasFilters && (
                <Link
                  className={activityActionClass}
                  href={activityHref("exams", { courseId: query.courseId })}
                >
                  清除筛选
                </Link>
              )}
              <Link className={activityActionClass} href="/student/courses">
                去我的课程
              </Link>
            </div>
          }
        />
      )}
      <StudentActivityPagination
        view="exams"
        query={query}
        pagination={result.pagination}
      />
    </section>
  );
}
