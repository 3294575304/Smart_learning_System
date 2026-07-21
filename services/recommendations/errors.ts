export class RecommendationOperationError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "RecommendationOperationError";
    this.status = status;
  }
}
