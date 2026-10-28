import { z } from "zod";

export const assignmentResultsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    studentId: z.string().cuid("学生 ID 格式无效").optional(),
    submissionId: z.string().cuid("提交 ID 格式无效").optional(),
    returnTo: z.string().max(8000).optional(),
  })
  .refine((query) => !query.submissionId || Boolean(query.studentId), {
    path: ["submissionId"],
    message: "查看提交记录时必须指定学生",
  });

export type AssignmentResultsQuery = z.output<
  typeof assignmentResultsQuerySchema
>;

export const teacherResultsOverviewQuerySchema = z.object({
  section: z.enum(["ALL", "CURRENT", "HISTORY"]).default("ALL"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(30).default(10),
  courseId: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().cuid("课程 ID 格式无效").optional(),
  ),
  classroomId: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().cuid("班级 ID 格式无效").optional(),
  ),
});

export type TeacherResultsOverviewQuery = z.output<
  typeof teacherResultsOverviewQuerySchema
>;
