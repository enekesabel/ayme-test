export interface PollOptions {
  /** Total timeout in milliseconds. Defaults to 5000. */
  timeout?: number;
  /** Escalating polling intervals in milliseconds. Defaults to [100, 250, 500, 1000]. */
  intervals?: number[];
}

const DEFAULT_TIMEOUT = 5000;
const DEFAULT_INTERVALS = [100, 250, 500, 1000];

/**
 * Retry an action with escalating polling intervals until it succeeds or times out.
 * Inspired by Playwright's `retryWithProgressAndTimeouts`.
 *
 * - First attempt is immediate (no delay).
 * - Subsequent attempts use escalating intervals, clamping at the last value.
 * - On success: returns the result.
 * - On timeout: throws the last error encountered.
 *
 * @internal Not exported from the public API.
 */
export async function poll<R>(
  action: () => Promise<R>,
  options?: PollOptions,
): Promise<R> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  const intervals = [0, ...(options?.intervals ?? DEFAULT_INTERVALS)];
  let intervalIndex = 0;
  let lastError: unknown;

  const deadline = Date.now() + timeout;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const interval = intervals[Math.min(intervalIndex++, intervals.length - 1)]!;

    if (interval > 0) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await sleep(Math.min(interval, remaining));
    }

    try {
      return await action();
    } catch (e) {
      lastError = e;
      if (Date.now() >= deadline) break;
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
