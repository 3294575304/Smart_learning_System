import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { AssignmentOperationError } from "@/services/assignments/errors";
import { getStudentExamReport } from "@/services/exams/student-report";

const show = (value: number | null) =>
  value === null ? "—" : `${value.toFixed(1)}%`;
export default async function StudentExamReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ examId: string }>;
  searchParams: Promise<{ classroomId?: string }>;
}) {
  const student = await requirePageRole(Role.STUDENT);
  const classroomId = (await searchParams).classroomId;
  let report;
  try {
    report = await getStudentExamReport(
      student.id,
      (await params).examId,
      classroomId,
    );
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    if (error instanceof AssignmentOperationError)
      return (
        <section className="space-y-4">
          <Link className="text-sky-700 underline" href="/student/exams">
            ← 我的考试
          </Link>
          <h1 className="text-2xl font-semibold">考试报告待公布</h1>
          <p className="rounded-xl border bg-white p-6">
            {error.message}。公布后可在此查看个人报告。
          </p>
        </section>
      );
    throw error;
  }
  return (
    <section className="space-y-6">
      <div>
        <Link className="text-sky-700 underline" href="/student/exams">
          ← 我的考试
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">
          {report.title} · 我的考试报告
        </h1>
        <p className="text-sm text-slate-600">
          {report.classroomName} · 本报告只显示你的作答与可公布的班级汇总。
        </p>
      </div>
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-slate-600">我的成绩</p>
          <p className="mt-2 text-3xl font-semibold">
            {report.score} / {report.maxScore}
          </p>
          <p className="text-sm">百分制 {show(report.percentage)}</p>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-slate-600">班级均分</p>
          <p className="mt-2 text-3xl font-semibold">
            {show(report.classAverage)}
          </p>
          <p className="text-xs text-slate-500">至少 5 人公布成绩后显示</p>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-slate-600">班级位置</p>
          <p className="mt-2 text-3xl font-semibold">
            {report.rankBand === null ? "—" : `前 ${report.rankBand}%`}
          </p>
          <p className="text-xs text-slate-500">至少 10 人公布成绩后显示区间</p>
        </div>
      </section>
      <section className="rounded-xl border bg-white p-5">
        <h2 className="text-lg font-semibold">课程知识点</h2>
        {report.concepts.length ? (
          report.concepts.map((item) => (
            <div className="mt-4" key={item.id}>
              <p className="text-sm font-medium">{item.name}</p>
              <p className="mt-1 text-xs">
                我：{show(item.ownRate)} · 班级：{show(item.classRate)}
              </p>
              <div className="mt-1 h-2 rounded bg-slate-100">
                <div
                  className="h-2 rounded bg-sky-600"
                  style={{ width: `${item.ownRate ?? 0}%` }}
                />
              </div>
              <div className="mt-1 h-2 rounded bg-slate-100">
                <div
                  className="h-2 rounded bg-slate-400"
                  style={{ width: `${item.classRate ?? 0}%` }}
                />
              </div>
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
      <section className="rounded-xl border bg-white p-5">
        <h2 className="text-lg font-semibold">本次错题</h2>
        {report.wrong.length ? (
          <ul className="mt-3 space-y-2">
            {report.wrong.map((item) => (
              <li className="rounded border p-3" key={item.number}>
                第 {item.number} 题 · {item.title}{" "}
                <Link
                  className="ml-3 text-sky-700 underline"
                  href={`/student/submissions/${item.submissionId}/result`}
                >
                  查看解析
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate-500">暂无已判定的错题。</p>
        )}
        <div className="mt-4 flex gap-4 text-sm">
          <Link
            className="text-sky-700 underline"
            href={`/student/wrong-questions?courseId=${report.courseId}&classroomId=${report.classroomId}`}
          >
            打开错题本
          </Link>
          <Link
            className="text-sky-700 underline"
            href={`/student/recommendations?courseId=${report.courseId}&classroomId=${report.classroomId}`}
          >
            推荐同类练习
          </Link>
          <Link className="text-sky-700 underline" href="/student/analytics">
            查看学习分析
          </Link>
        </div>
      </section>
    </section>
  );
}
