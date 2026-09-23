/** A failure that reached the server and came back with a code. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** True when retrying later could succeed — the sync engine keeps the event. */
  get isRetryable(): boolean {
    if (this.status >= 500) return true;
    if (this.status === 429) return true;
    return false;
  }

  /** The device needs pairing again. */
  get needsRepair(): boolean {
    return this.status === 401 || this.code === "TOKEN_EXPIRED";
  }
}

/** The request never reached the server: offline, DNS failure, timeout. */
export class NetworkError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "NetworkError";
    this.cause = cause;
  }
}

/** Maps any thrown value onto a patient-facing translation key. */
export function friendlyErrorKey(error: unknown): string {
  if (error instanceof NetworkError) return "errors.noInternet";
  if (error instanceof ApiRequestError) {
    if (error.needsRepair) return "errors.sessionExpired";
    if (error.status === 410) return "pairing.expired";
    if (error.status === 404) return "pairing.invalid";
    if (error.status >= 500) return "errors.serverUnavailable";
    return "errors.generic";
  }
  return "errors.generic";
}
