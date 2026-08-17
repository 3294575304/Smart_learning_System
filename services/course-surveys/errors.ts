export class CourseSurveyOperationError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = "COURSE_SURVEY_ERROR",
  ) {
    super(message);
    this.name = "CourseSurveyOperationError";
  }
}
