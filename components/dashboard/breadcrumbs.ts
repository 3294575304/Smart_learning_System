export interface BreadcrumbItem {
  href: string;
  label: string;
  linkable: boolean;
}

export function buildBreadcrumbs(
  pathname: string,
  segmentLabels: Readonly<Record<string, string>>,
): BreadcrumbItem[] {
  const segments = pathname.split("/").filter(Boolean);

  return segments.map((segment, index) => {
    const href = `/${segments.slice(0, index + 1).join("/")}`;
    const isTeacherCourseDetail =
      index === 2 && segments[0] === "teacher" && segments[1] === "courses";
    const hasChildPage = index < segments.length - 1;

    return {
      href,
      label: isTeacherCourseDetail
        ? "课程管理详情"
        : (segmentLabels[segment] ?? "详情"),
      linkable:
        hasChildPage &&
        (isTeacherCourseDetail || Boolean(segmentLabels[segment])),
    };
  });
}
