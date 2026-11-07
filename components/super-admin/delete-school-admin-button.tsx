"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { requestAdminApi } from "@/components/admin/request-api";

export function DeleteSchoolAdminButton({
  admin,
}: {
  admin: { id: string; displayName: string };
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (pending) return;
    if (
      !window.confirm(
        `确认删除管理员“${admin.displayName}”吗？删除后该账号将无法登录，现有登录会话立即失效，历史业务和审计记录保留。`,
      )
    )
      return;
    setPending(true);
    setError(null);
    const result = await requestAdminApi<{ id: string }>(
      `/api/super-admin/admins/${encodeURIComponent(admin.id)}`,
      { method: "DELETE" },
    );
    if (!result.success) {
      setError(result.error);
      setPending(false);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        aria-label={`删除管理员账号 ${admin.displayName}`}
        className="inline-flex items-center gap-1.5 rounded-md border border-red-100 bg-white px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-400"
      >
        <Trash2 aria-hidden="true" className="size-3.5" />
        {pending ? "正在删除…" : "删除"}
      </button>
      {error ? (
        <p role="alert" className="mt-2 max-w-xs text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
