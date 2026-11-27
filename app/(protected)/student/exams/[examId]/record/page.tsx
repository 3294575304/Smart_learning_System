import { studentAnalysisReturnFromHref } from "@/services/student-experience/analysis-navigation";
import { examReportHref } from "@/services/exams/student-report-review";
import Link from "next/link";
import { Role } from "@prisma/client";
import { requirePageRole } from "@/services/auth/page-authorization";
import { getStudentExamRecord } from "@/services/exams/student-record";
import { readActivityPage } from "@/services/student-experience/activity-page";
import { examListReturn } from "@/services/student-experience/activity-query";
import { studentTaskHref } from "@/services/student-experience/task-scope";
import {
  StudentExamDetailHeader,
  examPanelClass,
  examActionClass,
  examTime,
  readStudentExamDetailQuery,
  type StudentExamDetailProps,
} from "@/components/exams/student-exam-detail";
import { StatusChip } from "@/components/ui/status-chip";
import { formatScore } from "@/services/exams/exam-state";

const receipt = {
  MANUAL: "主动交卷",
  TIME_UP: "到时自动收卷",
  SWITCH_LIMIT: "切屏超限自动交卷",
  PAGE_EXIT: "离开考试页自动交卷",
} as const;

const attemptStatusLabels = {
  IN_PROGRESS: "作答中",
  SUBMITTED: "已提交",
  PENDING_REVIEW: "待批改",
  GRADED: "已批改 · 待公布",
  PUBLISHED: "已公布",
} as const;

const scoreNumber = (value: { toNumber(): number } | null) =>
  value === null ? null : value.toNumber();

