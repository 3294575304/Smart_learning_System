import { CLASSROOM_STATUS_LABELS } from "@/services/classrooms/presentation";

export interface StudentEnrollmentContext {
  course: { id: string; name: string; term: string; status?: string };
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
