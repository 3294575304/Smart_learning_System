import { z } from "zod";

const classroomNameSchema = z
  .string()
  .trim()
  .min(2, "班级名称至少需要 2 个字符")
  .max(80, "班级名称不能超过 80 个字符");

const classroomDescriptionSchema = z
  .string()
  .trim()
  .max(500, "班级描述不能超过 500 个字符")
  .transform((description) => description || null);

export const classroomIdSchema = z.string().cuid("班级 ID 格式无效");
export const membershipIdSchema = z.string().cuid("成员 ID 格式无效");

export const createClassroomSchema = z.object({
  name: classroomNameSchema,
  description: classroomDescriptionSchema,
  allowStudentLeave: z.boolean(),
});

export const updateClassroomSchema = createClassroomSchema;

export const joinClassroomSchema = z.object({
  joinCode: z
    .string()
    .trim()
    .toUpperCase()
    .min(6, "请输入有效的邀请码")
    .max(16, "请输入有效的邀请码")
    .regex(/^[A-Z0-9-]+$/, "邀请码只能包含大写字母、数字和连字符"),
});

export type CreateClassroomInput = z.input<typeof createClassroomSchema>;
export type CreateClassroomData = z.output<typeof createClassroomSchema>;
export type UpdateClassroomInput = z.input<typeof updateClassroomSchema>;
export type JoinClassroomInput = z.input<typeof joinClassroomSchema>;
