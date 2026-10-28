"use client";
import { useEffect, useRef, useState, useId } from "react";
import { requestApi } from "@/components/courses/request-api";
import type { PracticeManagementView } from "@/services/practice-sets/management-schemas";
type Action = "RENAME" | "END" | "TRASH" | "RESTORE";
const labels: Record<Action, string> = {
  RENAME: "重命名",
  END: "结束练习",
  TRASH: "移入回收站",
  RESTORE: "恢复记录",
};
export function PracticeManagementActions({
  id,
  title,
  management,
  active,
  onChange,
  batch,
  primaryRestore,
}: {
  id: string;
  title: string;
  management?: PracticeManagementView;
  active: boolean;
  primaryRestore?: boolean;
  onChange: () => void;
  batch?: {
    action: "TRASH" | "RESTORE";
    items: Array<{ id: string; expectedRevision: number }>;
  };
}) {
  const [action, setAction] = useState<Action | null>(null),
    [name, setName] = useState(title),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(false);
  const dialogTitle = useId();
  const dialog = useRef<HTMLDialogElement>(null),
    sending = useRef(false);
  useEffect(() => {
    if (action && !dialog.current?.open) dialog.current?.showModal();
  }, [action]);
  function open(next: Action) {
    setConflict(false);
    setName(title);
    setError("");
    setAction(next);
  }
  function close() {
    if (sending.current) return;
    dialog.current?.close();
    setAction(null);
    setError("");
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!action || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await requestApi<unknown>(
        batch
          ? "/api/student/practice-sets/batch"
          : `/api/student/practice-sets/${encodeURIComponent(id)}`,
        {
          method: batch ? "POST" : "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            batch
              ? { action: batch.action, items: batch.items }
              : {
                  action,
                  expectedRevision: management?.revision ?? 0,
                  ...(action === "RENAME" ? { title: name.trim() } : {}),
                },
          ),
        },
      );
      if (!response.success) {
        setConflict(response.status === 409);
        setError(response.error);
        return;
      }
      dialog.current?.close();
      setAction(null);
      onChange();
    } catch {
      setError("操作失败，请重试。");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      {batch ? (
        <button
          type="button"
          disabled={!batch.items.length}
          onClick={() => open(batch.action)}
          className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
        >
          {batch.action === "TRASH" ? "删除所选" : "恢复所选"}（
          {batch.items.length}）
        </button>
      ) : primaryRestore ? (
        <button
          type="button"
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white"
          onClick={() => open("RESTORE")}
        >
          恢复记录
        </button>
      ) : (
        <details className="relative text-sm">
          <summary
            className="cursor-pointer rounded-lg border bg-white px-3 py-2"
            aria-label={`管理${title}`}
          >
            更多
          </summary>
          <div className="absolute right-0 z-20 mt-1 min-w-36 space-y-1 rounded-lg border bg-white p-2 shadow-lg">
            {(management?.trashedAt
              ? ["RESTORE"]
              : active
                ? ["RENAME", "END", "TRASH"]
                : ["RENAME", "TRASH"]
            ).map((value) => (
              <button
                key={value}
                type="button"
                className="block w-full rounded px-3 py-2 text-left hover:bg-sky-50 focus-visible:outline-sky-600"
                onClick={() => open(value as Action)}
              >
                {labels[value as Action]}
              </button>
            ))}
          </div>
        </details>
      )}
      <dialog
        ref={dialog}
        aria-labelledby={dialogTitle}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl border p-0 shadow-xl backdrop:bg-sky-100/70"
      >
        <form
          onSubmit={(event) => void submit(event)}
          className="space-y-4 p-5"
          aria-busy={busy}
        >
          <h2 id={dialogTitle} className="text-lg font-semibold">
            {action ? labels[action] : "管理练习"}
            {batch ? ` · ${batch.items.length} 组` : ""}
          </h2>
          {!batch ? (
            <p className="text-sm font-medium [overflow-wrap:anywhere] break-words">
              {title}
            </p>
          ) : null}
          {action === "RENAME" ? (
            <label className="block text-sm">
              练习名称
              <input
                autoFocus
                required
                maxLength={80}
                value={name}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
                className="mt-2 w-full rounded-lg border p-2"
              />
            </label>
          ) : (
            <p className="text-sm leading-6 text-slate-600">
              {action === "TRASH"
                ? "移入回收站后，进行中的练习会同时结束。恢复后只能回看，不能继续作答；原始答案、成绩和学习记录保留。已排队判题会继续完成并保留反馈。"
                : action === "END"
                  ? "结束后只能回看，不能继续作答。已提交答案保留，已排队判题会继续完成并保留反馈。"
                  : "恢复到历史记录后可以只读查看题目、本人答案和已有反馈，不能重新作答。"}
            </p>
          )}
          {conflict ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                close();
                onChange();
              }}
              className="text-sm text-sky-700 underline"
            >
              刷新记录后重试
            </button>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={close}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              取消
            </button>
            <button
              disabled={busy || (action === "RENAME" && !name.trim())}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              type="submit"
            >
              {busy ? "处理中…" : "确认"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
