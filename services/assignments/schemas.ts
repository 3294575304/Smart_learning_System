import { AssignmentStatus } from "@prisma/client";
import { z } from "zod";

const assignmentQuestionSchema = z.object({
  questionId: z.string().cuid("题目 ID 格式无效"),
  sortOrder: z.number().int().min(1).max(200),
  points: z.number().positive("题目分值必须大于 0").max(10000),
});

export const assignmentUpsertSchema = z
  .object({
    title: z.string().trim().min(2, "作业名称至少需要 2 个字符").max(120),
    description: z.string().trim().max(5000).default(""),
    classroomId: z.string().cuid("班级 ID 格式无效"),
    publishedAt: z.coerce.date().optional(),
    dueAt: z.coerce.date().optional(),
    allowResubmission: z.boolean().default(false),
    questions: z.array(assignmentQuestionSchema).max(200),
  })
  .superRefine((value, context) => {
    const questionIds = value.questions.map((item) => item.questionId);
    const sortOrders = value.questions.map((item) => item.sortOrder);
    if (new Set(questionIds).size !== questionIds.length) {
      context.addIssue({
        code: "custom",
        path: ["questions"],
        message: "同一道题不能重复加入作业",
      });
    }
    if (new Set(sortOrders).size !== sortOrders.length) {
      context.addIssue({
        code: "custom",
        path: ["questions"],
        message: "题目顺序不能重复",
      });
    }
    if (value.publishedAt && value.dueAt && value.dueAt <= value.publishedAt) {
      context.addIssue({
        code: "custom",
        path: ["dueAt"],
        message: "截止时间必须晚于发布时间",
      });
    }
  });

export const assignmentIdSchema = z.string().cuid("作业 ID 格式无效");
export const submissionIdSchema = z.string().cuid("提交 ID 格式无效");

export const assignmentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: z.nativeEnum(AssignmentStatus).optional(),
  classroomId: z.string().cuid("班级 ID 格式无效").optional(),
  keyword: z.string().trim().max(120, "搜索关键词不能超过 120 个字符").optional(),
  sort: z
    .enum(["CREATED_DESC", "PUBLISHED_DESC", "DUE_ASC", "DUE_DESC"])
    .default("CREATED_DESC"),
});

export const studentResultsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(30).default(10),
});

export const studentAssignmentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  status: z
    .enum(["ALL", "PENDING", "IN_PROGRESS", "SUBMITTED", "EXPIRED"])
    .default("ALL"),
});

export const startAttemptSchema = z.object({
  idempotencyKey: z.string().uuid("幂等键格式无效"),
});

const answerBase = z.object({
  responseTimeMs: z.number().int().min(0).max(86_400_000).optional(),
  assignmentQuestionId: z.string().cuid("作业题目 ID 格式无效"),
});

const answerSchema = z.discriminatedUnion("kind", [
  answerBase.extend({ kind: z.literal("EMPTY") }),
  answerBase.extend({
    kind: z.literal("CHOICE"),
    optionIds: z
      .array(z.string().cuid("选项 ID 格式无效"))
      .max(20)
      .refine((items) => new Set(items).size === items.length, {
        message: "选项不能重复",
      }),
  }),
  answerBase.extend({ kind: z.literal("BOOLEAN"), value: z.boolean() }),
  answerBase.extend({
    kind: z.literal("TEXT"),
    value: z.string().max(10000, "答案不能超过 10000 个字符"),
  }),
]);

export const autosaveAnswersSchema = z.object({
  version: z.number().int().min(0),
  answers: z.array(answerSchema).min(1).max(200),
});

export type AssignmentUpsertData = z.output<typeof assignmentUpsertSchema>;
export type AssignmentListQuery = z.output<typeof assignmentListQuerySchema>;
export type StudentResultsQuery = z.output<typeof studentResultsQuerySchema>;
export type StudentAssignmentListQuery = z.output<
  typeof studentAssignmentListQuerySchema
>;
export type AutosaveAnswersData = z.output<typeof autosaveAnswersSchema>;
export type SavedAnswerInput = z.output<typeof answerSchema>;
