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

  count = this.State(async () => this.driver.count);
  values = this.Collection(async () => [this.driver.count, this.driver.count + 1]);

  async increment() {
    this.driver.count += 1;
    return this.driver.count;
  }

  async setCount(value: number) {
    this.driver.count = value;
    return this.driver.count;
  }

  async waitUntilCount(value: number) {
    await this.waitFor(this.count, value, { timeout: 1000 });
  }
}

test.describe('PageFragment methods', () => {
  test('supports async methods', async () => {
    const fragment = new TestFragment();
    await expect(fragment.increment()).resolves.toBe(1);
    await expect(fragment.increment()).resolves.toBe(2);
  });

  test('passes arguments through async methods', async () => {
    const fragment = new TestFragment();
    await expect(fragment.setCount(42)).resolves.toBe(42);
    await expect(fragment.increment()).resolves.toBe(43);
  });

  test('exposes waitFor() utility in fragment methods', async () => {
    const fragment = new TestFragment();
    setTimeout(() => {
      fragment.setCount(5);
    }, 50);
    await expect(fragment.waitUntilCount(5)).resolves.toBeUndefined();
  });

  test('supports Collection() with resolver overload', async () => {
    const fragment = new TestFragment();
    await expect(fragment.values.all()).resolves.toEqual([0, 1]);
  });
});
