import { AssignmentResourceList } from "@/components/assignments/assignment-resource-list";
import { StudentAssignmentListBackLink } from "@/components/assignments/student-assignment-list-back-link";
import { StudentBackLink } from "@/components/dashboard/student-back-link";
import { StudentRevokedAssignment } from "@/components/assignments/student-revoked-assignment";
import { AssignmentRevokedError } from "@/services/assignments/errors";
import { examTypeLabel } from "@/services/exams/exam-types";
import {
  studentTaskScopeSchema,
  studentTaskHref,
} from "@/services/student-experience/task-scope";
import {
  assignmentTaskReturn,
  examListReturn,
  withAssignmentTaskReturn,
} from "@/services/student-experience/activity-query";
import { assertAssignmentTaskScope } from "@/services/student-experience/task-scope-access";
import { listAssignmentResourceFiles } from "@/services/assignments/resources";
import { Role, SubmissionStatus } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StartAttemptButton } from "@/components/assignments/start-attempt-button";
import { ExamAttemptBadge } from "@/components/exams/exam-attempt-badge";
import { StatusChip, type StatusChipTone } from "@/components/ui/status-chip";
import { hundredPointScore } from "@/services/assignments/presentation";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { getStudentAssignment } from "@/services/assignments/service";

/** 与「提交记录与成绩」表格共用同一套状态用词，避免同一种状态两处两种叫法。 */
const ATTEMPT_STATUS: Record<
  SubmissionStatus,
  { label: string; tone: StatusChipTone }
> = {
  IN_PROGRESS: { label: "作答中", tone: "brand" },
  SUBMITTED: { label: "已提交", tone: "neutral" },
  PENDING_REVIEW: { label: "待批改", tone: "warn" },
  GRADED: { label: "待发布", tone: "warn" },
  PUBLISHED: { label: "成绩已发布", tone: "ok" },
  WITHDRAWN: { label: "已撤回", tone: "neutral" },
};

const submittedAtFormat = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Shanghai",
});

