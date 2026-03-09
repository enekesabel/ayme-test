import type { StateFunction } from '../primitives/state';
import { brandState } from '../primitives/state';
import { Collection } from '../primitives/collection';
import { waitFor as primitiveWaitFor } from '../primitives/wait';

/**
 * Framework-independent base class for all page fragments.
 * Provides State, Collection, and waitFor factories.
 * Adapters extend this class and add their own driver/locator concerns.
 */
export abstract class PageFragment {
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
