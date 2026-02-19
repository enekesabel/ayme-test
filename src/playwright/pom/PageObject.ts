import { Page } from '@playwright/test';
import { PageFragment } from './PageFragment';

/**
 * Represents a full page in the application.
 */
export abstract class PageObject extends PageFragment {
  constructor(page: Page) {
    super(page);
  }
}
