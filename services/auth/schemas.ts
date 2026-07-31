import { z } from "zod";

import { normalizeStudentNo } from "@/services/student-identities/normalization";

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

const loginIdentifierSchema = z
  .string()
  .trim()
  .min(1, "请输入登录账号")
  .max(254, "登录账号长度不能超过 254 个字符")
  .transform((value) =>
    value.includes("@") ? value.toLowerCase() : value.normalize("NFKC"),
  );

export const strongPasswordSchema = z
  .string()
  .min(8, "密码至少需要 8 个字符")
  .max(72, "密码长度不能超过 72 个字符")
  .regex(/[a-z]/, "密码必须包含小写字母")
  .regex(/[A-Z]/, "密码必须包含大写字母")
  .regex(/\d/, "密码必须包含数字")
  .refine(fitsBcryptLimit, "密码的 UTF-8 长度不能超过 72 字节");

export const loginSchema = z.object({
  email: loginIdentifierSchema,
  password: z
    .string()
    .min(1, "请输入密码")
    .max(72, "密码长度不能超过 72 个字符")
    .refine(fitsBcryptLimit, "密码的 UTF-8 长度不能超过 72 字节"),
});

export const registerSchema = z
  .object({
    studentNo: z
      .string()
      .transform(normalizeStudentNo)
      .pipe(
        z.string().min(1, "请输入学号").max(50, "学号长度不能超过 50 个字符"),
      ),
    displayName: z
      .string()
      .trim()
      .min(2, "姓名至少需要 2 个字符")
      .max(50, "姓名长度不能超过 50 个字符"),
    email: normalizedEmailSchema,
    password: strongPasswordSchema,
    confirmPassword: z.string().min(1, "请再次输入密码"),
  })
  .strict("注册信息包含不允许的字段")
  .refine((input) => input.password === input.confirmPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"],
  });

export const changeInitialPasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, "请输入当前初始密码")
      .max(72, "当前密码长度不能超过 72 个字符")
      .refine(fitsBcryptLimit, "当前密码的 UTF-8 长度不能超过 72 字节"),
    password: strongPasswordSchema,
    confirmPassword: z.string().min(1, "请再次输入新密码"),
  })
  .refine((input) => input.password === input.confirmPassword, {
    message: "两次输入的新密码不一致",
    path: ["confirmPassword"],
  });

export const classroomIdSchema = z.string().cuid("班级 ID 格式无效");

export type LoginInput = z.input<typeof loginSchema>;
export type RegisterInput = z.input<typeof registerSchema>;
export type RegisterData = z.output<typeof registerSchema>;
export type ChangeInitialPasswordInput = z.input<
  typeof changeInitialPasswordSchema
>;
export type ChangeInitialPasswordData = z.output<
  typeof changeInitialPasswordSchema
>;
