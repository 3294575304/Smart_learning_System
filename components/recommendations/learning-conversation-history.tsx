"use client";
import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AssistantPanelActiveContext } from "./practice-panel-context";
import { requestApi } from "@/components/courses/request-api";
import type {
  LearningConversationList,
  LearningConversationDetail,
} from "@/services/learning-assistant/schemas";
export function LearningConversationHistory({
  courseId,
  revision,
  pending,
  onRestore,
  onDelete,
  reflectionHistory,
}: {
  courseId: string;
  revision: string;
  pending: boolean;
  onRestore: (conversation: LearningConversationDetail) => void;
  onDelete: (id: string) => void;
  reflectionHistory?: ReactNode;
}) {
  const activePanel = useContext(AssistantPanelActiveContext);
  const autoOpened = useRef(false);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<LearningConversationList | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (
      activePanel &&
      !autoOpened.current &&
      window.matchMedia("(min-width: 1024px)").matches
    ) {
      autoOpened.current = true;
      setOpen(true);
    }
  }, [activePanel]);
  const base = `/api/student/courses/${encodeURIComponent(courseId)}/learning-assistant`;
  useEffect(() => {
    if (!open || !activePanel) return;
    let active = true;
    setBusy(true);
    setError("");
    void requestApi<LearningConversationList>(base, { method: "GET" }).then(
      (response) => {
        if (!active) return;
        setBusy(false);
        if (response.success) setResult(response.data);
        else setError(response.error);
      },
    );
    return () => {
      active = false;
    };
  }, [open, activePanel, base, revision, retry]);
  async function loadMore() {
    if (!result?.nextPage || busy) return;
    setBusy(true);
    const response = await requestApi<LearningConversationList>(
      `${base}?page=${result.nextPage}`,
      { method: "GET" },
    );
    setBusy(false);
    if (response.success)
      setResult({
        ...response.data,
        items: [...result.items, ...response.data.items],
      });
    else setError(response.error);
  }
  async function restore(id: string) {
    setBusy(true);
    setError("");
    const response = await requestApi<LearningConversationDetail>(
      `${base}/conversations/${encodeURIComponent(id)}`,
      { method: "GET" },
    );
    setBusy(false);
    if (response.success) {
      onRestore(response.data);
      document
        .getElementById("learning-assistant-conversation")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else setError(response.error);
  }
  async function remove(id: string) {
    if (
      !window.confirm(
        "删除这段 AI 对话？删除后无法恢复，已单独保存的学习反思会保留。",
      )
    )
      return;
    setBusy(true);
    setError("");
    const response = await requestApi<{ deleted: boolean }>(
      `${base}/conversations/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    setBusy(false);
    if (!response.success) {
      setError(response.error);
      return;
    }
    setResult((value) =>
      value
        ? { ...value, items: value.items.filter((item) => item.id !== id) }
        : value,
    );
    onDelete(id);
  }
  return (
    <details
      open={open}
      className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm font-medium">
        AI 历史对话
      </summary>
      {open && (
        <div className="mt-4 max-h-[65vh] space-y-3 overflow-y-auto overscroll-contain pr-1">
          <p className="text-xs leading-6 text-slate-500">
            当前课程的对话按最近交流时间排序。选择“查看 /
            继续对话”可恢复完整记录；历史掌握情况代表当时状态，不计入成绩。
          </p>
          {busy && (
            <p role="status" className="text-sm text-sky-700">
              正在加载对话…
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}{" "}
              <button
                type="button"
                onClick={() => setRetry((value) => value + 1)}
                className="underline"
              >
                重试
              </button>
            </p>
          )}
          {result && !result.items.length && !busy && (
            <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
              暂无历史对话。向 AI 提问后，问答会自动保存到这里。
            </p>
          )}
          <div className="divide-y">
            {result?.items.map((item) => (
              <article
                key={item.id}
                className="flex flex-wrap items-center gap-2 rounded-lg py-3"
              >
                <div className="min-w-0 basis-full">
                  <h3 className="truncate text-sm font-medium">{item.title}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.topic.name} · {item.turnCount} 轮 ·{" "}
                    {new Date(item.updatedAt).toLocaleString("zh-CN")}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy || pending}
                  className="rounded-lg border px-3 py-2 text-xs text-sky-700 disabled:opacity-50"
                  onClick={() => void restore(item.id)}
                >
                  查看 / 继续对话
                </button>
                <button
                  type="button"
                  disabled={busy || pending}
                  className="text-xs text-slate-500 disabled:opacity-50"
                  onClick={() => void remove(item.id)}
                >
                  删除
                </button>
              </article>
            ))}
          </div>
          {result?.nextPage && (
            <button
              type="button"
              disabled={busy || pending}
              onClick={() => void loadMore()}
              className="w-full rounded-lg border py-2 text-xs"
            >
              加载更多对话
            </button>
          )}
          {reflectionHistory && (
            <details className="border-t pt-3">
              <summary className="cursor-pointer text-xs text-slate-500">
                已保存的学习反思
              </summary>
              <div className="mt-3">{reflectionHistory}</div>
            </details>
          )}
        </div>
      )}
    </details>
  );
}
