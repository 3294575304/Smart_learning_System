"use client";

import { Copy, LoaderCircle, Pencil, Trash2 } from "lucide-react";
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
  canCopy: boolean;
  compact?: boolean;
}

export function QuestionActions({
  questionId,
  canEdit,
  canDelete,
  canCopy,
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

  const buttonClassName = compact
    ? "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-wait disabled:opacity-60 sm:text-sm"
    : "inline-flex shrink-0 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-wait disabled:opacity-60";

  return (
    <div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2">
      {canEdit ? (
        <Link
          aria-label="编辑题目"
          className={buttonClassName}
          href={`/teacher/questions/${questionId}/edit`}
          title="编辑题目"
        >
          <Pencil aria-hidden="true" className="size-4" />
          <span>编辑</span>
        </Link>
      ) : null}
      {canCopy ? (
        <button
          aria-label={pending === "copy" ? "正在复制题目" : "复制到我的题库"}
          className={`${buttonClassName} border-blue-200 text-blue-700 hover:bg-blue-50`}
          disabled={pending !== null}
          onClick={copy}
          title="复制到我的题库"
          type="button"
        >
          {pending === "copy" ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <Copy aria-hidden="true" className="size-4" />
          )}
          <span>{pending === "copy" ? "复制中…" : "复制"}</span>
        </button>
      ) : null}
      {canDelete ? (
        <button
          aria-label={pending === "delete" ? "正在删除题目" : "删除题目"}
          className={`${buttonClassName} border-red-200 text-red-700 hover:bg-red-50`}
          disabled={pending !== null}
          onClick={remove}
          title="删除题目"
          type="button"
        >
          {pending === "delete" ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <Trash2 aria-hidden="true" className="size-4" />
          )}
          <span>{pending === "delete" ? "处理中…" : "删除"}</span>
        </button>
      ) : null}
    </div>
  );
}
