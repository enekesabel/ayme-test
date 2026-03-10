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
  declare protected readonly _locatorType: L;

  protected _overrides?: Record<string, L>;

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
}

// ─── Adapter factory ──────────────────────────────────────────────

type AbstractConstructor<T = object, Args extends any[] = any[]> = abstract new (
  ...args: Args
) => T;

type InferLocator<F> = F extends AbstractConstructor<PageFragment<infer L>> ? L : unknown;

function isOptionsBag(value: unknown): value is { root: unknown } {
  return (
    typeof value === 'object'
    && value !== null
    && 'root' in value
  );
}

/**
 * Named abstract base for generated PageComponents.
 * Provides typed `root` (protected), `locators` (with root), and
 * `Locators()` override that auto-includes root.
 * Required as a named class for DTS emission (TS4094).
 */
export abstract class PageComponentBase<L = unknown> extends PageFragment<L> {
  protected declare root: L;
  declare locators: { root: L };

  protected override Locators<T extends Record<string, L>>(bag: T): { root: L } & T {
    const withOverrides = super.Locators(bag);
    return { root: this.root, ...withOverrides };
  }
}

/**
 * Generate `PageObject` and `PageComponent` abstract base classes from a customized `PageFragment`.
 *
 * `PageObject` has the same constructor as the fragment.
 * `PageComponent` prepends a `root` parameter (or options bag) before the fragment's constructor args.
 *
 * Consumers define locators as a field: `locators = this.Locators({ ... })`.
 * `this.Locators()` on PageComponent auto-includes `root`.
 * Override logic (from options bag constructor) is handled by `PageFragment.Locators()`.
 */
export function createAdapter<
  F extends AbstractConstructor<PageFragment<any>>,
>(
  Fragment: F,
) {
  type L = InferLocator<F>;

  const PageObject = Fragment;

  abstract class GeneratedPageComponent extends (Fragment as abstract new (...args: unknown[]) => PageFragment<L>) {
    protected root!: L;
    locators!: { root: L };

    protected override Locators<T extends Record<string, L>>(bag: T): { root: L } & T {
      const withOverrides = super.Locators(bag);
      return { root: this.root, ...withOverrides } as { root: L } & T;
    }

    constructor(rootOrOptions: unknown, ...args: unknown[]) {
      let root: unknown;
      let overrides: Record<string, unknown> | undefined;

      if (isOptionsBag(rootOrOptions)) {
        const { root: r, ...rest } = rootOrOptions;
        root = r;
        overrides = Object.keys(rest).length > 0 ? rest : undefined;
      } else {
        root = rootOrOptions;
      }

      const [existingOverrides, ...fragmentArgs] = args;
      const resolvedOverrides = (overrides ?? existingOverrides) as Record<string, L> | undefined;
      super(resolvedOverrides, ...fragmentArgs);
      this.root = root as L;
      this.locators = this.Locators({} as Record<string, L>);
    }
  }

  return {
    PageObject,
    PageComponent: GeneratedPageComponent as unknown as AbstractConstructor<
      PageComponentBase<L> & Omit<InstanceType<F>, keyof PageFragment<unknown>>,
      [root: L | (Record<string, L> & { root: L }), ...ConstructorParameters<F>]
    >,
  };
}
