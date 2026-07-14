// Thrown by auth guards / flows. `status` maps to an HTTP status when surfaced.
export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}
