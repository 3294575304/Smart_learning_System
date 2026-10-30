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
