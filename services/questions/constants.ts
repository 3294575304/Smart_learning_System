import type { QuestionStatus, QuestionType } from "@prisma/client";

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  SINGLE_CHOICE: "单选题",
  MULTIPLE_CHOICE: "多选题",
  TRUE_FALSE: "判断题",
  FILL_BLANK: "填空题",
  SHORT_ANSWER: "简答题",
  PYTHON_PROGRAMMING: "Python 编程题",
};

export const QUESTION_STATUS_LABELS: Record<QuestionStatus, string> = {
  DRAFT: "草稿",
  ACTIVE: "已启用",
  INACTIVE: "已停用",
  ARCHIVED: "已归档",
};
