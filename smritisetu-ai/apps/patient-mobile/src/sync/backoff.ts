/**
 * Exponential backoff with jitter.
 *
 * A patient's device may sit on a weak rural connection for hours. Backing off
 * protects the battery and the server, while the jitter stops every device in a
 * village retrying in lockstep after an outage.
 */
export const BASE_DELAY_MS = 5_000;
export const MAX_DELAY_MS = 15 * 60 * 1000;
export const MAX_RETRIES_BEFORE_MAX_DELAY = 8;

export function backoffDelayMs(retryCount: number, jitter: () => number = Math.random): number {
  const clamped = Math.max(0, Math.min(retryCount, MAX_RETRIES_BEFORE_MAX_DELAY));
  const exponential = Math.min(BASE_DELAY_MS * 2 ** clamped, MAX_DELAY_MS);
  // Up to 20% jitter, always downward so the delay never exceeds the cap.
  const jitterFactor = 0.8 + jitter() * 0.2;
  return Math.round(exponential * jitterFactor);
}

export function nextAttemptAt(retryCount: number, from = Date.now()): number {
  return from + backoffDelayMs(retryCount);
}

/** Whether enough time has passed since the last attempt to try again. */
export function isReadyToRetry(
  retryCount: number,
  lastAttemptAt: string | undefined,
  now = Date.now(),
  jitter: () => number = () => 0.5,
): boolean {
  if (!lastAttemptAt) return true;
  const last = new Date(lastAttemptAt).getTime();
  if (Number.isNaN(last)) return true;
  return now - last >= backoffDelayMs(retryCount, jitter);
}
