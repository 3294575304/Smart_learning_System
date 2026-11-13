import {
  StudentExamDetailHeader,
  examActionClass,
  examPanelClass,
  readStudentExamDetailQuery,
  type StudentExamDetailProps,
} from "@/components/exams/student-exam-detail";
import { getStudentExamRecord } from "@/services/exams/student-record";
import { readActivityPage } from "@/services/student-experience/activity-page";
import { examListReturn } from "@/services/student-experience/activity-query";
import { studentTaskHref } from "@/services/student-experience/task-scope";
import Link from "next/link";

import { Role } from "@prisma/client";
import { requirePageRole } from "@/services/auth/page-authorization";

import { AssignmentOperationError } from "@/services/assignments/errors";
import { getStudentExamReport } from "@/services/exams/student-report";

const show = (value: number | null) =>
  value === null ? "—" : `${value.toFixed(1)}%`;
export default async function StudentExamReportPage({
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
  const scope = {
    courseId: record.exam.courseId,
    classroomId: record.classroomId,
  };
  const back = examListReturn(query.returnTo, { ...scope, focus: record.id });
  const recordHref = studentTaskHref(
    `/student/exams/${examId}/record?${new URLSearchParams({ returnTo: back })}`,
    scope,
  );
  const answerHref = (id: string) =>
    studentTaskHref(
      `/student/submissions/${id}/result?${new URLSearchParams({ source: "exam", returnTo: back })}`,
      scope,
    );
  const header = (
    <StudentExamDetailHeader
      record={record}
      title="我的考试报告"
      back={back}
      actions={
        <Link className={examActionClass} href={recordHref}>
          查看考试记录
        </Link>
      }
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
  return (
    <section className="space-y-5">
      {header}
      {report.publishedSubmissionId && (
        <Link
          className={examActionClass}
          href={`${answerHref(report.publishedSubmissionId)}#exam-score-review`}
        >
          查看答卷与成绩复核
        </Link>
      )}
      <section className="grid gap-3 sm:grid-cols-3">
        <div className={examPanelClass}>
          <p className="text-sm text-slate-600">我的成绩</p>
          <p className="mt-2 text-3xl font-semibold">
            {report.score} / {report.maxScore}
          </p>
          <p className="text-sm">百分制 {show(report.percentage)}</p>
        </div>
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
            {report.rankBand === null ? "样本不足" : `前 ${report.rankBand}%`}
          </p>
          <p className="text-xs text-slate-500">至少 10 人公布成绩后显示区间</p>
        </div>
      </section>
      <section className={examPanelClass}>
        <h2 className="text-lg font-semibold">课程知识点</h2>
        {report.concepts.length ? (
          report.concepts.map((item) => (
            <div className="mt-4" key={item.id}>
              <p className="text-sm font-medium">{item.name}</p>
              <p className="mt-1 text-xs">
                我：{show(item.ownRate)} · 班级：{show(item.classRate)}
              </p>
              {item.ownRate !== null && (
                <div aria-hidden="true" className="mt-1 h-2 rounded bg-sky-100">
                  <div
                    className="h-2 rounded bg-sky-600"
                    style={{ width: `${item.ownRate}%` }}
                  />
                </div>
              )}
              {item.classRate !== null && (
                <div
                  aria-hidden="true"
                  className="mt-1 h-2 rounded bg-slate-100"
                >
                  <div
                    className="h-2 rounded bg-slate-400"
                    style={{ width: `${item.classRate}%` }}
                  />
                </div>
              )}
            </div>
          ))
        ) : (
          <p className="mt-3 text-sm text-slate-500">
            本次考试暂无可用的正式课程知识点绑定。
          </p>
        )}
        <p className="mt-3 text-xs text-slate-500">
          未覆盖正式知识点的题目：{report.unmappedQuestions} 道。
        </p>
      </section>
      <section
        id="exam-wrong-questions"
        className={`scroll-mt-24 ${examPanelClass}`}
      >
        <h2 className="text-lg font-semibold">本次错题</h2>
        {report.wrong.length ? (
          <ul className="mt-3 space-y-2">
            {report.wrong.map((item) => (
              <li
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                key={item.number}
              >
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  第 {item.number} 题 · {item.title}
                </span>
                <Link
                  className={examActionClass}
                  href={`${answerHref(item.submissionId)}#exam-question-${item.number}`}
                >
                  查看解析
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate-500">暂无已判定的错题。</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            className={examActionClass}
            href={`/student/wrong-questions?courseId=${report.courseId}&classroomId=${report.classroomId}`}
          >
            打开错题本
          </Link>
          <Link
            className={examActionClass}
            href={`/student/recommendations?courseId=${report.courseId}&classroomId=${report.classroomId}`}
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
    </section>
  );
}
