import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { AnalysisGenerateForm } from "@/components/exams/analysis-generate-form";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { getTeacherExamAnalysis } from "@/services/exams/analysis";

const display = (value: number | null, suffix = "") =>
  value === null ? "—" : `${value.toFixed(1)}${suffix}`;
export default async function ExamAnalysisPage({
  params,
  searchParams,
}: {
  params: Promise<{ examId: string }>;
  searchParams: Promise<{ revision?: string; sort?: string }>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const { examId } = await params;
  const query = await searchParams;
  const rawRevision = query.revision;
  const revision =
    rawRevision && /^\d+$/u.test(rawRevision) ? Number(rawRevision) : undefined;
  if (rawRevision && !revision) notFound();
  let result;
  try {
    result = await getTeacherExamAnalysis(teacher.id, examId, revision);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
  const { saved, current, stale } = result;
  const snapshot = saved?.snapshot ?? current.snapshot;
  const questions = [...snapshot.questions].sort((a, b) =>
    query.sort === "difficulty"
      ? (a.difficulty ?? Infinity) - (b.difficulty ?? Infinity) ||
        a.number - b.number
      : query.sort === "discrimination"
        ? (a.discrimination ?? Infinity) - (b.discrimination ?? Infinity) ||
          a.number - b.number
        : a.number - b.number,
  );
  const previous = result.previous;
  const compare = (
    current: number | null,
    earlier: number | null | undefined,
  ) =>
    current === null || earlier === null || earlier === undefined
      ? "上次同类考试：—"
      : `较上次 ${current - earlier >= 0 ? "+" : ""}${(current - earlier).toFixed(1)}`;
  return (
    <section className="space-y-6">
      <div>
        <Link
          className="text-sky-700 underline"
          href={`/teacher/exams/${examId}`}
        >
          ← 返回监考
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">
          {snapshot.title} · 考试分析
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {saved
            ? `版本 ${saved.revision} · ${saved.createdAt.toLocaleString("zh-CN")}`
            : "当前预览，尚未生成版本"}
          。已公布 {snapshot.overview.publishedClassrooms}/
          {snapshot.overview.totalClassrooms} 个班级；分数指标仅统计已公布成绩。
        </p>
        {stale && (
          <p className="mt-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
            成绩或成员已变化。当前展示历史版本，请生成新分析版本。
          </p>
        )}
      </div>
      <AnalysisGenerateForm
        examId={examId}
        pass={snapshot.thresholds.pass}
        excellent={snapshot.thresholds.excellent}
      />
      {result.versions.length > 0 && (
        <nav className="flex flex-wrap gap-3 text-sm" aria-label="历史分析版本">
          {result.versions.map((item) => (
            <Link
              className="text-sky-700 underline"
              href={`/teacher/exams/${examId}/analysis?revision=${item.revision}`}
              key={item.revision}
            >
              版本 {item.revision}
            </Link>
          ))}
        </nav>
      )}
      {saved && (
        <div className="flex flex-wrap gap-3 text-sm">
          <a
            className="rounded border px-3 py-2 text-sky-700"
            href={`/api/teacher/exams/${examId}/analysis/${saved.revision}/export?format=xlsx`}
          >
            下载分析工作簿
          </a>
          <a
            className="rounded border px-3 py-2 text-sky-700"
            href={`/api/teacher/exams/${examId}/analysis/${saved.revision}/export?format=pdf`}
          >
            下载讲评 PDF
          </a>
        </div>
      )}
      <section
        className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6"
        aria-label="考试概览"
      >
        {[
          {
            label: "参考率",
            value: snapshot.overview.participationRate,
            old: previous?.overview.participationRate,
            suffix: "%",
          },
          {
            label: "平均分",
            value: snapshot.overview.average,
            old: previous?.overview.average,
            suffix: "",
          },
          {
            label: "及格率",
            value: snapshot.overview.passRate,
            old:
              previous?.thresholds.pass === snapshot.thresholds.pass
                ? previous.overview.passRate
                : null,
            suffix: "%",
          },
          {
            label: "优秀率",
            value: snapshot.overview.excellentRate,
            old:
              previous?.thresholds.excellent === snapshot.thresholds.excellent
                ? previous.overview.excellentRate
                : null,
            suffix: "%",
          },
          {
            label: "最高分",
            value: snapshot.overview.highest,
            old: previous?.overview.highest,
            suffix: "",
          },
          {
            label: "标准差",
            value: snapshot.overview.standardDeviation,
            old: previous?.overview.standardDeviation,
            suffix: "",
          },
        ].map((item) => (
          <div className="rounded-xl border bg-white p-4" key={item.label}>
            <p className="text-sm text-slate-600">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold">
              {display(item.value, item.suffix)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {compare(item.value, item.old)}
            </p>
          </div>
        ))}
      </section>
      <p className="text-sm text-slate-600">
        应考 {snapshot.overview.expected} 人，实考{" "}
        {snapshot.overview.participated} 人，已公布分数{" "}
        {snapshot.overview.count} 人；特殊状态 {snapshot.overview.special}{" "}
        人，未评分 {snapshot.overview.unscored} 人。中位数{" "}
        {display(snapshot.overview.median)}，最低分{" "}
        {display(snapshot.overview.lowest)}；KR-20 内部一致性{" "}
        {display(snapshot.overview.kr20)}。
      </p>
      <section className="rounded-xl border bg-white p-4">
        <h2 className="font-semibold">分数段分布</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-5">
          {["0–59", "60–69", "70–79", "80–89", "90–100"].map((label, index) => (
            <div className="rounded bg-slate-50 p-3 text-sm" key={label}>
              {label} 分 · {snapshot.overview.bands[index]} 人
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">班级对比</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2">班级</th>
                <th>排名</th>
                <th>参考率</th>
                <th>均分</th>
                <th>及格率</th>
                <th>优秀率</th>
                <th>标准差</th>
                <th>详情</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.classrooms.map((row, index) => (
                <tr className="border-b" key={row.id}>
                  <td className="p-2">{row.name}</td>
                  <td>{row.stats.average === null ? "—" : index + 1}</td>
                  <td>{display(row.participationRate, "%")}</td>
                  <td>
                    <span>{display(row.stats.average)}</span>
                    <span className="mt-1 block h-1.5 rounded bg-slate-100">
                      <span
                        className="block h-1.5 rounded bg-sky-600"
                        style={{ width: `${row.stats.average ?? 0}%` }}
                      />
                    </span>
                  </td>
                  <td>{display(row.stats.passRate, "%")}</td>
                  <td>{display(row.stats.excellentRate, "%")}</td>
                  <td>{display(row.stats.standardDeviation)}</td>
                  <td>
                    <Link
                      className="text-sky-700 underline"
                      href={`/teacher/assignments/${row.assignmentId}/results`}
                    >
                      班级明细
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">题目分析</h2>
        <div className="mb-3 flex gap-3 text-sm">
          <Link
            className="text-sky-700 underline"
            href={`/teacher/exams/${examId}/analysis${saved ? `?revision=${saved.revision}` : ""}`}
          >
            按题号
          </Link>
          <Link
            className="text-sky-700 underline"
            href={`/teacher/exams/${examId}/analysis?sort=difficulty${saved ? `&revision=${saved.revision}` : ""}`}
          >
            按难度
          </Link>
          <Link
            className="text-sky-700 underline"
            href={`/teacher/exams/${examId}/analysis?sort=discrimination${saved ? `&revision=${saved.revision}` : ""}`}
          >
            按区分度
          </Link>
        </div>
        <div className="overflow-x-auto">
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
              {questions.map((row) => (
                <tr
                  className={`border-b ${(row.difficulty !== null && row.difficulty < 0.3) || (row.discrimination !== null && row.discrimination < 0.2) ? "border-l-4 border-l-amber-500" : ""}`}
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
        <p className="mt-3 text-xs text-slate-500">
          题目指标基于已公布的逐题批改；台账人工改分不能反推逐题得分。样本不足时区分度显示“—”。
        </p>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-4">
          <h2 className="font-semibold">课程 Concept 达成</h2>
          {snapshot.concepts.length ? (
            snapshot.concepts.map((row) => (
              <div className="mt-3" key={row.id}>
                <div className="flex justify-between text-sm">
                  <span>
                    {row.name} · {row.questionCount} 题
                  </span>
                  <span>{display(row.rate, "%")}</span>
                </div>
                <div className="mt-1 h-2 rounded bg-slate-100">
                  <div
                    className="h-2 rounded bg-sky-600"
                    style={{ width: `${row.rate ?? 0}%` }}
                  />
                </div>
              </div>
            ))
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              暂无正式课程 Concept 证据。
            </p>
          )}
          <p className="mt-3 text-xs text-slate-500">
            未映射题目 {snapshot.unmappedQuestions} 道，不计入达成率。
          </p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <h2 className="font-semibold">课程目标</h2>
          {snapshot.objectives.length ? (
            snapshot.objectives.map((row) => (
              <p className="mt-3 text-sm" key={row.code}>
                {row.code} · {row.questionCount} 题 · {display(row.rate, "%")}
              </p>
            ))
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              暂无发布时确认的目标映射。
            </p>
          )}
        </div>
      </section>
    </section>
  );
}
