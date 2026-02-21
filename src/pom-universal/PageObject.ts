import { PageFragment } from './PageFragment';

/**
 * Represents a full page in the application.
 * The driver (e.g. Playwright's `Page`) is the primary entry point.
 */
export abstract class PageObject<Driver, Locator> extends PageFragment<Driver, Locator> {
  constructor(driver: Driver) {
    super(driver);
  }
}
