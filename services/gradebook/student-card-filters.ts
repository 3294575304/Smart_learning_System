export interface GradeCardContext {
  course: { id: string; name: string; term: string; courseNo: string };
  classroom: { id: string; name: string };
}

export function studentGradeFilterHref(
  contexts: GradeCardContext[],
  classroomId: string,
  publication: string,
  committedQuery: string,
) {
  const context = contexts.find((x) => x.classroom.id === classroomId);
  if (classroomId && !context) throw new Error("Invalid classroom");
  if (!["ALL", "PUBLISHED", "PENDING"].includes(publication))
    throw new Error("Invalid publication");
  const params = new URLSearchParams({ view: "course" });
  if (context) {
    params.set("courseId", context.course.id);
    params.set("classroomId", context.classroom.id);
  }
  params.set("publication", publication);
  if (committedQuery) params.set("q", committedQuery);
  return `/student/results?${params}`;
}

export function filterStudentGradeCards<T extends GradeCardContext>(
  contexts: T[],
  raw: Record<string, string | string[] | undefined>,
  publishedClassrooms: ReadonlySet<string>,
) {
  for (const key of ["courseId", "classroomId", "publication", "q"])
    if (raw[key] !== undefined && typeof raw[key] !== "string")
      throw new Error("Invalid grade filters");
  let courseId = (raw.courseId as string | undefined) ?? "";
  let classroomId = (raw.classroomId as string | undefined) ?? "";
  const publication = (raw.publication as string | undefined) || "ALL";
  const q = ((raw.q as string | undefined) ?? "").trim();
  if (q.length > 80 || !["ALL", "PUBLISHED", "PENDING"].includes(publication))
    throw new Error("Invalid grade filters");
  if (courseId && !contexts.some((item) => item.course.id === courseId))
    throw new Error("Invalid course");
  if (
    classroomId &&
    !contexts.some(
      (item) =>
        item.classroom.id === classroomId &&
        (!courseId || item.course.id === courseId),
    )
  )
    throw new Error("Invalid classroom");
  const candidates = contexts.filter(
    (x) => !courseId || x.course.id === courseId,
  );
  const selectionRequired = Boolean(
    courseId && !classroomId && candidates.length > 1,
  );
  if (courseId && !classroomId && candidates.length === 1)
    classroomId = candidates[0].classroom.id;
  if (classroomId && !courseId)
    courseId =
      contexts.find((x) => x.classroom.id === classroomId)?.course.id ?? "";
  const matching = contexts.filter(
    (item) =>
      (!courseId || item.course.id === courseId) &&
      (!classroomId || item.classroom.id === classroomId) &&
      `${item.course.name} ${item.course.courseNo} ${item.classroom.name} ${item.course.term}`
        .toLocaleLowerCase()
        .includes(q.toLocaleLowerCase()),
  );
  const published = matching.filter((item) =>
    publishedClassrooms.has(item.classroom.id),
  ).length;
  return {
    courseId,
    classroomId,
    publication,
    q,
    selectionRequired,
    total: matching.length,
    published,
    pending: matching.length - published,
    items: selectionRequired
      ? []
      : matching.filter(
          (item) =>
            publication === "ALL" ||
            publishedClassrooms.has(item.classroom.id) ===
              (publication === "PUBLISHED"),
        ),
  };
}
