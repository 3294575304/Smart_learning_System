"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { PageIndex } from "@/components/dashboard/page-index";
import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";
import type { getStudentExamReport } from "@/services/exams/student-report";
import {
  examReportHref,
  examReviewAnchor,
  examReviewPage,
  examReviewStatuses,
  readExamReviewQuery,
  type ExamReviewQuery,
} from "@/services/exams/student-report-review";
import {
  studentTaskHref,
  type StudentTaskScope,
} from "@/services/student-experience/task-scope";
import { examActionClass, examPanelClass } from "./student-exam-detail";
import { StatusChip } from "@/components/ui/status-chip";

type Report = Pick<
  Awaited<ReturnType<typeof getStudentExamReport>>,
  "examId" | "wrong" | "pendingQuestions" | "publishedSubmissionId"
>;
const controlClass =
  "border-input bg-background mt-1.5 min-h-11 w-full rounded-lg border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700";

export function StudentFullExamAnswerLink({
  examId,
  submissionId,
  scope,
  examList,
}: {
  examId: string;
  submissionId: string;
  scope: StudentTaskScope;
  examList: string;
}) {
  const searchParams = useSearchParams();
  const reportReturn =
    examReportHref(
      examId,
      scope,
      examList,
      readExamReviewQuery(Object.fromEntries(searchParams)),
    ) + "&tab=wrong";
  return (
    <Link
      className={examActionClass}
      href={studentTaskHref(
        `/student/submissions/${submissionId}/result?${new URLSearchParams({ source: "exam", reportReturn })}`,
        scope,
      )}
    >
      查看完整答卷与反馈
    </Link>
  );
}

