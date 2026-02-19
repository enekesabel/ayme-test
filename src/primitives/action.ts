import type { StateFunction } from './state';
import type { Effects, EffectValue } from './effect';
import { normalizeEffects, captureSnapshot, computeExpectations } from './effect';
import { waitForStates } from './wait';
import { ActionEffectError, StateTimeoutError } from './errors';

// ============ ActionFunction Type ============

/** @internal */
const ActionNameSymbol = Symbol('ActionName');

export type ActionFunction<Args extends any[], R> = ((...args: Args) => Promise<R>) & {
  /** Set a display name for error messages. Returns the same instance (chainable). */
  named(name: string): ActionFunction<Args, R>;
};

// ============ Action Factory ============

/**
 * Creates a standalone ActionFunction.
 *
 * Three forms:
 *
 * 1. Fire-and-forget (with or without params):
 *    `Action(async (text) => { ... })`
 *
 * 2. With static effects (effects don't depend on args):
 *    `Action(async () => { ... }, [state, value])`
 *
 * 3. Factory form (effects depend on args):
 *    `Action((text) => [async () => { ... }, [state, text]])`
 */

// Form 1: Fire-and-forget
export function Action<Args extends any[], R>(
  fn: (...args: Args) => Promise<R>,
): ActionFunction<Args, R>;

// Form 2: With single effect
export function Action<Args extends any[], R, T>(
  fn: (...args: Args) => Promise<R>,
  effects: readonly [StateFunction<T>, EffectValue<T>],
): ActionFunction<Args, R>;

// Form 2: With multiple effects
export function Action<Args extends any[], R>(
  fn: (...args: Args) => Promise<R>,
  effects: readonly (readonly [StateFunction<any>, any])[],
): ActionFunction<Args, R>;

// Form 3: Factory returning [executeFn, effects]
export function Action<Args extends any[], R>(
  factory: (...args: Args) => readonly [() => Promise<R>, Effects],
): ActionFunction<Args, R>;

// Implementation
export function Action<Args extends any[], R>(
  fnOrFactory: ((...args: Args) => Promise<R>) | ((...args: Args) => readonly [() => Promise<R>, Effects]),
  effects?: Effects,
): ActionFunction<Args, R> {
  let actionName: string | undefined;

  const wrapper = (async (...args: Args): Promise<R> => {
    let executeFn: () => Promise<R>;
    let effectsDef: Effects | undefined;

    if (effects !== undefined) {
      // Form 2: fn + effects
      executeFn = () => (fnOrFactory as (...args: Args) => Promise<R>)(...args);
      effectsDef = effects;
    } else {
      // Could be Form 1 (fire-and-forget) or Form 3 (factory)
      const result = (fnOrFactory as Function)(...args);

      if (result instanceof Promise) {
        // Form 1: the function returned a Promise directly → fire-and-forget
        return result as Promise<R>;
      }

      if (Array.isArray(result) && result.length === 2 && typeof result[0] === 'function') {
        // Form 3: factory returned [executeFn, effects]
        executeFn = result[0] as () => Promise<R>;
        effectsDef = result[1] as Effects;
      } else {
        // Unexpected return value — treat as fire-and-forget with the result
        return result as R;
      }
    }

    if (!effectsDef) {
      return executeFn();
    }

    const effectEntries = normalizeEffects(effectsDef);
    if (effectEntries.length === 0) {
      return executeFn();
    }

    const beforeSnapshot = await captureSnapshot(effectEntries);
    const result = await executeFn();
    const expectations = computeExpectations(effectEntries, beforeSnapshot);

    try {
      await waitForStates(expectations);
    } catch (e) {
      if (e instanceof StateTimeoutError) {
        throw new ActionEffectError(actionName, args, e);
      }
      throw e;
    }

    return result;
  }) as ActionFunction<Args, R>;

  wrapper.named = (name: string): ActionFunction<Args, R> => {
    actionName = name;
    Object.defineProperty(wrapper, ActionNameSymbol, {
      value: name,
      configurable: true,
    });
    return wrapper;
  };

  return wrapper;
}

// ============ Actions Bulk Helper ============

type ActionDef =
  | ((...args: any[]) => Promise<any>)
  | readonly [(...args: any[]) => Promise<any>, Effects]
  | ((...args: any[]) => readonly [() => Promise<any>, Effects]);

type ActionDefinitions = Record<string, ActionDef>;

type InferActionFunction<T> =
  T extends (...args: infer Args) => Promise<infer R>
    ? ActionFunction<Args, R>
    : T extends readonly [(...args: infer Args) => Promise<infer R>, Effects]
      ? ActionFunction<Args, R>
      : T extends (...args: infer Args) => readonly [() => Promise<infer R>, Effects]
        ? ActionFunction<Args, R>
        : never;

type ActionsResult<T extends ActionDefinitions> = {
  [K in keyof T]: InferActionFunction<T[K]>;
};

/**
 * Bulk-define named actions from an object.
 * Property keys become action names automatically.
 *
 * @example
 * ```typescript
 * const { toggle, addItem, rename } = Actions({
 *   toggle: async () => { await checkbox.click(); },
 *   addItem: [
 *     async (text: string) => { ... },
 *     [itemCount, prev => prev() + 1],
 *   ],
 *   rename: (oldName: string, newName: string) => [
 *     async () => { ... },
 *     [itemName, newName],
 *   ],
 * });
 * ```
 */
export function Actions<T extends ActionDefinitions>(definitions: T): ActionsResult<T> {
  const result = {} as Record<string, ActionFunction<any[], any>>;

  for (const [key, def] of Object.entries(definitions)) {
    let action: ActionFunction<any[], any>;

    if (Array.isArray(def)) {
      // Form 2: [fn, effects]
      const [fn, effects] = def as [(...args: any[]) => Promise<any>, Effects];
      action = (Action as Function)(fn, effects) as ActionFunction<any[], any>;
    } else {
      // Form 1 or Form 3: just a function
      action = Action(def as (...args: any[]) => Promise<any>);
    }

    result[key] = action.named(key);
  }

  return result as ActionsResult<T>;
}
