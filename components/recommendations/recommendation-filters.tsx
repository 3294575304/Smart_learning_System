import Link from "next/link";
import type { RecommendationStatus } from "@prisma/client";
import React from "react";

import { RECOMMENDATION_FILTERS } from "@/components/recommendations/recommendation-presenters";

interface Props {
  activeStatus: RecommendationStatus | undefined;
}

export function RecommendationFilters({ activeStatus }: Props) {
  return (
    <nav
      aria-label="推荐状态筛选"
      className="flex max-w-full gap-2 overflow-x-auto pb-1"
    >
      {RECOMMENDATION_FILTERS.map((filter) => {
        const active = filter.status === activeStatus;
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm transition-colors ${
              active
                ? "border-sky-600 bg-sky-600 text-white"
                : "bg-white hover:bg-sky-50/70"
            }`}
            href={filter.href}
            key={filter.label}
          >
            {filter.label}
          </Link>
        );
      })}
    </nav>
  );
}
