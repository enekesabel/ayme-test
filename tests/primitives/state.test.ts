import { test, expect } from '@playwright/test';
import { State, States } from '../../src/primitives/state';
import { StateNameSymbol } from '../../src/primitives/state';

test.describe('State()', () => {
  test('creates a callable state function', async () => {
    const count = State(async () => 42);
    expect(await count()).toBe(42);
  });

  test('returns the current value from the closure', async () => {
    let value = 'initial';
    const getText = State(async () => value);

    expect(await getText()).toBe('initial');
    value = 'updated';
    expect(await getText()).toBe('updated');
  });

  test('.named() sets the state name and is chainable', async () => {
    const count = State(async () => 10).named('itemCount');
    expect(count[StateNameSymbol]).toBe('itemCount');
    expect(await count()).toBe(10);
  });

  test('.waitFor() resolves when state matches expected value', async () => {
    let value = 0;
    const count = State(async () => value);

    const promise = count.waitFor(5, { timeout: 2000 });
    setTimeout(() => { value = 5; }, 50);
    await promise;
  });

  test('.waitFor() resolves when predicate passes', async () => {
    let value = 0;
    const count = State(async () => value);

    const promise = count.waitFor(n => n >= 3, { timeout: 2000 });
    setTimeout(() => { value = 1; }, 30);
    setTimeout(() => { value = 3; }, 60);
    await promise;
  });

  test('.waitFor() throws StateTimeoutError on timeout', async () => {
    const count = State(async () => 0);

    const { StateTimeoutError } = await import('../../src/primitives/errors');
    await expect(count.waitFor(99, { timeout: 200 })).rejects.toBeInstanceOf(StateTimeoutError);
  });
});

test.describe('States()', () => {
  test('creates multiple named states from an object', async () => {
    const items = [1, 2, 3];

    const { itemCount, isEmpty } = States({
      itemCount: async () => items.length,
      isEmpty: async () => items.length === 0,
    });

    expect(await itemCount()).toBe(3);
    expect(await isEmpty()).toBe(false);

    expect(itemCount[StateNameSymbol]).toBe('itemCount');
    expect(isEmpty[StateNameSymbol]).toBe('isEmpty');
  });

  test('states reflect current closure values', async () => {
    let active = true;

    const { isActive } = States({
      isActive: async () => active,
    });

    expect(await isActive()).toBe(true);
    active = false;
    expect(await isActive()).toBe(false);
  });
});
