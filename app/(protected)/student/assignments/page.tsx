import {
  StudentActivityFilters,
  StudentActivityPagination,
} from "@/components/dashboard/student-activity-list";
import { activityHref } from "@/services/student-experience/activity-query";
import {
  readActivityPage,
  readActivityPageQuery,
} from "@/services/student-experience/activity-page";
import { loadActivityAssignments } from "@/services/student-experience/activity-service";
import { StudentCourseReturnLink } from "@/components/dashboard/student-course-return-link";
import { StudentBackLink } from "@/components/dashboard/student-back-link";
import { hundredPointScore } from "@/services/assignments/presentation";
import { StatusChip, type StatusChipTone } from "@/components/ui/status-chip";
import { StudentTaskScope } from "@/components/dashboard/student-task-scope";
import {
  studentTaskScopeSchema,
  studentTaskHref,
} from "@/services/student-experience/task-scope";
import { listStudentTaskClassrooms } from "@/services/courses/student-access";
import { StudentAssignmentTabs } from "@/components/assignments/student-assignment-tabs";
import { StudentSubmissionHistory } from "@/components/assignment-results/student-submission-history";
import { listStudentResults } from "@/services/dashboard/student-dashboard";
import { studentResultsQuerySchema } from "@/services/assignments/schemas";
import { studentAssignmentState } from "@/services/student-experience/task-policy";
import { Role } from "@prisma/client";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Lock,
  PencilLine,
  PlayCircle,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/dashboard/empty-state";

import { StudentPageHeader as PageHeader } from "@/components/dashboard/student-page-header";
import { requirePageRole } from "@/services/auth/page-authorization";

import { ResourceNotFoundError } from "@/services/auth/policy";
import { getStudentCourseContext } from "@/services/courses/student-access";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const assignmentState = studentAssignmentState;

const STATE_LABELS: Record<ReturnType<typeof assignmentState>, string> = {
  PENDING: "未开始",
  IN_PROGRESS: "进行中",
  SUBMITTED: "已提交",
  EXPIRED: "已截止",
};

type AssignmentState = ReturnType<typeof assignmentState>;

/**
 * 状态取色与图标集中在一处，保证列表 / 答题卡 / 反馈页三处对同一状态用同一种视觉。
 * 主色（brand）只表示「可继续操作」，其余状态一律走中性或语义色。
 */
const stateTone: Record<AssignmentState, StatusChipTone> = {
  PENDING: "brand",
  IN_PROGRESS: "brand",
  SUBMITTED: "neutral",
  EXPIRED: "neutral",
};

const stateIcon: Record<AssignmentState, typeof PlayCircle> = {
  PENDING: PlayCircle,
  IN_PROGRESS: PencilLine,
  SUBMITTED: CheckCircle2,
  EXPIRED: Lock,
};

const toneTile: Record<StatusChipTone, string> = {
  brand: "bg-brand-soft text-brand",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  neutral: "bg-muted text-ink-soft",
  ai: "bg-ai-soft text-ai",
};

/**
 * 截止倒计时只做「天 / 小时」两级，不做到秒：
 * 服务端渲染与客户端水合之间不会跳动，也不会制造焦虑感。
 */
function remainingLabel(dueAt: Date, now: Date): string | null {
  const diff = dueAt.getTime() - now.getTime();
  if (diff <= 0) return "已截止";
  const days = Math.floor(diff / 86_400_000);
  if (days >= 1) return `剩余 ${days} 天`;
  const hours = Math.floor(diff / 3_600_000);
  return hours >= 1 ? `剩余 ${hours} 小时` : "剩余不足 1 小时";
}

