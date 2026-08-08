import "server-only";

import { timingSafeEqual } from "node:crypto";

export class BackgroundWorkerAuthenticationError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BackgroundWorkerAuthenticationError";
  }
}

function configuredWorkerSecret(): string {
  const secret = process.env.BACKGROUND_JOB_WORKER_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new BackgroundWorkerAuthenticationError(
      "后台 worker 服务尚未配置",
      503,
    );
  }
  return secret;
}

export function assertBackgroundWorkerRequest(request: Request): void {
  const expected = Buffer.from(configuredWorkerSecret());
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = Buffer.from(
    authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : "",
  );
  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  ) {
    throw new BackgroundWorkerAuthenticationError("后台 worker 认证失败", 401);
  }
}
