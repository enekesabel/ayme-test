import { test, expect } from '@playwright/test';
import { PageObject, PageComponent, PageElement, PageNodeCollection } from '../src';

/**
 * Runtime test for auto testId generation.
 * Tests that the proxy correctly discovers property names and generates testIds.
 * Verifies that locators are set up correctly with the expected testId format.
 */

test.describe('Auto TestId Runtime Behavior', () => {
  test('PageComponent child generates correct testId', async ({ page }) => {
    class TestComponent extends PageComponent {
      checkbox = this.Child.withAutoTestId(PageElement);
    }

    const rootLocator = page.locator('[data-testid="TestComponent"]');
    const component = new TestComponent(rootLocator);

    // Verify testId format: ClassName.propertyName
    expect(component.checkbox.rootLocator.toString()).toContain("getByTestId('TestComponent.checkbox')");
  });

  test('PageObject child generates correct testId', async ({ page }) => {
    class TestPage extends PageObject {
      input = this.Child.withAutoTestId(PageElement);
    }

    const testPage = new TestPage(page);

    // Verify testId format: ClassName.propertyName
    expect(testPage.input.rootLocator.toString()).toContain("getByTestId('TestPage.input')");
  });

  test('multiple children generate correct testIds', async ({ page }) => {
    class TestComponent extends PageComponent {
      checkbox = this.Child.withAutoTestId(PageElement);
      label = this.Child.withAutoTestId(PageElement);
      button = this.Child.withAutoTestId(PageElement);
    }

    const rootLocator = page.locator('[data-testid="TestComponent"]');
    const component = new TestComponent(rootLocator);

    // Verify each has correct testId
    expect(component.checkbox.rootLocator.toString()).toContain("getByTestId('TestComponent.checkbox')");
    expect(component.label.rootLocator.toString()).toContain("getByTestId('TestComponent.label')");
    expect(component.button.rootLocator.toString()).toContain("getByTestId('TestComponent.button')");
  });

  test('ChildCollection generates correct testId', async ({ page }) => {
    class TestPage extends PageObject {
      items = this.ChildCollection.withAutoTestId(PageElement);
    }

    const testPage = new TestPage(page);

    // Verify collection testId format
    expect((testPage.items as any).rootLocator.toString()).toContain("getByTestId('TestPage.items')");
  });

  test('custom locator child does not use auto testId', async ({ page }) => {
    class TestComponent extends PageComponent {
      autoChild = this.Child.withAutoTestId(PageElement); // Auto testId
      customChild = this.Child(PageElement, this.rootLocator.locator('.custom')); // Custom locator
    }

    const rootLocator = page.locator('[data-testid="TestComponent"]');
    const component = new TestComponent(rootLocator);

    // Verify auto child uses getByTestId
    expect(component.autoChild.rootLocator.toString()).toContain("getByTestId('TestComponent.autoChild')");

    // Verify custom child uses custom locator (not getByTestId with auto testId)
    const customLocatorString = component.customChild.rootLocator.toString();
    expect(customLocatorString).not.toContain("getByTestId('TestComponent.customChild')");
    expect(customLocatorString).toContain('.custom');
  });

  test('nested components generate correct testIds', async ({ page }) => {
    class InnerComponent extends PageComponent {
      innerElement = this.Child.withAutoTestId(PageElement);
    }

    class OuterComponent extends PageComponent {
      nested = this.Child.withAutoTestId(InnerComponent);
    }

    const rootLocator = page.locator('[data-testid="OuterComponent"]');
    const outer = new OuterComponent(rootLocator);

    // Verify outer component's child uses outer's rootLocator
    expect(outer.nested.rootLocator.toString()).toContain("getByTestId('OuterComponent.nested')");

    // Verify nested component's child uses nested's rootLocator (scoped correctly)
    expect(outer.nested.innerElement.rootLocator.toString()).toContain("getByTestId('InnerComponent.innerElement')");
  });
});
