import { studentAnalysisReturnFromHref } from "@/services/student-experience/analysis-navigation";
import {
  StudentExamDetailHeader,
  examActionClass,
  examPanelClass,
  readStudentExamDetailQuery,
  type StudentExamDetailProps,
} from "@/components/exams/student-exam-detail";
import Link from "next/link";
import { StudentExamReportTabs } from "@/components/exams/student-exam-report-tabs";
import { getStudentExamRecord } from "@/services/exams/student-record";
import { readActivityPage } from "@/services/student-experience/activity-page";
import { examListReturn } from "@/services/student-experience/activity-query";
import { studentTaskHref } from "@/services/student-experience/task-scope";

import { Role } from "@prisma/client";
import { requirePageRole } from "@/services/auth/page-authorization";

import { AssignmentOperationError } from "@/services/assignments/errors";
import { getStudentExamReport } from "@/services/exams/student-report";
import { listPublishedExamScores } from "@/services/course-analytics/exam-scores";
import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";
import { StatusChip } from "@/components/ui/status-chip";
import {
  StudentExamReviewList,
  StudentFullExamAnswerLink,
} from "@/components/exams/student-exam-review-list";

const show = (value: number | null) =>
  value === null ? "—" : `${value.toFixed(1)}%`;

const paperStatus = {
  CORRECT: { label: "得分", tone: "ok" },
  INCORRECT: { label: "答错", tone: "bad" },
  PARTIAL: { label: "部分得分", tone: "warn" },
  UNANSWERED: { label: "未作答", tone: "neutral" },
  PENDING: { label: "待批改", tone: "neutral" },
} as const;

