import type { StateFunction } from './state';
import { StateBrandSymbol, StateNameSymbol } from './state';
import { poll } from './poll';
import {
  StateExpectationStabilityError,
  StateExpectationTimeoutError,
  type StateExpectationMismatch,
} from './errors';

export interface WaitForOptions {
  /** Maximum time to wait in milliseconds. Defaults to 5000ms. */
  timeout?: number;
  /** Time in milliseconds that all expectations must remain true before resolving. */
  stableFor?: number;
}

export type WaitForStateOptions = WaitForOptions;

type Expectation<T> = readonly [StateFunction<T>, T | ((value: T) => boolean)];
export type InternalExpectation = {
  label?: string;
  evaluate: () => Promise<StateExpectationMismatch | undefined>;
};

class PendingExpectationMismatchError extends Error {
  constructor(readonly mismatches: StateExpectationMismatch[]) {
    super('State expectations still mismatched');
  }
}

class PendingExpectationStabilityError extends Error {
  constructor(readonly stableFor: number, readonly timeout: number) {
    super('State expectations are not yet stable');
  }
}

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

export function waitFor(
  expectations: ReadonlyArray<InternalExpectation>,
  options?: WaitForOptions,
): Promise<void>;

// Implementation
export async function waitFor(
  first: number | StateFunction<unknown> | Expectation<unknown> | ReadonlyArray<Expectation<unknown> | InternalExpectation>,
  second?: unknown,
  third?: WaitForOptions,
): Promise<void> {
  if (typeof first === 'number') {
    return new Promise(resolve => setTimeout(resolve, first));
  }

  let expectations: ReadonlyArray<InternalExpectation>;
  let options: WaitForOptions | undefined;

  if (typeof first === 'function' && StateBrandSymbol in first) {
    expectations = [createStateExpectation(first as StateFunction<unknown>, second)];
    options = third;
  } else if (Array.isArray(first) && first.length === 2 && typeof first[0] === 'function' && StateBrandSymbol in first[0]) {
    const tuple = first as unknown as Expectation<unknown>;
    expectations = [createStateExpectation(tuple[0], tuple[1])];
    options = second as WaitForOptions | undefined;
  } else {
    expectations = normalizeExpectations(
      first as ReadonlyArray<Expectation<unknown> | InternalExpectation>,
    );
    options = second as WaitForOptions | undefined;
  }

  if (expectations.length === 0) return;

  await pollExpectations(expectations, options);
}

async function runExpectationPoll(
  expectations: ReadonlyArray<InternalExpectation>,
  options?: WaitForOptions,
): Promise<void> {
  const timeout = options?.timeout ?? 5000;
  const stableFor = options?.stableFor ?? 0;
  let stableSince: number | null = null;

  await poll(
    async () => {
      const mismatches: StateExpectationMismatch[] = [];

      for (const expectation of expectations) {
        const mismatch = await expectation.evaluate();
        if (mismatch) {
          mismatches.push(mismatch);
        }
      }

      if (mismatches.length > 0) {
        stableSince = null;
        throw new PendingExpectationMismatchError(mismatches);
      }

      if (stableFor > 0) {
        const now = Date.now();
        if (stableSince === null) stableSince = now;
        if (now - stableSince < stableFor) {
          throw new PendingExpectationStabilityError(stableFor, timeout);
        }
      }
    },
    { timeout },
  );
}

function normalizeExpectations(
  expectations: ReadonlyArray<Expectation<unknown> | InternalExpectation>,
): ReadonlyArray<InternalExpectation> {
  return expectations.map<InternalExpectation>(expectation => {
    if (Array.isArray(expectation)) {
      return createStateExpectation(expectation[0], expectation[1]);
    }
    return expectation as InternalExpectation;
  });
}

export function createStateExpectation<T>(
  state: StateFunction<T>,
  expected: T | ((value: T) => boolean),
): InternalExpectation {
  return {
    label: state[StateNameSymbol],
    evaluate: async () => {
      const current = await state();
      const isPredicate = typeof expected === 'function';
      const matches = isPredicate
        ? (expected as (value: T) => boolean)(current)
        : current === expected;

      if (matches) return undefined;

      return {
        state,
        label: state[StateNameSymbol],
        expected,
        current,
        isPredicate,
      };
    },
  };
}

export async function pollExpectations(
  expectations: ReadonlyArray<InternalExpectation>,
  options?: WaitForOptions,
): Promise<void> {
  try {
    await runExpectationPoll(expectations, options);
  } catch (error) {
    if (error instanceof PendingExpectationMismatchError) {
      throw new StateExpectationTimeoutError(error.mismatches, options?.timeout ?? 5000);
    }
    if (error instanceof PendingExpectationStabilityError) {
      throw new StateExpectationStabilityError(error.stableFor, error.timeout);
    }
    throw error;
  }
}
