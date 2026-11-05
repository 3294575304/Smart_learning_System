export class ProvisioningError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
    this.name = "ProvisioningError";
  }
}
