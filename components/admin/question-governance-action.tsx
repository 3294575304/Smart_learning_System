"use client";

import { QuestionStatus, QuestionVisibility } from "@prisma/client";
import { Ban, Globe, LoaderCircle, ShieldOff } from "lucide-react";
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

  async function updateVisibility() {
    const makingPublic = question.visibility === QuestionVisibility.PRIVATE;
    const message = makingPublic
      ? `确认将“${question.title}”设为公共题目吗？所有教师都将可以查看和复制。`
      : `确认撤销“${question.title}”的公共状态吗？历史作业快照不会受到影响。`;
    if (!window.confirm(message)) return;
    setPending(true);
    const result = await requestAdminApi<AdminQuestionView>(
      `/api/admin/questions/${question.id}/visibility`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          visibility: makingPublic
            ? QuestionVisibility.PUBLIC
            : QuestionVisibility.PRIVATE,
        }),
      },
    );
    setPending(false);
    if (!result.success) {
      window.alert(result.error);
      return;
    }
    router.refresh();
  }

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

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        aria-label={
          question.visibility === QuestionVisibility.PUBLIC
            ? "撤销公共题目"
            : "设为公共题目"
        }
        className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-white px-2.5 py-2 text-xs font-medium text-blue-700 transition hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
        disabled={pending || question.status !== QuestionStatus.ACTIVE}
        onClick={updateVisibility}
        title={
          question.visibility === QuestionVisibility.PUBLIC
            ? "撤销公共状态"
            : "设为公共"
        }
        type="button"
      >
        {pending ? (
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        ) : question.visibility === QuestionVisibility.PUBLIC ? (
          <ShieldOff aria-hidden="true" className="size-4" />
        ) : (
          <Globe aria-hidden="true" className="size-4" />
        )}
        {pending
          ? "处理中…"
          : question.visibility === QuestionVisibility.PUBLIC
            ? "撤销公共"
            : "设为公共"}
      </button>
      {question.status === QuestionStatus.ACTIVE ? (
        <button
          aria-label="停用题目"
          className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 py-2 text-xs font-medium text-red-700 transition hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
          disabled={pending}
          onClick={disable}
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
