export class QualityReportOperationError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = "QUALITY_REPORT_ERROR",
  ) {
    super(message);
    this.name = "QualityReportOperationError";
  }
}
