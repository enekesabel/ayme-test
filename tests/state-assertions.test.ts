import { test, expect, PageComponent, PageObject } from '../src';

/**
 * Runtime tests for toHaveState polling behavior.
 * These tests verify the actual polling/retry functionality at runtime.
 */

test.describe('expect().toHaveState Runtime Behavior', () => {
  test('toHaveState resolves when single state matches', async ({ page }) => {
    let isComplete = false;

    class TestComponent extends PageComponent {
      isCompleted = this.State(async () => isComplete);
    }

    const component = new TestComponent(page.locator('body'));

    // Start assertion in background
    const assertPromise = expect(component).toHaveState(
      { isCompleted: true },
      { timeout: 5000 }
    );

    // Change state
    await new Promise(r => setTimeout(r, 50));
    isComplete = true;

    // Assertion should resolve
    await assertPromise;
  });

  test('toHaveState resolves when multiple states all match', async ({ page }) => {
    let count = 0;
    let isLoading = true;

    class TestPage extends PageObject {
      constructor(p: any) {
        super(p);
      }
      itemCount = this.State(async () => count);
      isLoading = this.State(async () => isLoading);
    }

    const testPage = new TestPage(page);

    // Start assertion
    const assertPromise = expect(testPage).toHaveState(
      {
        itemCount: 3,
        isLoading: false,
      },
      { timeout: 5000 }
    );

    // Change states gradually
    await new Promise(r => setTimeout(r, 30));
    count = 1;
    await new Promise(r => setTimeout(r, 30));
    count = 3;
    await new Promise(r => setTimeout(r, 30));
    isLoading = false;

    // Should resolve when ALL conditions are met
    await assertPromise;
  });

  test('toHaveState with predicate resolves when predicate passes', async ({ page }) => {
    let count = 0;

    class TestComponent extends PageComponent {
      itemCount = this.State(async () => count);
    }

    const component = new TestComponent(page.locator('body'));

    // Start assertion with predicate
    const assertPromise = expect(component).toHaveState(
      { itemCount: (n: number) => n >= 5 },
      { timeout: 5000 }
    );

    // Increment until predicate passes
    for (let i = 1; i <= 5; i++) {
      count = i;
      await new Promise(r => setTimeout(r, 30));
    }

    await assertPromise;
  });

  test('toHaveState times out with proper error message', async ({ page }) => {
    class TestComponent extends PageComponent {
      boolState = this.State(async () => false);
      numState = this.State(async () => 42);
    }

    const component = new TestComponent(page.locator('body'));

    try {
      await expect(component).toHaveState(
        {
          boolState: true,
          numState: 100,
        },
        { timeout: 200 }
      );
      throw new Error('Should have thrown');
    } catch (error) {
      const errorStr = String(error);
      expect(errorStr).toContain('TestComponent');
      expect(errorStr).toContain('not met within 200ms');
    }
  });

  test('toHaveState with empty expectations resolves immediately', async ({ page }) => {
    class TestComponent extends PageComponent {
      someState = this.State(async () => 'value');
    }

    const component = new TestComponent(page.locator('body'));

    // Empty expectations should pass immediately
    await expect(component).toHaveState({}, { timeout: 100 });
  });

  test('State attaches inferred name after invocation', async ({ page }) => {
    class TestComponent extends PageComponent {
      isCompleted = this.State(async () => true);
    }

    const component = new TestComponent(page.locator('body'));

    await component.isCompleted();

    const stateNameSymbol = Object.getOwnPropertySymbols(component.isCompleted).find(
      symbol => symbol.description === 'StateName'
    );

    expect(stateNameSymbol).toBeTruthy();
    if (!stateNameSymbol) {
      return;
    }

    const stateName = Reflect.get(component.isCompleted, stateNameSymbol) as string | undefined;
    expect(stateName).toBe('TestComponent.isCompleted');
  });
});
