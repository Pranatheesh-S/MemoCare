/**
 * Every failure leaves the API in the same shape:
 *   { error: { code, message, details?, requestId } }
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(400, "BAD_REQUEST", message, details);
  }
  static validation(message: string, details?: unknown) {
    return new AppError(422, "VALIDATION_ERROR", message, details);
  }
  static unauthorized(message = "Authentication is required") {
    return new AppError(401, "UNAUTHORIZED", message);
  }
  static tokenExpired(message = "Session expired. Please sign in again.") {
    return new AppError(401, "TOKEN_EXPIRED", message);
  }
  static forbidden(message = "You do not have access to this resource") {
    return new AppError(403, "FORBIDDEN", message);
  }
  static notFound(resource = "Resource") {
    return new AppError(404, "NOT_FOUND", `${resource} was not found`);
  }
  static conflict(message: string, details?: unknown) {
    return new AppError(409, "CONFLICT", message, details);
  }
  static gone(message: string) {
    return new AppError(410, "GONE", message);
  }
  static tooManyRequests(message = "Too many requests. Please try again shortly.") {
    return new AppError(429, "RATE_LIMITED", message);
  }
  static internal(message = "Something went wrong on our side") {
    return new AppError(500, "INTERNAL_ERROR", message);
  }
  static serviceUnavailable(message = "A dependent service is unavailable") {
    return new AppError(503, "SERVICE_UNAVAILABLE", message);
  }
}
