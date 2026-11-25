/**
 * 学情分析（/teacher/results）里的按钮会跳到课程子页面。
 * 这些子页面的左上角返回入口需要区分来源：从学情分析进来就返回学情分析，
 * 从课程工作台进来就返回课程。用 from=analytics 把来源和目标页的筛选条件带过去。
 */
export const ANALYTICS_ORIGIN = "analytics";

export function isAnalyticsOrigin(value?: string | string[] | null): boolean {
  const current = Array.isArray(value) ? value[0] : value;
  return current === ANALYTICS_ORIGIN;
}

/** 还原学情分析的筛选条件，保证「返回学情分析」落回同一个课程 / 班级 / 统计范围。 */
export function analyticsSearchParams({
  courseId = null,
  classroomId = null,
  section = null,
}: {
  courseId?: string | null;
  classroomId?: string | null;
  section?: string | null;
} = {}) {
  const params = new URLSearchParams();
  if (courseId) params.set("courseId", courseId);
  if (classroomId) params.set("classroomId", classroomId);
  if (section && section !== "ALL") params.set("section", section);
  return params;
}

/** 给课程子页面链接打上「来自学情分析」的标记，并保留班级与统计范围。 */
export function withAnalyticsOrigin(
  href: string,
  {
    classroomId = null,
    section = null,
  }: { classroomId?: string | null; section?: string | null } = {},
) {
  const url = new URL(href, "http://localhost");
  url.searchParams.set("from", ANALYTICS_ORIGIN);
  if (classroomId) url.searchParams.set("classroomId", classroomId);
  if (section && section !== "ALL") url.searchParams.set("section", section);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** 目标页把来源标记继续传给下一层页面（例如课程画像 → 学生证据详情）。 */
export function keepAnalyticsOrigin(
  href: string,
  {
    from = null,
    section = null,
  }: {
    from?: string | string[] | null;
    section?: string | string[] | null;
  } = {},
) {
  if (!isAnalyticsOrigin(from)) return href;
  const current = Array.isArray(section) ? section[0] : section;
  const url = new URL(href, "http://localhost");
  url.searchParams.set("from", ANALYTICS_ORIGIN);
  if (current && current !== "ALL") url.searchParams.set("section", current);
  return `${url.pathname}${url.search}${url.hash}`;
}
