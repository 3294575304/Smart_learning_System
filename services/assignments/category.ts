import { z } from "zod";
export const assignmentCategorySchema = z.enum(
  ["PRACTICE", "COURSE_ASSIGNMENT", "COURSE_EXPERIMENT"],
  { errorMap: () => ({ message: "请选择作业类别" }) },
);
export type AssignmentCategoryValue = z.infer<typeof assignmentCategorySchema>;
export const ASSIGNMENT_CATEGORY_LABELS = {
  PRACTICE: "练习",
  COURSE_ASSIGNMENT: "课程作业",
  COURSE_EXPERIMENT: "课程实验",
} as const;
export const ASSIGNMENT_COMPONENT_TYPES = {
  PRACTICE: "REGULAR_PERFORMANCE",
  COURSE_ASSIGNMENT: "COURSE_ASSIGNMENT",
  COURSE_EXPERIMENT: "COURSE_EXPERIMENT",
} as const;
export function assignmentSyncIssue(
  category: AssignmentCategoryValue,
  component: {
    type: string;
    sourceType: string;
    enabled: boolean;
    assignmentAggregationConfirmed: boolean;
  },
) {
  if (component.type !== ASSIGNMENT_COMPONENT_TYPES[category])
    return "作业类别与考核项目不匹配；旧台账关联保留，请先核对分类与原台账。";
  if (
    !component.enabled ||
    component.sourceType !== "PLATFORM_ASSIGNMENT" ||
    !component.assignmentAggregationConfirmed
  )
    return "请先在正式考核方案中确认：此项目完全使用对应类别作业的百分制等权平均。含出勤等混合构成时不得勾选，需先明确拆分规则。";
  return null;
}
