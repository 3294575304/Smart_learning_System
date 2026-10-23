import { getSegmentLabels, SEGMENT_LABELS } from "./navigation";

export interface BreadcrumbItem {
  href: string;
  label: string;
  linkable: boolean;
}

export function buildBreadcrumbs(
  pathname: string,
  segmentLabels: Readonly<Record<string, string>> = SEGMENT_LABELS,
): BreadcrumbItem[] {
  const segments = pathname.split("/").filter(Boolean);
  const labels = getSegmentLabels(pathname, segmentLabels);

  return segments
    .map((segment, index) => {
      const href = `/${segments.slice(0, index + 1).join("/")}`;
      const isTeacherCourseDetail =
        index === 2 &&
        segments[0] === "teacher" &&
        segments[1] === "courses" &&
        !labels[segment];
      const hasChildPage = index < segments.length - 1;
      const isResourceDetail =
        !labels[segment] &&
        ((index === 2 &&
          segments[0] === "teacher" &&
          ["assignments", "classrooms", "questions"].includes(segments[1])) ||
          (index === 2 &&
            segments[0] === "student" &&
            ["assignments", "recommendations", "wrong-questions"].includes(
              segments[1],
            )) ||
          (index === 4 &&
            segments[0] === "teacher" &&
            segments[1] === "courses" &&
            ["gradebook", "surveys"].includes(segments[3])));
      const isStudentCourse =
        index === 2 && segments[0] === "student" && segments[1] === "courses";
      const isTeacherAssignment =
        index === 2 &&
        segments[0] === "teacher" &&
        segments[1] === "assignments" &&
        !labels[segment];

      const isStudentVirtualRoot =
        segments[0] === "student" &&
        index === 1 &&
        ["practice", "question-favorites", "submissions"].includes(segment);
      const targetHref = isStudentVirtualRoot
        ? segment === "submissions"
          ? pathname.endsWith("/result")
            ? "/student/assignments?view=records"
            : "/student/assignments"
          : segment === "question-favorites"
            ? "/student/wrong-questions?view=favorites"
            : "/student/recommendations"
        : isStudentCourse
          ? `${href}/learning-center`
          : href;
      return {
        href: targetHref,
        label: isTeacherCourseDetail
          ? "课程管理详情"
          : isStudentCourse
            ? "课程学习中心"
            : isTeacherAssignment
              ? "作业详情"
              : isResourceDetail
                ? `${labels[segments[index - 1]] ?? "资源"}详情`
                : (labels[segment] ?? "详情"),
        linkable:
          hasChildPage &&
          targetHref !== pathname &&
          (isTeacherCourseDetail ||
            isStudentCourse ||
            isResourceDetail ||
            Boolean(labels[segment])),
      };
    })
    .filter(
      (item, index, items) =>
        !items.slice(index + 1).some((next) => next.href === item.href),
    );
}
