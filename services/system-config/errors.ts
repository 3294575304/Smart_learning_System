export class SystemConfigOperationError extends Error {
  constructor(
    message: string,
    readonly status: 409 | 422 = 409,
  ) {
    super(message);
    this.name = "SystemConfigOperationError";
  }
}

export class MaintenanceModeError extends Error {
  readonly status = 503;
  readonly code = "SYSTEM_MAINTENANCE";

  constructor(message: string) {
    super(message);
    this.name = "MaintenanceModeError";
  }
}

export class SelfRegistrationDisabledError extends Error {
  readonly status = 403;

  constructor(message = "系统当前未开放自主注册") {
    super(message);
    this.name = "SelfRegistrationDisabledError";
  }
}
