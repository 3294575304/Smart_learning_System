import Link from "next/link";
import React, { type ReactNode } from "react";

import {
  difficultyLabel,
  formatRecommendationTime,
  questionTypeLabel,
  RECOMMENDATION_STATUS_LABELS,
  RECOMMENDATION_STATUS_STYLES,
} from "@/components/recommendations/recommendation-presenters";
import type { RecommendationListItemView } from "@/services/recommendations/types";

interface Props {
  action?: ReactNode;
  item: RecommendationListItemView;
}

export function RecommendationCard({ action, item }: Props) {
  return (
    <article className="flex min-w-0 flex-col rounded-xl border bg-white p-5">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            className="font-semibold break-words hover:underline"
            href={`/student/recommendations/${item.id}`}
          >
            {item.title}
          </Link>
          <p className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border px-2 py-1">
              {questionTypeLabel(item.type)}
            </span>
            <span className="rounded-full border px-2 py-1">
              难度：{difficultyLabel(item.difficulty)}
            </span>
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${RECOMMENDATION_STATUS_STYLES[item.status]}`}
        >
          {RECOMMENDATION_STATUS_LABELS[item.status]}
        </span>
      </div>

      <section className="mt-4 min-w-0 rounded-lg bg-gray-50 p-3">
        <h3 className="text-xs font-medium text-gray-500">推荐原因</h3>
        <p className="mt-1 text-sm leading-6 break-words whitespace-pre-wrap text-gray-700">
          {item.reason}
        </p>
      </section>

      <div className="mt-4 min-w-0">
        <h3 className="text-xs font-medium text-gray-500">知识点</h3>
        {item.knowledgePoints.length === 0 ? (
          <p className="mt-1 text-sm text-gray-500">暂未关联知识点</p>
        ) : (
          <ul className="mt-2 flex min-w-0 flex-wrap gap-2">
            {item.knowledgePoints.map((knowledgePoint) => (
              <li
                className="max-w-full rounded-md bg-gray-100 px-2 py-1 text-xs break-words"
                key={knowledgePoint.id}
              >
                {knowledgePoint.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-auto flex min-w-0 flex-col gap-3 border-t pt-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 text-xs text-gray-500">
          <p>推荐时间：{formatRecommendationTime(item.createdAt)}</p>
          <p className="mt-1 break-words">
            有效期：
            {item.expiresAt
              ? formatRecommendationTime(item.expiresAt)
              : "长期有效"}
          </p>
        </div>
        <div className="shrink-0">{action}</div>
      </div>
    </article>
  );
}
