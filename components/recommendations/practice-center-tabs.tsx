"use client";

import { BookOpen, SlidersHorizontal, MessageCircle } from "lucide-react";
import { AssistantPanelActiveContext } from "./practice-panel-context";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

interface Props {
  initialView: "recommended" | "generate" | "assistant";
  practice: ReactNode;
  generation: ReactNode;
  assistant?: ReactNode;
}

/** The browser history update keeps deep links without another server navigation. */
export function PracticeCenterTabs({
  initialView,
  practice,
  generation,
  assistant,
}: Props) {
  const searchParams = useSearchParams();
  const [view, setView] = useState(initialView);
  const queryView = searchParams.get("view");

  useEffect(() => {
    setView(
      queryView === "generate"
        ? "generate"
        : queryView === "assistant"
          ? "assistant"
          : "recommended",
    );
  }, [queryView]);

  useEffect(() => {
    const openPractice = (event: Event) => {
      const path = (event as CustomEvent<string>).detail;
      const url = new URL(path, window.location.origin);
      if (
        url.origin !== window.location.origin ||
        url.pathname !== window.location.pathname
      )
        return;
      url.searchParams.set("view", "generate");
      window.history.replaceState(null, "", url);
      setView("generate");
      window.requestAnimationFrame(() => {
        document
          .getElementById("course-practice-center")
          ?.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    };
    window.addEventListener("learning-assistant-practice", openPractice);
    return () =>
      window.removeEventListener("learning-assistant-practice", openPractice);
  }, []);

  function selectView(nextView: Props["initialView"]) {
    setView(nextView);
    const url = new URL(window.location.href);
    url.searchParams.set("view", nextView);
    window.history.replaceState(null, "", url);
  }

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="练习中心功能"
        className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm sm:grid-cols-3"
      >
        {(
          [
            ["recommended", "我的练习"],
            ["generate", "生成练习"],
            ["assistant", "AI 学习助手"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`practice-tab-${value}`}
            aria-selected={view === value}
            aria-controls={`practice-panel-${value}`}
            className={`flex min-w-0 items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${view === value ? "bg-sky-50 text-sky-800 ring-1 ring-sky-200 ring-inset" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}
            onClick={() => selectView(value)}
            onKeyDown={(event) => {
              if (
                event.key !== "ArrowLeft" &&
                event.key !== "ArrowRight" &&
                event.key !== "Home" &&
                event.key !== "End"
              )
                return;
              event.preventDefault();
              const order = ["recommended", "generate", "assistant"] as const;
              const index = order.indexOf(view);
              const next =
                event.key === "Home"
                  ? order[0]
                  : event.key === "End"
                    ? order[order.length - 1]
                    : order[
                        (index +
                          (event.key === "ArrowRight" ? 1 : -1) +
                          order.length) %
                          order.length
                      ];
              selectView(next);
              document.getElementById(`practice-tab-${next}`)?.focus();
            }}
            tabIndex={view === value ? 0 : -1}
          >
            {(() => {
              const Icon = {
                recommended: BookOpen,
                generate: SlidersHorizontal,
                assistant: MessageCircle,
              }[value];
              return <Icon className="size-4 shrink-0" aria-hidden="true" />;
            })()}
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id="practice-panel-recommended"
        aria-labelledby="practice-tab-recommended"
        hidden={view !== "recommended"}
      >
        {practice}
      </div>
      <div
        role="tabpanel"
        id="practice-panel-generate"
        aria-labelledby="practice-tab-generate"
        hidden={view !== "generate"}
      >
        {generation}
      </div>
      <div
        role="tabpanel"
        id="practice-panel-assistant"
        aria-labelledby="practice-tab-assistant"
        hidden={view !== "assistant"}
      >
        <AssistantPanelActiveContext.Provider value={view === "assistant"}>
          {assistant}
        </AssistantPanelActiveContext.Provider>
      </div>
    </div>
  );
}
