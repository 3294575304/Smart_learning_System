import { PageIndex } from "@/components/dashboard/page-index";

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
    <PageIndex
      ariaLabel="错题分页"
      hrefForPage={(page) => pageHref(query, page)}
      page={query.page}
      summary={`共 ${total} 道，第 ${query.page} / ${totalPages} 页`}
      totalPages={totalPages}
    />
  );
}
