import { test, expect } from '@playwright/test';
import { PageFragment, createAdapter } from '../../src/pom-universal/createAdapter';

type RootfulLocator = {
  id: string;
  root: { id: string };
  find(selector: string): RootfulLocator;
};

function locator(id: string): RootfulLocator {
  return {
    id,
    root: { id: `${id}:root` },
    find(selector: string) {
      return locator(`${id}->${selector}`);
    },
  };
}

abstract class TestFragment extends PageFragment<RootfulLocator> {}

const { PageObject, PageComponent } = createAdapter(TestFragment);

class Widget extends PageComponent {
  locators = this.Locators({
    input: this.root.find('input'),
  });
}

class ExplicitWidget extends Widget {
  constructor(root: RootfulLocator) {
    super(root);
  }
}

class Dashboard extends PageObject {
  locators = this.Locators({
    sidebar: locator('sidebar'),
  });
}

test.describe('createAdapter', () => {
  test('treats locator objects with a root property as the root locator', async () => {
    const root = locator('widget');
    const widget = new Widget(root);

    await expect(widget.locators.root).toBe(root);
    await expect(widget.locators.input.id).toBe('widget->input');
  });

  test('WithLocators() returns a new component instance with merged overrides', async () => {
    const root = locator('widget');
    const widget = new Widget(root);
    const customized = widget.WithLocators({ input: locator('custom-input') });

    await expect(customized).not.toBe(widget);
    await expect(customized.locators.root).toBe(root);
    await expect(customized.locators.input.id).toBe('custom-input');
    await expect(widget.locators.input.id).toBe('widget->input');
  });

  test('WithLocators() preserves explicit subclass constructors', async () => {
    const root = locator('explicit-widget');
    const widget = new ExplicitWidget(root);
    const customized = widget.WithLocators({ input: locator('custom-explicit-input') });

    await expect(customized).toBeInstanceOf(ExplicitWidget);
    await expect(customized.locators.input.id).toBe('custom-explicit-input');
    await expect(customized.locators.root).toBe(root);
  });

  test('WithLocators() returns a new page object instance with overrides', async () => {
    const dashboard = new Dashboard();
    const customized = dashboard.WithLocators({ sidebar: locator('custom-sidebar') });

    await expect(customized).not.toBe(dashboard);
    await expect(customized.locators.sidebar.id).toBe('custom-sidebar');
    await expect(dashboard.locators.sidebar.id).toBe('sidebar');
  });
});
