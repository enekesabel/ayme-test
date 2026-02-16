import { test, expect } from '@playwright/test';
import { PageObject, PageComponent, PageElement } from '../src';

test.describe('Scope Runtime Behavior', () => {

  test('string Scope prefixes testId', async ({ page }) => {
    class ScopedComponent extends PageComponent {
      static Scope = 'UI' as const;
      button = this.Child.withAutoTestId(PageElement);
    }
    const component = new ScopedComponent(page.locator('[data-testid="ScopedComponent"]'));
    expect(component.button.rootLocator.toString())
      .toContain("getByTestId('UI.ScopedComponent.button')");
  });

  test('class reference Scope resolves correctly', async ({ page }) => {
    class ParentPage extends PageObject {
      static Scope = 'Pages' as const;
    }
    class ChildComponent extends PageComponent {
      static Scope = ParentPage;
      input = this.Child.withAutoTestId(PageElement);
    }
    const component = new ChildComponent(page.locator('[data-testid="ChildComponent"]'));
    expect(component.input.rootLocator.toString())
      .toContain("getByTestId('Pages.ParentPage.ChildComponent.input')");
  });

  test('inherited Scope from base class', async ({ page }) => {
    abstract class UIBase extends PageComponent {
      static Scope = 'UI' as const;
    }
    class Button extends UIBase {
      icon = this.Child.withAutoTestId(PageElement);
    }
    const button = new Button(page.locator('[data-testid="Button"]'));
    expect(button.icon.rootLocator.toString())
      .toContain("getByTestId('UI.Button.icon')");
  });

  test('no Scope uses flat testId (backwards compat)', async ({ page }) => {
    class UnscopedComponent extends PageComponent {
      element = this.Child.withAutoTestId(PageElement);
    }
    const component = new UnscopedComponent(page.locator('[data-testid="UnscopedComponent"]'));
    expect(component.element.rootLocator.toString())
      .toContain("getByTestId('UnscopedComponent.element')");
  });

  test('chained class reference Scopes resolve fully', async ({ page }) => {
    class AppRoot extends PageObject {
      static Scope = 'App' as const;
    }
    class FeaturePage extends PageObject {
      static Scope = AppRoot;
    }
    class FeatureItem extends PageComponent {
      static Scope = FeaturePage;
      checkbox = this.Child.withAutoTestId(PageElement);
    }
    const item = new FeatureItem(page.locator('[data-testid="FeatureItem"]'));
    expect(item.checkbox.rootLocator.toString())
      .toContain("getByTestId('App.AppRoot.FeaturePage.FeatureItem.checkbox')");
  });

  test('ChildCollection respects Scope', async ({ page }) => {
    class ScopedPage extends PageObject {
      static Scope = 'Pages' as const;
      items = this.ChildCollection.withAutoTestId(PageElement);
    }
    const scopedPage = new ScopedPage(page);
    expect((scopedPage.items as any).rootLocator.toString())
      .toContain("getByTestId('Pages.ScopedPage.items')");
  });

});
