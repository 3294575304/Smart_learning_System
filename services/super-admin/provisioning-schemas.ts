import { z } from "zod";
import { createAdminUserSchema } from "@/services/admin/users/schemas";
import { PROVINCES } from "@/services/schools/provinces";
import { schoolBindingNameSchema } from "@/services/schools/schemas";

export const createPartnerSchoolSchema = z
  .object({
    name: z
      .string()
      .transform((name) => name.normalize("NFKC"))
      .pipe(schoolBindingNameSchema),
    provinceCode: z
      .string()
      .refine(
        (code) => PROVINCES.some((province) => province.code === code),
        "请选择所在省级地区",
      ),
  })
  .strict();

const initialSchoolAdminPasswordSchema = z
  .string()
  .min(1, "请输入初始密码")
  .max(72, "初始密码长度不能超过 72 个字符")
  .refine(
    (password) => new TextEncoder().encode(password).length <= 72,
    "初始密码的 UTF-8 长度不能超过 72 字节",
  );

export const createSchoolAdminSchema = createAdminUserSchema
  .pick({ displayName: true, email: true })
  .extend({
    password: initialSchoolAdminPasswordSchema,
    schoolId: z
      .string()
      .trim()
      .min(1, "请先选择合作学校")
      .max(100, "学校标识无效"),
    confirmPassword: z.string().min(1, "请再次输入初始密码"),
  })
  .strict()
  .refine((input) => input.password === input.confirmPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"],
  });

const schoolAdminPasswordSchema = z
  .string()
  .min(8, "密码至少需要 8 个字符")
  .max(72, "密码长度不能超过 72 个字符")
  .regex(/[a-z]/, "密码必须包含小写字母")
  .regex(/[A-Z]/, "密码必须包含大写字母")
  .regex(/\d/, "密码必须包含数字")
  .refine(
    (password) => new TextEncoder().encode(password).length <= 72,
    "密码的 UTF-8 长度不能超过 72 字节",
  );

const optionalSchoolAdminPasswordSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.length === 0 ? undefined : value,
  schoolAdminPasswordSchema.optional(),
);

export const updateSchoolAdminSchema = z
  .object({
    displayName: z.string().trim().min(2, "姓名至少需要 2 个字符").max(50),
    email: z
      .string()
      .trim()
      .min(1, "请输入邮箱")
      .max(254, "邮箱长度不能超过 254 个字符")
      .email("请输入有效的邮箱地址")
      .transform((email) => email.toLowerCase()),
    password: optionalSchoolAdminPasswordSchema,
    confirmPassword: z.string().optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.password === undefined
        ? !input.confirmPassword
        : input.password === input.confirmPassword,
    { message: "两次输入的密码不一致", path: ["confirmPassword"] },
  );

export type CreatePartnerSchoolInput = z.input<
  typeof createPartnerSchoolSchema
>;
export type CreatePartnerSchoolData = z.output<
  typeof createPartnerSchoolSchema
>;
export type CreateSchoolAdminInput = z.input<typeof createSchoolAdminSchema>;
export type CreateSchoolAdminData = z.output<typeof createSchoolAdminSchema>;
export type UpdateSchoolAdminInput = z.input<typeof updateSchoolAdminSchema>;
export type UpdateSchoolAdminData = z.output<typeof updateSchoolAdminSchema>;

export const partnerSchoolIdSchema = z
  .string()
  .trim()
  .min(1, "学校标识无效")
  .max(100, "学校标识无效");
