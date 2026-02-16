import { PageObject, PageComponent, PageElement, AllTestIds } from '../src';

/**
 * Type tests for AllTestIds<T> with Scope support.
 * Tests that scoped testIds are correctly generated.
 */

// --- Test classes ---

class UnscopedPage extends PageObject {
  element = this.Child.withAutoTestId(PageElement);
}

class ScopedPage extends PageObject {
  static Scope = 'Pages' as const;
  input = this.Child.withAutoTestId(PageElement);
}

class ChildOfScoped extends PageComponent {
  static Scope = ScopedPage;
  button = this.Child.withAutoTestId(PageElement);
}

abstract class UIBase extends PageComponent {
  static Scope = 'UI' as const;
}

class UIButton extends UIBase {
  icon = this.Child.withAutoTestId(PageElement);
}

// --- Mock exports ---

type MockExports = {
  UnscopedPage: typeof UnscopedPage;
  ScopedPage: typeof ScopedPage;
  ChildOfScoped: typeof ChildOfScoped;
  UIButton: typeof UIButton;
};

type AllIds = AllTestIds<MockExports>;

// --- Valid testIds ---

const unscoped: AllIds = 'UnscopedPage.element';
const scoped: AllIds = 'Pages.ScopedPage.input';
const classRefScoped: AllIds = 'Pages.ScopedPage.ChildOfScoped.button';
const inherited: AllIds = 'UI.UIButton.icon';

// --- Invalid testIds (should error) ---

// @ts-expect-error - missing scope prefix
const missingScope: AllIds = 'ScopedPage.input';

// @ts-expect-error - wrong scope
const wrongScope: AllIds = 'Wrong.ScopedPage.input';

// @ts-expect-error - incomplete chain
const incompleteChain: AllIds = 'ScopedPage.ChildOfScoped.button';

// @ts-expect-error - nonexistent property
const wrongProp: AllIds = 'Pages.ScopedPage.nonexistent';

export {};
