import "server-only";

export class QuestionImportError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = "QUESTION_IMPORT_FAILED",
  ) {
    super(message);
    this.name = "QuestionImportError";
  }
}
