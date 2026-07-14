"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { requestApi } from "@/components/classrooms/request-api";

interface LeaveClassroomButtonProps {
  classroomId: string;
  classroomName: string;
}

export function LeaveClassroomButton({
  classroomId,
  classroomName,
}: LeaveClassroomButtonProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leave() {
    if (!window.confirm(`确定退出“${classroomName}”吗？`)) {
      return;
    }
    setIsPending(true);
    setError(null);
    const result = await requestApi<{ classroomId: string }>(
      `/api/student/classrooms/${classroomId}/leave`,
      { method: "POST" },
    );
    setIsPending(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-4">
      <button
        className="text-destructive text-sm underline disabled:opacity-60"
        disabled={isPending}
        onClick={leave}
        type="button"
      >
        {isPending ? "正在退出…" : "退出班级"}
      </button>
      {error ? <p className="text-destructive mt-2 text-sm">{error}</p> : null}
    </div>
  );
}
