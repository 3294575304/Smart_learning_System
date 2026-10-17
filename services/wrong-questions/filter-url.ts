import type { WrongQuestionListQuery } from "./schemas";
/** 每次使用最新已确认条件构造地址，切换父级时清空依赖项。 */
export function wrongQuestionFilterUrl(
  query: WrongQuestionListQuery,
  name: keyof WrongQuestionListQuery,
  value: string,
  keyword: string,
) {
  const params = new URLSearchParams({
    view: "wrong",
    pageSize: String(query.pageSize),
    page: "1",
  });
  for (const key of [
    "courseId",
    "classroomId",
    "chapterId",
    "knowledgePointId",
    "type",
    "isMastered",
    "recentDays",
  ] as const) {
    if (query[key] !== undefined) params.set(key, String(query[key]));
  }
  if (keyword.trim()) params.set("keyword", keyword.trim());
  if (value) params.set(name, value);
  else params.delete(name);
  if (name === "courseId") {
    params.delete("chapterId");
    params.delete("knowledgePointId");
    params.delete("classroomId");
  }
  if (name === "chapterId") params.delete("knowledgePointId");
  return `/student/wrong-questions?${params}`;
}
