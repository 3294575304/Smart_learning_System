"use client";

import { Ellipsis } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { assignmentDraftAction } from "@/services/assignments/draft-action";
import { EditorDialog } from "./editor-dialog";
import { requestAssignmentApi } from "./request-api";

export function DraftManagementMenu({
  id,
  title,
  classroom,
  action,
  updatedAt,
  submissionCount,
}: {
  id: string;
  title: string;
  classroom: string;
  action:
    | NonNullable<ReturnType<typeof assignmentDraftAction>>
    | "REVOKE"
    | "COPY_REVOKED";
  submissionCount?: number;
  updatedAt: string;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const copyRequest = useRef<string | null>(null);
  const labels = {
    DELETE_DRAFT: "删除草稿",
    CANCEL_SCHEDULE: "取消预约",
    REVOKE: "撤销误发",
    COPY_REVOKED: "复制为草稿",
  };
  const descriptions = {
    DELETE_DRAFT: "确认后，这份草稿将从作业管理移除。",
    CANCEL_SCHEDULE:
      "确认后，原预约和通知将失效。作业会退回草稿，可编辑后重新发布。",
    REVOKE:
      "本班学生将收到站内通知。确认后这份作业会立即从作业管理删除，不进入历史作业；已有作答与评分快照仅保留在数据库中供追溯。",
    COPY_REVOKED:
      "将在本班新建草稿。题库题以当前可用版本复制，请核对题目、附件和时间后再发布。",
  };
  const success = {
    DELETE_DRAFT: "草稿已删除。",
    CANCEL_SCHEDULE: "预约已取消，作业已退回草稿。",
    REVOKE: "作业已撤销并删除。",
    COPY_REVOKED: "草稿已创建。",
  };
  const label = labels[action];
  useEffect(() => {
    if (done) closeButton.current?.focus();
  }, [done]);

  function close() {
    if (inFlight.current) return;
    setOpen(false);
    if (done || error) window.location.reload();
  }
  async function confirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const result = await requestAssignmentApi<{ assignmentId?: string }>(
      `/api/teacher/assignments/${id}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          action === "COPY_REVOKED"
            ? {
                action,
                requestId: (copyRequest.current ??= crypto.randomUUID()),
              }
            : {
                action,
                expectedUpdatedAt: updatedAt,
                ...(action === "REVOKE" ? { reason: reason.trim() } : {}),
              },
        ),
      },
    );
    inFlight.current = false;
    setBusy(false);
    if (!result.success) setError(result.error);
    else if (action === "COPY_REVOKED" && result.data.assignmentId)
      window.location.assign(
        `/teacher/assignments/${result.data.assignmentId}/edit`,
      );
    else setDone(true);
  }
  return (
    <>
      <details
        ref={menu}
        className="relative"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            event.currentTarget.open = false;
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.currentTarget.open = false;
            trigger.current?.focus();
          }
        }}
      >
        <summary
          ref={trigger}
          aria-label={`更多操作：${title}`}
          className="flex h-10 cursor-pointer list-none items-center gap-1 rounded-xl border px-3 text-sm text-slate-700 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-sky-700 [&::-webkit-details-marker]:hidden"
        >
          <Ellipsis aria-hidden="true" className="size-4" />
          更多
        </summary>
        <div className="absolute end-0 top-full z-10 mt-1 w-32 rounded-xl border bg-white p-1 shadow-md">
          <button
            type="button"
            className="min-h-10 w-full rounded-lg px-3 text-start text-sm text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-700"
            onClick={() => {
              if (menu.current) menu.current.open = false;
              trigger.current?.focus();
              setDone(false);
              setReason("");
              setError(null);
              setOpen(true);
            }}
          >
            {label}
          </button>
        </div>
      </details>
      <EditorDialog open={open} busy={busy} title={label} onClose={close}>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 rounded-lg bg-slate-50 p-3 text-sm">
          <dt className="text-slate-600">作业</dt>
          <dd className="min-w-0 font-medium [overflow-wrap:anywhere]">
            {title}
          </dd>
          <dt className="text-slate-600">教学班</dt>
          <dd className="min-w-0 [overflow-wrap:anywhere]">{classroom}</dd>
          {action === "REVOKE" && (
            <>
              <dt className="text-slate-600">已有有效提交</dt>
              <dd>{submissionCount ?? 0} 人</dd>
            </>
          )}
        </dl>
        <p role="status" className="mt-4 text-sm leading-6 text-slate-700">
          {done ? success[action] : descriptions[action]}
        </p>
        {action === "REVOKE" && !done && (
          <label className="mt-4 block space-y-1 text-sm">
            <span>撤销原因（选填，仅用于审计）</span>
            <textarea
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={busy}
              className="min-h-20 w-full rounded-lg border p-3"
            />
          </label>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={close}
            ref={closeButton}
            disabled={busy}
            className="h-10 rounded-xl border px-4 text-sm focus-visible:outline-2 focus-visible:outline-sky-700"
          >
            {done ? "完成" : "取消"}
          </button>
          {!done && (
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="h-10 rounded-xl bg-red-700 px-4 text-sm font-medium text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800 disabled:opacity-60"
            >
              {busy ? "处理中…" : `确认${label}`}
            </button>
          )}
        </div>
      </EditorDialog>
    </>
  );
}
