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
  const [success, setSuccess] = useState(false);
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

  async function completeCurrentClassroom() {
    if (
      !window.confirm(
        "确认结课后将停止学生作答、入班及新教学活动，作业转入历史。已有成员与数据保留，仍可完成批改、发布成绩和生成报告。确定结课吗？",
      )
    ) {
      return;
    }
    setPendingAction("close");
    setError(null);
    const result = await requestApi<{ id: string }>(
      `/api/teacher/classrooms/${classroomId}/complete`,
      { method: "POST" },
    );
    setPendingAction(null);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setSuccess(true);
    router.refresh();
  }

  return (
    <section className="bg-card rounded-xl border p-5">
      <h2 className="font-semibold">
        {isClosed ? "班级教学状态" : "班级邀请码"}
      </h2>
      {!isClosed ? (
        <p className="mt-3 font-mono text-2xl tracking-widest">{joinCode}</p>
      ) : null}
      <p className="text-muted-foreground mt-2 text-sm">
        {isClosed
          ? "班级已停止新教学活动，成员和历史数据保留。可继续批改、发布成绩与生成报告。"
          : "学生输入此邀请码即可加入授课中的班级。"}
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
            className="rounded-md bg-sky-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            disabled={pendingAction !== null}
            onClick={completeCurrentClassroom}
            type="button"
          >
            {pendingAction === "close" ? "正在结课…" : "确认结课"}
          </button>
        </div>
      ) : null}
      {success ? (
        <p role="status" className="mt-3 text-sm text-emerald-700">
          已确认结课，作业已转入历史作业。
        </p>
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
