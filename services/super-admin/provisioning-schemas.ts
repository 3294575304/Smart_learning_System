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

export const createSchoolAdminSchema = createAdminUserSchema
  .pick({ displayName: true, email: true, password: true })
  .extend({
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

export type CreatePartnerSchoolInput = z.input<
  typeof createPartnerSchoolSchema
>;
export type CreatePartnerSchoolData = z.output<
  typeof createPartnerSchoolSchema
>;
export type CreateSchoolAdminInput = z.input<typeof createSchoolAdminSchema>;
export type CreateSchoolAdminData = z.output<typeof createSchoolAdminSchema>;

export const partnerSchoolIdSchema = z
  .string()
  .trim()
  .min(1, "学校标识无效")
  .max(100, "学校标识无效");
