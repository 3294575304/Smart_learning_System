"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { requestAssignmentApi } from "@/components/assignments/request-api";
import type { TeacherSubmissionDetail } from "@/services/assignments/types";

interface Props {
  assignmentId: string;
  submissionId: string;
}

export function CompleteGradingButton({ assignmentId, submissionId }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function complete() {
    if (
      !window.confirm(
        "确认完成整份批改？完成后需通过作业级发布才能对学生公开成绩。",
      )
    ) {
      return;
    }
    setPending(true);
    setError(null);
    const result = await requestAssignmentApi<TeacherSubmissionDetail>(
      `/api/teacher/assignments/${assignmentId}/submissions/${submissionId}/complete`,
      { method: "POST" },
    );
    setPending(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <button
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        disabled={pending}
        onClick={() => void complete()}
        type="button"
      >
        {pending ? "正在完成批改…" : "完成整份批改"}
      </button>
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
