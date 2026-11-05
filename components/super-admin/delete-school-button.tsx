"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { requestAdminApi } from "@/components/admin/request-api";

export function DeleteSchoolButton({
  schoolId,
  schoolName,
  boundUsers,
}: {
  schoolId: string;
  schoolName: string;
  boundUsers: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  async function remove() {
    if (!window.confirm(`确认删除合作学校“${schoolName}”吗？此操作不可撤销。`))
      return;
    setPending(true);
    setFeedback(null);
    const result = await requestAdminApi<{ id: string }>(
      `/api/super-admin/schools/${encodeURIComponent(schoolId)}`,
      { method: "DELETE" },
    );
    if (!result.success) {
      setFeedback(result.error);
      setPending(false);
      return;
    }
    setFeedback("合作学校已删除");
    router.refresh();
  }
  return (
    <div className="min-w-32">
      <button
        type="button"
        onClick={remove}
        disabled={pending || boundUsers > 0}
        title={
          boundUsers > 0
            ? `仍有 ${boundUsers} 个绑定账号，请先处理绑定关系`
            : `删除合作学校 ${schoolName}`
        }
        aria-label={`删除合作学校 ${schoolName}`}
        className="inline-flex items-center gap-1.5 rounded-md border border-red-100 bg-white px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
      >
        <Trash2 aria-hidden="true" className="size-3.5" />
        {pending ? "正在删除…" : "删除"}
      </button>
      {boundUsers > 0 ? (
        <p className="mt-1 text-xs text-slate-400">
          已有 {boundUsers} 个绑定账号
        </p>
      ) : null}
      {feedback ? (
        <p role="status" className="mt-2 max-w-xs text-xs text-slate-600">
          {feedback}
        </p>
      ) : null}
    </div>
  );
}
