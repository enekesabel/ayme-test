import { PageObject, PageComponent, PageElement, PageNodeCollection, AllTestIds } from '../src';

/**
 * Type tests for AllTestIds<T> utility.
 * This file tests that AllTestIds correctly generates full testIds from exported classes.
 */

// Test classes with auto testId children
class PageWithChildren extends PageObject {
  autoChild = this.Child.withAutoTestId(PageElement);
  autoCollection = this.ChildCollection.withAutoTestId(PageElement);
  // Custom locator children (should NOT be in AllTestIds)
  customChild = this.Child(PageElement, this.page.locator('.custom'));
  customCollection = this.ChildCollection(PageElement, this.page.locator('.custom-list'));
}

class ComponentWithChildren extends PageComponent {
  childElement = this.Child.withAutoTestId(PageElement);
  // Custom locator child (should NOT be in AllTestIds)
  customChild = this.Child(PageElement, this.rootLocator.locator('.custom'));
}

// Test class without auto testId children (should be filtered out)
class PageWithoutChildren extends PageObject {
  customChild = this.Child(PageElement, this.page.locator('.custom')); // Custom locator, not auto testId
}

// Create a mock module export type
type MockExports = {
  PageWithChildren: typeof PageWithChildren;
  ComponentWithChildren: typeof ComponentWithChildren;
  PageWithoutChildren: typeof PageWithoutChildren;
};

// Extract all testIds
type AllIds = AllTestIds<MockExports>;

// These should be valid testIds (full format: ClassName.propertyName)
const validId1: AllIds = 'PageWithChildren.autoChild';
const validId2: AllIds = 'PageWithChildren.autoCollection';
const validId3: AllIds = 'ComponentWithChildren.childElement';

// These should cause type errors

// @ts-expect-error - PageWithoutChildren has no auto testId children
const noChildrenId: AllIds = 'PageWithoutChildren.customChild';

// @ts-expect-error - customChild is not auto testId (custom locator, not auto testId)
const invalidId1: AllIds = 'PageWithChildren.customChild';

// @ts-expect-error - customCollection is not auto testId (custom locator, not auto testId)
const invalidId4: AllIds = 'PageWithChildren.customCollection';

// @ts-expect-error - ComponentWithChildren.customChild is not auto testId (custom locator)
const invalidId5: AllIds = 'ComponentWithChildren.customChild';

// @ts-expect-error - wrong property name
const invalidId2: AllIds = 'PageWithChildren.wrong';

// @ts-expect-error - non-existent class
const invalidId3: AllIds = 'NonExistent.autoChild';

// @ts-expect-error - component name only (missing property)
const classNameOnly: AllIds = 'PageWithChildren';

// @ts-expect-error - partially correct testId (missing property name after dot)
const partiallyCorrect: AllIds = 'PageWithChildren.';

// @ts-expect-error - extension of a valid testId (extra characters)
const extendedTestId: AllIds = 'PageWithChildren.autoChildExtra';

// @ts-expect-error - extension with suffix
const extendedWithSuffix: AllIds = 'PageWithChildren.autoChild.extra';

// Test that PageWithoutChildren is truly filtered out
type OnlyWithChildren = Exclude<AllIds, `PageWithoutChildren.${string}`>;
// Should be the same as AllIds - no PageWithoutChildren testIds
type Test = OnlyWithChildren extends AllIds ? true : false;

export {};
