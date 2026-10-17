export function groupStudentCourseContexts<
  T extends { course: { id: string }; classroom: { id: string } },
>(contexts: T[]) {
  const groups = new Map<
    string,
    { course: T["course"]; classrooms: T["classroom"][] }
  >();
  for (const context of contexts) {
    const group: { course: T["course"]; classrooms: T["classroom"][] } =
      groups.get(context.course.id) ?? {
        course: context.course,
        classrooms: [],
      };
    if (!group.classrooms.some((item) => item.id === context.classroom.id))
      group.classrooms.push(context.classroom);
    groups.set(context.course.id, group);
  }
  return [...groups.values()];
}
