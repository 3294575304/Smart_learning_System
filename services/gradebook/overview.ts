export interface GradebookClassroomSummary {
  id: string;
  name: string;
  status: string;
  studentCount: number;
}

export interface CourseGradebookSummary {
  id: string;
  classroom: GradebookClassroomSummary;
  scheme: { id: string; versionNumber: number };
  currentPublication: { versionNumber: number; publishedAt: string } | null;
}

export function groupCourseGradebooks(
  classrooms: GradebookClassroomSummary[],
  gradebooks: CourseGradebookSummary[],
  currentSchemeId: string | null,
) {
  const linkedIds = new Set(classrooms.map((item) => item.id));
  const all = new Map(classrooms.map((item) => [item.id, item]));
  for (const gradebook of gradebooks) {
    if (!all.has(gradebook.classroom.id))
      all.set(gradebook.classroom.id, gradebook.classroom);
  }
  return Array.from(all.values())
    .filter(
      (classroom) =>
        classroom.status === "ACTIVE" ||
        classroom.status === "COMPLETED" ||
        gradebooks.some((book) => book.classroom.id === classroom.id),
    )
    .map((classroom) => {
      const books = gradebooks
        .filter((item) => item.classroom.id === classroom.id)
        .sort(
          (a, b) =>
            b.scheme.versionNumber - a.scheme.versionNumber ||
            a.id.localeCompare(b.id),
        );
      const current =
        books.find((item) => item.scheme.id === currentSchemeId) ?? null;
      const primary = current ?? books[0] ?? null;
      const linked = linkedIds.has(classroom.id);
      return {
        classroom,
        linked,
        primary,
        history: books.filter((item) => item.id !== primary?.id),
        canCreate:
          linked &&
          (classroom.status === "ACTIVE" || classroom.status === "COMPLETED") &&
          !!currentSchemeId &&
          !current,
        usesPreviousScheme: !!primary && primary.scheme.id !== currentSchemeId,
        status: !primary
          ? "missing"
          : primary.currentPublication
            ? "published"
            : "pending",
      };
    })
    .sort(
      (a, b) =>
        Number(b.linked) - Number(a.linked) ||
        Number(b.status === "published") - Number(a.status === "published") ||
        b.classroom.studentCount - a.classroom.studentCount ||
        a.classroom.name.localeCompare(b.classroom.name, "zh-CN", {
          numeric: true,
        }),
    );
}
