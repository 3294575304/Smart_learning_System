import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ClassroomGovernanceAction } from "@/components/admin/classroom-governance-action";
import { adminClassroomIdSchema } from "@/services/admin/classrooms/schemas";
import { getAdminClassroom } from "@/services/admin/classrooms/service";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { requirePageRole } from "@/services/auth/page-authorization";

interface PageProps {
  params: Promise<{ classroomId: string }>;
}

export default async function AdminClassroomDetailPage({ params }: PageProps) {
  await requirePageRole(Role.ADMIN);
  const id = adminClassroomIdSchema.safeParse((await params).classroomId);
  if (!id.success) notFound();
  let classroom;
  try {
    classroom = await getAdminClassroom(id.data);
  } catch (error: unknown) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link className="text-sm text-gray-500" href="/admin/classrooms">
            ← 返回班级治理
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">{classroom.name}</h1>
          <p className="mt-2 text-sm text-gray-500">
            {classroom.status === "ACTIVE"
              ? "开启"
              : classroom.status === "CLOSED"
                ? "关闭"
                : "归档"}{" "}
            · 创建于 {classroom.createdAt.toLocaleString("zh-CN")}
          </p>
        </div>
        <ClassroomGovernanceAction classroom={classroom} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">教师</p>
          <p className="mt-1 font-semibold">{classroom.teacher.displayName}</p>
          <p className="text-sm text-gray-500">{classroom.teacher.email}</p>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">活跃学生</p>
          <p className="mt-1 text-2xl font-semibold">
            {classroom.activeStudentCount}
          </p>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">历史作业</p>
          <p className="mt-1 text-2xl font-semibold">
            {classroom.assignmentCount}
          </p>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">历史提交</p>
          <p className="mt-1 text-2xl font-semibold">
            {classroom.submissionCount}
          </p>
        </div>
      </div>
      <div className="rounded-xl border bg-white p-6">
        <h2 className="font-semibold">班级详情</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">描述</dt>
            <dd>{classroom.description || "暂无描述"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">学生自主退出</dt>
            <dd>{classroom.allowStudentLeave ? "允许" : "不允许"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">关闭时间</dt>
            <dd>
              {classroom.closedAt
                ? classroom.closedAt.toLocaleString("zh-CN")
                : "尚未关闭"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">最近更新</dt>
            <dd>{classroom.updatedAt.toLocaleString("zh-CN")}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
