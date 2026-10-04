"use client";
import { useCallback, useEffect, useState } from "react";
import { requestAssignmentApi } from "@/components/assignments/request-api";

type Attachment = {
  id: string;
  assignmentQuestionId: string;
  originalName: string;
  sizeBytes: number;
};
export function SubmissionAttachments({
  submissionId,
  questionId,
  editable = false,
  onPendingChange,
}: {
  submissionId: string;
  questionId: string;
  editable?: boolean;
  onPendingChange?: (pending: boolean) => void;
}) {
  const [files, setFiles] = useState<Attachment[]>([]);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const url = `/api/submissions/${submissionId}/attachments`;
  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await requestAssignmentApi<Attachment[]>(url, {
      method: "GET",
    });
    if (result.success) {
      setFiles(
        result.data.filter((file) => file.assignmentQuestionId === questionId),
      );
      setError(null);
    } else setError(result.error);
    setLoading(false);
  }, [url, questionId]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function upload(file: File) {
    setPending(true);
    onPendingChange?.(true);
    setError(null);
    const form = new FormData();
    form.set("file", file);
    form.set("assignmentQuestionId", questionId);
    const result = await requestAssignmentApi<{ id: string }>(url, {
      method: "POST",
      body: form,
    });
    if (result.success) await refresh();
    else setError(result.error);
    setPending(false);
    onPendingChange?.(false);
  }
  async function remove(id: string) {
    setPending(true);
    onPendingChange?.(true);
    const result = await requestAssignmentApi<{ deleted: boolean }>(
      `${url}/${id}`,
      { method: "DELETE" },
    );
    if (result.success) await refresh();
    else setError(result.error);
    setPending(false);
    onPendingChange?.(false);
  }
  return (
    <section
      className="mt-4 rounded-xl border bg-slate-50 p-4"
      aria-label="提交附件"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-medium">作业附件</h3>
        {editable && (
          <label className="cursor-pointer rounded-lg border bg-white px-3 py-2 text-sm">
            {pending ? "处理中…" : "添加截图或 PDF"}
            <input
              className="sr-only"
              aria-label="上传作业附件"
              type="file"
              accept="image/png,image/jpeg,application/pdf"
              disabled={pending || files.length >= 5}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {editable
          ? "每题最多 5 个文件，每个不超过 5 MB。请等待上传完成后提交作业。"
          : "点击文件下载查看学生提交材料。"}
      </p>
      {loading ? (
        <p className="mt-3 text-sm">正在加载附件…</p>
      ) : files.length ? (
        <ul className="mt-3 space-y-2">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center justify-between gap-3 rounded-lg bg-white p-3 text-sm"
            >
              <a
                className="min-w-0 break-all text-sky-700 underline"
                href={`${url}/${file.id}`}
              >
                {file.originalName}{" "}
                <span className="text-xs text-slate-500">
                  ({Math.ceil(file.sizeBytes / 1024)} KB)
                </span>
              </a>
              {editable && (
                <button
                  type="button"
                  disabled={pending}
                  className="shrink-0 text-red-600"
                  onClick={() => void remove(file.id)}
                >
                  移除
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-500">暂无附件。</p>
      )}
      {error && (
        <div role="alert" className="mt-3 text-sm text-red-700">
          {error}
          <button
            type="button"
            className="ml-3 underline"
            onClick={() => void refresh()}
          >
            重新加载
          </button>
        </div>
      )}
    </section>
  );
}
