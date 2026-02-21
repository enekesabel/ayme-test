import type { StateFunction } from './state';
import { StateBrandSymbol, StateNameSymbol } from './state';
import { poll } from './poll';
import { StateTimeoutError, type StateMismatch } from './errors';

export interface WaitForOptions {
  /** Maximum time to wait in milliseconds. Defaults to 5000ms. */
  timeout?: number;
  /** Time in milliseconds that all expectations must remain true before resolving. */
  stableFor?: number;
}

export type WaitForStateOptions = WaitForOptions;

type Expectation<T> = readonly [StateFunction<T>, T | ((value: T) => boolean)];

/**
 * Sleep for a given number of milliseconds.
 */
export function waitFor(ms: number): Promise<void>;

/**
 * Wait until a single state reaches an expected value.
 */
export function waitFor<T>(
  state: StateFunction<T>,
  expected: T | ((value: T) => boolean),
  options?: WaitForOptions,
): Promise<void>;

/**
 * Wait until a single expectation tuple is met.
 */
export function waitFor<T>(
  expectation: Expectation<T>,
  options?: WaitForOptions,
): Promise<void>;

/**
 * Wait until all state expectations are met.
 */
export function waitFor(
  expectations: ReadonlyArray<Expectation<unknown>>,
  options?: WaitForOptions,
): Promise<void>;

// Implementation
export async function waitFor(
  first: number | StateFunction<unknown> | Expectation<unknown> | ReadonlyArray<Expectation<unknown>>,
  second?: unknown,
  third?: WaitForOptions,
): Promise<void> {
  if (typeof first === 'number') {
    return new Promise(resolve => setTimeout(resolve, first));
  }

  let expectations: ReadonlyArray<Expectation<unknown>>;
  let options: WaitForOptions | undefined;

  if (typeof first === 'function' && StateBrandSymbol in first) {
    expectations = [[first as StateFunction<unknown>, second]];
    options = third;
  } else if (Array.isArray(first) && first.length === 2 && typeof first[0] === 'function' && StateBrandSymbol in first[0]) {
    expectations = [first as unknown as Expectation<unknown>];
    options = second as WaitForOptions | undefined;
  } else {
    expectations = first as ReadonlyArray<Expectation<unknown>>;
    options = second as WaitForOptions | undefined;
  }

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