export default async function StudentExamRecordPage({
  params,
  searchParams,
}: StudentExamDetailProps) {
  const student = await requirePageRole(Role.STUDENT);
  const [{ examId }, query] = await Promise.all([
    params,
    readStudentExamDetailQuery(searchParams),
  ]);
  const record = await readActivityPage(() =>
    getStudentExamRecord(student.id, examId, query.scope),
  );
  const { exam } = record;
  const scopeValue = {
    courseId: exam.courseId,
    classroomId: record.classroomId,
  };
  const back = examListReturn(query.returnTo, {
    ...scopeValue,
    focus: record.id,
  });
  const now = new Date();
  const closed = record.dueAt <= now;
  const attempts = record.attempts;
  const latestId = record.submission?.id ?? null;
  const special = record.specialStatusLabel;
  const canContinue =
    !record.readOnly && !closed && record.remainingAttempts > 0;

  return (
    <section className="space-y-5">
      <StudentExamDetailHeader
        record={record}
        back={back}
        analysisReturn={studentAnalysisReturnFromHref(back)}
      />
      {record.readOnly && (
        <div className="text-warn bg-warn-soft rounded-xl border border-amber-200 px-4 py-3 text-sm">
          <p className="font-medium">该教学班的学习记录为只读</p>
          <p className="mt-1">
            你已退出「{record.classroom.name}」
            {record.membershipEndedAt
              ? `（${examTime.format(record.membershipEndedAt)} 退出）`
              : ""}
            ，以下记录仅可查看，不能继续作答。
          </p>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className={examPanelClass}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">交卷记录</h2>
            <p className="text-sm text-slate-600">
              {attempts.length ? `共 ${attempts.length} 次作答` : "暂无作答"}
            </p>
          </div>
          {attempts.length ? (
            <ol className="divide-border mt-3 divide-y">
              {attempts.map((attempt) => {
                const isLatest = attempt.id === latestId;
                const score = scoreNumber(attempt.score);
                const maxScore = scoreNumber(attempt.maxScore);
                return (
                  <li
                    key={attempt.id}
                    className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        第 {attempt.attemptNumber} 次
                        {isLatest && <StatusChip tone="brand">计分</StatusChip>}
                        <StatusChip
                          tone={
                            attempt.status === "IN_PROGRESS"
                              ? "warn"
                              : attempt.status === "PUBLISHED"
                                ? "ok"
                                : "neutral"
                          }
                          variant={
                            attempt.status === "IN_PROGRESS"
                              ? "soft"
                              : "outline"
                          }
                        >
                          {attemptStatusLabels[
                            attempt.status as keyof typeof attemptStatusLabels
                          ] ?? "已提交"}
                        </StatusChip>
                        {attempt.feedbackCount > 0 && (
                          <StatusChip tone="ai" variant="outline">
                            教师反馈 {attempt.feedbackCount}
                          </StatusChip>
                        )}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {attempt.examSubmissionReason
                          ? receipt[attempt.examSubmissionReason]
                          : attempt.status === "IN_PROGRESS"
                            ? "尚未交卷"
                            : "交卷方式未记录"}
                        {" · "}
                        {attempt.submittedAt
                          ? examTime.format(attempt.submittedAt)
                          : attempt.lastSavedAt
                            ? `最近保存 ${examTime.format(attempt.lastSavedAt)}`
                            : "时间未记录"}
                        {` · ${attempt.submittedAt ? "用时" : "已用"}${
                          attempt.elapsedMinutes > 0
                            ? ` ${attempt.elapsedMinutes} 分钟`
                            : "不到 1 分钟"
                        }`}
                        {attempt.switchCount > 0 &&
                          ` · 切屏 ${attempt.switchCount} 次（上限 ${record.exam.allowedSwitches}）`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {score !== null && maxScore !== null ? (
                        <p className="text-sm font-medium text-slate-900 tabular-nums">
                          {formatScore(score)} / {formatScore(maxScore)}
                        </p>
                      ) : null}
                      {attempt.status !== "IN_PROGRESS" && (
                        <Link
                          className={examActionClass}
                          href={studentTaskHref(
                            `/student/submissions/${attempt.id}/result?${new URLSearchParams({ source: "exam", returnTo: back })}`,
                            scopeValue,
                          )}
                        >
                          查看答卷
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-muted-foreground mt-3 text-sm leading-6">
              {closed
                ? "本场考试没有你的交卷记录。成绩状态以教师登记为准。"
                : "你还没有交卷，截止前仍可继续作答。"}
            </p>
          )}
          {canContinue && (
            <div className="mt-4">
              <Link
                className={examActionClass}
                href={studentTaskHref(
                  `/student/assignments/${record.id}`,
                  scopeValue,
                )}
              >
                {record.hasInProgress
                  ? "继续作答"
                  : `继续作答（剩 ${record.remainingAttempts} 次）`}
              </Link>
            </div>
          )}
        </section>
        <section className={examPanelClass}>
          <h2 className="text-lg font-semibold">成绩与答卷</h2>
          {record.scoreView ? (
            <>
              <p className="bg-muted/50 mt-3 inline-flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg px-3 py-2">
                <span className="text-sm text-slate-600">得分</span>
                <span className="text-xl leading-none font-semibold text-slate-950 tabular-nums">
                  {formatScore(record.scoreView.score)}
                </span>
                <span className="text-sm text-slate-500">
                  / {formatScore(record.scoreView.maxScore)}
                </span>
                {record.scoreView.percentage !== null && (
                  <span className="text-xs text-slate-600">
                    · 百分制 {record.scoreView.percentage}%
                  </span>
                )}
              </p>
              <p className="mt-2 text-xs text-slate-600">
                判分明细、错题解析与知识点对比在「考试报告」里。
              </p>
              {attempts.length > 1 &&
                record.scoreView.attemptNumber !== null && (
                  <p className="mt-1 text-xs text-slate-600">
                    本次成绩按最新一次作答（第 {record.scoreView.attemptNumber}{" "}
                    次）计算。
                  </p>
                )}
            </>
          ) : special ? (
            <p className="mt-3 text-sm leading-6 text-slate-700">
              本场登记为「{special.replace(/（教师已登记）$/, "")}
              」，无答卷与分数。 如需复核，请联系任课教师。
            </p>
          ) : record.submission ? (
            <>
              <p className="text-muted-foreground mt-3 text-sm leading-6">
                答卷已提交，等待教师公布成绩。公布后可查看判分、解析与教师反馈。
              </p>
              {record.scorePublishAt && (
                <p className="mt-2 text-sm text-slate-700">
                  预计 {examTime.format(record.scorePublishAt)} 公布。
                </p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground mt-3 text-sm leading-6">
              尚无已提交的答卷。
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {record.canViewReport && (
              <Link
                className={examActionClass}
                href={examReportHref(exam.id, scopeValue, back)}
              >
                查看成绩与答卷
              </Link>
            )}
            {record.submission &&
              (!record.canViewReport ||
                record.submission.status !== "PUBLISHED") && (
                <Link
                  className={examActionClass}
                  href={studentTaskHref(
                    `/student/submissions/${record.submission.id}/result?${new URLSearchParams({ source: "exam", returnTo: back })}`,
                    scopeValue,
                  )}
                >
                  {record.submission.status === "PUBLISHED"
                    ? "查看答卷与反馈"
                    : "查看交卷回执"}
                </Link>
              )}
          </div>
        </section>
      </div>
    </section>
  );
}
