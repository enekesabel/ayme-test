import { test, expect } from '@playwright/test';
import { ActionEffectError } from '../../src/primitives/errors';
import { PageFragment } from '../../src/pom-universal/createAdapter';

class TestFragment extends PageFragment {
  constructor(locatorOverrides?: Record<string, unknown>) {
    super(locatorOverrides);
  }

  count = this.State(async () => this.counter);
  values = this.Collection(async () => [this.counter, this.counter + 1]);

  private counter = 0;

  increment = this.Action(async () => {
    this.counter += 1;
    return this.counter;
  }).effect(this.count, (current, previous) => current === previous + 1);

  setCount = this.Action(async (value: number) => {
    this.counter = value;
    return this.counter;
  }).effect((effect, value) => effect(this.count, value));

  async waitUntilCount(value: number) {
    await this.waitFor(this.count, value, { timeout: 1000 });
  }

  protected override clone(): this {
    return new TestFragment() as this;
  }
}

class LocatorFragment extends PageFragment<{ id: string }> {
  constructor(locatorOverrides?: Record<string, { id: string }>) {
    super(locatorOverrides);
  }

  locators = this.Locators({
    label: { id: 'label' },
  });

  protected override clone(): this {
    return new LocatorFragment() as this;
  }
}

test.describe('PageFragment methods', () => {
  test('supports async methods', async () => {
    const fragment = new TestFragment(undefined);
    await expect(fragment.increment()).resolves.toBe(1);
    await expect(fragment.increment()).resolves.toBe(2);
  });

  test('passes arguments through async methods', async () => {
    const fragment = new TestFragment(undefined);
    await expect(fragment.setCount(42)).resolves.toBe(42);
    await expect(fragment.increment()).resolves.toBe(43);
  });

  test('preserves original parameter names in action metadata', async () => {
    const fragment = new TestFragment(undefined);

    expect(fragment.setCount.meta()).toEqual({
      name: 'TestFragment.setCount',
      params: ['value'],
    });
  });

  test('exposes waitFor() utility in fragment methods', async () => {
    const fragment = new TestFragment(undefined);
    setTimeout(() => {
      void fragment.setCount(5);
    }, 50);
    await expect(fragment.waitUntilCount(5)).resolves.toBeUndefined();
  });

  test('supports Collection() with resolver overload', async () => {
    const fragment = new TestFragment(undefined);
    await expect(fragment.values.all()).resolves.toEqual([0, 1]);
  });

  test('supports WithLocators() when clone() is implemented', async () => {
    const fragment = new LocatorFragment();
    const customized = fragment.WithLocators({ label: { id: 'custom-label' } });

    await expect(customized).not.toBe(fragment);
    await expect(customized.locators.label.id).toBe('custom-label');
    await expect(fragment.locators.label.id).toBe('label');
  });

  test('formats action effect errors with original parameter names', async () => {
    class EffectFailureFragment extends TestFragment {
      impossibleSetCount = this.Action(async (value: number) => {
        await this.setCount(value);
        return value;
      })
        .effect(this.count, (count: number) => count > 10)
        .options({ timeout: 200 });
    }

    const fragment = new EffectFailureFragment();

    try {
      await fragment.impossibleSetCount(5);
      throw new Error('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ActionEffectError);
      expect((error as ActionEffectError).actionCall).toBe('EffectFailureFragment.impossibleSetCount(value: 5)');
      expect((error as ActionEffectError).message).toContain('EffectFailureFragment.impossibleSetCount(value: 5)');
    }
  });
});
