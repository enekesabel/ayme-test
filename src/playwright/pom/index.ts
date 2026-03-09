import { Page, Locator } from '@playwright/test';
import { PageFragment as GenericPageFragment } from '../../pom-universal/PageFragment';
import { Collection } from '../../primitives/collection';
export { Action } from './action';

type ComponentConstructor<T> = new (locator: Locator, page: Page) => T;

/**
 * Playwright-specific PageFragment.
 * Adds `page`, `resolveAll`, and the `Collection(ComponentClass, locator)` shorthand.
 */
abstract class PlaywrightPageFragment extends GenericPageFragment {
  constructor(readonly page: Page) {
    super();
  }

  private async resolveAll<T>(
    Cls: ComponentConstructor<T>,
    locator: Locator
  ): Promise<T[]> {
    return (await locator.all()).map(l => new Cls(l, this.page));
  }

  protected override Collection<T>(resolver: () => Promise<T[]>): Collection<T>;
  protected override Collection<T>(ComponentClass: ComponentConstructor<T>, locator: Locator): Collection<T>;
  protected override Collection<T>(
    first: (() => Promise<T[]>) | ComponentConstructor<T>,
    locator?: Locator
  ): Collection<T> {
    if (locator === undefined) {
      return super.Collection(first as () => Promise<T[]>);
    }
    return super.Collection(() => this.resolveAll(
      first as ComponentConstructor<T>,
      locator,
    ));
  }
}

abstract class PageObject extends PlaywrightPageFragment {}

abstract class PageComponent extends PlaywrightPageFragment {
  constructor(readonly root: Locator) {
    super(root.page());
  }
}

export { PlaywrightPageFragment as PageFragment, PageObject, PageComponent };
