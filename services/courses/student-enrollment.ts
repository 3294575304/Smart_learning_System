import { CLASSROOM_STATUS_LABELS } from "@/services/classrooms/presentation";

export interface StudentEnrollmentContext {
  course: {
    id: string;
    name: string;
    term: string;
    status?: string;
    courseNo?: string;
  };
  classroom: { id: string; name: string; status?: string };
}
export function studentEnrollmentLabel(item: StudentEnrollmentContext) {
  return `${item.course.name} · ${item.classroom.name} · ${item.course.term}`;
}

export function studentEnrollmentStatus(
  courseStatus?: string,
  classroomStatus?: string,
) {
  if (courseStatus === "ARCHIVED" || classroomStatus === "ARCHIVED")
    return { label: "已归档", readOnly: true };
  if (classroomStatus === "COMPLETED" || classroomStatus === "CLOSED")
    return { label: CLASSROOM_STATUS_LABELS[classroomStatus], readOnly: true };
  return { label: "学习中", readOnly: false };
}
export function selectStudentEnrollment<T extends StudentEnrollmentContext>(
  items: T[],
  raw: Record<string, unknown>,
): T | undefined {
  for (const key of ["courseId", "classroomId"])
    if (raw[key] !== undefined && typeof raw[key] !== "string")
      throw new Error("Invalid enrollment");
  if (
    raw.courseId !== undefined &&
    !items.some((x) => x.course.id === raw.courseId)
  )
    throw new Error("Unknown course");
  if (
    raw.classroomId !== undefined &&
    !items.some(
      (x) =>
        x.classroom.id === raw.classroomId &&
        (!raw.courseId || x.course.id === raw.courseId),
    )
  )
    throw new Error("Unknown enrollment");
  const matching = items.filter(
    (x) =>
      (!raw.courseId || x.course.id === raw.courseId) &&
      (!raw.classroomId || x.classroom.id === raw.classroomId),
  );
  return (
    matching.find(
      (x) => x.classroom.status === "ACTIVE" && x.course.status !== "ARCHIVED",
    ) ?? matching[0]
  );
}

function normalizeEnrollmentSearch(text: string) {
  return text.normalize("NFKC").trim().toLowerCase();
}

export function searchStudentEnrollments<T extends StudentEnrollmentContext>(
  items: T[],
  search: string,
) {
  const terms = normalizeEnrollmentSearch(search)
    .split(/[\s·,，、]+/)
    .filter(Boolean);
  if (!terms.length) return items;
  return items
    .map((item) => {
      const names = [
        item.course.name,
        item.classroom.name,
        item.course.courseNo ?? "",
      ].map(normalizeEnrollmentSearch);
      const term = normalizeEnrollmentSearch(item.course.term);
      let rank = 0;
      for (const keyword of terms) {
        if (names.some((name) => name.startsWith(keyword))) rank += 2;
        else if (
          names.some((name) => name.includes(keyword)) ||
          term.includes(keyword)
        )
          rank += 1;
        else return { item, rank: 0 };
      }
      return { item, rank };
    })
    .filter(({ rank }) => rank > 0)
    .sort((a, b) => b.rank - a.rank)
    .map(({ item }) => item);
}

export function selectMostActiveStudentEnrollment<
  T extends StudentEnrollmentContext & {
    lastClassActivityAt: number;
    lastPracticeAt: number;
  },
>(items: T[]) {
  const active = items.filter(
    ({ course, classroom }) =>
      classroom.status === "ACTIVE" &&
      !studentEnrollmentStatus(course.status, classroom.status).readOnly,
  );
  return [...(active.length ? active : items)].sort(
    (a, b) =>
      Math.max(b.lastClassActivityAt, b.lastPracticeAt) -
        Math.max(a.lastClassActivityAt, a.lastPracticeAt) ||
      b.lastClassActivityAt - a.lastClassActivityAt,
  )[0];
}
