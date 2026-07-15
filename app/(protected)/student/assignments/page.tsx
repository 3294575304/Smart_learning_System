import { Role } from "@prisma/client";
import Link from "next/link";

import { requirePageRole } from "@/services/auth/page-authorization";
import { listStudentAssignments } from "@/services/assignments/service";

export default async function StudentAssignmentsPage() {
  const student = await requirePageRole(Role.STUDENT);
  const assignments = await listStudentAssignments(student.id);
  const now = new Date();
  return (
    <section className="space-y-6">
      <div>
        <Link className="text-sm text-gray-500 hover:underline" href="/student">
          ← 返回学生工作台
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">我的作业</h1>
        <p className="mt-2 text-sm text-gray-600">
          查看已发布作业、继续作答或查看提交结果。
        </p>
      </div>
      {assignments.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-gray-500">
          当前没有已发布的作业。
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {assignments.map((assignment) => {
            const expired = assignment.dueAt <= now;
            return (
              <Link
                className="rounded-xl border bg-white p-5 transition-colors hover:bg-gray-50"
                href={`/student/assignments/${assignment.id}`}
                key={assignment.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold">{assignment.title}</h2>
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${expired ? "bg-gray-100" : "bg-green-50 text-green-700"}`}
                  >
                    {expired ? "已截止" : "进行中"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  {assignment.classroomName} · {assignment.totalPoints} 分
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  截止：{assignment.dueAt.toLocaleString("zh-CN")}
                </p>
                <p className="mt-3 text-sm">
                  {assignment.inProgressSubmissionId
                    ? "有未提交的作答"
                    : assignment.latestSubmissionId
                      ? `已提交 ${assignment.attemptCount} 次`
                      : "尚未开始"}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
