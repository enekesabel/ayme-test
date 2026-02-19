import { Locator } from '@playwright/test';
import { PageFragment } from './PageFragment';

/**
 * Base class for page fragments rooted to a specific locator.
 */
export abstract class PageNode extends PageFragment {
  constructor(readonly rootLocator: Locator) {
    super(rootLocator.page());
  }
}

/**
 * Represents a reusable UI component on a page.
 */
export abstract class PageComponent extends PageNode {}

/**
 * Represents a single element on a page.
 */
export class PageElement extends PageNode {}
