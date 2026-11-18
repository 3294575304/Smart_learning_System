"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { requestAssignmentApi } from "@/components/assignments/request-api";
import { AttachmentDropZone } from "./attachment-drop-zone";
import {
  SUBMISSION_ATTACHMENT_ACCEPT,
  SUBMISSION_ATTACHMENT_FORMATS,
} from "@/services/assignments/attachment-formats";

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
  const pendingRef = useRef(false);
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
  const uploadDisabled = !editable || loading || pending || files.length >= 5;
  function changePending(value: boolean) {
    pendingRef.current = value;
    setPending(value);
    onPendingChange?.(value);
  }
  async function upload(selected: File[]) {
    if (uploadDisabled || pendingRef.current || !selected.length) return;
    if (files.length + selected.length > 5) {
      setError("每道题最多上传 5 个附件，请减少本次选择的文件");
      return;
    }
    changePending(true);
    setError(null);
    try {
      let failure: string | undefined;
      for (const file of selected) {
        const form = new FormData();
        form.set("file", file);
        form.set("assignmentQuestionId", questionId);
        const result = await requestAssignmentApi<{ id: string }>(url, {
          method: "POST",
          body: form,
        });
        if (!result.success) {
          failure = `${file.name}：${result.error}`;
          break;
        }
      }
      await refresh();
      if (failure) setError(failure);
    } finally {
      changePending(false);
    }
  }
  async function remove(id: string) {
    if (!editable || pendingRef.current) return;
    changePending(true);
    try {
      const result = await requestAssignmentApi<{ deleted: boolean }>(
        `${url}/${id}`,
        { method: "DELETE" },
      );
      if (result.success) await refresh();
      else setError(result.error);
    } finally {
      changePending(false);
    }
  }
  return (
    <AttachmentDropZone
      className="mt-4 rounded-xl border bg-slate-50 p-4"
      label="提交附件"
      disabled={uploadDisabled}
      onFiles={(selected) => void upload(selected)}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-medium">作业附件</h3>
        {editable && (
          <label className="cursor-pointer rounded-lg border bg-white px-3 py-2 text-sm">
            {pending ? "处理中…" : "添加附件"}
            <input
              className="sr-only"
              aria-label="上传作业附件"
              type="file"
              multiple
              accept={SUBMISSION_ATTACHMENT_ACCEPT}
              disabled={uploadDisabled}
              onChange={(e) => {
                void upload(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {editable
          ? `可将文件拖到此处或点击添加附件。支持 ${SUBMISSION_ATTACHMENT_FORMATS}，每题最多 5 个，每个不超过 5 MB。请等待上传完成后提交作业。`
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
    </AttachmentDropZone>
  );
}
