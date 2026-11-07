"use client";

import { Copy } from "lucide-react";
import { useRef, useState } from "react";
import { EditorDialog } from "./editor-dialog";
import { requestAssignmentApi } from "./request-api";

export function HistoricalAssignmentCopy({
  assignmentId,
  sourceClassroomId,
  targets,
}: {
  assignmentId: string;
  sourceClassroomId: string;
  targets: Array<{ id: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(
    targets.find((room) => room.id === sourceClassroomId)?.id ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<{ target: string; id: string } | null>(null);
  const inFlight = useRef(false);
  async function copy() {
    if (!target || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    if (request.current?.target !== target)
      request.current = { target, id: crypto.randomUUID() };
    const response = await requestAssignmentApi<{ assignmentId: string }>(
      `/api/teacher/assignments/${assignmentId}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "COPY_HISTORY",
          classroomId: target,
          requestId: request.current.id,
        }),
      },
    );
    if (response.success) {
      window.location.assign(
        `/teacher/assignments/${response.data.assignmentId}/edit`,
      );
    } else {
      setError(response.error);
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-sm text-sky-800 hover:bg-sky-50"
      >
        <Copy aria-hidden="true" className="size-4" />
        复制到新草稿
      </button>
      <EditorDialog
        open={open}
        busy={busy}
        title="复制到新草稿"
        onClose={() => setOpen(false)}
      >
        <p className="mt-3 text-sm leading-6 text-slate-600">
          复制题序、分值和可用附件。题库题采用当前版本，创建后可设置本次发布时间和截止时间。
        </p>
        <label className="mt-4 block space-y-1 text-sm font-medium">
          本次教学班
          <select
            value={target}
            disabled={busy}
            onChange={(e) => setTarget(e.target.value)}
            className="h-10 w-full min-w-0 rounded-lg border px-3 font-normal"
          >
            <option value="" disabled>
              请选择班级
            </option>
            {targets.map((room) => (
              <option key={room.id} value={room.id}>
                {room.label}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p role="alert" className="mt-3 text-sm text-rose-800">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={busy}
            className="h-10 rounded-lg border px-4"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void copy()}
            disabled={!target || busy}
            className="h-10 rounded-lg bg-sky-700 px-4 text-white disabled:opacity-50"
          >
            {busy ? "正在复制…" : "创建草稿并编辑"}
          </button>
        </div>
      </EditorDialog>
    </>
  );
}
