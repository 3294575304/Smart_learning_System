export class AssessmentSchemeOperationError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly code = "ASSESSMENT_SCHEME_ERROR",
  ) {
    super(message);
    this.name = "AssessmentSchemeOperationError";
  }
}
