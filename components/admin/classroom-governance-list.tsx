import { School } from "lucide-react";
import Link from "next/link";

import { ClassroomGovernanceAction } from "@/components/admin/classroom-governance-action";
import { EmptyState } from "@/components/dashboard/empty-state";
import type { AdminClassroomView } from "@/services/admin/classrooms/types";

export function ClassroomGovernanceList({
  classrooms,
}: {
  classrooms: AdminClassroomView[];
}) {
  if (classrooms.length === 0) {
    return (
      <EmptyState
        description="调整搜索或状态条件后重试。"
        icon={School}
        title="没有找到班级"
      />
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="w-full min-w-[850px] text-left text-sm">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="px-4 py-3 font-medium">班级</th>
            <th className="px-4 py-3 font-medium">教师</th>
            <th className="px-4 py-3 font-medium">学生人数</th>
            <th className="px-4 py-3 font-medium">创建时间</th>
            <th className="px-4 py-3 font-medium">状态</th>
            <th className="px-4 py-3 font-medium">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {classrooms.map((classroom) => (
            <tr key={classroom.id}>
              <td className="px-4 py-3">
                <Link
                  className="font-medium hover:underline"
                  href={`/admin/classrooms/${classroom.id}`}
                >
                  {classroom.name}
                </Link>
              </td>
              <td className="px-4 py-3">
                <p>{classroom.teacher.displayName}</p>
                <p className="text-muted-foreground text-xs">
                  {classroom.teacher.email}
                </p>
              </td>
              <td className="px-4 py-3">{classroom.activeStudentCount}</td>
              <td className="px-4 py-3">
                {classroom.createdAt.toLocaleString("zh-CN")}
              </td>
              <td className="px-4 py-3">
                {classroom.status === "ACTIVE"
                  ? "开启"
                  : classroom.status === "CLOSED"
                    ? "关闭"
                    : "归档"}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-3">
                  <Link
                    className="text-sm underline underline-offset-4"
                    href={`/admin/classrooms/${classroom.id}`}
                  >
                    查看详情
                  </Link>
                  <ClassroomGovernanceAction classroom={classroom} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
