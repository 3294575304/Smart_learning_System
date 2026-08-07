export class AttendanceOperationError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = "ATTENDANCE_OPERATION_FAILED",
  ) {
    super(message);
    this.name = "AttendanceOperationError";
  }
}