interface Props {
  params: Promise<{ assignmentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
export default async function StudentAssignmentPage({
  params,
  searchParams,
}: Props) {
  const student = await requirePageRole(Role.STUDENT);
  const query = await searchParams;
  const scope = studentTaskScopeSchema.safeParse(query);
  if (!scope.success) notFound();
  try {
    const assignment = await getStudentAssignment(
      student.id,
      (await params).assignmentId,
    );
    await assertAssignmentTaskScope(assignment.id, scope.data);
    const resourceFiles = await listAssignmentResourceFiles(
      student,
      assignment.id,
    );
    const inProgress = assignment.attempts.find(
      (item) => item.status === SubmissionStatus.IN_PROGRESS,
    );
    const submitted = assignment.attempts.filter(
      (item) => item.status !== SubmissionStatus.IN_PROGRESS,
    );
    const canStart = assignment.canWrite;
    // 考试靠 examSessionId 挂在 Assignment 上：待开始的考试没有提交记录，
    // 这时「提交历史与成绩」只会是一张空卡，应该换成考试信息。
    const exam = assignment.exam;
    const returnTo = exam
      ? undefined
      : assignmentTaskReturn(query.returnTo, scope.data);
    const answerHref = inProgress
      ? withAssignmentTaskReturn(
          studentTaskHref(
            `/student/submissions/${inProgress.id}/answer`,
            scope.data,
          ),
          returnTo,
        )
      : null;
    const hasAttempts = submitted.length > 0 || Boolean(inProgress);
    return (
      <section className="space-y-6">
        <div>
          {returnTo ? (
            <StudentBackLink href={returnTo}>返回学习任务</StudentBackLink>
          ) : exam ? (
            <StudentBackLink
              href={examListReturn(query.returnTo, {
                ...scope.data,
                focus: assignment.id,
              })}
            >
              返回考试列表
            </StudentBackLink>
          ) : (
            <StudentAssignmentListBackLink scope={scope.data} />
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="text-ink text-2xl font-semibold break-words">
              {assignment.title}
            </h1>
            {exam ? (
              <>
                <StatusChip tone="brand">{examTypeLabel(exam.type)}</StatusChip>
                <ExamAttemptBadge remaining={exam.remainingAttempts} />
              </>
            ) : null}
          </div>
          <p className="text-ink-body mt-2">
            {assignment.description || (exam ? "暂无考试说明" : "暂无作业说明")}
          </p>
          <p className="text-ink-soft mt-2 text-sm">
            {assignment.classroomName} · {assignment.questions.length} 题 ·{" "}
            百分制展示 · 原始满分 {assignment.totalPoints} 分
          </p>
          {exam ? (
            <p className="text-ink-soft mt-1 text-sm">
              考试时间：{exam.startsAt.toLocaleString("zh-CN")} 至{" "}
              {exam.endsAt.toLocaleString("zh-CN")}
            </p>
          ) : (
            <p className="text-ink-soft mt-1 text-sm">
              截止：
              {assignment.effectiveDueAt?.toLocaleString("zh-CN") ?? "未设置"}
            </p>
          )}
        </div>
        <AssignmentResourceList
          assignmentId={assignment.id}
          files={resourceFiles}
        />
        <div className="flex flex-wrap items-center gap-3">
          {answerHref ? (
            <Link
              className="bg-brand hover:bg-brand-strong inline-flex min-h-11 items-center rounded-lg border border-sky-700 px-4 text-sm font-medium text-white"
              href={answerHref}
            >
              {assignment.canWrite ? "继续作答" : "查看已保存作答"}
            </Link>
          ) : canStart ? (
            <StartAttemptButton
              assignmentId={assignment.id}
              scope={scope.data}
              returnTo={returnTo}
              exam={exam ?? undefined}
              label={exam ? "开始考试" : undefined}
            />
          ) : null}
          {!assignment.canWrite && assignment.writeBlockedReason ? (
            <p className="bg-muted text-ink-soft inline-flex min-h-11 items-center rounded-lg px-4 text-sm">
              {assignment.writeBlockedReason}
            </p>
          ) : null}
        </div>
        {exam ? (
          <section className="border-line bg-card rounded-xl border p-5">
            <h2 className="text-ink text-[15px] font-semibold">考试信息</h2>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-ink-soft text-xs">考试时间</dt>
                <dd className="text-ink-body mt-0.5 tabular-nums">
                  {exam.startsAt.toLocaleString("zh-CN")} 至{" "}
                  {exam.endsAt.toLocaleString("zh-CN")}
                </dd>
              </div>
              <div>
                <dt className="text-ink-soft text-xs">允许切屏</dt>
                <dd className="text-ink-body mt-0.5">
                  {exam.allowedSwitches} 次，超出后自动交卷
                </dd>
                <dd className="text-ink-soft mt-1 text-xs leading-5">
                  切换标签页、最小化浏览器或让考试窗口持续失焦，都会计入。
                </dd>
              </div>
              <div>
                <dt className="text-ink-soft text-xs">考试机会</dt>
                <dd className="text-ink-body mt-0.5">
                  共 {exam.allowedAttempts} 次
                </dd>
              </div>
              <div>
                <dt className="text-ink-soft text-xs">考试期间退出</dt>
                <dd className="text-ink-body mt-0.5">
                  {exam.autoSubmitOnExit
                    ? "自动交卷并计 1 次"
                    : "保留作答，可继续考试"}
                </dd>
              </div>
            </dl>
            {exam.cancelledAt ? (
              <p className="text-warn mt-3 text-sm">
                本场考试已取消，无法作答。
              </p>
            ) : (
              <p className="text-ink-soft mt-3 text-xs leading-5">
                开考后从本页进入作答；交卷后的答卷与成绩在「我的考试」中查看。
              </p>
            )}
            <Link
              className="text-brand-strong mt-1 inline-flex min-h-11 items-center text-xs font-medium hover:underline"
              href={studentTaskHref("/student/exams", scope.data)}
            >
              打开我的考试 ↗
            </Link>
          </section>
        ) : null}
        {!exam || hasAttempts ? (
          <section className="border-line bg-card rounded-xl border p-5">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-ink text-[15px] font-semibold">
                提交历史与成绩
              </h2>
              {/* 考试的全部记录在「我的考试」里，考试信息卡上方已给入口，这里不再重复。 */}
              {exam ? null : (
                <Link
                  className="text-brand-strong inline-flex min-h-11 items-center rounded-md px-1 text-xs font-medium hover:underline"
                  href={studentTaskHref(
                    "/student/assignments?view=records",
                    scope.data,
                  )}
                >
                  查看全部记录 ↗
                </Link>
              )}
            </header>
            {submitted.length === 0 && !inProgress ? (
              <p className="text-ink-soft mt-3 text-sm">
                还没有提交记录，提交后可在这里查看每一次的成绩。
              </p>
            ) : (
              <ul className="divide-line mt-2 divide-y">
                {inProgress && answerHref ? (
                  <li>
                    <Link
                      className="hover:bg-muted focus-visible:outline-brand -mx-2 flex min-h-11 items-center gap-3 rounded-lg px-2 focus-visible:outline-2 focus-visible:outline-offset-2"
                      href={answerHref}
                    >
                      <span className="text-ink w-14 shrink-0 text-xs font-medium tabular-nums">
                        第 {inProgress.attemptNumber} 次
                      </span>
                      <span className="text-ink-soft min-w-0 flex-1 text-xs">
                        {assignment.canWrite
                          ? "作答中，未提交"
                          : "未提交，可查看已保存的作答"}
                      </span>
                      <StatusChip
                        tone={assignment.canWrite ? "brand" : "neutral"}
                      >
                        {assignment.canWrite ? "作答中" : "未提交草稿"}
                      </StatusChip>
                      <span className="text-ink-muted w-14 shrink-0 text-right text-xs">
                        —
                      </span>
                    </Link>
                  </li>
                ) : null}
                {submitted.map((attempt) => {
                  const percent =
                    attempt.status === SubmissionStatus.PUBLISHED
                      ? hundredPointScore(
                          attempt.score?.toNumber() ?? null,
                          attempt.maxScore?.toNumber() ?? null,
                        )
                      : null;
                  const presentation = ATTEMPT_STATUS[attempt.status];
                  return (
                    <li key={attempt.id}>
                      <Link
                        className="hover:bg-muted focus-visible:outline-brand -mx-2 flex min-h-11 items-center gap-3 rounded-lg px-2 focus-visible:outline-2 focus-visible:outline-offset-2"
                        href={studentTaskHref(
                          `/student/submissions/${attempt.id}/result`,
                          scope.data,
                        )}
                      >
                        <span className="text-ink w-14 shrink-0 text-xs font-medium tabular-nums">
                          第 {attempt.attemptNumber} 次
                        </span>
                        <span className="text-ink-soft min-w-0 flex-1 text-xs tabular-nums">
                          {attempt.submittedAt
                            ? submittedAtFormat.format(attempt.submittedAt)
                            : "—"}
                        </span>
                        <StatusChip tone={presentation.tone}>
                          {presentation.label}
                        </StatusChip>
                        <span
                          className={
                            percent === null
                              ? "text-ink-muted w-14 shrink-0 text-right text-xs tabular-nums"
                              : "text-ink w-14 shrink-0 text-right text-xs font-medium tabular-nums"
                          }
                        >
                          {percent === null ? "—" : `${percent} 分`}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : null}
        <section className="border-line bg-card rounded-xl border p-5">
          <h2 className="text-ink text-[15px] font-semibold">题目概览</h2>
          <ol className="mt-3 space-y-2">
            {assignment.questions.map((question) => (
              <li
                className="flex justify-between gap-4 text-sm"
                key={question.id}
              >
                <span className="text-ink-body min-w-0">
                  {question.sortOrder}. {question.title}
                </span>
                <span className="text-ink-soft shrink-0 tabular-nums">
                  {question.points} 分
                </span>
              </li>
            ))}
          </ol>
        </section>
      </section>
    );
  } catch (error: unknown) {
    if (error instanceof AssignmentRevokedError)
      return (
        <StudentRevokedAssignment
          backHref={studentTaskHref("/student/assignments", scope.data)}
        />
      );
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
