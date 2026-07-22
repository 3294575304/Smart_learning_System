export class NotificationOperationError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "NotificationOperationError";
    this.status = status;
  }
}
