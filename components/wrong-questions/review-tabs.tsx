"use client";
import Link from "next/link";
import { Bookmark, NotebookPen } from "lucide-react";
import { useSearchParams } from "next/navigation";
export function ReviewTabs({ favorites }: { favorites: boolean }) {
  const search = useSearchParams();
  return (
    <nav
      aria-label="复习中心分类"
      className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm"
    >
      {[
        { id: "wrong", label: "错题本", icon: NotebookPen },
        { id: "favorites", label: "我的收藏", icon: Bookmark },
      ].map((tab) => {
        const params = new URLSearchParams({ view: tab.id });
        const courseId = search.get("courseId");
        if (courseId && !["LEGACY", "GENERAL"].includes(courseId))
          params.set("courseId", courseId);
        if (courseId && search.get("chapterId"))
          params.set("chapterId", search.get("chapterId") ?? "");
        return (
          <Link
            key={tab.id}
            href={`/student/wrong-questions?${params}`}
            aria-current={
              (favorites ? "favorites" : "wrong") === tab.id
                ? "page"
                : undefined
            }
            className={`flex min-w-0 items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${(favorites ? "favorites" : "wrong") === tab.id ? "bg-sky-50 text-sky-800 ring-1 ring-sky-200 ring-inset" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}
          >
            <tab.icon className="size-4 shrink-0" aria-hidden="true" />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
