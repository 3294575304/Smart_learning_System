"use client";

import { ClassroomStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { requestAdminApi } from "@/components/admin/request-api";
import type { AdminClassroomView } from "@/services/admin/classrooms/types";

export function ClassroomGovernanceAction({
  classroom,
}: {
  classroom: AdminClassroomView;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  if (classroom.status !== ClassroomStatus.ACTIVE) return null;

  async function closeClassroom() {
    if (
      !window.confirm(
        `确认关闭班级“${classroom.name}”吗？历史作业、提交和成绩将全部保留。`,
      )
    )
      return;
    setPending(true);
    const result = await requestAdminApi<AdminClassroomView>(
      `/api/admin/classrooms/${classroom.id}/close`,
      { method: "POST" },
    );
    setPending(false);
    if (!result.success) {
      window.alert(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <button
      className="text-sm text-red-600 disabled:text-gray-400"
      disabled={pending}
      onClick={closeClassroom}
      type="button"
    >
      {pending ? "关闭中…" : "关闭班级"}
    </button>
  );
}
