import Link from "next/link";

import type { WrongQuestionListQuery } from "@/services/wrong-questions/schemas";

function pageHref(query: WrongQuestionListQuery, page: number): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(query.pageSize),
  });
  if (query.keyword) params.set("keyword", query.keyword);
  if (query.classroomId) params.set("classroomId", query.classroomId);
  if (query.knowledgePointId)
    params.set("knowledgePointId", query.knowledgePointId);
  if (query.type) params.set("type", query.type);
  if (query.isMastered !== undefined)
    params.set("isMastered", String(query.isMastered));
  if (query.recentDays) params.set("recentDays", String(query.recentDays));
  return `/student/wrong-questions?${params.toString()}`;
}

interface Props {
  query: WrongQuestionListQuery;
  total: number;
  totalPages: number;
}

export function WrongQuestionPagination({ query, total, totalPages }: Props) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label="错题分页"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3"
    >
      <p className="text-muted-foreground text-sm">
        共 {total} 道，第 {query.page} / {totalPages} 页
      </p>
      <div className="flex gap-2">
        {query.page > 1 ? (
          <Link
            className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
            href={pageHref(query, query.page - 1)}
          >
            上一页
          </Link>
        ) : (
          <span className="rounded-md border px-3 py-2 text-sm opacity-40">
            上一页
          </span>
        )}
        {query.page < totalPages ? (
          <Link
            className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
            href={pageHref(query, query.page + 1)}
          >
            下一页
          </Link>
        ) : (
          <span className="rounded-md border px-3 py-2 text-sm opacity-40">
            下一页
          </span>
        )}
      </div>
    </nav>
  );
}
