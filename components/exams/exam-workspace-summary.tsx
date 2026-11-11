import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { getTeacherExamDetails } from "@/services/exams/analysis";

type ExamDetails = Awaited<ReturnType<typeof getTeacherExamDetails>>;

const display = (value: number | null, suffix = "") =>
  value === null ? "—" : `${value.toFixed(1)}${suffix}`;

export function ExamWorkspaceSummary({
  details,
  assignmentId,
}: {
  details: ExamDetails;
  assignmentId?: string;
}) {
  const { exam, analysis } = details;
  const Heading = assignmentId ? "h2" : "h1";
  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-white p-5">
        <Heading
          className={
            assignmentId
              ? "text-lg font-semibold"
              : "text-2xl font-semibold [overflow-wrap:anywhere]"
          }
        >
          {exam.title} · {exam.type === "MIDTERM" ? "期中" : "期末"}
          {exam.cancelledAt ? " · 已取消" : ""}
        </Heading>
        <p className="mt-1 text-sm text-slate-600">
          {exam.startsAt.toLocaleString("zh-CN")} 至{" "}
          {exam.endsAt.toLocaleString("zh-CN")} · 允许切屏{" "}
          {exam.allowedSwitches} 次
        </p>
        {(!assignmentId || exam.assignments.length > 1) &&
          exam.assignments.length > 0 && (
            <>
              <nav
                className={
                  assignmentId
                    ? "mt-4 flex flex-wrap gap-2"
                    : "mt-5 grid gap-2 border-t border-sky-100 pt-4 sm:grid-cols-2 xl:grid-cols-3"
                }
                aria-label="考试教学班"
              >
                {exam.assignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className={
                      !assignmentId
                        ? "min-w-0 rounded-xl border border-sky-100 bg-white p-2"
                        : undefined
                    }
                  >
                    <Link
                      href={`/teacher/assignments/${assignment.id}?source=exam&examId=${exam.id}`}
                      aria-current={
                        assignment.id === assignmentId ? "page" : undefined
                      }
                      className={`flex min-h-10 min-w-0 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 motion-safe:transition-colors ${assignment.id === assignmentId ? "border-sky-700 bg-sky-50 text-sky-800" : "border-sky-200 text-sky-800 hover:bg-sky-50 active:bg-sky-100"}`}
                    >
                      <span className="[overflow-wrap:anywhere]">
                        {assignment.classroom.name}
                      </span>
                      {!assignmentId && (
                        <ArrowRight
                          aria-hidden="true"
                          className="size-4 shrink-0"
                        />
                      )}
                    </Link>
                    {!assignmentId && (
                      <Link
                        className="mt-1 inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-medium text-sky-800 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-sky-700"
                        href={`/teacher/exams/${exam.id}/monitor?classroomId=${assignment.classroomId}`}
                      >
                        监考与成绩公布
                      </Link>
                    )}
                  </div>
                ))}
              </nav>
            </>
          )}
        {!exam.assignments.length && (
          <p className="mt-3 text-sm text-slate-600">暂无可查看的教学班。</p>
        )}
      </section>
      {exam.cancelledAt ? (
        <p className="rounded-xl border bg-slate-50 p-4 text-sm text-slate-600">
          考试已取消，暂无参考率或题目分析。
        </p>
      ) : exam.endsAt > new Date() ? (
        <p className="rounded-xl border bg-white p-4 text-sm text-slate-600">
          考试结束且公布成绩后，可查看参考率和题目分析。
        </p>
      ) : !analysis ? (
        <p className="rounded-xl border bg-white p-4 text-sm text-slate-600">
          尚无已公布成绩的教学班，暂不展示参考率和题目分析。
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
              <p className="mt-3 text-sm text-slate-600">暂无可分析的题目。</p>
            )}
            <p className="mt-3 text-xs text-slate-500">
              题目指标仅基于已公布的逐题批改；台账人工改分不能反推逐题得分。样本不足时区分度显示“—”。
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
