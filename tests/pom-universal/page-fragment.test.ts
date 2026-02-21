import { test, expect } from '@playwright/test';
import { PageFragment } from '../../src/pom-universal/PageFragment';

class TestFragment extends PageFragment<{ count: number }, string> {
  constructor() {
    super({ count: 0 });
  }

  protected async resolveAll<T>(
    ComponentClass: new (locator: string, driver: { count: number }) => T,
    locator: string
  ): Promise<T[]> {
    void ComponentClass;
    void locator;
    return [];
  }

  increment = this.Action(async () => {
    this.driver.count += 1;
    return this.driver.count;
  });

  setCount = this.Action(async (value: number) => {
    this.driver.count = value;
    return this.driver.count;
  });
}

test.describe('PageFragment.Action()', () => {
  test('supports callback actions without effects', async () => {
    const fragment = new TestFragment();
    await expect(fragment.increment()).resolves.toBe(1);
    await expect(fragment.increment()).resolves.toBe(2);
  });

  test('passes arguments through callback actions without effects', async () => {
    const fragment = new TestFragment();
    await expect(fragment.setCount(42)).resolves.toBe(42);
    await expect(fragment.increment()).resolves.toBe(43);
  });
});
