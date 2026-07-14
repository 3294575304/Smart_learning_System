"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { requestQuestionApi } from "@/components/questions/request-api";
import type {
  DeleteQuestionResult,
  QuestionDetail,
} from "@/services/questions/types";

interface QuestionActionsProps {
  questionId: string;
  canEdit: boolean;
  canDelete: boolean;
  compact?: boolean;
}

export function QuestionActions({
  questionId,
  canEdit,
  canDelete,
  compact = false,
}: QuestionActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState<"copy" | "delete" | null>(null);

  async function copy() {
    setPending("copy");
    const result = await requestQuestionApi<QuestionDetail>(
      `/api/teacher/questions/${questionId}/copy`,
      { method: "POST" },
    );
    setPending(null);
    if (!result.success) {
      window.alert(result.error);
      return;
    }
    router.push(`/teacher/questions/${result.data.id}/edit`);
    router.refresh();
  }

  async function remove() {
    if (
      !window.confirm(
        "确认删除这道题吗？系统会先检查作业及其他引用；有引用时将改为归档。",
      )
    ) {
      return;
    }
    setPending("delete");
    const result = await requestQuestionApi<DeleteQuestionResult>(
      `/api/teacher/questions/${questionId}`,
      { method: "DELETE" },
    );
    setPending(null);
    if (!result.success) {
      window.alert(result.error);
      return;
    }
    window.alert(
      result.data.mode === "ARCHIVED"
        ? "该题已有引用，已安全归档，历史作业不受影响。"
        : "题目已删除。",
    );
    router.push("/teacher/questions?scope=OWNED");
    router.refresh();
  }

  const className = compact
    ? "text-sm underline underline-offset-4"
    : "rounded-md border px-3 py-2 text-sm";

  return (
    <div className="flex flex-wrap gap-2">
      {canEdit ? (
        <Link
          className={className}
          href={`/teacher/questions/${questionId}/edit`}
        >
          编辑
        </Link>
      ) : null}
      <button
        className={className}
        disabled={pending !== null}
        onClick={copy}
        type="button"
      >
        {pending === "copy" ? "复制中…" : "复制"}
      </button>
      {canDelete ? (
        <button
          className={`${className} text-red-600`}
          disabled={pending !== null}
          onClick={remove}
          type="button"
        >
          {pending === "delete" ? "处理中…" : "删除"}
        </button>
      ) : null}
    </div>
  );
}
