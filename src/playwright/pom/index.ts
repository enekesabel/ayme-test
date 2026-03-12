import { Page, Locator } from '@playwright/test';
import { PageFragment as GenericPageFragment } from '../../pom-universal/createAdapter';
import { createAdapter } from '../../pom-universal/createAdapter';
import { Collection } from '../../primitives/collection';
export { Action } from './action';

type ComponentConstructor<T> = new (locator: Locator, page: Page) => T;

/**
 * Playwright-specific PageFragment.
 * Adds `page`, `resolveAll`, and the `Collection(ComponentClass, locator)` shorthand.
 */
abstract class PlaywrightPageFragment extends GenericPageFragment<Locator> {
  constructor(locatorOverrides: Record<string, Locator> | undefined, readonly page: Page) {
    super(locatorOverrides);
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

const { PageObject: BasePageObject, PageComponent: BasePageComponent } = createAdapter(PlaywrightPageFragment);

function isPage(value: unknown): value is Page {
  return typeof (value as Record<string, unknown>).goto === 'function';
}

abstract class PageObject extends BasePageObject {
  constructor(page: Page) {
    if (!isPage(page)) {
      throw new Error('PageObject constructor requires a Playwright Page');
    }
    super(page);
  }
}

abstract class PageComponent extends BasePageComponent {
  constructor(root: Locator) {
    super(root, root.page());
  }
}

export { PlaywrightPageFragment as PageFragment, PageObject, PageComponent };
