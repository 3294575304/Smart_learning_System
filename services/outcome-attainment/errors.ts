export class OutcomeAttainmentError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = "OUTCOME_ATTAINMENT_FAILED",
  ) {
    super(message);
    this.name = "OutcomeAttainmentError";
  }
}
