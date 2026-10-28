export const STUDENT_COURSE_TABS = [
  {
    id: "overview",
    label: "学习概况",
    description: "本班任务、学习进度与当前建议",
  },
  {
    id: "knowledge",
    label: "知识与路径",
    description: "知识掌握、学习路径与课程知识图谱",
  },
  {
    id: "profile",
    label: "我的画像",
    description: "课程画像、证据与学习变化",
  },
] as const;
export type StudentCourseTab = (typeof STUDENT_COURSE_TABS)[number]["id"];
export function parseStudentCourseTab(value: unknown): StudentCourseTab | null {
  if (value === undefined) return "overview";
  if (value === "tasks") return "overview";
  if (value === "path") return "knowledge";
  if (value === "activity") return "profile";
  return typeof value === "string" &&
    STUDENT_COURSE_TABS.some((item) => item.id === value)
    ? (value as StudentCourseTab)
    : null;
}
export function studentCourseTabHref(
  courseId: string,
  classroomId: string,
  tab: StudentCourseTab,
) {
  return `/student/courses/${encodeURIComponent(courseId)}/learning-center?${new URLSearchParams({ classroomId, tab })}`;
}
