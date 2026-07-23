import { ClassroomStatus } from "@prisma/client";
import Link from "next/link";

import type { AdminClassroomListQuery } from "@/services/admin/classrooms/schemas";

export function ClassroomGovernanceFilters({
  query,
}: {
  query: AdminClassroomListQuery;
}) {
  return (
    <form
      className="grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-[1fr_12rem_auto]"
      method="get"
    >
      <input
        className="rounded-md border px-3 py-2 text-sm"
        defaultValue={query.keyword}
        maxLength={100}
        name="keyword"
        placeholder="搜索班级名称、教师姓名或邮箱"
      />
      <select
        className="rounded-md border bg-white px-3 py-2 text-sm"
        defaultValue={query.status ?? ""}
        name="status"
      >
        <option value="">全部状态</option>
        <option value={ClassroomStatus.ACTIVE}>开启</option>
        <option value={ClassroomStatus.CLOSED}>关闭</option>
        <option value={ClassroomStatus.ARCHIVED}>归档</option>
      </select>
      <div className="flex gap-2">
        <button
          className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white"
          type="submit"
        >
          筛选
        </button>
        <Link
          className="rounded-md border px-4 py-2 text-sm"
          href="/admin/classrooms"
        >
          重置
        </Link>
      </div>
      <input name="pageSize" type="hidden" value={query.pageSize} />
    </form>
  );
}
