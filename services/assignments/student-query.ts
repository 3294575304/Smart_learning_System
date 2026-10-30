import { z } from "zod";

const optionalId = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().cuid().optional(),
);
export const teacherStudentQuerySchema = z.object({
  section: z.enum(["ALL", "CURRENT", "HISTORY"]).default("ALL"),
  courseId: optionalId,
  classroomId: optionalId,
  studentKeyword: z.string().trim().max(120).default(""),
  submissionFilter: z
    .enum(["ALL", "UNSUBMITTED", "OVERDUE", "PENDING_REVIEW"])
    .default("ALL"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export const teacherStudentDetailQuerySchema = teacherStudentQuerySchema.extend(
  {
    classroomId: z.string().cuid(),
    assignmentKeyword: z.string().trim().max(120).default(""),
    returnTo: z.string().max(2000).optional(),
  },
);
export type TeacherStudentQuery = z.output<typeof teacherStudentQuerySchema>;
export const studentFilterLabels = {
  ALL: "全部",
  UNSUBMITTED: "存在未交",
  OVERDUE: "存在逾期未交",
  PENDING_REVIEW: "存在待批改",
} as const;
export function studentListHref(query: TeacherStudentQuery, page = query.page) {
  const params = new URLSearchParams({
    view: "STUDENTS",
    section: "ALL",
    page: String(page),
    pageSize: String(query.pageSize),
  });
  if (query.courseId) params.set("courseId", query.courseId);
  if (query.classroomId) params.set("classroomId", query.classroomId);
  if (query.studentKeyword) params.set("studentKeyword", query.studentKeyword);
  return `/teacher/assignments?${params}`;
}
export function safeStudentReturn(value?: string) {
  if (!value || !value.startsWith("/teacher/assignments?"))
    return "/teacher/assignments?view=STUDENTS";
  const url = new URL(value, "http://localhost");
  if (
    url.origin !== "http://localhost" ||
    url.pathname !== "/teacher/assignments"
  )
    return "/teacher/assignments?view=STUDENTS";
  const parsed = teacherStudentQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  return parsed.success
    ? studentListHref(parsed.data)
    : "/teacher/assignments?view=STUDENTS";
}

export function safeStudentWorkReturn(
  value: string | undefined,
  studentId: string,
  classroomId: string,
): string | undefined {
  const pathname = `/teacher/assignments/students/${studentId}`;
  if (!value?.startsWith(`${pathname}?`) || value.length > 8000)
    return undefined;
  const url = new URL(value, "http://localhost");
  if (url.origin !== "http://localhost" || url.pathname !== pathname)
    return undefined;
  const parsed = teacherStudentDetailQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!parsed.success || parsed.data.classroomId !== classroomId)
    return undefined;
  const query = parsed.data;
  const params = new URLSearchParams({
    classroomId,
    section: query.section,
    submissionFilter: query.submissionFilter,
    assignmentKeyword: query.assignmentKeyword,
    page: String(query.page),
    pageSize: String(query.pageSize),
    returnTo: safeStudentReturn(query.returnTo),
  });
  if (query.courseId) params.set("courseId", query.courseId);
  return `${pathname}?${params}`;
}
