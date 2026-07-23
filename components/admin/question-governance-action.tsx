"use client";

import { QuestionStatus, QuestionVisibility } from "@prisma/client";
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
    <div className="flex flex-wrap gap-3">
      <button
        className="text-sm text-blue-700 disabled:text-gray-400"
        disabled={pending || question.status !== QuestionStatus.ACTIVE}
        onClick={updateVisibility}
        type="button"
      >
        {pending
          ? "处理中…"
          : question.visibility === QuestionVisibility.PUBLIC
            ? "撤销公共"
            : "设为公共"}
      </button>
      {question.status === QuestionStatus.ACTIVE ? (
        <button
          className="text-sm text-red-600 disabled:text-gray-400"
          disabled={pending}
          onClick={disable}
          type="button"
        >
          停用
        </button>
      ) : null}
    </div>
  );
}
