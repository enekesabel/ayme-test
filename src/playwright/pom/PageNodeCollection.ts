import { Locator } from '@playwright/test';
import { Collection } from '../../primitives/collection';
import type { PageNode } from './PageNode';

type PageNodeConstructor<T extends PageNode> = new (rootLocator: Locator) => T;

/**
 * A Playwright-specific collection of PageNode components.
 * Extends the framework-independent Collection, providing a Locator-based resolver.
 */
export class PageNodeCollection<T extends PageNode> extends Collection<T> {
  /** @internal */
  static fromLocator<T extends PageNode>(
    ctor: PageNodeConstructor<T>,
    rootLocator: Locator,
  ): PageNodeCollection<T> {
    const resolver = async () =>
      (await rootLocator.all()).map(locator => new ctor(locator)) as T[];
    return new PageNodeCollection(resolver);
  }
}
