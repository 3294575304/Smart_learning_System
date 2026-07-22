import "server-only";

import { timingSafeEqual } from "node:crypto";

export class NotificationJobAuthenticationError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "NotificationJobAuthenticationError";
    this.status = status;
  }
}

function configuredSecret(): string {
  const secret = process.env.NOTIFICATION_JOB_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new NotificationJobAuthenticationError("内部任务服务尚未配置", 503);
  }
  return secret;
}

export function assertNotificationJobRequest(request: Request): void {
  const expected = configuredSecret();
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  if (
    expectedBuffer.length !== suppliedBuffer.length ||
    !timingSafeEqual(expectedBuffer, suppliedBuffer)
  ) {
    throw new NotificationJobAuthenticationError("内部任务认证失败", 401);
  }
}
