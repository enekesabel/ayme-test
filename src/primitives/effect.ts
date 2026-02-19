import type { StateFunction } from './state';
import { StateBrandSymbol } from './state';

// ============ Effect Types ============

/**
 * Callable snapshot for accessing previous state values.
 * Used in effect functions to compare before/after.
 */
export interface PrevSnapshot<CurrentT = unknown> {
  /** Returns the previous value of the current effect's state */
  (): CurrentT;
  /** Returns the previous value of the specified state */
  <T>(state: StateFunction<T>): T;
}

/**
 * Effect value: static value or function computing expected from snapshot.
 */
export type EffectValue<T> = T | ((prev: PrevSnapshot<T>) => T);

/**
 * A single effect entry: a state paired with its expected value.
 */
export type EffectEntry<T> = readonly [StateFunction<T>, EffectValue<T>];

/**
 * Runtime type for effects — single entry or array of entries.
 * @internal
 */
export type Effects = EffectEntry<unknown> | readonly EffectEntry<unknown>[];

// ============ Type Validation ============

/** @internal */
type ValidateEffect<T> =
  T extends readonly [StateFunction<infer V>, infer Value]
    ? Value extends EffectValue<V>
      ? readonly [StateFunction<V>, EffectValue<V>]
      : never
    : never;

/** @internal */
export type ValidateEffects<T extends readonly unknown[]> = {
  [K in keyof T]: ValidateEffect<T[K]>
};

// ============ Internal Helpers ============

/**
 * Checks if effects is a single [state, value] tuple or an array of tuples.
 * @internal
 */
export function isSingleEffect(effects: Effects): effects is EffectEntry<unknown> {
  if (!Array.isArray(effects) || effects.length === 0) return false;
  const first = effects[0];
  return typeof first === 'function' && StateBrandSymbol in first;
}

/**
 * Normalizes effects to an array of effect entries.
 * @internal
 */
export function normalizeEffects(effects: Effects): readonly EffectEntry<unknown>[] {
  if (isSingleEffect(effects)) return [effects];
  return effects as readonly EffectEntry<unknown>[];
}

/**
 * Captures the current values of all states referenced in effects.
 * @internal
 */
export async function captureSnapshot(
  effectEntries: readonly EffectEntry<unknown>[],
): Promise<Map<StateFunction<unknown>, unknown>> {
  const snapshot = new Map<StateFunction<unknown>, unknown>();
  for (const [state] of effectEntries) {
    if (!snapshot.has(state)) {
      snapshot.set(state, await state());
    }
  }
  return snapshot;
}

/**
 * Creates a PrevSnapshot bound to a specific effect entry's state.
 * @internal
 */
export function createPrevSnapshot<T>(
  snapshot: Map<StateFunction<unknown>, unknown>,
  currentState: StateFunction<T>,
): PrevSnapshot<T> {
  const prev = function <U>(state?: StateFunction<U>): T | U {
    if (state === undefined) return snapshot.get(currentState) as T;
    if (!snapshot.has(state)) {
      throw new Error(
        'State not found in snapshot. Include all states you access via prev() in your effects array.',
      );
    }
    return snapshot.get(state) as U;
  };
  return prev as PrevSnapshot<T>;
}

/**
 * Computes expected values from effect entries and a before-state snapshot.
 * @internal
 */
export function computeExpectations(
  effectEntries: readonly EffectEntry<unknown>[],
  beforeSnapshot: Map<StateFunction<unknown>, unknown>,
): Array<[StateFunction<unknown>, unknown]> {
  const expectations: Array<[StateFunction<unknown>, unknown]> = [];
  for (const [state, effectValue] of effectEntries) {
    if (typeof effectValue === 'function') {
      const prev = createPrevSnapshot(beforeSnapshot, state);
      expectations.push([state, effectValue(prev)]);
    } else {
      expectations.push([state, effectValue]);
    }
  }
  return expectations;
}
