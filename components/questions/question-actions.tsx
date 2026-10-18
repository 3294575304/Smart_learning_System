"use client";

import { LoaderCircle, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { requestQuestionApi } from "@/components/questions/request-api";
import type { DeleteQuestionResult } from "@/services/questions/types";

interface QuestionActionsProps {
  questionId: string;
  compact?: boolean;
}

export function QuestionActions({
  questionId,
  compact = false,
}: QuestionActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function remove() {
    if (
      !window.confirm(
        "确认归档这道题吗？已发布作业、判题配置和历史记录会继续保留，管理员可以恢复。",
      )
    ) {
      return;
    }
    setPending(true);
    const result = await requestQuestionApi<DeleteQuestionResult>(
      `/api/teacher/questions/${questionId}`,
      { method: "DELETE" },
    );
    setPending(false);
    if (!result.success) {
      window.alert(result.error);
      return;
    }
    window.alert("题目已归档，历史作业不受影响。");
    router.push("/teacher/questions");
    router.refresh();
  }

  const buttonClassName = compact
    ? "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-wait disabled:opacity-60 sm:text-sm"
    : "inline-flex shrink-0 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-wait disabled:opacity-60";

  return (
    <div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2">
      <Link
        aria-label="编辑题目"
        className={buttonClassName}
        href={`/teacher/questions/${questionId}/edit`}
        title="编辑题目"
      >
        <Pencil aria-hidden="true" className="size-4" />
        <span>编辑</span>
      </Link>
      <button
        aria-label={pending ? "正在归档题目" : "归档题目"}
        className={`${buttonClassName} border-red-200 text-red-700 hover:bg-red-50`}
        disabled={pending}
        onClick={remove}
        title="归档题目"
        type="button"
      >
        {pending ? (
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        ) : (
          <Trash2 aria-hidden="true" className="size-4" />
        )}
        <span>{pending ? "处理中…" : "归档"}</span>
      </button>
    </div>
  );
}
