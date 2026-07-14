"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { requestApi } from "@/components/classrooms/request-api";

interface TeacherClassroomControlsProps {
  classroomId: string;
  initialJoinCode: string;
  isClosed: boolean;
}

export function TeacherClassroomControls({
  classroomId,
  initialJoinCode,
  isClosed,
}: TeacherClassroomControlsProps) {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState(initialJoinCode);
  const [pendingAction, setPendingAction] = useState<"code" | "close" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  async function regenerateCode() {
    if (!window.confirm("重新生成后旧邀请码将立即失效，确定继续吗？")) {
      return;
    }
    setPendingAction("code");
    setError(null);
    const result = await requestApi<{ joinCode: string }>(
      `/api/teacher/classrooms/${classroomId}/join-code`,
      { method: "POST" },
    );
    setPendingAction(null);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setJoinCode(result.data.joinCode);
    router.refresh();
  }

  async function closeCurrentClassroom() {
    if (
      !window.confirm(
        "关闭后学生不能再加入，教师也不能发布新作业。历史数据会保留，确定关闭吗？",
      )
    ) {
      return;
    }
    setPendingAction("close");
    setError(null);
    const result = await requestApi<{ id: string }>(
      `/api/teacher/classrooms/${classroomId}/close`,
      { method: "POST" },
    );
    setPendingAction(null);
    if (!result.success) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <section className="bg-card rounded-xl border p-5">
      <h2 className="font-semibold">班级邀请码</h2>
      <p className="mt-3 font-mono text-2xl tracking-widest">{joinCode}</p>
      <p className="text-muted-foreground mt-2 text-sm">
        学生输入此邀请码即可加入当前开放班级。
      </p>
      {!isClosed ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            className="border-input rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-60"
            disabled={pendingAction !== null}
            onClick={regenerateCode}
            type="button"
          >
            {pendingAction === "code" ? "正在生成…" : "重新生成邀请码"}
          </button>
          <button
            className="bg-destructive rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            disabled={pendingAction !== null}
            onClick={closeCurrentClassroom}
            type="button"
          >
            {pendingAction === "close" ? "正在关闭…" : "关闭班级"}
          </button>
        </div>
      ) : null}
      {error ? (
        <p
          className="bg-destructive/10 text-destructive mt-4 rounded-md p-3 text-sm"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
