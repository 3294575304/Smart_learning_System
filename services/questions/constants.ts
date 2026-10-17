import type { QuestionStatus, QuestionType } from "@prisma/client";

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  SINGLE_CHOICE: "单选题",
  MULTIPLE_CHOICE: "多选题",
  TRUE_FALSE: "判断题",
  FILL_BLANK: "填空题",
  SHORT_ANSWER: "简答与解答题",
  PYTHON_PROGRAMMING: "编程题",
};

// Display categories are independent of course subjects and stored enum values.
export const QUESTION_TYPE_GROUPS: ReadonlyArray<{
  label: string;
  types: ReadonlyArray<QuestionType>;
}> = [
  {
    label: "客观题",
    types: ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE", "FILL_BLANK"],
  },
  { label: "主观题", types: ["SHORT_ANSWER"] },
  { label: "实践题", types: ["PYTHON_PROGRAMMING"] },
];

export const QUESTION_TYPE_DESCRIPTIONS: Record<QuestionType, string> = {
  SINGLE_CHOICE: "设置唯一正确选项，适用于概念辨析、阅读理解和知识检查。",
  MULTIPLE_CHOICE: "设置多个正确选项，适用于综合判断与多条件分析。",
  TRUE_FALSE: "判断陈述是否正确，适用于概念、定理和语言规则辨析。",
  FILL_BLANK:
    "设置可接受答案，适用于数值、公式文本、单词或短语；按文本匹配判分。",
  SHORT_ANSWER:
    "填写参考答案，适用于数学推导、英语写作或代码分析，由教师人工批改。",
  PYTHON_PROGRAMMING:
    "通过代码、公开样例和隐藏用例进行判题；执行语言在判题配置中单独说明。",
};

export const QUESTION_STATUS_LABELS: Record<QuestionStatus, string> = {
  DRAFT: "草稿",
  ACTIVE: "已启用",
  INACTIVE: "已停用",
  ARCHIVED: "已归档",
};