export default async function StudentAssignmentsPage({ searchParams }: Props) {
  const student = await requirePageRole(Role.STUDENT);
  const raw = await searchParams;
  const scopeResult = studentTaskScopeSchema.safeParse({
    ...raw,
    classroomId: raw.classroomId === "" ? undefined : raw.classroomId,
  });
  if (!scopeResult.success) notFound();
  const { courseId, classroomId } = scopeResult.data;
  let course: Awaited<ReturnType<typeof getStudentCourseContext>> | null = null;
  if (courseId) {
    try {
      course = await getStudentCourseContext(student.id, courseId);
    } catch (error) {
      if (error instanceof ResourceNotFoundError) notFound();
      throw error;
    }
  }
  const classrooms = await listStudentTaskClassrooms(student.id, course?.id);
  if (classroomId && !classrooms.some((item) => item.id === classroomId))
    notFound();
  if (raw.view === "records") {
    const parsedResults = studentResultsQuerySchema.safeParse({
      page:
        typeof raw.page === "string" && Number(raw.page) <= 100_000
          ? raw.page
          : undefined,
      pageSize: typeof raw.pageSize === "string" ? raw.pageSize : undefined,
    });
    const resultQuery = parsedResults.success
      ? parsedResults.data
      : studentResultsQuerySchema.parse({});
    const results = await listStudentResults(
      student.id,
      resultQuery,
      course?.id,
      classroomId,
    );
    return (
      <section className="space-y-4">
        <PageHeader
          title="我的作业"
          description="统一查看提交记录、批改进度与正式成绩；历史班级保留本人记录，未发布成绩不提前显示。"
          eyebrow={course?.name}
          actions={
            course && classroomId ? (
              <StudentCourseReturnLink
                courseId={course.id}
                classroomId={classroomId}
                tab="tasks"
              />
            ) : (
              <StudentBackLink href="/student/results?view=course">
                查看课程总评
              </StudentBackLink>
            )
          }
        />
        <StudentTaskScope
          classrooms={classrooms}
          courseId={course?.id}
          selectedId={classroomId}
          summary={`共 ${results.pagination.total} 条提交记录`}
        />
        <StudentAssignmentTabs
          view="records"
          courseId={course?.id}
          classroomId={classroomId}
        />
        <StudentSubmissionHistory
          query={resultQuery}
          results={results}
          courseId={course?.id}
          classroomId={classroomId}
        />
      </section>
    );
  }
  const now = new Date();
  const query = readActivityPageQuery("assignments", raw);
  const result = await readActivityPage(() =>
    loadActivityAssignments(student.id, query, now),
  );
  const { items: pageItems, pagination } = result;

  // 主视觉只放「还能继续做」的那一条；其余任务退成行，避免所有卡片等权重。
  const featured =
    pageItems.find(
      (assignment) => assignmentState(assignment, now) === "IN_PROGRESS",
    ) ??
    pageItems.find(
      (assignment) => assignmentState(assignment, now) === "PENDING",
    ) ??
    null;
  const listItems = featured
    ? pageItems.filter((assignment) => assignment.id !== featured.id)
    : pageItems;

  return (
    <section className="space-y-4">
      <PageHeader
        actions={
          course ? (
            <StudentCourseReturnLink
              courseId={course.id}
              classroomId={classroomId}
              tab="tasks"
            />
          ) : (
            <StudentBackLink href="/student/tasks">
              返回学习任务
            </StudentBackLink>
          )
        }
        description={
          course
            ? "查看当前课程的全部作业、提交记录与成绩，最新发布的作业排在前面。"
            : "查看各门课程的全部作业、提交记录与成绩。待处理任务集中在学习任务中。"
        }
        eyebrow={course?.name}
        title="我的作业"
      />

      <StudentActivityFilters
        view="assignments"
        query={query}
        classrooms={classrooms}
        total={pagination.total}
      />
      <StudentAssignmentTabs
        view="work"
        courseId={course?.id}
        classroomId={classroomId}
      />
      {pageItems.length === 0 ? (
        <EmptyState
          compact
          action={
            query.status === "ALL" ? null : (
              <Link
                className="text-sm font-medium underline"
                href={activityHref("assignments", { courseId, classroomId })}
              >
                查看全部作业
              </Link>
            )
          }
          description={
            query.status === "ALL"
              ? course && classroomId
                ? "本班暂无已发布且可访问的作业。"
                : "当前没有已发布且可访问的作业。"
              : "当前筛选状态下没有作业。"
          }
          icon={ClipboardList}
          title={course && classroomId ? "本班暂无作业" : "暂无作业"}
        />
      ) : (
        <div className="space-y-3">
          {featured
            ? (() => {
                const remaining = remainingLabel(featured.dueAt, now);
                return (
                  <Link
                    className="border-line bg-card focus-visible:outline-brand relative flex min-w-0 flex-wrap items-center gap-4 overflow-hidden rounded-2xl border py-4 pr-5 pl-6 shadow-[var(--shadow-card)] transition-colors hover:border-sky-200 focus-visible:outline-2 focus-visible:outline-offset-2 sm:py-5 sm:pr-6 sm:pl-7"
                    href={studentTaskHref(
                      `/student/assignments/${featured.id}`,
                      scopeResult.data,
                    )}
                    key={featured.id}
                  >
                    <span
                      aria-hidden="true"
                      className="bg-brand absolute inset-y-0 left-0 w-1"
                    />
                    <span className="bg-brand-soft flex size-11 shrink-0 items-center justify-center rounded-xl">
                      <PencilLine
                        aria-hidden="true"
                        className="text-brand size-5"
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-ink min-w-0 text-base font-semibold break-words">
                          {featured.title}
                        </h2>
                        <StatusChip tone="brand">
                          {STATE_LABELS[assignmentState(featured, now)]}
                        </StatusChip>
                        {featured.historyOnly ? (
                          <StatusChip tone="neutral">历史作业</StatusChip>
                        ) : null}
                      </div>
                      <p className="text-ink-soft mt-1.5 text-xs">
                        {featured.classroomName} · {featured.questionCount} 题 ·
                        原始满分 {featured.totalPoints} 分
                      </p>
                      <p className="text-ink-muted mt-1 text-xs">
                        截止 {featured.dueAt.toLocaleString("zh-CN")}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                      {remaining ? (
                        <span className="text-warn inline-flex items-center gap-1 text-xs font-medium">
                          <Clock3 aria-hidden="true" className="size-3.5" />
                          {remaining}
                        </span>
                      ) : null}
                      <span className="bg-brand inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-4 text-[13px] font-semibold text-white">
                        继续作答
                        <ArrowRight aria-hidden="true" className="size-4" />
                      </span>
                    </div>
                  </Link>
                );
              })()
            : null}

          <ul className="space-y-2.5">
            {listItems.map((assignment) => {
              const state = assignmentState(assignment, now);
              const status = assignment.latestSubmissionStatus;
              const chip: { tone: StatusChipTone; label: string } | null =
                status
                  ? status === "PUBLISHED"
                    ? {
                        tone: "ok",
                        label: (() => {
                          const percent = hundredPointScore(
                            assignment.latestPublishedScore ?? null,
                            assignment.totalPoints,
                          );
                          return percent === null
                            ? "成绩已发布"
                            : `成绩已发布 · ${percent} 分`;
                        })(),
                      }
                    : status === "GRADED"
                      ? { tone: "warn", label: "批改完成 · 待发布" }
                      : { tone: "warn", label: "已提交 · 待批改" }
                  : null;
              const Icon = stateIcon[state];
              return (
                <li key={assignment.id}>
                  <Link
                    className="border-line bg-card focus-visible:outline-brand flex min-w-0 items-center gap-3 rounded-xl border px-4 py-3.5 transition-colors hover:border-sky-200 hover:bg-sky-50/40 focus-visible:outline-2 focus-visible:outline-offset-2"
                    href={studentTaskHref(
                      state === "SUBMITTED" && assignment.latestSubmissionId
                        ? `/student/submissions/${assignment.latestSubmissionId}/result`
                        : `/student/assignments/${assignment.id}`,
                      scopeResult.data,
                    )}
                  >
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${toneTile[chip?.tone ?? stateTone[state]]}`}
                    >
                      <Icon aria-hidden="true" className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-ink text-[15px] font-semibold break-words">
                        {assignment.title}
                      </p>
                      <p className="text-ink-soft mt-1 text-xs">
                        {assignment.classroomName} · {assignment.questionCount}{" "}
                        题 · 原始满分 {assignment.totalPoints} 分 · 截止{" "}
                        {assignment.dueAt.toLocaleString("zh-CN")}
                      </p>
                      {assignment.historyOnly ? (
                        <p className="text-ink-muted mt-1 text-xs">
                          历史作业 · 仅可查看本人提交记录
                        </p>
                      ) : null}
                    </div>
                    <StatusChip tone={chip?.tone ?? stateTone[state]}>
                      {chip?.label ?? STATE_LABELS[state]}
                    </StatusChip>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <StudentActivityPagination
        view="assignments"
        query={query}
        pagination={pagination}
      />
    </section>
  );
}
