import { Page, Locator, test } from '@playwright/test';
import type { StateFunction } from '../../primitives/state';
import { brandState, StateBrandSymbol } from '../../primitives/state';
import type { Effects, EffectEntry, EffectValue } from '../../primitives/effect';
import type { ValidateEffects } from '../../primitives/effect';
import { Action as primitiveAction } from '../../primitives/action';
import { extractParamNames, formatActionCall } from './format';
import type { PageNode } from './PageNode';
import { PageNodeCollection } from './PageNodeCollection';

export type ActionFunction<Args extends any[], R> = (...args: Args) => Promise<R>;

/** @internal */
interface ActionDefinition<R> {
  execute: () => Promise<R>;
  effects: Effects;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPageNode = PageNode;
type PageNodeConstructor<T extends AnyPageNode> = new (rootLocator: Locator) => T;

/**
 * Base class for all page fragments.
 * A PageFragment has access to the Page and can define States and Actions.
 */
export abstract class PageFragment {
  protected constructor(protected readonly page: Page) {}

  protected readonly Child = <T extends PageNode>(
    ComponentClass: PageNodeConstructor<T>,
    locator: Locator
  ): T => {
    return new ComponentClass(locator);
  };

  protected readonly ChildCollection = <T extends PageNode>(
    ComponentClass: PageNodeConstructor<T>,
    locator: Locator
  ): PageNodeCollection<T> => {
    return PageNodeCollection.fromLocator(ComponentClass, locator);
  };

  protected Action<Args extends unknown[], R>(
    fn: (...args: Args) => Promise<R>,
    effects: Effects
  ): ActionFunction<Args, R>;

  protected Action<Args extends unknown[], R>(
    factory: (...args: Args) => ActionDefinition<R>
  ): ActionFunction<Args, R>;

  protected Action<Args extends unknown[], R>(
    fnOrFactory: ((...args: Args) => Promise<R>) | ((...args: Args) => ActionDefinition<R>),
    effects?: Effects
  ): ActionFunction<Args, R> {
    const action = effects !== undefined
      ? (primitiveAction as Function)(
          (...args: Args) => (fnOrFactory as (...args: Args) => Promise<R>).apply(this, args),
          effects,
        ) as ((...args: Args) => Promise<R>)
      : primitiveAction((...args: Args) => {
          const def = (fnOrFactory as (...args: Args) => ActionDefinition<R>).apply(this, args);
          return [def.execute.bind(this), def.effects] as const;
        });

    let cachedActionName: string | null = null;
    let cachedParamNames: string[] | null = null;

    const wrapper = ((...args: Args): Promise<R> => {
      if (cachedActionName === null) {
        const className = this.constructor.name;
        for (const key of Object.keys(this)) {
          if ((this as Record<string, unknown>)[key] === wrapper) {
            cachedActionName = `${className}.${key}`;
            break;
          }
        }
        if (cachedActionName === null) {
          cachedActionName = `${className}.<unknown action>`;
        }
        cachedParamNames = extractParamNames(fnOrFactory);
      }

      const stepName = formatActionCall(cachedActionName, cachedParamNames!, args);
      return test.step(stepName, () => action(...args));
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

  // Single effect
  protected Effect<T>(
    state: StateFunction<T>,
    value: EffectValue<T>
  ): EffectEntry<T>;
  // 2 effects
  protected Effect<T1, T2>(
    e1: readonly [StateFunction<T1>, EffectValue<T1>],
    e2: readonly [StateFunction<T2>, EffectValue<T2>]
  ): [EffectEntry<T1>, EffectEntry<T2>];
  // 3 effects
  protected Effect<T1, T2, T3>(
    e1: readonly [StateFunction<T1>, EffectValue<T1>],
    e2: readonly [StateFunction<T2>, EffectValue<T2>],
    e3: readonly [StateFunction<T3>, EffectValue<T3>]
  ): [EffectEntry<T1>, EffectEntry<T2>, EffectEntry<T3>];
  // 4 effects
  protected Effect<T1, T2, T3, T4>(
    e1: readonly [StateFunction<T1>, EffectValue<T1>],
    e2: readonly [StateFunction<T2>, EffectValue<T2>],
    e3: readonly [StateFunction<T3>, EffectValue<T3>],
    e4: readonly [StateFunction<T4>, EffectValue<T4>]
  ): [EffectEntry<T1>, EffectEntry<T2>, EffectEntry<T3>, EffectEntry<T4>];
  // 5 effects
  protected Effect<T1, T2, T3, T4, T5>(
    e1: readonly [StateFunction<T1>, EffectValue<T1>],
    e2: readonly [StateFunction<T2>, EffectValue<T2>],
    e3: readonly [StateFunction<T3>, EffectValue<T3>],
    e4: readonly [StateFunction<T4>, EffectValue<T4>],
    e5: readonly [StateFunction<T5>, EffectValue<T5>]
  ): [EffectEntry<T1>, EffectEntry<T2>, EffectEntry<T3>, EffectEntry<T4>, EffectEntry<T5>];
  // 6+ effects
  protected Effect<T extends readonly (readonly [StateFunction<any>, any])[]>(
    ...effects: T & ValidateEffects<T>
  ): T;
  // Implementation
  protected Effect(
    ...args: [StateFunction<unknown>, EffectValue<unknown>] | readonly (readonly [StateFunction<unknown>, unknown])[]
  ): EffectEntry<unknown> | EffectEntry<unknown>[] {
    if (typeof args[0] === 'function' && StateBrandSymbol in args[0]) {
      return [args[0] as StateFunction<unknown>, args[1]] as const;
    }
    return args as EffectEntry<unknown>[];
  }
}
