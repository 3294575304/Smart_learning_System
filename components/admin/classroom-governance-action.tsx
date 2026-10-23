"use client";

import { ClassroomStatus } from "@prisma/client";
import { LoaderCircle, XCircle } from "lucide-react";
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
  if (
    classroom.status !== ClassroomStatus.ACTIVE &&
    classroom.status !== ClassroomStatus.COMPLETED
  )
    return null;

  async function closeClassroom() {
    if (
      !window.confirm(
        `确认关闭班级“${classroom.name}”吗？历史作业、提交和成绩将全部保留。`,
      )
    )
      return;
    const reason = window.prompt(
      "请填写关闭原因（2–500字，将记录到审计日志）：",
    );
    if (reason === null) return;
    if (reason.trim().length < 2 || reason.trim().length > 500) {
      window.alert("请填写2–500字的关闭原因");
      return;
    }
    setPending(true);
    const result = await requestAdminApi<AdminClassroomView>(
      `/api/admin/classrooms/${classroom.id}/close`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      },
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
      aria-label={`关闭班级 ${classroom.name}`}
      className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 py-2 text-xs font-medium text-red-700 transition hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
      disabled={pending}
      onClick={closeClassroom}
      title="关闭班级"
      type="button"
    >
      {pending ? (
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
      ) : (
        <XCircle aria-hidden="true" className="size-4" />
      )}
      {pending ? "关闭中…" : "关闭班级"}
    </button>
  );
}
