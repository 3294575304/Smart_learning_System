import { QuestionType } from "@prisma/client";
import { z } from "zod";
import {
  activityPage,
  examListReturn,
} from "@/services/student-experience/activity-query";
import {
  studentTaskHref,
  studentTaskScopeSchema,
  type StudentTaskScope,
} from "@/services/student-experience/task-scope";

export const examReviewAnchor = "#exam-wrong-questions";
export const examReviewStatuses = {
  INCORRECT: "答错",
  PARTIAL: "部分得分",
  UNANSWERED: "未作答",
} as const;
export type ExamReviewStatus = keyof typeof examReviewStatuses;
const statusSchema = z.enum(["INCORRECT", "PARTIAL", "UNANSWERED"]);
const positiveInteger = z
  .string()
  .regex(/^[1-9]\d{0,5}$/)
  .transform(Number);
const reviewQuerySchema = z.object({
  questionType: z.nativeEnum(QuestionType).optional().catch(undefined),
  reviewStatus: statusSchema.optional().catch(undefined),
  questionNumber: positiveInteger.optional().catch(undefined),
  reviewPage: positiveInteger.catch(1),
});
export type ExamReviewQuery = z.output<typeof reviewQuerySchema>;

export function readExamReviewQuery(query: Record<string, unknown>) {
  return reviewQuerySchema.parse(query);
}

export function examReviewPage<
  T extends { type: QuestionType; status: ExamReviewStatus; number: number },
>(items: T[], query: ExamReviewQuery) {
  return activityPage(
    items.filter(
      (item) =>
        (!query.questionType || item.type === query.questionType) &&
        (!query.reviewStatus || item.status === query.reviewStatus) &&
        (!query.questionNumber || item.number === query.questionNumber),
    ),
    query.reviewPage,
  );
}

export function examReportHref(
  examId: string,
  scope: StudentTaskScope,
  examList: string,
  query?: ExamReviewQuery,
) {
  const params = new URLSearchParams({ returnTo: examList });
  if (query?.questionType) params.set("questionType", query.questionType);
  if (query?.reviewStatus) params.set("reviewStatus", query.reviewStatus);
  if (query?.questionNumber)
    params.set("questionNumber", String(query.questionNumber));
  if (query && query.reviewPage > 1)
    params.set("reviewPage", String(query.reviewPage));
  return studentTaskHref(`/student/exams/${examId}/report?${params}`, scope);
}

export function examReportReturn(
  value: unknown,
  examId: string,
  assignmentId: string,
  scope: StudentTaskScope,
) {
  const path = `/student/exams/${examId}/report`;
  if (
    typeof value !== "string" ||
    value.length > 2400 ||
    !value.startsWith(`${path}?`)
  )
    return;
  const url = new URL(value, "http://localhost");
  if (url.pathname !== path || (url.hash && url.hash !== examReviewAnchor))
    return;
  const query = Object.fromEntries(url.searchParams);
  const parsed = studentTaskScopeSchema.safeParse(query);
  if (
    !parsed.success ||
    parsed.data.courseId !== scope.courseId ||
    parsed.data.classroomId !== scope.classroomId
  )
    return;
  const href = examReportHref(
    examId,
    scope,
    examListReturn(query.returnTo, { ...scope, focus: assignmentId }),
    readExamReviewQuery(query),
  );
  // 从「整卷索引」点进某题再返回时，保持原来的报告视图。
  const tab =
    query.tab === "paper" || query.tab === "overview" || query.tab === "wrong"
      ? query.tab
      : undefined;
  return (tab ? `${href}&tab=${tab}` : href) + url.hash;
}
