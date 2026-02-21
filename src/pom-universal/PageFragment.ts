import type { StateFunction } from '../primitives/state';
import { brandState } from '../primitives/state';
import type { EffectResult, EffectValue, StateDeps, ResolvedDeps, ExpectedValues } from '../primitives/effect';
import { Effect as primitiveEffect } from '../primitives/effect';
import { Action as primitiveAction } from '../primitives/action';
import type { ActionDefinition, ActionFunction as PrimitiveActionFunction } from '../primitives/action';
import { Collection } from '../primitives/collection';

export type ActionFunction<Args extends any[], R> = (...args: Args) => Promise<R>;
export type { ActionDefinition } from '../primitives/action';

/** Constructor type for components: takes a locator and driver. */
export type ComponentConstructor<Driver, Locator, T> = new (locator: Locator, driver: Driver) => T;

/**
 * Framework-independent base class for all page fragments.
 * Provides State, Action, Effect, and Collection factories.
 *
 * @typeParam Driver - The test framework's driver type (e.g. Playwright's `Page`)
 * @typeParam Locator - The test framework's element locator type (e.g. Playwright's `Locator`)
 */
export abstract class PageFragment<Driver, Locator> {
  protected constructor(protected readonly driver: Driver) {}

  protected abstract resolveAll<T>(
    ComponentClass: ComponentConstructor<Driver, Locator, T>,
    locator: Locator
  ): Promise<T[]>;

  protected Collection<T>(
    ComponentClass: ComponentConstructor<Driver, Locator, T>,
    locator: Locator
  ): Collection<T> {
    return Collection.create(() => this.resolveAll(ComponentClass, locator));
  }

  private buildAction<Args extends unknown[], R>(
    fnOrFactory: ((...args: Args) => Promise<R>) | ((...args: Args) => ActionDefinition<R>),
    effects?: EffectResult
  ): PrimitiveActionFunction<Args, R> {
    if (effects !== undefined) {
      return (primitiveAction as Function)(
        (...args: Args) => (fnOrFactory as (...args: Args) => Promise<R>).apply(this, args),
        effects,
      ) as PrimitiveActionFunction<Args, R>;
    }
    return (primitiveAction as Function)((...args: Args) => {
      const result = (fnOrFactory as (...args: Args) => Promise<R> | ActionDefinition<R>).apply(this, args);

      if (
        typeof result === 'object' &&
        result !== null &&
        'execute' in result &&
        typeof result.execute === 'function'
      ) {
        return { execute: result.execute.bind(this), effects: result.effects };
      }

      return result;
    }) as PrimitiveActionFunction<Args, R>;
  }

  /**
   * Hook for framework adapters to wrap action execution (e.g. test.step()).
   * Override in adapters — default implementation just calls the action directly.
   * Use `action.meta()` to access action name and parameter names.
   */
  protected executeAction<R>(
    action: PrimitiveActionFunction<unknown[], R>,
    args: unknown[]
  ): Promise<R> {
    return action(...args);
  }

  protected Action<Args extends unknown[], R>(
    fn: (...args: Args) => Promise<R>,
    effects: EffectResult,
  ): ActionFunction<Args, R>;

  protected Action<Args extends unknown[], R>(
    factory: (...args: Args) => ActionDefinition<R>
  ): ActionFunction<Args, R>;

  protected Action<Args extends unknown[], R>(
    fn: (...args: Args) => Promise<R>,
  ): ActionFunction<Args, R>;

  protected Action<Args extends unknown[], R>(
    fnOrFactory: ((...args: Args) => Promise<R>) | ((...args: Args) => ActionDefinition<R>),
    effects?: EffectResult
  ): ActionFunction<Args, R> {
    const action = this.buildAction<Args, R>(fnOrFactory, effects);

    const wrapper = ((...args: Args): Promise<R> => {
      if (action.meta().name === undefined) {
        const className = this.constructor.name;
        for (const key of Object.keys(this)) {
          if ((this as Record<string, unknown>)[key] === wrapper) {
            action.named(`${className}.${key}`);
            break;
          }
        }
      }
      return this.executeAction(action as PrimitiveActionFunction<unknown[], R>, args);
    }) as ActionFunction<Args, R>;

    return wrapper;
  }

  protected State<R>(fn: () => Promise<R>): StateFunction<R> {
    let nameDiscovered = false;
    const state = brandState<R>(async () => {
      if (!nameDiscovered) {
        const className = this.constructor.name;
        for (const key of Object.keys(this)) {
          if ((this as Record<string, unknown>)[key] === state) {
            state.named(`${className}.${key}`);
            break;
          }
        }
        nameDiscovered = true;
      }
      return fn();
    });

    return state;
  }

  /**
   * Define a single effect: one state with an expected value.
   */
  protected Effect<T>(state: StateFunction<T>, value: EffectValue<T>): EffectResult;

  /**
   * Define multiple effects with named deps and cross-state support.
   */
  protected Effect<D extends StateDeps, R extends ExpectedValues<D>>(
    deps: D,
    compute: (prev: ResolvedDeps<D>) => R & { [K in Exclude<keyof R, keyof D>]: never },
  ): EffectResult;

  protected Effect(
    stateOrDeps: StateFunction<unknown> | StateDeps,
    valueOrCompute: unknown,
  ): EffectResult {
    return primitiveEffect(
      stateOrDeps as StateFunction<unknown>,
      valueOrCompute as EffectValue<unknown>,
    );
  }
}
