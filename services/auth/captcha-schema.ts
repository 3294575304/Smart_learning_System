import { z } from "zod";

export const captchaIdSchema = z
  .string()
  .regex(/^[a-f0-9]{48}$/, "请刷新验证码后重试");

export const loginCaptchaFields = {
  captchaId: captchaIdSchema,
  captchaAnswer: z
    .string()
    .trim()
    .min(1, "请输入图形验证码")
    .regex(/^[a-zA-Z0-9]{5}$/, "请输入图片中的 5 位字符"),
};

export const captchaRequestSchema = z
  .object({ previousId: captchaIdSchema.optional() })
  .strict();

export const captchaResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: captchaIdSchema,
    image: z.string().startsWith("data:image/png;base64,"),
    expiresAt: z.number().int().positive(),
  }),
});

export type LoginCaptchaInput = z.input<z.ZodObject<typeof loginCaptchaFields>>;
