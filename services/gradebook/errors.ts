export class GradebookOperationError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly code = "GRADEBOOK_ERROR",
  ) {
    super(message);
    this.name = "GradebookOperationError";
  }
}
