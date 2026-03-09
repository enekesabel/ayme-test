import type { StateFunction } from '../primitives/state';
import { brandState } from '../primitives/state';
import { Action as primitiveAction } from '../primitives/action';
import type {
  ActionFunction as PrimitiveActionFunction,
  ActionWithEffects as PrimitiveActionWithEffects,
  ActionMeta,
} from '../primitives/action';
import { Collection } from '../primitives/collection';
import { waitFor as primitiveWaitFor } from '../primitives/wait';
import type { WaitForOptions } from '../primitives/wait';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type ActionFunction<Args extends unknown[], R> = PrimitiveActionFunction<Args, R>;
export type ActionWithEffects<Args extends unknown[], R> = PrimitiveActionWithEffects<Args, R>;

/**
 * Framework-independent base class for all page fragments.
 * Provides State, Collection, waitFor, and Locators factories.
 *
 * @typeParam L - The locator type used by the concrete adapter (e.g. Playwright's `Locator`).
 */
export abstract class PageFragment<L = unknown> {
  /** @internal — makes L structurally visible for type inference */
  protected readonly _locatorType!: L;
  locators!: Record<string, L>;

  protected _overrides?: Record<string, L>;

  constructor(locatorOverrides: Record<string, L> | undefined) {
    const pendingOverrides = consumePendingLocatorOverrides<L>(new.target);
    const resolvedOverrides = mergeLocatorOverrides(locatorOverrides, pendingOverrides);
    if (resolvedOverrides) {
      this._overrides = resolvedOverrides;
    }
  }

  protected Locators<T extends Record<string, L>>(bag: T): T {
    if (this._overrides) {
      return { ...bag, ...this._overrides } as T;
    }
    return bag;
  }

  protected Collection<T>(resolver: () => Promise<T[]>): Collection<T> {
    return Collection.create(resolver);
  }

  protected waitFor = primitiveWaitFor;

  /**
   * Hook for framework adapters to wrap action execution (e.g. test.step()).
   * Override in adapters — default implementation just calls the action directly.
   */
  protected executeAction<Args extends unknown[], R>(
    action: PrimitiveActionFunction<Args, R>,
    args: Args,
  ): Promise<R> {
    return action(...args);
  }

