import { createPomAdapter } from '../../pom-universal';
import { Page, Locator } from '@playwright/test';
import { PageFragment as GenericPageFragment } from '../../pom-universal/PageFragment';
export { Action } from './action';

/**
 * Playwright-specific PageFragment.
 * Extends the generic PageFragment with:
 * - `Locator.all()` collection resolution
 */
abstract class PlaywrightPageFragment extends GenericPageFragment<Page, Locator> {
  get page(): Page {
    return this.driver;
  }

  protected async resolveAll<T>(
    Cls: new (locator: Locator, driver: Page) => T,
    locator: Locator
  ): Promise<T[]> {
    return (await locator.all()).map(l => new Cls(l, this.page));
  }
}

const { PageObject, PageComponent: BasePageComponent } = createPomAdapter(PlaywrightPageFragment);

// Extend the base page component to automatically get the driver from the locator
class PageComponent extends BasePageComponent {
  constructor(root: Locator) {
    super(root, root.page());
  }
}
export { PlaywrightPageFragment as PageFragment, PageObject, PageComponent };
