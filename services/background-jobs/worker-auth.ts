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

function configuredWorkerSecrets(): string[] {
  const secret = process.env.BACKGROUND_JOB_WORKER_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new BackgroundWorkerAuthenticationError(
      "后台 worker 服务尚未配置",
      503,
    );
  }
  const previous = process.env.BACKGROUND_JOB_WORKER_PREVIOUS_SECRET?.trim();
  if (previous && previous.length < 32) {
    throw new BackgroundWorkerAuthenticationError(
      "后台 worker 轮换密钥配置无效",
      503,
    );
  }
  return previous ? [secret, previous] : [secret];
}

export function assertBackgroundWorkerRequest(request: Request): void {
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = Buffer.from(
    authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : "",
  );
  const authenticated = configuredWorkerSecrets().some((secret) => {
    const expected = Buffer.from(secret);
    return (
      expected.length === supplied.length && timingSafeEqual(expected, supplied)
    );
  });
  if (!authenticated) {
    throw new BackgroundWorkerAuthenticationError("后台 worker 认证失败", 401);
  }
}
