import { z } from "zod";

export const assignmentResultsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    studentId: z.string().cuid("学生 ID 格式无效").optional(),
    submissionId: z.string().cuid("提交 ID 格式无效").optional(),
  })
  .refine((query) => !query.submissionId || Boolean(query.studentId), {
    path: ["submissionId"],
    message: "查看提交记录时必须指定学生",
  });

export type AssignmentResultsQuery = z.output<
  typeof assignmentResultsQuerySchema
>;
