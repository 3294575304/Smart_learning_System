import { Role, UserStatus } from "@prisma/client";
import { z } from "zod";

function fitsBcryptLimit(password: string): boolean {
  return new TextEncoder().encode(password).length <= 72;
}

const normalizedEmailSchema = z
  .string()
  .trim()
  .min(1, "请输入邮箱")
  .max(254, "邮箱长度不能超过 254 个字符")
  .email("请输入有效的邮箱地址")
  .transform((email) => email.toLowerCase());

const displayNameSchema = z
  .string()
  .trim()
  .min(2, "姓名至少需要 2 个字符")
  .max(50, "姓名长度不能超过 50 个字符");

const optionalDisplayNameSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0 ? undefined : value,
  displayNameSchema.optional(),
);

const optionalNormalizedEmailSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0 ? undefined : value,
  normalizedEmailSchema.optional(),
);

const initialPasswordSchema = z
  .string()
  .min(8, "初始密码至少需要 8 个字符")
  .max(72, "初始密码长度不能超过 72 个字符")
  .regex(/[a-z]/, "初始密码必须包含小写字母")
  .regex(/[A-Z]/, "初始密码必须包含大写字母")
  .regex(/\d/, "初始密码必须包含数字")
  .refine(fitsBcryptLimit, "初始密码的 UTF-8 长度不能超过 72 字节");

export const adminUserIdSchema = z.string().cuid("用户 ID 格式无效");

export const adminUserListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    keyword: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().trim().min(1).max(100).optional(),
    ),
    role: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.nativeEnum(Role).optional(),
    ),
    status: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.nativeEnum(UserStatus).optional(),
    ),
    sortBy: z
      .enum(["createdAt", "updatedAt", "email", "role", "status"])
      .default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();

export const createAdminUserSchema = z
  .object({
    displayName: displayNameSchema,
    email: normalizedEmailSchema,
    password: initialPasswordSchema,
    role: z.nativeEnum(Role),
  })
  .strict();

export const updateAdminUserSchema = z
  .object({
    displayName: optionalDisplayNameSchema,
    email: optionalNormalizedEmailSchema,
    role: z.nativeEnum(Role).optional(),
    status: z.nativeEnum(UserStatus).optional(),
  })
  .strict()
  .refine(
    (input) => Object.values(input).some((value) => value !== undefined),
    "至少需要提供一个可修改字段",
  );

export type AdminUserListQuery = z.output<typeof adminUserListQuerySchema>;
export type CreateAdminUserInput = z.input<typeof createAdminUserSchema>;
export type CreateAdminUserData = z.output<typeof createAdminUserSchema>;
export type UpdateAdminUserInput = z.input<typeof updateAdminUserSchema>;
export type UpdateAdminUserData = z.output<typeof updateAdminUserSchema>;