  protected Action<Args extends unknown[], R>(
    fn: (...args: Args) => Promise<R>,
  ): ActionFunction<Args, R> {
    const action = primitiveAction((...args: Args) => fn.apply(this, args));

    const wrapper = ((...args: Args): Promise<R> => {
      this.ensureActionNamed(action, wrapper);
      return this.executeAction(action, args);
    }) as ActionFunction<Args, R>;

    wrapper.effect = ((
      first: unknown,
      second?: unknown,
    ): ActionWithEffects<Args, R> => {
      (action.effect as (first: unknown, second?: unknown) => PrimitiveActionWithEffects<Args, R>)(first, second);
      return wrapper as unknown as ActionWithEffects<Args, R>;
    }) as ActionFunction<Args, R>['effect'];

    (wrapper as unknown as ActionWithEffects<Args, R>).options = (opts: WaitForOptions): ActionWithEffects<Args, R> => {
      (action as unknown as PrimitiveActionWithEffects<Args, R>).options(opts);
      return wrapper as unknown as ActionWithEffects<Args, R>;
    };

    wrapper.named = (name: string): ActionFunction<Args, R> => {
      action.named(name);
      return wrapper;
    };

    wrapper.meta = (): ActionMeta => {
      this.ensureActionNamed(action, wrapper);
      return action.meta();
    };

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

  WithLocators<T extends this>(this: T, overrides: LocatorOverrides<T>): T {
    const mergedOverrides = mergeLocatorOverrides(
      this._overrides,
      overrides as Record<string, L> | undefined,
    );
    return withPendingLocatorOverrides(
      this.constructor as Function,
      mergedOverrides,
      () => this.clone() as T,
    );
  }

  protected abstract clone(): this;

  private ensureActionNamed<Args extends unknown[], R>(
    action: PrimitiveActionFunction<Args, R>,
    wrapper: ActionFunction<Args, R>,
  ): void {
    if (action.meta().name !== undefined) return;

    const className = this.constructor.name;
    for (const key of Object.keys(this)) {
      if ((this as Record<string, unknown>)[key] === wrapper) {
        action.named(`${className}.${key}`);
        break;
      }
    }
  }
}

// ─── Adapter factory ──────────────────────────────────────────────

type AbstractConstructor<T = object, Args extends any[] = any[]> = abstract new (
  ...args: Args
) => T;

type InferLocator<F> = F extends AbstractConstructor<PageFragment<infer L>> ? L : unknown;
type Tail<T extends any[]> = T extends [any, ...infer R] ? R : never;
type AtLeastOne<T extends object> = {
  [K in keyof T]-?: Pick<T, K> & Partial<Omit<T, K>>
}[keyof T];
type LocatorOverrides<T extends PageFragment<any>> = AtLeastOne<Omit<T['locators'], 'root'>>;

const pendingLocatorOverrides = new WeakMap<Function, Array<Record<string, unknown>>>();

function validateLocatorOverrides<L>(
  overrides: Record<string, L> | undefined,
): Record<string, L> | undefined {
  if (overrides && Object.keys(overrides).length === 0) {
    throw new Error('Locator overrides must contain at least one locator');
  }
  return overrides;
}

function mergeLocatorOverrides<L>(
  existing: Record<string, L> | undefined,
  incoming: Record<string, L> | undefined,
): Record<string, L> | undefined {
  const merged = { ...existing, ...incoming };
  return validateLocatorOverrides(
    Object.keys(merged).length > 0 ? merged : undefined,
  );
}

function consumePendingLocatorOverrides<L>(ctor: Function | undefined): Record<string, L> | undefined {
  if (!ctor) return undefined;

  const stack = pendingLocatorOverrides.get(ctor);
  const overrides = stack?.pop() as Record<string, L> | undefined;

  if (stack && stack.length === 0) {
    pendingLocatorOverrides.delete(ctor);
  }

  return validateLocatorOverrides(overrides);
}

function withPendingLocatorOverrides<T>(
  ctor: Function,
  overrides: Record<string, unknown> | undefined,
  clone: () => T,
): T {
  if (!overrides) {
    return clone();
  }

  const stack = pendingLocatorOverrides.get(ctor) ?? [];
  stack.push(overrides);
  pendingLocatorOverrides.set(ctor, stack);

  try {
    return clone();
  } finally {
    const currentStack = pendingLocatorOverrides.get(ctor);
    if (currentStack) {
      const pendingIndex = currentStack.lastIndexOf(overrides);
      if (pendingIndex !== -1) {
        currentStack.splice(pendingIndex, 1);
      }

      if (currentStack.length === 0) {
        pendingLocatorOverrides.delete(ctor);
      }
    }
  }
}

/**
 * Named abstract base for generated PageComponents.
 * Provides typed `root` (protected), `locators` (with root), and
 * `Locators()` override that auto-includes root.
 * Required as a named class for DTS emission (TS4094).
 */
// Required for DTS emission (TS4094); the interface augments the generated class shape.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export abstract class PageComponentBase<L = unknown> extends PageFragment<L> {
  protected root!: L;

  protected override Locators<T extends Record<string, L>>(bag: T): { root: L } & T {
    const withOverrides = super.Locators(bag);
    return { root: this.root, ...withOverrides };
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface PageComponentBase<L = unknown> {
  locators: { root: L };
}

/**
 * Generate `PageObject` and `PageComponent` abstract base classes from a customized `PageFragment`.
 *
 * `PageObject` takes the fragment's constructor args except for the internal locator-overrides slot.
 * `PageComponent` prepends a `root` parameter before those same fragment args.
 *
 * Consumers define locators as a field: `locators = this.Locators({ ... })`.
 * `this.Locators()` on PageComponent auto-includes `root`.
 * Override logic is handled by `PageFragment.Locators()` and `PageFragment.WithLocators()`.
 */
export function createAdapter<
  F extends AbstractConstructor<PageFragment<any>>,
>(
  Fragment: F,
) {
  type L = InferLocator<F>;
  type FragmentArgs = Tail<ConstructorParameters<F>>;

  abstract class GeneratedPageObject extends (Fragment as abstract new (...args: unknown[]) => PageFragment<L>) {
    constructor(...fragmentArgs: FragmentArgs) {
      super(undefined, ...fragmentArgs);
    }
  }

  abstract class GeneratedPageComponent extends (Fragment as abstract new (...args: unknown[]) => PageFragment<L>) {
    protected root!: L;

    protected override Locators<T extends Record<string, L>>(bag: T): { root: L } & T {
      const withOverrides = super.Locators(bag);
      return { root: this.root, ...withOverrides } as { root: L } & T;
    }

    constructor(root: L, ...fragmentArgs: FragmentArgs) {
      super(undefined, ...fragmentArgs);
      this.root = root;
      this.locators = this.Locators({} as Record<string, L>);
    }
  }

  return {
    PageObject: GeneratedPageObject as unknown as AbstractConstructor<
      InstanceType<F>,
      FragmentArgs
    >,
    PageComponent: GeneratedPageComponent as unknown as AbstractConstructor<
      PageComponentBase<L> & InstanceType<F>,
      [root: L, ...fragmentArgs: FragmentArgs]
    >,
  };
}
