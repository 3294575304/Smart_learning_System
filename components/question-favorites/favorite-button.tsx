"use client";
import { useEffect, useState } from "react";
import { Bookmark, Check } from "lucide-react";
import { requestApi } from "@/components/courses/request-api";
import type { FavoriteSource } from "@/services/question-favorites/schemas";
export function announceFavoriteChange(questionId: string, favorited: boolean) {
  window.dispatchEvent(
    new CustomEvent("question-favorites-changed", {
      detail: { questionId, favorited },
    }),
  );
}
export function FavoriteButton({
  questionId,
  source,
  initialFavorited,
}: {
  questionId?: string;
  source: FavoriteSource;
  initialFavorited?: boolean;
}) {
  const sourceKind = source.kind;
  const sourceId = source.id;
  const [state, setState] = useState<{
    favorited: boolean;
    note?: string;
    questionId?: string;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setState(null);
    setError("");
    const path = questionId
      ? `/api/student/question-favorites/${encodeURIComponent(questionId)}`
      : `/api/student/question-favorites/source?${new URLSearchParams({ kind: sourceKind, id: sourceId })}`;
    void requestApi<{ favorited: boolean; note?: string; questionId?: string }>(
      path,
      { method: "GET" },
    ).then((response) => {
      if (!active) return;
      if (response.success)
        setState({
          ...response.data,
          questionId: questionId ?? response.data.questionId,
        });
      else {
        setError(response.error);
        setState(null);
      }
    });
    return () => {
      active = false;
    };
  }, [questionId, sourceKind, sourceId, retry]);
  useEffect(() => {
    const change = (event: Event) => {
      const detail = (
        event as CustomEvent<{ questionId: string; favorited: boolean }>
      ).detail;
      if (detail.questionId === (questionId ?? state?.questionId)) {
        setState((current) =>
          current ? { ...current, favorited: detail.favorited } : current,
        );
        setRetry((value) => value + 1);
      }
    };
    window.addEventListener("question-favorites-changed", change);
    return () =>
      window.removeEventListener("question-favorites-changed", change);
  }, [questionId, state?.questionId]);
  async function toggle() {
    const id = questionId ?? state?.questionId;
    if (!state || !id || pending) return;
    if (
      state.favorited &&
      state.note &&
      !window.confirm("取消收藏会删除这条个人备注，确定继续吗？")
    )
      return;
    setPending(true);
    setError("");
    const response = await requestApi<{ favorited: boolean; note?: string }>(
      `/api/student/question-favorites/${encodeURIComponent(id)}`,
      state.favorited
        ? { method: "DELETE" }
        : {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ source }),
          },
    );
    setPending(false);
    if (!response.success) {
      setError(response.error);
      return;
    }
    setState({ ...response.data, questionId: id });
    announceFavoriteChange(id, response.data.favorited);
  }
  const favorited = state?.favorited ?? Boolean(initialFavorited);
  return (
    <div className="shrink-0 text-right">
      <button
        type="button"
        aria-pressed={favorited}
        disabled={pending || !state}
        onClick={() => void toggle()}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs disabled:opacity-50 ${favorited ? "border-amber-200 bg-amber-50 text-amber-800" : "bg-white text-slate-600"}`}
      >
        <Bookmark
          className="size-4"
          fill={favorited ? "currentColor" : "none"}
          aria-hidden="true"
        />
        {pending ? "处理中…" : favorited ? "已收藏" : "收藏"}
        {favorited && <Check className="size-3" aria-hidden="true" />}
      </button>
      {error && (
        <p role="alert" className="mt-1 max-w-60 text-xs text-red-700">
          {error}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => setRetry((value) => value + 1)}
          >
            重试
          </button>
        </p>
      )}
    </div>
  );
}