export function StudentExamReviewList({
  report,
  scope,
  examList,
  paperLink,
}: {
  report: Report;
  scope: StudentTaskScope;
  examList: string;
  /** 「回看整卷」入口，放在错题回顾的标题行，避免成为页头的孤立按钮。 */
  paperLink?: ReactNode;
}) {
  const searchParams = useSearchParams();
  const query = readExamReviewQuery(Object.fromEntries(searchParams));
  const { examId, wrong, pendingQuestions, publishedSubmissionId } = report;
  const { items, pagination } = examReviewPage(wrong, query);
  const hasFilters = Boolean(
    query.questionType || query.reviewStatus || query.questionNumber,
  );
  const types = new Set(wrong.map(({ type }) => type));
  if (query.questionType) types.add(query.questionType);
  const reportHref = (filters?: ExamReviewQuery) =>
    examReportHref(examId, scope, examList, filters) +
    "&tab=wrong" +
    examReviewAnchor;
  const reportReturn = reportHref({ ...query, reviewPage: pagination.page });
  function apply(values: Record<string, unknown>) {
    const next = reportHref(readExamReviewQuery(values));
    if (
      next !==
      window.location.pathname + window.location.search + window.location.hash
    )
      window.history.pushState(null, "", next);
  }
  return (
    <section
      id={examReviewAnchor.slice(1)}
      aria-labelledby="exam-wrong-questions-heading"
      className={`scroll-mt-24 space-y-4 ${examPanelClass}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="exam-wrong-questions-heading"
            className="text-lg font-semibold"
          >
            本次错题
          </h2>
          {publishedSubmissionId && (
            <p className="text-muted-foreground mt-1 text-sm">
              {wrong.length} 道已判定失分题
              {pendingQuestions > 0 && ` · ${pendingQuestions} 道暂无判分明细`}
            </p>
          )}
        </div>
        {paperLink && <div className="shrink-0">{paperLink}</div>}
      </div>
      {wrong.length > 0 && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const number = new FormData(event.currentTarget).get(
              "questionNumber",
            );
            apply(
              number
                ? { questionNumber: number }
                : {
                    ...query,
                    questionNumber: undefined,
                    reviewPage: undefined,
                  },
            );
          }}
          method="get"
          action={`/student/exams/${examId}/report${examReviewAnchor}`}
          className="bg-muted/40 grid items-end gap-3 rounded-lg p-3 sm:grid-cols-3 xl:grid-cols-[repeat(3,minmax(0,1fr))_auto]"
          aria-label="筛选错题"
        >
          <input type="hidden" name="returnTo" value={examList} />
          {scope.courseId && (
            <input type="hidden" name="courseId" value={scope.courseId} />
          )}
          {scope.classroomId && (
            <input type="hidden" name="classroomId" value={scope.classroomId} />
          )}
          <label className="min-w-0 text-sm font-medium">
            题型
            <select
              name="questionType"
              value={query.questionType ?? ""}
              onChange={(event) =>
                apply({
                  questionType: event.target.value,
                  reviewStatus: query.reviewStatus,
                })
              }
              className={controlClass}
            >
              <option value="">全部题型</option>
              {[...types].map((type) => (
                <option key={type} value={type}>
                  {QUESTION_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-sm font-medium">
            失分状态
            <select
              name="reviewStatus"
              value={query.reviewStatus ?? ""}
              onChange={(event) =>
                apply({
                  questionType: query.questionType,
                  reviewStatus: event.target.value,
                })
              }
              className={controlClass}
            >
              <option value="">全部状态</option>
              {Object.entries(examReviewStatuses).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-sm font-medium">
            原卷题号
            <input
              type="text"
              inputMode="numeric"
              name="questionNumber"
              pattern="[1-9][0-9]{0,5}"
              maxLength={6}
              placeholder="例如 12"
              key={`${query.questionType ?? ""}:${query.reviewStatus ?? ""}:${query.questionNumber ?? ""}`}
              defaultValue={query.questionNumber}
              className={controlClass}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-3 xl:col-span-1">
            <button
              type="submit"
              className={`${examActionClass} justify-center`}
            >
              应用筛选
            </button>
            {hasFilters && (
              <Link
                href={reportHref()}
                className={examActionClass}
                onClick={(event) => {
                  if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  event.preventDefault();
                  apply({});
                }}
              >
                清除筛选
              </Link>
            )}
          </div>
        </form>
      )}
      {hasFilters && wrong.length > 0 && (
        <p role="status" className="text-muted-foreground text-sm">
          筛选结果 {pagination.total} 道
        </p>
      )}
      {items.length > 0 ? (
        <ol className="divide-border divide-y">
          {items.map((item) => (
            <li
              key={item.number}
              className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium [overflow-wrap:anywhere]">
                  第 {item.number} 题 · {item.title}
                </p>
                <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-sm">
                  <span>
                    {QUESTION_TYPE_LABELS[item.type]} ·{" "}
                    {examReviewStatuses[item.status]}
                  </span>
                  {item.hasFeedback && (
                    <StatusChip tone="ai" variant="outline">
                      有教师反馈
                    </StatusChip>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
                <p className="text-sm tabular-nums">
                  <span className="font-medium">
                    {item.score} / {item.maxScore} 分
                  </span>
                  <span className="text-muted-foreground ms-2">
                    失 {item.lostPoints} 分
                  </span>
                </p>
                <Link
                  href={studentTaskHref(
                    `/student/submissions/${item.submissionId}/result?${new URLSearchParams({ source: "exam", reportReturn, question: String(item.number) })}`,
                    scope,
                  )}
                  className={examActionClass}
                  aria-label={`查看第 ${item.number} 题解析`}
                >
                  查看解析
                </Link>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-muted-foreground bg-muted/40 rounded-lg px-3 py-4 text-sm">
          {wrong.length > 0
            ? "没有符合筛选条件的错题，可以调整条件或清除筛选。"
            : !publishedSubmissionId
              ? "这次成绩暂无可查看的在线答卷明细。"
              : pendingQuestions > 0
                ? "已有判分明细的题目中暂无失分题。"
                : "本次考试没有失分题。"}
        </p>
      )}
      <PageIndex
        {...pagination}
        ariaLabel="错题分页"
        hrefForPage={(reviewPage) => reportHref({ ...query, reviewPage })}
      />
      <div className="border-border flex flex-wrap gap-2 border-t pt-4">
        <Link
          className={examActionClass}
          href={studentTaskHref("/student/wrong-questions", scope)}
        >
          打开错题本
        </Link>
        <Link
          className={examActionClass}
          href={studentTaskHref("/student/recommendations", scope)}
        >
          推荐同类练习
        </Link>
        <Link
          className={examActionClass}
          href={studentTaskHref("/student/analytics", scope)}
        >
          查看学习分析
        </Link>
      </div>
    </section>
  );
}
