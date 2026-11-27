import { z } from "zod";
import { QuestionType } from "@prisma/client";
import { safeStudentWorkReturn } from "./student-query";
import { teacherSubmissionListQuerySchema } from "./schemas";
import {
  examListContext,
  examMonitorHref,
  examWorkspaceHref,
  teacherAssessmentHref,
} from "@/services/exams/classroom-navigation";

export const personalWorkQuerySchema = z.object({
  filter: z
    .enum([
      "ALL",
      "WRONG",
      "CORRECT",
      "INCORRECT",
      "PARTIAL",
      "PENDING",
      "PENDING_REVIEW",
    ])
    .default("ALL")
    .transform((value) => (value === "PENDING_REVIEW" ? "ALL" : value)),
  returnTo: z.string().max(8000).optional(),
  questionType: z.nativeEnum(QuestionType).optional(),
  answerStatus: z.enum(["ANSWERED", "UNANSWERED"]).optional(),
});

export type PersonalWorkFilters = Pick<
  z.output<typeof personalWorkQuerySchema>,
  "filter" | "questionType" | "answerStatus"
>;

export function personalWorkHref(
  assignmentId: string,
  submissionId: string,
  returnTo?: string,
  filter = "ALL",
  examId?: string | null,
  filters?: Omit<PersonalWorkFilters, "filter">,
) {
  const query = new URLSearchParams({ filter });
  if (returnTo) query.set("returnTo", returnTo);
  if (filters?.questionType) query.set("questionType", filters.questionType);
  if (filters?.answerStatus) query.set("answerStatus", filters.answerStatus);
  return `${teacherAssessmentHref(assignmentId, examId)}/submissions/${submissionId}?${query}`;
}

/** Never replace a missing student submission with the class-wide assignment page. */
export function studentAssignmentPersonalHref(
  assignmentId: string,
  studentId: string,
  submissionId: string | null,
  returnTo: string,
) {
  if (submissionId)
    return personalWorkHref(assignmentId, submissionId, returnTo);
  const query = new URLSearchParams({ studentId, returnTo });
  return `/teacher/assignments/${assignmentId}/results?${query}`;
}

export function personalWorkReturn(
  value: string | undefined,
  assignmentId: string,
  studentId: string,
  classroomId: string,
  examId?: string | null,
) {
  const base = teacherAssessmentHref(assignmentId, examId);
  const fallback = `${base}/submissions`;
  const studentReturn = examId
    ? null
    : safeStudentWorkReturn(value, studentId, classroomId);
  const fallbackLabel = examId ? "返回答卷列表" : "返回提交列表";
  if (studentReturn) return { href: studentReturn, label: "返回该学生的作业" };
  if (!value || value.length > 8000 || !value.startsWith("/teacher/"))
    return { href: fallback, label: fallbackLabel };
  try {
    const url = new URL(value, "http://localhost");
    if (url.origin !== "http://localhost") throw new Error("Invalid origin");
    const context = examId
      ? examListContext(url.searchParams.get("examList"))
      : "";
    url.searchParams.delete("examList");
    if (examId && url.pathname === `/teacher/exams/${examId}/monitor`) {
      if (
        url.searchParams.size !== 1 ||
        url.searchParams.get("classroomId") !== classroomId
      )
        throw new Error("Invalid classroom");
      const hash = /^#(?:monitor-|review-)[a-z0-9]+$/i.test(url.hash)
        ? url.hash
        : "";
      return {
        href: examWorkspaceHref(
          `${examMonitorHref(examId, classroomId)}${hash}`,
          context,
        ),
        label: "返回监考与公布",
      };
    }
    const legacyBase = teacherAssessmentHref(assignmentId);
    const results =
      url.pathname === `${base}/results` ||
      (examId && url.pathname === `${legacyBase}/results`);
    if (
      !results &&
      url.pathname !== fallback &&
      !(examId && url.pathname === `${legacyBase}/submissions`)
    )
      throw new Error("Invalid path");
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
      href: examWorkspaceHref(
        `${results ? `${base}/results` : fallback}?${params}${hash}`,
        context,
      ),
      label: results ? "返回班级成绩" : fallbackLabel,
    };
  } catch {
    return { href: fallback, label: fallbackLabel };
  }
}
