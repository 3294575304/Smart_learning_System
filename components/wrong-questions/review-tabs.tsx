"use client";
import { Bookmark, NotebookPen } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { reviewTabHref } from "@/services/review/tab-navigation";
import {
  SECTION_TABS_LIST,
  sectionTabClass,
} from "@/components/ui/section-tabs";
export function ReviewTabs({ favorites }: { favorites: boolean }) {
  const search = useSearchParams();
  return (
    <nav aria-label="我的题库分类" className={SECTION_TABS_LIST}>
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
            className={sectionTabClass(
              (favorites ? "favorites" : "wrong") === tab.id,
            )}
          >
            <tab.icon className="size-4 shrink-0" aria-hidden="true" />
            <span>{tab.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
