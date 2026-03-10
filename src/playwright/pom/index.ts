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
  constructor(pageOrOverrides: Page | Record<string, Locator>) {
    if (isPage(pageOrOverrides)) {
      super(undefined, pageOrOverrides);
    } else {
      const locators = Object.values(pageOrOverrides);
      if (locators.length === 0) {
        throw new Error('Locator overrides must contain at least one locator to derive Page');
      }
      super(pageOrOverrides, locators[0]!.page());
    }
  }
}

function isLocatorOptionsBag(value: unknown): value is Record<string, Locator> & { root: Locator } {
  return typeof value === 'object' && value !== null && 'root' in value
    && typeof (value as Record<string, unknown>).root === 'object';
}

abstract class PageComponent extends BasePageComponent {
  constructor(rootOrOptions: Locator | (Record<string, Locator> & { root: Locator })) {
    const isOptions = isLocatorOptionsBag(rootOrOptions);
    const root = isOptions ? rootOrOptions.root : rootOrOptions as Locator;
    super(isOptions ? rootOrOptions : root, undefined, root.page());
  }
}

export { PlaywrightPageFragment as PageFragment, PageObject, PageComponent };
