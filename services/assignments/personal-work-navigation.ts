import { z } from "zod";
import { safeStudentWorkReturn } from "./student-query";
import { teacherSubmissionListQuerySchema } from "./schemas";

export const personalWorkQuerySchema = z.object({
  filter: z
    .enum(["ALL", "WRONG", "PENDING_REVIEW"])
    .default("ALL")
    .transform((value) => (value === "PENDING_REVIEW" ? "ALL" : value)),
  returnTo: z.string().max(8000).optional(),
});

export function personalWorkHref(
  assignmentId: string,
  submissionId: string,
  returnTo?: string,
  filter = "ALL",
) {
  const query = new URLSearchParams({ filter });
  if (returnTo) query.set("returnTo", returnTo);
  return `/teacher/assignments/${assignmentId}/submissions/${submissionId}?${query}`;
}

export function personalWorkReturn(
  value: string | undefined,
  assignmentId: string,
  studentId: string,
  classroomId: string,
) {
  const fallback = `/teacher/assignments/${assignmentId}/submissions`;
  const studentReturn = safeStudentWorkReturn(value, studentId, classroomId);
  if (studentReturn) return { href: studentReturn, label: "返回该学生的作业" };
  if (
    !value ||
    value.length > 8000 ||
    !value.startsWith("/teacher/assignments/")
  )
    return { href: fallback, label: "返回提交列表" };
  try {
    const url = new URL(value, "http://localhost");
    if (url.origin !== "http://localhost") throw new Error("Invalid origin");
    const results =
      url.pathname === `/teacher/assignments/${assignmentId}/results`;
    if (!results && url.pathname !== fallback) throw new Error("Invalid path");
    const input = Object.fromEntries(url.searchParams);
    const schema = results
      ? z
          .object({
            page: z.coerce.number().int().min(1).default(1),
            pageSize: z.coerce.number().int().min(1).max(50).default(20),
          })
          .strict()
      : teacherSubmissionListQuerySchema;
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new Error("Invalid query");
    const params = new URLSearchParams();
    for (const [key, item] of Object.entries(parsed.data))
      if (item !== undefined)
        params.set(key, String(item) === "PUBLISHED" ? "GRADED" : String(item));
    const hash = /^#(?:student-|submission-)[a-z0-9]+$/i.test(url.hash)
      ? url.hash
      : "";
    return {
      href: `${url.pathname}?${params}${hash}`,
      label: results ? "返回班级成绩" : "返回提交列表",
    };
  } catch {
    return { href: fallback, label: "返回提交列表" };
  }
}
