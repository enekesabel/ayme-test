import { test, expect } from '@playwright/test';
import { PageFragment } from '../../src/pom-universal/PageFragment';

class TestFragment extends PageFragment {
  count = this.State(async () => this.counter);
  values = this.Collection(async () => [this.counter, this.counter + 1]);

  private counter = 0;

  async increment() {
    this.counter += 1;
    return this.counter;
  }

  async setCount(value: number) {
    this.counter = value;
    return this.counter;
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
