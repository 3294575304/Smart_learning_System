import "server-only";

import { resolve } from "node:path";
import { cookies } from "next/headers";
import { CaptchaChallengeStore } from "./captcha-store";
import type { LoginCaptchaInput } from "./captcha-schema";

export const CAPTCHA_COOKIE = "login_captcha_browser";
export const CAPTCHA_COOKIE_PATTERN = /^[a-zA-Z0-9_-]{43}$/;

export function getCaptchaStore() {
  return new CaptchaChallengeStore(
    resolve(
      process.env.LOGIN_CAPTCHA_STORAGE_DIR?.trim() || ".data/login-captcha",
    ),
  );
}

export async function validateLoginCaptcha(input: LoginCaptchaInput) {
  try {
    const binding = (await cookies()).get(CAPTCHA_COOKIE)?.value;
    if (!binding || !CAPTCHA_COOKIE_PATTERN.test(binding)) return false;
    return await getCaptchaStore().consume(input, binding);
  } catch (error) {
    console.error(
      "Failed to validate login captcha",
      error instanceof Error ? error.name : "UnknownError",
    );
    return false;
  }
}
