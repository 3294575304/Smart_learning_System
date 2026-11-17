import { readAllowedParam, readTextParam } from "@/lib/list-filter";

const classroomListPath = "/teacher/classrooms";
export const teacherClassroomStatuses = [
  "ACTIVE",
  "COMPLETED",
  "CLOSED",
] as const;

export interface TeacherClassroomFilters {
  keyword: string;
  status: string;
  courseId: string;
}

export function readTeacherClassroomListFilters(
  params: Partial<
    Record<keyof TeacherClassroomFilters, string | string[] | null>
  >,
): TeacherClassroomFilters {
  return {
    keyword: readTextParam(
      typeof params.keyword === "string" ? params.keyword : undefined,
    ),
    status: readAllowedParam(
      typeof params.status === "string" ? params.status : undefined,
      teacherClassroomStatuses,
    ),
    courseId: readTextParam(
      typeof params.courseId === "string" ? params.courseId : undefined,
      64,
    ),
  };
}

export function teacherClassroomListHref(
  filters: TeacherClassroomFilters,
  history = false,
) {
  const params = new URLSearchParams();
  if (history) params.set("view", "history");
  for (const [key, value] of Object.entries(
    readTeacherClassroomListFilters(filters),
  )) {
    if (value) params.set(key, value);
  }
  return params.size ? `${classroomListPath}?${params}` : classroomListPath;
}

export function isTeacherClassroomHistory(pathname: string, view: unknown) {
  return pathname === classroomListPath && view === "history";
}
