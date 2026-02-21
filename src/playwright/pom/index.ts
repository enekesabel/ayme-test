import { createPomAdapter } from '../../pom-universal';
import { Page, Locator, test } from '@playwright/test';
import { PageFragment as GenericPageFragment } from '../../pom-universal/PageFragment';
import type { ActionFunction as PrimitiveActionFunction } from '../../primitives/action';
import { formatActionCall } from './format';

export type { ActionFunction } from '../../pom-universal/PageFragment';

/**
 * Playwright-specific PageFragment.
 * Extends the generic PageFragment with:
 * - `test.step()` wrapping for actions
 * - `Locator.all()` collection resolution
 * - static `driverFromLocator()` hook used by createPomAdapter()
 */
export abstract class PlaywrightPageFragment extends GenericPageFragment<Page, Locator> {
  static driverFromLocator(locator: Locator): Page {
    return locator.page();
  }

  protected constructor(page: Page) {
    super(page);
  }

  /** Alias for `this.driver` — the Playwright Page instance. */
  get page(): Page {
    return this.driver;
  }

  protected async resolveAll<T>(
    Cls: new (locator: Locator) => T,
    locator: Locator
  ): Promise<T[]> {
    return (await locator.all()).map(l => new Cls(l));
  }

  protected executeAction<R>(
    action: PrimitiveActionFunction<unknown[], R>,
    args: unknown[]
  ): Promise<R> {
    const { name, params } = action.meta();
    const stepName = formatActionCall(name ?? '<unknown>', params, args);
    return test.step(stepName, () => action(...args));
  }
}

export const { PageObject, PageComponent } = createPomAdapter(PlaywrightPageFragment);
export { PlaywrightPageFragment as PageFragment };
