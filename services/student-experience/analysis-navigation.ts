import { studentTaskScopeSchema, type StudentTaskScope } from "./task-scope";

const analysisPath = "/student/analytics";
const origin = "https://student.local";

export function studentAnalysisHref(
  scope: StudentTaskScope,
  options: { fromCourseCenter?: boolean; chart?: string } = {},
) {
  const params = new URLSearchParams();
  if (scope.courseId) params.set("courseId", scope.courseId);
  if (scope.classroomId) params.set("classroomId", scope.classroomId);
  if (options.fromCourseCenter) params.set("from", "course-center");
  if (
    options.chart === "assignment" ||
    options.chart === "exam" ||
    options.chart === "practice"
  )
    params.set("chart", options.chart);
  return analysisPath + (params.size ? "?" + params : "");
}

export function readStudentAnalysisReturn(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length > 300 ||
    (value !== analysisPath && !value.startsWith(analysisPath + "?"))
  )
    return;
  const url = new URL(value, origin);
  if (url.hash) return;
  const scope = studentTaskScopeSchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!scope.success) return;
  return studentAnalysisHref(scope.data, {
    fromCourseCenter: url.searchParams.get("from") === "course-center",
    chart: url.searchParams.get("chart") ?? undefined,
  });
}

export function studentAnalysisReturnFromHref(href: string) {
  return readStudentAnalysisReturn(
    new URL(href, origin).searchParams.get("analysisReturn"),
  );
}

export function withStudentAnalysisReturn(href: string, value: unknown) {
  const back = readStudentAnalysisReturn(value);
  if (!back) return href;
  const url = new URL(href, origin);
  if (!href.startsWith("/student/") || url.origin !== origin) return href;
  url.searchParams.set("analysisReturn", back);
  return url.pathname + url.search + url.hash;
}
