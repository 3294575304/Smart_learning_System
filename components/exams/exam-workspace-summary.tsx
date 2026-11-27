import {
  examClassroomHref,
  examMonitorHref,
  examWorkspaceHref,
} from "@/services/exams/classroom-navigation";
import type { getTeacherExamDetails } from "@/services/exams/analysis";
import { examTypeLabel } from "@/services/exams/exam-types";

type ExamDetails = Awaited<ReturnType<typeof getTeacherExamDetails>>;

const display = (value: number | null, suffix = "") =>
  value === null ? "—" : `${value.toFixed(1)}${suffix}`;

export function ExamWorkspaceSummary({
  details,
  listContext,
}: {
  details: ExamDetails;
  listContext?: string;
}) {
  const { exam, analysis, classroomProgress } = details;
  const now = new Date();
  const status = exam.cancelledAt
    ? "已取消"
    : exam.endsAt <= now
      ? "已结束"
      : exam.startsAt > now
        ? "未开考"
        : "考试中";
  const chinaTime = (value: Date) =>
    value.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
  return (
    <div className="space-y-4">
      <header className="rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold [overflow-wrap:anywhere]">
              {exam.title}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {examTypeLabel(exam.type)} · {exam.assignments.length} 个教学班
            </p>
          </div>
          <span className="rounded-full bg-sky-50 px-3 py-1 text-sm font-medium text-sky-900">
            {status}
          </span>
        </div>
        <dl className="mt-4 flex flex-wrap gap-x-7 gap-y-3 border-t pt-4 text-sm">
          <div>
            <dt className="text-slate-600">开考时间</dt>
            <dd>{chinaTime(exam.startsAt)}</dd>
          </div>
          <div>
            <dt className="text-slate-600">结束时间</dt>
            <dd>{chinaTime(exam.endsAt)}</dd>
          </div>
          <div>
            <dt className="text-slate-600">考试规则</dt>
            <dd>
              可考 {exam.allowedAttempts} 次 · 允许切屏 {exam.allowedSwitches}{" "}
              次 · {exam.autoSubmitOnExit ? "退出自动交卷" : "退出可继续作答"}
            </dd>
          </div>
        </dl>
      </header>
      <section
        className="rounded-xl border bg-white p-5"
        aria-labelledby="exam-classrooms"
      >
        <h2 id="exam-classrooms" className="text-lg font-semibold">
          教学班
        </h2>
        {!!exam.assignments.length && !exam.cancelledAt && (
          <p className="mt-1 text-xs leading-5 text-slate-600">
            实考按已交卷统计，含自动收卷。同一学生按最新有效答卷计一次。
          </p>
        )}
        {exam.assignments.length ? (
          <ul className="mt-3 divide-y">
            {exam.assignments.map((assignment) => {
              const base = examClassroomHref(exam.id, assignment.id);
              const progress = classroomProgress[assignment.id];
              const destinations = [
                ["查看试卷", base],
                ["答卷与批改", `${base}/submissions`],
                ["成绩统计", `${base}/results`],
                [
                  "监考与公布",
                  examMonitorHref(exam.id, assignment.classroomId),
                ],
              ];
              return (
                <li
                  key={assignment.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <h3 className="font-medium [overflow-wrap:anywhere]">
                      {assignment.classroom.name}
                    </h3>
                    {!exam.cancelledAt && (
                      <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs">
                        <div className="flex items-baseline gap-1.5">
                          <dt className="text-slate-600">实考</dt>
                          <dd className="font-semibold tabular-nums">
                            {progress.participated} 人
                          </dd>
                        </div>
                        <div className="flex items-baseline gap-1.5">
                          <dt className="text-slate-600">待批改</dt>
                          <dd
                            className={`font-semibold tabular-nums ${progress.pending ? "text-amber-800" : ""}`}
                          >
                            {progress.pending} 人
                          </dd>
                        </div>
                        <div className="flex items-baseline gap-1.5">
                          <dt className="text-slate-600">已公布</dt>
                          <dd className="font-semibold tabular-nums">
                            {progress.published} 人
                          </dd>
                        </div>
                      </dl>
                    )}
                  </div>
                  <nav
                    className="flex flex-wrap gap-2"
                    aria-label={`${assignment.classroom.name}的考试功能`}
                  >
                    {destinations.map(([label, href]) => (
                      <a
                        key={label}
                        href={examWorkspaceHref(href, listContext)}
                        className="inline-flex min-h-10 items-center rounded-lg border border-sky-200 px-3 text-sm font-medium text-sky-900 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                      >
                        {label}
                      </a>
                    ))}
                  </nav>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate-600">
            本场考试暂无可查看的教学班。
          </p>
        )}
      </section>
      <div id="exam-analysis" className="scroll-mt-24">
        {exam.cancelledAt ? (
          <p className="rounded-xl border bg-slate-50 p-4 text-sm text-slate-600">
            考试已取消，暂无参考率或题目分析。
          </p>
        ) : exam.endsAt > now ? (
          <p className="rounded-xl border bg-white p-4 text-sm text-slate-600">
            考试结束且公布成绩后，可查看参考率和题目分析。
          </p>
        ) : !analysis ? (
          <p className="rounded-xl border bg-white p-4 text-sm text-slate-600">
            尚无教学班公布成绩。公布进度可在对应班级的「监考与公布」中查看。
          </p>
        ) : (
          <div className="space-y-4">
            <section
              className="rounded-xl border bg-white p-5"
              aria-label="参考率"
            >
              <h2 className="text-lg font-semibold">参考率</h2>
              <p className="mt-2 text-2xl font-semibold">
                {display(analysis.overview.participationRate, "%")}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                场次汇总 · 应考 {analysis.overview.expected} 人，实考{" "}
                {analysis.overview.participated} 人；已公布成绩的班级{" "}
                {analysis.overview.publishedClassrooms}/
                {analysis.overview.totalClassrooms}。
              </p>
            </section>
            <section className="rounded-xl border bg-white p-5">
              <h2 className="text-lg font-semibold">场次题目分析</h2>
              {analysis.questions.length ? (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[850px] text-left text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="p-2">题目</th>
                        <th>题型</th>
                        <th>满分</th>
                        <th>均分</th>
                        <th>难度 P</th>
                        <th>区分度 D</th>
                        <th>正确率</th>
                        <th>平均用时</th>
                        <th>选项分布</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.questions.map((row) => (
                        <tr
                          className="border-b"
                          key={`${row.number}:${row.questionId}`}
                        >
                          <td className="p-2">
                            {row.number}. {row.title}
                          </td>
                          <td>{row.type}</td>
                          <td>{row.points}</td>
                          <td>{display(row.averageScore)}</td>
                          <td>{display(row.difficulty)}</td>
                          <td>{display(row.discrimination)}</td>
                          <td>{display(row.accuracy, "%")}</td>
                          <td>
                            {row.averageTimeMs === null
                              ? "—"
                              : `${display(row.averageTimeMs / 1000)} 秒`}
                          </td>
                          <td>
                            {row.options
                              .map(
                                (option) =>
                                  `${option.label} ${display(option.rate, "%")}`,
                              )
                              .join(" · ") || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-600">
                  暂无可分析的题目。
                </p>
              )}
              <p className="mt-3 text-xs text-slate-500">
                题目指标仅基于已公布的逐题批改；台账人工改分不能反推逐题得分。样本不足时区分度显示“—”。
              </p>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
