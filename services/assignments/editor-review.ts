import { assignmentUpsertSchema, type AssignmentUpsertData } from "./schemas";

export function validateEditorAction(
  input: unknown,
  publish: boolean,
  now = new Date(),
): AssignmentUpsertData {
  const data = assignmentUpsertSchema.parse(input);
  if (publish) {
    if (!data.submissionTask && !data.questions.length)
      throw new Error("发布前请至少选择一道题");
    if (!data.publishedAt || !data.dueAt)
      throw new Error("发布前请设置发布时间和截止时间");
    if (data.dueAt <= now) throw new Error("截止时间必须晚于当前时间");
  }
  return data;
}

export function courseSwitchImpact<
  T extends { questionCategoryId: string | null },
>(
  questions: T[],
  categoryId: string | null,
  attachmentCount: number,
  changesCourse: boolean,
) {
  const retained = categoryId
    ? questions.filter((q) => q.questionCategoryId === categoryId)
    : questions;
  return {
    retained,
    removedCount: questions.length - retained.length,
    removedAttachments: changesCourse ? attachmentCount : 0,
  };
}
