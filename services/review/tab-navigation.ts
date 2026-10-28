export function reviewTabHref(search: string, view: "wrong" | "favorites") {
  const source = new URLSearchParams(search);
  const params = new URLSearchParams({ view });
  for (const key of ["backCourseId", "backClassroomId"]) {
    const value = source.get(key);
    if (value) params.set(key, value);
  }
  const courseId = source.get("courseId");
  if (courseId && !["LEGACY", "GENERAL"].includes(courseId)) {
    params.set("courseId", courseId);
    const chapter = source.get("chapterId");
    if (chapter) params.set("chapterId", chapter);
  }
  return `/student/wrong-questions?${params}`;
}
