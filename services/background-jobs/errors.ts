export const BACKGROUND_JOB_ERROR_CODES = {
  INPUT_CONFLICT: "BACKGROUND_JOB_INPUT_CONFLICT",
  LEASE_LOST: "BACKGROUND_JOB_LEASE_LOST",
  LEASE_EXPIRED: "BACKGROUND_JOB_LEASE_EXPIRED",
  CANCELLED: "BACKGROUND_JOB_CANCELLED",
  INTERNAL: "BACKGROUND_JOB_INTERNAL_ERROR",
  EXECUTOR_UNAVAILABLE: "EXECUTOR_UNAVAILABLE",
  EXECUTOR_TIMEOUT: "EXECUTOR_TIMEOUT",
  SECURITY_CAPABILITY_FAILED: "SANDBOX_SECURITY_CAPABILITY_FAILED",
} as const;

export class BackgroundJobError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BackgroundJobError";
  }
}

export class BackgroundJobInputConflictError extends BackgroundJobError {
  constructor() {
    super(
      "幂等键已用于不同的任务输入",
      BACKGROUND_JOB_ERROR_CODES.INPUT_CONFLICT,
      409,
    );
  }
}

export class BackgroundJobLeaseLostError extends BackgroundJobError {
  constructor() {
    super("任务租约已失效", BACKGROUND_JOB_ERROR_CODES.LEASE_LOST, 409);
  }
}
