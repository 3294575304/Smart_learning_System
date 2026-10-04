"use client";

import { LoaderCircle, ToggleLeft, ToggleRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { requestApi } from "@/components/courses/request-api";

export function CourseTemplateActions({
  templateId,
  isActive,
}: {
  templateId: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"enable" | "disable" | null>(null);

  async function toggleTemplate() {
    const nextAction = isActive ? "disable" : "enable";
    const message = isActive
      ? "确认停用这个课程模板吗？停用后教师将不能用它创建新课程。"
      : "确认启用这个课程模板吗？";
    if (!window.confirm(message)) return;

    setPending(nextAction);
    const result = await requestApi<{ id: string }>(
      `/api/admin/course-templates/${templateId}/${nextAction}`,
      { method: "POST" },
    );
    setPending(null);
    if (!result.success) {
      window.alert(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <button
      aria-label={isActive ? "停用课程模板" : "启用课程模板"}
      className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-white px-2.5 py-2 text-xs font-medium text-blue-700 transition hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
      disabled={pending !== null}
      onClick={() => void toggleTemplate()}
      title={isActive ? "停用课程模板" : "启用课程模板"}
      type="button"
    >
      {pending ? (
        <>
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          处理中...
        </>
      ) : isActive ? (
        <>
          <ToggleLeft className="h-4 w-4" />
          停用
        </>
      ) : (
        <>
          <ToggleRight className="h-4 w-4" />
          启用
        </>
      )}
    </button>
  );
}
