import type { StateFunction } from './state';
import { StateNameSymbol } from './state';
import { poll } from './poll';
import { StateTimeoutError, type StateMismatch } from './errors';

export interface WaitForStatesOptions {
  /** Maximum time to wait in milliseconds. Defaults to 5000ms. */
  timeout?: number;
  /** Time in milliseconds that all expectations must remain true before resolving. */
  stableFor?: number;
}

export type WaitForStateOptions = WaitForStatesOptions;

/**
 * Waits until all state expectations are met, using polling with escalating intervals.
 * Throws a `StateTimeoutError` with detailed mismatches on timeout.
 */
export async function waitForStates(
  expectations: ReadonlyArray<readonly [StateFunction<unknown>, unknown]>,
  options?: WaitForStatesOptions,
): Promise<void> {
  if (expectations.length === 0) return;

  const timeout = options?.timeout ?? 5000;
  const stableFor = options?.stableFor ?? 0;
  let stableSince: number | null = null;

  await poll(
    async () => {
      const mismatches: StateMismatch[] = [];

      for (const [state, expected] of expectations) {
        const actual = await state();
        const isPredicate = typeof expected === 'function';
        const matches = isPredicate
          ? (expected as (value: unknown) => boolean)(actual)
          : actual === expected;

        if (!matches) {
          mismatches.push({
            state,
            stateName: state[StateNameSymbol],
            expected,
            actual,
            isPredicate,
          });
        }
      }

      if (mismatches.length > 0) {
        stableSince = null;
        throw new StateTimeoutError(mismatches, timeout);
      }

      if (stableFor > 0) {
        const now = Date.now();
        if (stableSince === null) stableSince = now;
        if (now - stableSince < stableFor) {
          throw new Error('Stability period not yet met');
        }
      }
    },
    { timeout },
  );
}
