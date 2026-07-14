"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { requestApi } from "@/components/classrooms/request-api";

interface RemoveStudentButtonProps {
  classroomId: string;
  membershipId: string;
  studentName: string;
}

export function RemoveStudentButton({
  classroomId,
  membershipId,
  studentName,
}: RemoveStudentButtonProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function removeStudent() {
    if (
      !window.confirm(
        `确定将“${studentName}”移出班级吗？历史作业和成绩会保留。`,
      )
    ) {
      return;
    }
    setIsPending(true);
    setError(null);
    const result = await requestApi<{ membershipId: string }>(
      `/api/teacher/classrooms/${classroomId}/members/${membershipId}`,
      { method: "DELETE" },
    );
    setIsPending(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="text-right">
      <button
        className="text-destructive text-sm underline disabled:opacity-60"
        disabled={isPending}
        onClick={removeStudent}
        type="button"
      >
        {isPending ? "正在移除…" : "移除"}
      </button>
      {error ? <p className="text-destructive mt-1 text-xs">{error}</p> : null}
    </div>
  );
}
