import { AssignmentStatus, Role } from "@prisma/client";
import Link from "next/link";

import { requirePageRole } from "@/services/auth/page-authorization";
import { assignmentListQuerySchema } from "@/services/assignments/schemas";
import { listTeacherAssignments } from "@/services/assignments/service";

const STATUS_LABELS: Record<AssignmentStatus, string> = {
  DRAFT: "草稿",
  PUBLISHED: "已发布",
  CLOSED: "已关闭",
  ARCHIVED: "已归档",
};

export default async function TeacherAssignmentsPage() {
  const teacher = await requirePageRole(Role.TEACHER);
  const assignments = await listTeacherAssignments(
    teacher.id,
    assignmentListQuerySchema.parse({ pageSize: 50 }),
  );
  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            className="text-sm text-gray-500 hover:underline"
            href="/teacher"
          >
            ← 返回教师工作台
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">作业管理</h1>
          <p className="mt-2 text-sm text-gray-600">
            创建草稿、预约发布并查看作业状态。
          </p>
        </div>
        <Link
          className="rounded-md bg-black px-4 py-2 text-white"
          href="/teacher/assignments/new"
        >
          创建作业
        </Link>
      </div>
      {assignments.items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-gray-500">
          暂无作业，请创建第一份作业。
        </div>
      ) : (
        <div className="space-y-3">
          {assignments.items.map((assignment) => (
            <article
              className="rounded-xl border bg-white p-5"
              key={assignment.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold">{assignment.title}</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    {assignment.classroom.name} · {assignment.questions.length}{" "}
                    题 · {assignment.totalPoints} 分
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    发布时间：
                    {assignment.publishedAt
                      ? assignment.publishedAt.toLocaleString("zh-CN")
                      : "未设置"}
                    　截止：
                    {assignment.dueAt
                      ? assignment.dueAt.toLocaleString("zh-CN")
                      : "未设置"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs">
                    {STATUS_LABELS[assignment.status]}
                  </span>
                  {assignment.status === AssignmentStatus.DRAFT ? (
                    <Link
                      className="text-sm underline"
                      href={`/teacher/assignments/${assignment.id}/edit`}
                    >
                      编辑
                    </Link>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
