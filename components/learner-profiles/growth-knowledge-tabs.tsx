"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, type ReactNode } from "react";

type KnowledgeView = "chapter" | "objective";

/**
 * 「按章 / 按目标」切换。两份内容都由服务端渲染好，
 * 这里只做显隐，切换不重新取数、不改变口径。
 *
 * URL 用 history.replaceState 同步：刷新/分享能回到同一视图，
 * 但不会触发 RSC 重新渲染（否则切换一次要重新算一遍掌握度）。
 */
export function GrowthKnowledgeTabs({
  chapterView,
  objectiveView,
  objectiveCount,
  objectiveNotice,
}: {
  chapterView: ReactNode;
  objectiveView: ReactNode;
  objectiveCount: number;
  /**
   * 目标视图的口径说明。切换维度时上方分布条不变、下方内容整块换掉，
   * 没有一句话解释会让人以为「数据没了」或「两边数量对不上是 bug」。
   */
  objectiveNotice?: ReactNode;
}) {
  const tab =
    useSearchParams().get("view") === "objective" ? "objective" : "chapter";
  const select = useCallback((next: KnowledgeView) => {
    const params = new URLSearchParams(window.location.search);
    if (next === "objective") params.set("view", "objective");
    else params.delete("view");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );
  }, []);
  const options = [
    { id: "chapter" as const, label: "按章节" },
    { id: "objective" as const, label: `按目标（${objectiveCount}）` },
  ];
  return (
    <div className="space-y-3">
      <div
        aria-label="掌握度聚合维度"
        className="inline-flex rounded-lg bg-slate-100 p-0.5"
        role="tablist"
      >
        {options.map((option) => (
          <button
            aria-controls={`growth-panel-${option.id}`}
            aria-selected={tab === option.id}
            className={`text-ink-soft hover:text-ink min-h-10 rounded-md px-3 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 ${
              tab === option.id ? "text-ink bg-white shadow-sm" : ""
            }`}
            id={`growth-tab-${option.id}`}
            key={option.id}
            onClick={() => select(option.id)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
                return;
              }
              event.preventDefault();
              const next = tab === "chapter" ? "objective" : "chapter";
              select(next);
              document.getElementById(`growth-tab-${next}`)?.focus();
            }}
            role="tab"
            tabIndex={tab === option.id ? 0 : -1}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      <div
        aria-labelledby="growth-tab-chapter"
        hidden={tab !== "chapter"}
        id="growth-panel-chapter"
        role="tabpanel"
      >
        {chapterView}
      </div>
      <div
        aria-labelledby="growth-tab-objective"
        hidden={tab !== "objective"}
        id="growth-panel-objective"
        role="tabpanel"
      >
        {objectiveNotice ? (
          <p className="border-line bg-muted/50 text-ink-body mb-3 rounded-lg border px-3 py-2 text-xs leading-5">
            {objectiveNotice}
          </p>
        ) : null}
        {objectiveView}
      </div>
    </div>
  );
}
