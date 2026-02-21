import { PageFragment } from './PageFragment';

/**
 * Represents a reusable UI component rooted to a specific locator.
 * Takes both a root locator and a driver reference.
 */
export abstract class PageComponent<Driver, Locator> extends PageFragment<Driver, Locator> {
  constructor(protected readonly rootLocator: Locator, driver: Driver) {
    super(driver);
  }
}
