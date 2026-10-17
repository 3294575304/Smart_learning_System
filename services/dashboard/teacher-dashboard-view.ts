/** Course-wide review tasks remain visible when a card selects one class. */
export function filterDashboardClassroomItems<
  T extends { classroomId: string | null },
>(items: readonly T[], classroomId: string, includeCourseWide = false): T[] {
  return items.filter(
    (item) =>
      !classroomId ||
      item.classroomId === classroomId ||
      (includeCourseWide && item.classroomId === null),
  );
}
