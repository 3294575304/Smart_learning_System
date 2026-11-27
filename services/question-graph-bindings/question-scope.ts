import { QuestionStatus, type Prisma } from "@prisma/client";

/**
 * 「有效题目」的唯一判定口径。
 *
 * 为什么需要收敛到一处：
 * - 内容覆盖自检（services/courses/content-coverage.ts）与知识图谱题库统计
 *   （services/question-graph-bindings/service.ts#getGraphQuestionCoverage）
 *   此前各写一套 where：前者过滤 ACTIVE 但不限课程分类，后者限课程分类但不过滤状态，
 *   导致同一门课在两个页面显示不同的"有题"数字。
 * - 绑定写入路径（accessibleQuestion）本来就用「启用 + 未删除 + 属于本课程题库分类」，
 *   说明这才是系统内公认的"能绑、能布置"的题目定义。统计应与之一致。
 *
 * 任何新增的覆盖/绑定统计都应引用本函数，不要在调用处另写条件。
 */
export function coverageQuestionWhere(
  questionCategoryId: string,
): Prisma.QuestionWhereInput {
  return {
    status: QuestionStatus.ACTIVE,
    deletedAt: null,
    questionCategoryId,
  };
}
