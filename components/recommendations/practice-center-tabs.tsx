"use client";

import { BookOpen, SlidersHorizontal, MessageCircle } from "lucide-react";
import { AssistantPanelActiveContext } from "./practice-panel-context";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";

interface Props {
  initialView: "recommended" | "generate" | "assistant";
  practice: ReactNode;
  generation: ReactNode;
  assistant?: ReactNode;
}

/** Only the selected server panel loads its domain data. */
export function PracticeCenterTabs({
  initialView,
  practice,
  generation,
  assistant,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
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
      startTransition(() =>
        router.push(`${url.pathname}${url.search}`, { scroll: false }),
      );
      window.requestAnimationFrame(() => {
        document
          .getElementById("course-practice-center")
          ?.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    };
    window.addEventListener("learning-assistant-practice", openPractice);
    return () =>
      window.removeEventListener("learning-assistant-practice", openPractice);
  }, [router]);

  function selectView(nextView: Props["initialView"]) {
    const url = new URL(window.location.href);
    url.searchParams.set("view", nextView);
    if (
      nextView !== "recommended" &&
      url.searchParams.get("courseId") === "GENERAL"
    ) {
      url.searchParams.delete("courseId");
      url.searchParams.delete("chapterId");
      url.searchParams.delete("conceptId");
    }
    startTransition(() =>
      router.push(`${url.pathname}${url.search}`, { scroll: false }),
    );
  }

  return (
    <div className="space-y-5" aria-busy={pending}>
      {pending ? (
        <p role="status" className="text-sm text-slate-500">
          正在加载功能…
        </p>
      ) : null}
      <div
        role="tablist"
        aria-label="练习中心功能"
        className="flex w-fit max-w-full flex-wrap gap-1 rounded-xl border border-sky-100 bg-white p-1"
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
            className={`flex min-w-0 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${view === value ? "bg-sky-50 text-sky-800 ring-1 ring-sky-200 ring-inset" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}
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
