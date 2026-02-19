import { Page, Locator, test } from '@playwright/test';

export * from '@playwright/test';
export { default } from '@playwright/test';

// Re-export primitive types so existing consumers still get them from @ayde/test
export type { StateFunction } from './primitives/state';
export type { EffectValue, EffectEntry, Effects, PrevSnapshot } from './primitives/effect';
export type { FilterExpectations } from './primitives/types';
export type { WaitForStatesOptions, WaitForStateOptions } from './primitives/wait';

// Re-export primitive values
export { waitForStates } from './primitives/wait';

// Import primitives for internal use
import type { StateFunction } from './primitives/state';
import { brandState, StateBrandSymbol } from './primitives/state';
import type { Effects, EffectEntry, EffectValue } from './primitives/effect';
import type { ValidateEffects } from './primitives/effect';
import { Action as primitiveAction } from './primitives/action';

// Import shared format utility from primitives
import { formatValue } from './primitives/format';

// ============ Action Parameter Logging ============

/**
 * @internal
 */
function extractParamNames(fn: Function): string[] {
  const fnStr = fn.toString();
  const arrowMatch = fnStr.match(/^\s*(?:async\s+)?(?:\(([^)]*)\)|(\w+))\s*=>/);
  const funcMatch = fnStr.match(/^\s*(?:async\s+)?function\s*\w*\s*\(([^)]*)\)/);
  const paramsStr = arrowMatch?.[1] ?? arrowMatch?.[2] ?? funcMatch?.[1] ?? '';
  if (!paramsStr.trim()) return [];
  return paramsStr.split(',').map(p => {
    const cleaned = p.trim().split(/[=:]/)[0]?.trim() ?? '';
    if (cleaned.startsWith('{')) return '{...}';
    if (cleaned.startsWith('[')) return '[...]';
    return cleaned;
  }).filter(Boolean);
}

/**
 * @internal
 */
function formatActionCall(actionName: string, paramNames: string[], args: unknown[]): string {
  if (args.length === 0) return `${actionName}()`;
  const formattedArgs = paramNames.map((name, i) => {
    return `${name}: ${formatValue(args[i])}`;
  }).join(', ');
  return `${actionName}(${formattedArgs})`;
}

// ============ POM-specific types ============

export type ActionFunction<Args extends any[], R> = (...args: Args) => Promise<R>;

/**
 * Action definition for factory form.
 * @internal
 */
interface ActionDefinition<R> {
  execute: () => Promise<R>;
  effects: Effects;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPageNode = PageNode;

// ============ Base Classes ============

/**
 * Base class for all page fragments.
 * A PageFragment has access to the Page and can define States and Actions.
 */
export abstract class PageFragment {
  protected constructor(protected readonly page: Page) {}

  /**
   * Factory for creating child components with explicit locators.
   */
  protected readonly Child = <T extends PageNode>(
    ComponentClass: PageNodeConstructor<T>,
    locator: Locator
  ): T => {
    return new ComponentClass(locator);
  };

  /**
   * Factory for creating child component collections with explicit locators.
   */
  protected readonly ChildCollection = <T extends PageNode>(
    ComponentClass: PageNodeConstructor<T>,
    locator: Locator
  ): PageNodeCollection<T> => {
    return PageNodeCollection.fromLocator(ComponentClass, locator);
  };

  /**
   * Creates an action function with declarative effects.
   * Wraps the primitive Action in Playwright's test.step() for trace logging.
   */
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
    // Create a primitive Action that handles all effect logic.
    // Cast through Function to bypass overload resolution with the Effects union.
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

    // Wrap with POM-specific name discovery + test.step
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

  /**
   * Creates a state function with auto-discovered name from the property key.
   * Uses brandState() from primitives, adding POM-specific name discovery on first call.
   */
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
   * Creates a type-safe effect entry for use with Action.
   */
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
  // 6+ effects: uses mapped type validation
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

/**
 * Base class for page fragments rooted to a specific locator.
 */
export abstract class PageNode extends PageFragment {
  constructor(readonly rootLocator: Locator) {
    super(rootLocator.page());
  }
}

/**
 * Represents a reusable UI component on a page.
 */
export abstract class PageComponent extends PageNode {}

/**
 * Represents a full page in the application.
 */
export abstract class PageObject extends PageFragment {
  constructor(page: Page) {
    super(page);
  }
}

/**
 * Represents a single element on a page.
 */
export class PageElement extends PageNode {}

// ============ Collection ============

import { Collection } from './primitives/collection';

type PageNodeConstructor<T extends AnyPageNode> = new (rootLocator: Locator) => T;

/**
 * A Playwright-specific collection of PageNode components.
 * Extends the framework-independent Collection, providing a Locator-based resolver.
 */
export class PageNodeCollection<T extends AnyPageNode> extends Collection<T> {
  /** @internal */
  static fromLocator<T extends AnyPageNode>(
    ctor: PageNodeConstructor<T>,
    rootLocator: Locator,
  ): PageNodeCollection<T> {
    const resolver = async () =>
      (await rootLocator.all()).map(locator => new ctor(locator)) as T[];
    return new PageNodeCollection(resolver);
  }
}

// Re-export Playwright types for convenience
export type { Page, Locator } from '@playwright/test';

// Re-export extended test and expect from fixtures
export { test, expect } from './fixtures';
export type { ToHaveStateExpectations, ToHaveStateOptions, PageFragmentMatchers } from './fixtures';
