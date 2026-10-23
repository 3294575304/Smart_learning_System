"use client";

import { useRouter } from "next/navigation";
import { markTeacherWorkspaceDirty } from "@/components/dashboard/teacher-workspace-refresh";
import { useState } from "react";

import { requestAssignmentApi } from "@/components/assignments/request-api";
import type { PublishAssignmentResultsResult } from "@/services/assignments/types";

export function PublishResultsButton({
  assignmentId,
  publication,
}: {
  assignmentId: string;
  publication: {
    canPublish: boolean;
    pendingCount: number;
    gradedCount: number;
    publishedCount: number;
  };
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
        "确认公布每名学生最新有效提交的成绩？发布后学生将看到总分、逐题结果、正确答案、解析和教师反馈。",
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
    markTeacherWorkspaceDirty();
    router.refresh();
  }

  return (
    <div className="space-y-2 text-right">
      <button
        className="rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        disabled={pending || !publication.canPublish}
        onClick={() => void publish()}
        type="button"
      >
        {pending
          ? "公布中…"
          : publication.canPublish
            ? `公布给学生（${publication.gradedCount}份）`
            : publication.pendingCount
              ? "尚有提交待批改"
              : publication.publishedCount
                ? "成绩已全部公布"
                : "暂无可公布成绩"}
      </button>
      <p className="max-w-sm text-xs leading-5 text-slate-500">
        公布后学生可见分数、答案、解析和反馈；完成的待公布事项会从工作台移除。
        {publication.pendingCount
          ? ` 还有${publication.pendingCount}份最新提交未完成批改。`
          : ""}
      </p>
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
