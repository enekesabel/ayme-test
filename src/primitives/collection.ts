import type { FilterExpectations } from './types';

type FilterPredicate<T> = (item: T) => Promise<boolean>;

/**
 * A framework-independent typed collection with state-based filtering.
 * Uses a resolver function to fetch the current list of items.
 *
 * Subclassable: `filter()` preserves the concrete type via virtual constructor.
 */
export class Collection<T> {
  static create<T>(resolver: () => Promise<T[]>): Collection<T> {
    return new Collection(resolver);
  }

  protected constructor(
    protected readonly resolver: () => Promise<T[]>,
    protected readonly filterPredicates?: FilterPredicate<T>[],
  ) {}

  /**
   * Filter the collection by state expectations.
   * Returns a new collection of the same concrete type (chainable).
   */
  filter(expectations: FilterExpectations<T>): this {
    const predicate: FilterPredicate<T> = async (item) => {
      for (const [key, expected] of Object.entries(expectations)) {
        const getter = (item as any)[key];
        if (typeof getter === 'function') {
          const actual = await getter.call(item);
          if (typeof expected === 'function') {
            if (!(expected as (v: unknown) => boolean)(actual)) return false;
          } else {
            if (actual !== expected) return false;
          }
        }
      }
      return true;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new (this.constructor as any)(
      this.resolver,
      [...(this.filterPredicates ?? []), predicate],
    );
  }

  /** Get all items (after applying filters). */
  async all(): Promise<T[]> {
    const allItems = await this.resolver();

    if (!this.filterPredicates?.length) return allItems;

    const filtered: T[] = [];
    for (const item of allItems) {
      const results = await Promise.all(
        this.filterPredicates.map(p => p(item)),
      );
      if (results.every(keep => keep)) filtered.push(item);
    }
    return filtered;
  }

  /** Get the first item. */
  async first(): Promise<T | undefined> {
    return (await this.all())[0];
  }

  /** Get the last item. */
  async last(): Promise<T | undefined> {
    const items = await this.all();
    return items[items.length - 1];
  }

  /** Get the count of items. */
  async count(): Promise<number> {
    return (await this.all()).length;
  }

  /** Get an item by index (0-based). */
  async at(index: number): Promise<T | undefined> {
    return (await this.all())[index];
  }

  /** Find the first item matching state expectations. */
  async find(expectations: FilterExpectations<T>): Promise<T | undefined> {
    const items = await this.all();
    for (const item of items) {
      let matches = true;
      for (const [key, expected] of Object.entries(expectations)) {
        const getter = (item as any)[key];
        if (typeof getter === 'function') {
          const actual = await getter.call(item);
          if (typeof expected === 'function') {
            if (!(expected as (v: unknown) => boolean)(actual)) {
              matches = false;
              break;
            }
          } else {
            if (actual !== expected) {
              matches = false;
              break;
            }
          }
        }
      }
      if (matches) return item;
    }
    return undefined;
  }
}
