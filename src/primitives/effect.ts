import type { StateFunction } from './state';
import { StateBrandSymbol } from './state';

// ============ Effect Types ============

/**
 * Effect value: static value or predicate.
 * - `(current) => boolean`: predicate on current value
 * - `(current, prev) => boolean`: predicate with previous snapshot (effects only)
 */
export type EffectValue<T> =
  | T
  | ((current: T) => boolean)
  | ((current: T, prev: T) => boolean);

// ============ EffectResult — unified return from Effect() ============

/** @internal */
const EffectSymbol: unique symbol = Symbol('Effect');

/** @internal */
export type EffectKind = 'single' | 'multi';

/** Map of named state dependencies. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type StateDeps = Record<string, StateFunction<any>>;

/** Resolved before-values keyed by dependency name. */
export type ResolvedDeps<D extends StateDeps> = {
  [K in keyof D]: D[K] extends StateFunction<infer T> ? T : never;
};

/** Expected values keyed by dependency name (all optional — only asserted keys matter). */
export type ExpectedValues<D extends StateDeps> = {
  [K in keyof D]?: D[K] extends StateFunction<infer T> ? EffectValue<T> : never;
};

/**
 * Unified result of an `Effect()` call.
 * Recognized by the `Action()` runtime during effect verification.
 */
export interface EffectResult {
  /** @internal */
  readonly [EffectSymbol]: true;
  /** @internal */
  readonly kind: EffectKind;
  /** @internal — for single effects */
  readonly state?: StateFunction<unknown>;
  /** @internal — for single effects */
  readonly value?: EffectValue<unknown>;
  /** @internal — for multi effects */
  readonly deps?: StateDeps;
  /** @internal — for multi effects */
  readonly compute?: (prev: Record<string, unknown>) => Record<string, unknown>;
}

// ============ Effect() function — overloads ============

/**
 * Define a single effect: one state with an expected value.
 *
 * @example
 * ```typescript
 * Effect(isChecked, true)
 * Effect(isChecked, cur => cur === true)
 * Effect(count, (cur, prev) => cur === prev + 1)
 * Effect(count, 0)
 * ```
 */
export function Effect<T>(
  state: StateFunction<T>,
  value: EffectValue<T>,
): EffectResult;

/**
 * Define multiple effects with cross-state support.
 *
 * `deps` names the states to snapshot. The `compute` callback receives their
 * before-values and returns expected after-values for any subset.
 *
 * @example
 * ```typescript
 * Effect({ count, label }, prev => ({
 *   count: (cur, prevCount) => cur === prev.label.length,
 *   label: String(prev.count),
 * }))
 * ```
 */
export function Effect<D extends StateDeps, R extends ExpectedValues<D>>(
  deps: D,
  compute: (prev: ResolvedDeps<D>) => R & { [K in Exclude<keyof R, keyof D>]: never },
): EffectResult;

// Implementation
export function Effect(
  stateOrDeps: StateFunction<unknown> | StateDeps,
  valueOrCompute: EffectValue<unknown> | ((prev: Record<string, unknown>) => Record<string, unknown>),
): EffectResult {
  if (typeof stateOrDeps === 'function' && StateBrandSymbol in stateOrDeps) {
    return {
      [EffectSymbol]: true,
      kind: 'single',
      state: stateOrDeps,
      value: valueOrCompute as EffectValue<unknown>,
    };
  }

  return {
    [EffectSymbol]: true,
    kind: 'multi',
    deps: stateOrDeps as StateDeps,
    compute: valueOrCompute as (prev: Record<string, unknown>) => Record<string, unknown>,
  };
}

/** @internal */
export function isEffectResult(value: unknown): value is EffectResult {
  return typeof value === 'object' && value !== null && EffectSymbol in value;
}

// ============ Internal Helpers ============

/**
 * Captures snapshot for a single effect.
 * @internal
 */
export async function captureSingleSnapshot(
  result: EffectResult,
): Promise<unknown> {
  return result.state!();
}

/**
 * Captures snapshot for multi effects.
 * @internal
 */
export async function captureMultiSnapshot(
  result: EffectResult,
): Promise<Record<string, unknown>> {
  const snapshot: Record<string, unknown> = {};
  for (const [key, state] of Object.entries(result.deps!)) {
    snapshot[key] = await state();
  }
  return snapshot;
}

/**
 * Computes expected value from a single effect and its before-value.
 * @internal
 */
export function computeSingleExpectation(
  result: EffectResult,
  beforeValue: unknown,
): [StateFunction<unknown>, unknown] {
  const effectValue = result.value!;
  if (typeof effectValue === 'function') {
    return [result.state!, (current: unknown) => {
      return (effectValue as (current: unknown, prev: unknown) => boolean)(current, beforeValue);
    }];
  }
  return [result.state!, effectValue];
}

/**
 * Computes expected values from multi effects and their before-snapshot.
 * @internal
 */
export function computeMultiExpectations(
  result: EffectResult,
  beforeSnapshot: Record<string, unknown>,
): Array<[StateFunction<unknown>, unknown]> {
  const expectedValues = result.compute!(beforeSnapshot);
  const expectations: Array<[StateFunction<unknown>, unknown]> = [];

  for (const [key, expected] of Object.entries(expectedValues)) {
    if (expected === undefined) continue;
    const state = result.deps![key];
    if (!state) continue;

    if (typeof expected === 'function') {
      expectations.push([state, (current: unknown) => {
        return (expected as (current: unknown, prev: unknown) => boolean)(
          current,
          beforeSnapshot[key],
        );
      }]);
    } else {
      expectations.push([state, expected]);
    }
  }

  return expectations;
}
