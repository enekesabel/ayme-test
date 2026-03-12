import type { StateFunction } from '../primitives/state';
import { brandState } from '../primitives/state';
import { Collection } from '../primitives/collection';
import { waitFor as primitiveWaitFor } from '../primitives/wait';

/* eslint-disable @typescript-eslint/no-explicit-any */

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
  private _cloneArgs?: unknown[];

  constructor(locatorOverrides: Record<string, L> | undefined) {
    if (locatorOverrides) {
      if (Object.keys(locatorOverrides).length === 0) {
        throw new Error('Locator overrides must contain at least one locator');
      }
      this._overrides = locatorOverrides;
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
    return this._cloneWithLocators(
      mergeLocatorOverrides(this._overrides, overrides as Record<string, L> | undefined),
    ) as T;
  }

  protected _storeCloneArgs(args: unknown[]): void {
    this._cloneArgs = args;
  }

  protected _cloneWithLocators(overrides: Record<string, L> | undefined): this {
    if (!this._cloneArgs) {
      throw new Error('WithLocators() is only supported on adapter-generated PageFragment instances');
    }

    const Ctor = this.constructor as new (...args: unknown[]) => this;
    return instantiateWithLocatorOverrides(Ctor, this._cloneArgs, overrides);
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

function mergeLocatorOverrides<L>(
  existing: Record<string, L> | undefined,
  incoming: Record<string, L> | undefined,
): Record<string, L> | undefined {
  const merged = { ...existing, ...incoming };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function consumePendingLocatorOverrides<L>(ctor: Function): Record<string, L> | undefined {
  const stack = pendingLocatorOverrides.get(ctor);
  const overrides = stack?.pop() as Record<string, L> | undefined;

  if (stack && stack.length === 0) {
    pendingLocatorOverrides.delete(ctor);
  }

  return overrides;
}

function instantiateWithLocatorOverrides<T>(
  Ctor: new (...args: unknown[]) => T,
  args: unknown[],
  overrides: Record<string, unknown> | undefined,
): T {
  if (!overrides) {
    return new Ctor(...args);
  }

  const stack = pendingLocatorOverrides.get(Ctor) ?? [];
  stack.push(overrides);
  pendingLocatorOverrides.set(Ctor, stack);

  try {
    return new Ctor(...args);
  } finally {
    const currentStack = pendingLocatorOverrides.get(Ctor);
    if (currentStack) {
      const pendingIndex = currentStack.lastIndexOf(overrides);
      if (pendingIndex !== -1) {
        currentStack.splice(pendingIndex, 1);
      }

      if (currentStack.length === 0) {
        pendingLocatorOverrides.delete(Ctor);
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
export abstract class PageComponentBase<L = unknown> extends PageFragment<L> {
  protected root!: L;

  protected override Locators<T extends Record<string, L>>(bag: T): { root: L } & T {
    const withOverrides = super.Locators(bag);
    return { root: this.root, ...withOverrides };
  }
}

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
      const pendingOverrides = consumePendingLocatorOverrides<L>(new.target);
      super(pendingOverrides, ...fragmentArgs);
      this._storeCloneArgs(fragmentArgs);
    }
  }

  abstract class GeneratedPageComponent extends (Fragment as abstract new (...args: unknown[]) => PageFragment<L>) {
    protected root!: L;

    protected override Locators<T extends Record<string, L>>(bag: T): { root: L } & T {
      const withOverrides = super.Locators(bag);
      return { root: this.root, ...withOverrides } as { root: L } & T;
    }

    constructor(root: L, ...fragmentArgs: FragmentArgs) {
      const pendingOverrides = consumePendingLocatorOverrides<L>(new.target);
      super(pendingOverrides, ...fragmentArgs);
      this.root = root;
      this.locators = this.Locators({} as Record<string, L>);
      this._storeCloneArgs([root, ...fragmentArgs]);
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
