import { createHmac } from "node:crypto";

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const PHONE_PATTERN = /(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/gu;
const LONG_NUMBER_PATTERN = /(?<!\d)\d{8,18}(?!\d)/gu;
const CONTROL_CHARACTER_PATTERN =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu;

export function createAnonymousStudentId(
  studentId: string,
  salt: string,
): string {
  if (salt.length < 16) {
    throw new Error("AI 匿名化盐至少需要 16 个字符");
  }
  return createHmac("sha256", salt).update(studentId).digest("hex");
}

export function scrubSensitiveText(
  value: string,
  knownPrivateValues: readonly string[] = [],
  maxLength = 4_000,
): string {
  let sanitized = value
    .normalize("NFKC")
    .replace(CONTROL_CHARACTER_PATTERN, " ")
    .replace(EMAIL_PATTERN, "[已隐藏邮箱]")
    .replace(PHONE_PATTERN, "[已隐藏手机号]")
    .replace(LONG_NUMBER_PATTERN, "[已隐藏编号]");

  for (const privateValue of knownPrivateValues) {
    const normalized = privateValue.normalize("NFKC").trim();
    if (normalized.length >= 2) {
      sanitized = sanitized.split(normalized).join("[已隐藏身份信息]");
    }
  }

  return sanitized.replace(/\s+/gu, " ").trim().slice(0, maxLength);
}
