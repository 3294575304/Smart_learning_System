"use client";
import { Bookmark, NotebookPen } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { reviewTabHref } from "@/services/review/tab-navigation";
export function ReviewTabs({ favorites }: { favorites: boolean }) {
  const search = useSearchParams();
  return (
    <nav
      aria-label="复习中心分类"
      className="flex w-fit max-w-full flex-wrap gap-1 rounded-xl border border-sky-100 bg-white p-1"
    >
      {[
        { id: "wrong", label: "错题本", icon: NotebookPen },
        { id: "favorites", label: "我的收藏", icon: Bookmark },
      ].map((tab) => {
        return (
          <a
            key={tab.id}
            href={reviewTabHref(
              search.toString(),
              tab.id === "favorites" ? "favorites" : "wrong",
            )}
            aria-current={
              (favorites ? "favorites" : "wrong") === tab.id
                ? "page"
                : undefined
            }
            className={`flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${(favorites ? "favorites" : "wrong") === tab.id ? "bg-sky-50 text-sky-800 ring-1 ring-sky-200 ring-inset" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}
          >
            <tab.icon className="size-4 shrink-0" aria-hidden="true" />
            <span>{tab.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
