import type { WaitForStateOptions } from './wait';
import { waitForStates } from './wait';

// ============ Branding Symbols ============

/** @internal */
export const StateBrandSymbol = Symbol('StateFunction');
/** @internal */
export const StateNameSymbol = Symbol('StateName');

/** Type-level brand. @internal */
declare const StateBrand: unique symbol;

// ============ StateFunction Type ============

/**
 * A branded async function representing a state query.
 * States are parameterless async functions that return a value.
 */
export type StateFunction<R> = (() => Promise<R>) & {
  [StateBrand]: R;
  [StateBrandSymbol]: true;
  [StateNameSymbol]?: string;
  /** Wait until this state matches the expected value or predicate. */
  waitFor(
    expected: R | ((value: R) => boolean),
    options?: WaitForStateOptions,
  ): Promise<void>;
  /** Set a display name for error messages. Returns the same instance (chainable). */
  named(name: string): StateFunction<R>;
};

// ============ Brand Helper ============

/**
 * Brands an async function as a StateFunction, adding `waitFor` and `named` methods.
 * @internal — not part of the public primitives API.
 */
export function brandState<R>(fn: () => Promise<R>): StateFunction<R> {
  const state = fn as StateFunction<R>;

  (state as any)[StateBrandSymbol] = true;

  state.named = (name: string): StateFunction<R> => {
    Object.defineProperty(state, StateNameSymbol, {
      value: name,
      configurable: true,
    });
    return state;
  };

  state.waitFor = async (
    expected: R | ((value: R) => boolean),
    options?: WaitForStateOptions,
  ): Promise<void> => {
    return waitForStates([[state, expected]], options);
  };

  return state;
}

// ============ State Factory ============

/**
 * Creates a standalone StateFunction.
 *
 * @example
 * ```typescript
 * const itemCount = State(async () => items.length);
 * const value = await itemCount();
 * await itemCount.waitFor(5);
 *
 * // With a name for better error messages
 * const isEmpty = State(async () => items.length === 0).named('isEmpty');
 * ```
 */
export function State<R>(fn: () => Promise<R>): StateFunction<R> {
  return brandState(async () => fn());
}

// ============ States Bulk Helper ============

type StateDefinitions = Record<string, () => Promise<unknown>>;

type StatesResult<T extends StateDefinitions> = {
  [K in keyof T]: T[K] extends () => Promise<infer R> ? StateFunction<R> : never;
};

/**
 * Bulk-define named states from an object.
 * Property keys become state names automatically.
 *
 * @example
 * ```typescript
 * const { itemCount, isEmpty } = States({
 *   itemCount: async () => items.length,
 *   isEmpty: async () => items.length === 0,
 * });
 * ```
 */
export function States<T extends StateDefinitions>(definitions: T): StatesResult<T> {
  const result = {} as Record<string, StateFunction<unknown>>;
  for (const [key, fn] of Object.entries(definitions)) {
    result[key] = State(fn).named(key);
  }
  return result as StatesResult<T>;
}
