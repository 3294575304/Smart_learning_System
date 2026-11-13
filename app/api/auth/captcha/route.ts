import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";

import { apiError, apiSuccess } from "@/lib/api-response";
import {
  CAPTCHA_COOKIE,
  CAPTCHA_COOKIE_PATTERN,
  getCaptchaStore,
} from "@/services/auth/captcha";
import {
  generateCaptchaAnswer,
  renderCaptchaImage,
} from "@/services/auth/captcha-image";
import { captchaRequestSchema } from "@/services/auth/captcha-schema";
import { CaptchaCapacityError } from "@/services/auth/captcha-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // This public endpoint issues challenges only for the requesting browser.
  if (request.headers.get("sec-fetch-site") === "cross-site")
    return apiError("不允许跨站请求", 403);
  try {
    const parsed = captchaRequestSchema.safeParse(await request.json());
    if (!parsed.success) return apiError("验证码请求无效", 400);
    const cookieStore = await cookies();
    const existing = cookieStore.get(CAPTCHA_COOKIE)?.value;
    const binding =
      existing && CAPTCHA_COOKIE_PATTERN.test(existing)
        ? existing
        : randomBytes(32).toString("base64url");
    const store = getCaptchaStore();
    if (parsed.data.previousId)
      await store.invalidate(parsed.data.previousId, binding);
    const answer = generateCaptchaAnswer();
    const image = renderCaptchaImage(answer);
    const challenge = await store.issue(answer, binding);
    const response = apiSuccess({ ...challenge, image }, 200, {
      "Cache-Control": "no-store, private",
      Pragma: "no-cache",
    });
    response.cookies.set(CAPTCHA_COOKIE, binding, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 86400,
    });
    return response;
  } catch (error) {
    if (error instanceof SyntaxError) return apiError("验证码请求无效", 400);
    console.error(
      "Failed to issue login captcha",
      error instanceof Error ? error.name : "UnknownError",
    );
    return apiError(
      "验证码暂时无法加载，请稍后重试",
      503,
      undefined,
      error instanceof CaptchaCapacityError
        ? "CAPTCHA_CAPACITY"
        : "CAPTCHA_UNAVAILABLE",
    );
  }
}
