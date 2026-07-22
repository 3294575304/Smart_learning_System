import type { Role } from "@prisma/client";

import type { AuthenticatedUser } from "@/services/auth/types";
import {
  MaintenanceModeError,
  SelfRegistrationDisabledError,
} from "@/services/system-config/errors";

export class AuthenticationError extends Error {
  readonly status = 401;

  constructor(message = "请先登录") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  readonly status = 403;

  constructor(message = "无权执行此操作") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export class ResourceNotFoundError extends Error {
  readonly status = 404;

  constructor(message = "资源不存在") {
    super(message);
    this.name = "ResourceNotFoundError";
  }
}

export function assertRole(
  user: AuthenticatedUser,
  allowedRoles: readonly Role[],
): void {
  if (!allowedRoles.includes(user.role)) {
    throw new AuthorizationError();
  }
}

export function getErrorStatus(error: unknown): number {
  if (
    error instanceof AuthenticationError ||
    error instanceof AuthorizationError ||
    error instanceof ResourceNotFoundError ||
    error instanceof MaintenanceModeError ||
    error instanceof SelfRegistrationDisabledError
  ) {
    return error.status;
  }

  return 500;
}

export function getSafeErrorMessage(error: unknown): string {
  if (
    error instanceof AuthenticationError ||
    error instanceof AuthorizationError ||
    error instanceof ResourceNotFoundError ||
    error instanceof MaintenanceModeError ||
    error instanceof SelfRegistrationDisabledError
  ) {
    return error.message;
  }

  return "服务器暂时无法处理请求";
}

export function roleHomePath(role: Role): string {
  const paths: Record<Role, string> = {
    ADMIN: "/admin",
    TEACHER: "/teacher",
    STUDENT: "/student",
  };

  return paths[role];
}
