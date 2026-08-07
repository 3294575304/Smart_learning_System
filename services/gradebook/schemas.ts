import { GradeValueStatus } from "@prisma/client";
import { z } from "zod";

export const createGradebookSchema = z
  .object({ classroomId: z.string().cuid("班级 ID 格式无效") })
  .strict();

export const syncPlatformGradesSchema = z
  .object({
    componentId: z.string().cuid("考核项目 ID 格式无效"),
    assignmentId: z.string().cuid("作业 ID 格式无效"),
  })
  .strict();

export const correctGradeEntrySchema = z
  .object({
    status: z.nativeEnum(GradeValueStatus),
    score: z.number().finite().nonnegative().nullable(),
    reason: z.string().trim().min(1).max(500),
    idempotencyKey: z.string().trim().min(8).max(191),
    expectedRevisionNumber: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === GradeValueStatus.SCORED && value.score === null) {
      context.addIssue({
        code: "custom",
        path: ["score"],
        message: "数值成绩必须填写分数",
      });
    }
    if (value.status !== GradeValueStatus.SCORED && value.score !== null) {
      context.addIssue({
        code: "custom",
        path: ["score"],
        message: "特殊状态不能同时填写数值分数",
      });
    }
  });

export const gradebookIdSchema = z.string().cuid("成绩台账 ID 格式无效");
export const gradeItemIdSchema = z.string().cuid("成绩项 ID 格式无效");
export const studentIdSchema = z.string().cuid("学生 ID 格式无效");
export const gradeImportBatchIdSchema = z.string().cuid("导入批次 ID 格式无效");
