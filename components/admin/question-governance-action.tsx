"use client";

import { QuestionStatus } from "@prisma/client";
import { Ban, LoaderCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { requestAdminApi } from "@/components/admin/request-api";
import type { AdminQuestionView } from "@/services/admin/questions/types";

export function QuestionGovernanceAction({
  question,
}: {
  question: AdminQuestionView;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function disable() {
    if (
      !window.confirm(
        `确认停用“${question.title}”吗？该操作不会删除历史作业、提交或成绩。`,
      )
    )
      return;
    setPending(true);
    const result = await requestAdminApi<AdminQuestionView>(
      `/api/admin/questions/${question.id}/status`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: QuestionStatus.INACTIVE }),
      },
    );
    setPending(false);
    if (!result.success) {
      window.alert(result.error);
      return;
    }
    router.refresh();
  }

  async function restore() {
    if (!window.confirm(`确认恢复“${question.title}”吗？`)) return;
    setPending(true);
    const result = await requestAdminApi<AdminQuestionView>(
      `/api/admin/questions/${question.id}/restore`,
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
    <div className="flex flex-wrap items-center gap-2">
      {question.status === QuestionStatus.ARCHIVED ? (
        <button
          aria-label="恢复归档题目"
          className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-white px-2.5 py-2 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none disabled:opacity-50 sm:text-sm"
          disabled={pending || !question.archivedFromStatus}
          onClick={() => void restore()}
          type="button"
        >
          {pending ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <RefreshCw aria-hidden="true" className="size-4" />
          )}
          恢复
        </button>
      ) : question.status === QuestionStatus.ACTIVE ? (
        <button
          aria-label="停用题目"
          className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 py-2 text-xs font-medium text-red-700 transition hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none disabled:opacity-50 sm:text-sm"
          disabled={pending}
          onClick={() => void disable()}
          title="停用题目"
          type="button"
        >
          {pending ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <Ban aria-hidden="true" className="size-4" />
          )}
          停用
        </button>
      ) : null}
    </div>
  );
}
