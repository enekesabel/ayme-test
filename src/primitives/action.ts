import type { EffectResult } from './effect';
import {
  isEffectResult,
  captureSingleSnapshot,
  captureMultiSnapshot,
  computeSingleExpectation,
  computeMultiExpectations,
} from './effect';
import { extractParamNames } from './format';
import { waitFor } from './wait';
import { ActionEffectError, StateTimeoutError } from './errors';

// ============ ActionFunction Type ============

export interface ActionMeta {
  readonly name?: string;
  readonly params: string[];
}

export type ActionFunction<Args extends any[], R> = ((...args: Args) => Promise<R>) & {
  /** Set a display name for error messages. Returns the same instance (chainable). */
  named(name: string): ActionFunction<Args, R>;
  /** Returns metadata: action name and parameter names. */
  meta(): ActionMeta;
};

// ============ ActionDefinition (object factory return) ============

export interface ActionDefinition<R> {
  execute: () => Promise<R>;
  effects?: EffectResult;
}

// ============ Action Factory ============

// Form 1: Fire-and-forget
export function Action<Args extends any[], R>(
  fn: (...args: Args) => Promise<R>,
): ActionFunction<Args, R>;

// Form 2: With effect(s)
export function Action<Args extends any[], R>(
  fn: (...args: Args) => Promise<R>,
  effects: EffectResult,
): ActionFunction<Args, R>;

// Form 3: Factory returning { execute, effects? }
export function Action<Args extends any[], R>(
  factory: (...args: Args) => ActionDefinition<R>,
): ActionFunction<Args, R>;

// Implementation
export function Action<Args extends any[], R>(
  fnOrFactory: ((...args: Args) => Promise<R>) | ((...args: Args) => ActionDefinition<R>),
  effects?: EffectResult,
): ActionFunction<Args, R> {
  let actionName: string | undefined;
  const params = extractParamNames(fnOrFactory);

  const wrapper = (async (...args: Args): Promise<R> => {
    let executeFn: () => Promise<R>;
    let effectsDef: EffectResult | undefined;

    if (effects !== undefined) {
      executeFn = () => (fnOrFactory as (...args: Args) => Promise<R>)(...args);
      effectsDef = effects;
    } else {
      const result = (fnOrFactory as Function)(...args);

      if (result instanceof Promise) {
        return result as Promise<R>;
      }

      if (typeof result === 'object' && result !== null && 'execute' in result && typeof result.execute === 'function') {
        const def = result as ActionDefinition<R>;
        executeFn = def.execute;
        effectsDef = def.effects;
      } else {
        return result as R;
      }
    }

    if (!effectsDef || !isEffectResult(effectsDef)) {
      return executeFn();
    }

    if (effectsDef.kind === 'single') {
      const beforeValue = await captureSingleSnapshot(effectsDef);
      const result = await executeFn();
      const expected = computeSingleExpectation(effectsDef, beforeValue);

      try {
        await waitFor([expected]);
      } catch (e) {
        if (e instanceof StateTimeoutError) {
          throw new ActionEffectError(actionName, args, e);
        }
        throw e;
      }
      return result;
    }

    if (effectsDef.kind === 'multi') {
      const beforeSnapshot = await captureMultiSnapshot(effectsDef);
      const result = await executeFn();
      const expectations = computeMultiExpectations(effectsDef, beforeSnapshot);

      if (expectations.length === 0) return result;

      try {
        await waitFor(expectations);
      } catch (e) {
        if (e instanceof StateTimeoutError) {
          throw new ActionEffectError(actionName, args, e);
        }
        throw e;
      }
      return result;
    }

    return executeFn();
  }) as ActionFunction<Args, R>;

  wrapper.named = (name: string): ActionFunction<Args, R> => {
    actionName = name;
    return wrapper;
  };

  wrapper.meta = (): ActionMeta => ({
    name: actionName,
    params,
  });

  return wrapper;
}

// ============ Actions Bulk Helper ============

type ActionDef =
  | ((...args: any[]) => Promise<any>)
  | readonly [(...args: any[]) => Promise<any>, EffectResult]
  | ((...args: any[]) => ActionDefinition<any>);

type ActionDefinitions = Record<string, ActionDef>;

type InferActionFunction<T> =
  T extends (...args: infer Args) => Promise<infer R>
    ? ActionFunction<Args, R>
    : T extends readonly [(...args: infer Args) => Promise<infer R>, EffectResult]
      ? ActionFunction<Args, R>
      : T extends (...args: infer Args) => ActionDefinition<infer R>
        ? ActionFunction<Args, R>
        : never;

type ActionsResult<T extends ActionDefinitions> = {
  [K in keyof T]: InferActionFunction<T[K]>;
};

/**
 * Bulk-define named actions from an object.
 * Property keys become action names automatically.
 */
export function Actions<T extends ActionDefinitions>(definitions: T): ActionsResult<T> {
  const result = {} as Record<string, ActionFunction<any[], any>>;

  for (const [key, def] of Object.entries(definitions)) {
    let action: ActionFunction<any[], any>;

    if (Array.isArray(def)) {
      const [fn, effects] = def as [(...args: any[]) => Promise<any>, EffectResult];
      action = (Action as Function)(fn, effects) as ActionFunction<any[], any>;
    } else {
      action = Action(def as (...args: any[]) => Promise<any>);
    }

    result[key] = action.named(key);
  }

  return result as ActionsResult<T>;
}
