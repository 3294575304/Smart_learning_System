export class AnnouncementOperationError extends Error {
  readonly status: number;
  /** 可选业务码，供前端区分「需要二次确认」这类可恢复错误。 */
  readonly code?: string;

  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.name = "AnnouncementOperationError";
    this.status = status;
    if (code) this.code = code;
  }
}
