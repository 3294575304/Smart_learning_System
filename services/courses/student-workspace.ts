export const STUDENT_COURSE_TABS = [
  { id: "overview", label: "学习概况" },
  { id: "tasks", label: "课程任务" },
  { id: "growth", label: "知识与成长" },
] as const;
export const STUDENT_GROWTH_SECTIONS = [
  { id: "knowledge", label: "章节掌握" },
  { id: "path", label: "学习路径" },
  { id: "profile", label: "我的画像" },
  { id: "trends", label: "趋势与记录" },
] as const;
export type StudentCourseTab = (typeof STUDENT_COURSE_TABS)[number]["id"];
export type StudentGrowthSection =
  (typeof STUDENT_GROWTH_SECTIONS)[number]["id"];

/**
 * 趋势页的时间区间。
 * 刻意不用「本学期」：课程 term 存在 `2025-2026-2学期` / `2026-9-2027-1`
 * 等多种写法，解析开学日期会把口径变成猜谜；固定天数可解释、可对比。
 */
export const STUDENT_GROWTH_RANGES = [
  { id: "30d", label: "近 30 天", days: 30 },
  { id: "90d", label: "近 90 天", days: 90 },
  { id: "all", label: "全部", days: null },
] as const;
export type StudentGrowthRange = (typeof STUDENT_GROWTH_RANGES)[number]["id"];

export function parseGrowthRange(value: unknown): StudentGrowthRange {
  return value === "30d" || value === "90d" ? value : "all";
}

/** 区间起点；`all` 返回 null，表示不裁剪。 */
export function growthRangeSince(
  range: StudentGrowthRange,
  now: Date = new Date(),
): Date | null {
  const days = STUDENT_GROWTH_RANGES.find((item) => item.id === range)?.days;
  if (!days) return null;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
export type StudentCourseLocation =
  | { tab: "overview" | "tasks" }
  | { tab: "growth"; section: StudentGrowthSection };
export function parseStudentCourseLocation(
  tab: unknown,
  section: unknown,
): StudentCourseLocation | null {
  if (tab === "growth") {
    const match = STUDENT_GROWTH_SECTIONS.find((item) => item.id === section);
    return section === undefined
      ? { tab, section: "knowledge" }
      : match
        ? { tab, section: match.id }
        : null;
  }
  if (section !== undefined) return null;
  if (tab === undefined || tab === "overview") return { tab: "overview" };
  if (tab === "tasks") return { tab };
  if (tab === "knowledge" || tab === "path" || tab === "profile")
    return { tab: "growth", section: tab };
  if (tab === "activity") return { tab: "growth", section: "trends" };
  return null;
}
export function studentCourseTabHref(
  courseId: string,
  classroomId: string,
  tab: StudentCourseTab,
  section?: StudentGrowthSection,
) {
  const params = new URLSearchParams({ classroomId, tab });
  if (tab === "growth") params.set("section", section ?? "knowledge");
  return `/student/courses/${encodeURIComponent(courseId)}/learning-center?${params}`;
}
