import type { StateFunction } from '../primitives/state';
import { brandState } from '../primitives/state';
import { Collection } from '../primitives/collection';
import { waitFor as primitiveWaitFor } from '../primitives/wait';

export type FragmentConstructor<Driver, Locator> = abstract new (driver: Driver) => PageFragment<Driver, Locator>;

export type ComponentConstructor<Driver, Locator, T> = new (locator: Locator, driver: Driver) => T;

/**
 * Framework-independent base class for all page fragments.
 * Provides State and Collection factories.
 *
 * @typeParam Driver - The test framework's driver type (e.g. Playwright's `Page`)
 * @typeParam Locator - The test framework's element locator type (e.g. Playwright's `Locator`)
 */
export abstract class PageFragment<Driver, Locator> {
  constructor(protected readonly driver: Driver) {}

  protected abstract resolveAll<T>(
    ComponentClass: ComponentConstructor<Driver, Locator, T>,
    locator: Locator
  ): Promise<T[]>;

  protected Collection<T>(
    resolver: () => Promise<T[]>,
  ): Collection<T>;
  protected Collection<T>(
    ComponentClass: ComponentConstructor<Driver, Locator, T>,
    locator: Locator
  ): Collection<T>;
  protected Collection<T>(
    first: (() => Promise<T[]>) | ComponentConstructor<Driver, Locator, T>,
    locator?: Locator
  ): Collection<T> {
    if (locator === undefined) {
      return Collection.create(first as () => Promise<T[]>);
    }
    return Collection.create(() => this.resolveAll(
      first as ComponentConstructor<Driver, Locator, T>,
      locator,
    ));
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
