import Link from "next/link";
import { Role } from "@prisma/client";
import { requirePageRole } from "@/services/auth/page-authorization";
import { getTeacherExamMonitor } from "@/services/exams/service";
import { MonitorRefresh } from "@/components/exams/monitor-refresh";

export default async function ExamMonitorPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const exam = await getTeacherExamMonitor(teacher.id, (await params).examId);
  return (
    <section className="space-y-5">
      <Link className="text-sky-700" href="/teacher/exams">
        ← 考试管理
      </Link>
      <h1 className="text-2xl font-semibold">{exam.title} · 监考</h1>
      {exam.endsAt <= new Date() && !exam.cancelledAt && (
        <Link
          className="text-sky-700 underline"
          href={`/teacher/exams/${exam.id}/analysis`}
        >
          查看考试分析
        </Link>
      )}
      <p>
        {exam.startsAt.toLocaleString("zh-CN")} 至{" "}
        {exam.endsAt.toLocaleString("zh-CN")} · 允许切屏 {exam.allowedSwitches}{" "}
        次
      </p>
      <MonitorRefresh />
      {exam.assignments.map((assignment) => (
        <section key={assignment.id} className="rounded-xl border bg-white p-4">
          <div className="flex justify-between">
            <h2 className="font-semibold">
              {assignment.classroomName} · 已开始{" "}
              {assignment.submissions.length}/{assignment.expectedCount}
            </h2>
            <Link
              className="text-sky-700 underline"
              href={`/teacher/assignments/${assignment.id}/submissions`}
            >
              提交与批改
            </Link>
          </div>
          {assignment.submissions.length ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th>学生</th>
                    <th>学号</th>
                    <th>状态</th>
                    <th>切屏次数</th>
                    <th>交卷时间</th>
                  </tr>
                </thead>
                <tbody>
                  {assignment.submissions.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td>{item.studentName}</td>
                      <td>{item.studentNo}</td>
                      <td>{item.status}</td>
                      <td>{item.switchCount}</td>
                      <td>
                        {item.submittedAt?.toLocaleString("zh-CN") ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">暂无学生开始考试。</p>
          )}
        </section>
      ))}
    </section>
  );
}
