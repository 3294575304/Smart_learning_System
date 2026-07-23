"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { requestAssignmentApi } from "@/components/assignments/request-api";
import type { PublishAssignmentResultsResult } from "@/services/assignments/types";

export function PublishResultsButton({
  assignmentId,
}: {
  assignmentId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  async function publish() {
    if (
      !window.confirm(
        "确认正式发布本作业所有已完成批改的成绩？发布后学生将看到总分、逐题结果、正确答案、解析和教师反馈。",
      )
    ) {
      return;
    }
    setPending(true);
    setMessage(null);
    const result = await requestAssignmentApi<PublishAssignmentResultsResult>(
      `/api/teacher/assignments/${assignmentId}/results/publish`,
      { method: "POST" },
    );
    setPending(false);
    if (!result.success) {
      setMessage({ kind: "error", text: result.error });
      return;
    }
    setMessage({
      kind: "success",
      text:
        result.data.publishedCount > 0
          ? `已正式发布 ${result.data.publishedCount} 份成绩`
          : "该作业成绩已经全部发布",
    });
    router.refresh();
  }

  return (
    <div className="space-y-2 text-right">
      <button
        className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        disabled={pending}
        onClick={() => void publish()}
        type="button"
      >
        {pending ? "发布中…" : "正式发布成绩"}
      </button>
      {message ? (
        <p
          className={
            message.kind === "error"
              ? "text-sm text-red-700"
              : "text-sm text-emerald-700"
          }
          role={message.kind === "error" ? "alert" : "status"}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