export default async function StudentExamReportPage({
  params,
  searchParams,
}: StudentExamDetailProps) {
  const student = await requirePageRole(Role.STUDENT);
  const raw = await searchParams;
  const [{ examId }, query] = await Promise.all([
    params,
    readStudentExamDetailQuery(Promise.resolve(raw)),
  ]);
  const record = await readActivityPage(() =>
    getStudentExamRecord(student.id, examId, query.scope),
  );
  const scope = {
    courseId: record.exam.courseId,
    classroomId: record.classroomId,
  };
  const back = examListReturn(query.returnTo, { ...scope, focus: record.id });
  const recordHref = studentTaskHref(
    `/student/exams/${examId}/record?${new URLSearchParams({ returnTo: back })}`,
    scope,
  );

  /** 切换报告视图时保留 returnTo / 作用域 / 错题筛选，只改 tab。 */
  const tabHref = (tab: "paper") => {
    const paramsToKeep = new URLSearchParams();
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value !== "string" || key === "tab") continue;
      paramsToKeep.set(key, value);
    }
    paramsToKeep.set("tab", tab);
    return `/student/exams/${examId}/report?${paramsToKeep}`;
  };

  const header = (
    <StudentExamDetailHeader
      record={record}
      back={recordHref}
      backLabel="返回考试记录"
      analysisReturn={studentAnalysisReturnFromHref(back)}
    />
  );
  let report;
  try {
    report = await readActivityPage(() =>
      getStudentExamReport(student.id, examId, scope.classroomId),
    );
  } catch (error) {
    if (!(error instanceof AssignmentOperationError)) throw error;
    const ended = record.exam.endsAt <= new Date();
    const submitted =
      record.submission && record.submission.status !== "IN_PROGRESS";
    return (
      <section className="space-y-5">
        {header}
        <section className={examPanelClass}>
          <h2 className="text-lg font-semibold">
            {!ended
              ? "考试尚未结束"
              : submitted
                ? "成绩待公布"
                : "暂无个人考试报告"}
          </h2>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            {!ended
              ? "考试结束并公布成绩后，可在此查看个人报告。"
              : submitted
                ? "交卷记录已保留。教师公布成绩后，这里将显示得分、知识点表现和本次错题。"
                : "当前没有可展示的个人成绩。可在考试记录中核对交卷情况。"}
          </p>
        </section>
      </section>
    );
  }

  // 只读（已退课）学生不再展示班级聚合信息，结论句也不能透露班均差。
  const gap =
    !record.readOnly &&
    report.classAverage !== null &&
    report.percentage !== null
      ? Math.round((report.percentage - report.classAverage) * 10) / 10
      : null;
  const weakest = report.concepts
    .filter((item) => item.ownRate !== null && item.ownRate < 100)
    .sort((left, right) => (left.ownRate ?? 0) - (right.ownRate ?? 0))
    .slice(0, 2)
    .map((item) => item.name);
  const conclusion = [
    report.percentage === null
      ? "本次成绩已发布"
      : `本次百分制 ${report.percentage}%`,
    gap === null ? "" : `，比班均${gap >= 0 ? "高" : "低"} ${Math.abs(gap)} 分`,
    weakest.length
      ? `；本场得分率较低的知识点为「${weakest.join("」「")}」。`
      : "。",
  ].join("");

  // 本班历次考试走势：只读学生不看班级聚合，但仍可看自己的历史。
  const trendRows = await listPublishedExamScores(
    [scope.classroomId],
    student.id,
  ).catch(() => []);
  const trend = [...trendRows]
    .sort(
      (left, right) => left.publishedAt.getTime() - right.publishedAt.getTime(),
    )
    .flatMap((row) =>
      row.assignmentId &&
      row.status === "SCORED" &&
      row.score !== null &&
      row.maxScore > 0
        ? [
            {
              id: row.assignmentId,
              title: row.title,
              percentage: Math.round((row.score / row.maxScore) * 1000) / 10,
              current: row.assignmentId === record.id,
            },
          ]
        : [],
    )
    .slice(-6);

  const questionHref = (number: number) =>
    studentTaskHref(
      `/student/submissions/${report.publishedSubmissionId}/result?${new URLSearchParams(
        {
          source: "exam",
          reportReturn: tabHref("paper"),
          question: String(number),
        },
      )}`,
      scope,
    );

  return (
    <section className="space-y-5">
      {header}
      {record.readOnly && (
        <p className="text-warn bg-warn-soft rounded-xl border border-amber-200 px-4 py-3 text-sm">
          你已退出「{record.classroom.name}
          」，这份报告仅保留你的个人成绩与答卷； 班级均分与位次不再展示。
        </p>
      )}
      <section
        className={`grid gap-3 ${record.readOnly ? "" : "sm:grid-cols-3"}`}
      >
        <div className={examPanelClass}>
          <p className="text-sm text-slate-600">我的成绩</p>
          <p className="mt-2 text-3xl font-semibold">
            {report.score} / {report.maxScore}
          </p>
          <p className="text-sm">百分制 {show(report.percentage)}</p>
        </div>
        {!record.readOnly && (
          <>
            <div className={examPanelClass}>
              <p className="text-sm text-slate-600">班级均分</p>
              <p className="mt-2 text-3xl font-semibold">
                {report.classAverage === null
                  ? "样本不足"
                  : show(report.classAverage)}
              </p>
              <p className="text-xs text-slate-500">至少 5 人公布成绩后显示</p>
            </div>
            <div className={examPanelClass}>
              <p className="text-sm text-slate-600">班级位置</p>
              <p className="mt-2 text-3xl font-semibold">
                {report.rankBand === null
                  ? "样本不足"
                  : `前 ${report.rankBand}%`}
              </p>
              <p className="text-xs text-slate-500">
                至少 10 人公布成绩后显示区间
              </p>
            </div>
          </>
        )}
      </section>
      <p className="border-border bg-muted/40 rounded-xl border px-4 py-3 text-sm leading-6 text-slate-700">
        <span className="me-1 font-semibold text-slate-900">本次结论</span>
        {conclusion}
        {report.feedbackCount > 0 && (
          <span className="ms-2 inline-flex align-middle">
            <StatusChip tone="ai">
              教师反馈 {report.feedbackCount} 道题
            </StatusChip>
          </span>
        )}
      </p>

      <StudentExamReportTabs
        wrongCount={report.wrong.length}
        paperCount={report.paper.length}
        wrong={
          <>
            <StudentExamReviewList
              report={{
                examId: report.examId,
                wrong: report.wrong,
                pendingQuestions: report.pendingQuestions,
                publishedSubmissionId: report.publishedSubmissionId,
              }}
              scope={scope}
              examList={back}
              paperLink={
                report.publishedSubmissionId ? (
                  <StudentFullExamAnswerLink
                    examId={examId}
                    submissionId={report.publishedSubmissionId}
                    scope={scope}
                    examList={back}
                  />
                ) : undefined
              }
            />
            {report.feedbackCount > 0 && (
              <p className="text-sm text-slate-600">
                另有 {report.feedbackCount}{" "}
                道题带教师反馈，可在「整卷索引」里按题查看。
              </p>
            )}
          </>
        }
        paper={
          <section className={examPanelClass}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">整卷索引</h2>
              <p className="text-sm text-slate-600">
                共 {report.paper.length} 题
                {report.feedbackCount > 0
                  ? ` · ${report.feedbackCount} 题有教师反馈`
                  : ""}
              </p>
            </div>
            {report.paper.length ? (
              <ol className="divide-border mt-3 divide-y">
                {report.paper.map((item) => {
                  const meta = paperStatus[item.status];
                  return (
                    <li
                      key={item.number}
                      className="hover:bg-muted/40 flex flex-wrap items-center justify-between gap-2 py-2 transition-colors"
                    >
                      <p className="min-w-0 text-sm">
                        <span className="font-medium">第 {item.number} 题</span>
                        <span className="text-slate-600">
                          {" "}
                          · {QUESTION_TYPE_LABELS[item.type]} ·{" "}
                        </span>
                        <span className="break-words text-slate-700">
                          {item.title}
                        </span>
                      </p>
                      <div className="flex shrink-0 items-center gap-2">
                        {item.hasFeedback && (
                          <StatusChip tone="ai" variant="outline">
                            反馈
                          </StatusChip>
                        )}
                        <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
                        <span className="text-sm text-slate-700 tabular-nums">
                          {item.score === null ? "—" : item.score} /{" "}
                          {item.maxScore}
                        </span>
                        {report.publishedSubmissionId && (
                          <Link
                            className={examActionClass}
                            href={questionHref(item.number)}
                            aria-label={`查看第 ${item.number} 题`}
                          >
                            查看
                          </Link>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="text-muted-foreground mt-3 text-sm">
                暂无整卷数据，成绩公布后可查看。
              </p>
            )}
          </section>
        }
        overview={
          <>
            <section className={examPanelClass}>
              <h2 className="text-lg font-semibold">
                本次考查知识点 · {report.concepts.length} 个
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                得分率为本场相关已评分题目的得分除以满分。同一道题关联多个知识点时，得分和满分在相关知识点之间均分。
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                这些数据反映本场考试表现。暂无计分记录时用「—」，已计分且未得分显示
                0%。
                {!record.readOnly &&
                  " 班级得分率在该知识点至少有 5 名学生的已公布计分记录时显示。"}
              </p>
              {report.conceptGroups.length ? (
                <div className="mt-5 space-y-4">
                  {report.conceptGroups.map((group) => (
                    <section
                      key={group.id}
                      className="border-border overflow-hidden rounded-lg border"
                    >
                      <h3 className="bg-muted/40 px-4 py-2.5 font-semibold">
                        {group.name}
                        <span className="ms-2 text-xs font-normal text-slate-600">
                          考查 {group.points.length} 个知识点
                        </span>
                      </h3>
                      <ul className="divide-border divide-y px-4">
                        {group.points.map((item) => (
                          <li
                            key={item.id}
                            className="grid min-w-0 gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.9fr)] sm:gap-4"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium [overflow-wrap:anywhere]">
                                {item.name}
                              </p>
                              <p className="mt-1 text-xs text-slate-600">
                                关联 {item.questionCount} 道 · 已计分{" "}
                                {item.ownGradedCount} 道
                              </p>
                            </div>
                            <div className="min-w-0 space-y-1.5">
                              <p className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-slate-700">
                                <span>
                                  我的得分率{" "}
                                  <strong className="tabular-nums">
                                    {show(item.ownRate)}
                                  </strong>
                                </span>
                                {!record.readOnly &&
                                  item.classRate !== null && (
                                    <span>
                                      班级得分率{" "}
                                      <strong className="tabular-nums">
                                        {show(item.classRate)}
                                      </strong>
                                    </span>
                                  )}
                              </p>
                              {item.ownRate !== null && (
                                <div
                                  aria-hidden="true"
                                  className="bg-muted h-2 rounded"
                                >
                                  <div
                                    className="bg-brand h-2 rounded"
                                    style={{ width: `${item.ownRate}%` }}
                                  />
                                </div>
                              )}
                              {!record.readOnly && item.classRate !== null && (
                                <div
                                  aria-hidden="true"
                                  className="h-2 rounded bg-slate-100"
                                >
                                  <div
                                    className="h-2 rounded bg-slate-400"
                                    style={{ width: `${item.classRate}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-600">
                  本场考试暂无可用于统计的正式知识点关联。
                </p>
              )}
              {report.unmappedQuestions > 0 && (
                <p className="mt-4 text-xs text-slate-600">
                  {report.unmappedQuestions}{" "}
                  道题未关联正式知识点，未纳入上述得分率统计。
                </p>
              )}
            </section>

            {trend.length >= 2 && (
              <section className={examPanelClass}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-semibold">我的历次考试</h2>
                  <p className="text-xs text-slate-600">
                    按公布时间排序，最多 6 场
                  </p>
                </div>
                <ul className="mt-3 space-y-2">
                  {trend.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-3 text-sm"
                    >
                      <span
                        className={`w-32 shrink-0 truncate ${item.current ? "font-semibold text-slate-900" : "text-slate-600"}`}
                        title={item.title}
                      >
                        {item.current ? "本次 · " : ""}
                        {item.title}
                      </span>
                      <span
                        aria-hidden="true"
                        className="bg-muted h-2 min-w-0 flex-1 rounded"
                      >
                        <span
                          className={`block h-2 rounded ${item.current ? "bg-brand" : "bg-brand/40"}`}
                          style={{ width: `${item.percentage}%` }}
                        />
                      </span>
                      <span className="w-14 shrink-0 text-right text-slate-700 tabular-nums">
                        {item.percentage}%
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        }
      />
    </section>
  );
}
