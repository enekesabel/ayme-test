import { test, expect } from '@playwright/test';
import { Action, ActionEffectError, State } from '../../src/primitives';

test.describe('Action()', () => {
  test('supports simple exact-value effects', async () => {
    let ready = false;

    const isReady = State(async () => ready).named('isReady');

    const setReady = Action(async () => {
      ready = true;
    })
      .named('setReady')
      .effect(isReady, true);

    await setReady();

    expect(await isReady()).toBe(true);
  });

  test('supports previous-value predicates', async () => {
    let count = 0;

    const itemCount = State(async () => count).named('itemCount');

    const increment = Action(async () => {
      count += 1;
    })
      .named('increment')
      .effect(itemCount, (current, previous) => current === previous + 1);

    await increment();
    await increment();

    expect(await itemCount()).toBe(2);
  });

  test('supports arg-aware deferred effects with chained builder calls', async () => {
    let text = 'before';
    let editing = true;

    const labelText = State(async () => text).named('labelText');
    const isEditing = State(async () => editing).named('isEditing');

    const rename = Action(async (newText: string) => {
      text = newText;
      editing = false;
    })
      .named('rename')
      .effect((effect, newText) => effect(labelText, newText)
        .effect(isEditing, false));

    await rename('after');

    expect(await labelText()).toBe('after');
    expect(await isEditing()).toBe(false);
  });

  test('supports cross-state predicates', async () => {
    let completed = 0;
    let active = 2;

    const completedCount = State(async () => completed).named('completedCount');
    const activeCount = State(async () => active).named('activeCount');

    const completeOne = Action(async () => {
      completed += 1;
      active -= 1;
    })
      .named('completeOne')
      .effect(
        { completedCount, activeCount },
        (current, previous) =>
          current.completedCount === previous.completedCount + 1 &&
          current.activeCount === previous.activeCount - 1,
      );

    await completeOne();

    expect(await completedCount()).toBe(1);
    expect(await activeCount()).toBe(1);
  });

  test('supports deferred cross-state predicates with action args', async () => {
    let itemCountValue = 0;
    let activeCountValue = 0;

    const itemCount = State(async () => itemCountValue).named('itemCount');
    const activeCount = State(async () => activeCountValue).named('activeCount');

    const addMany = Action(async (count: number) => {
      itemCountValue += count;
      activeCountValue += count;
    })
      .named('addMany')
      .effect((effect, count) => effect(
        { itemCount, activeCount },
        (current, previous) =>
          current.itemCount === previous.itemCount + count &&
          current.activeCount === previous.activeCount + count,
      ));

    await addMany(3);

    expect(await itemCount()).toBe(3);
    expect(await activeCount()).toBe(3);
  });

  test('throws ActionEffectError when effects never become true', async () => {
    let ready = false;

    const isReady = State(async () => ready).named('isReady');

    const setReady = Action(async () => {
      ready = false;
    })
      .named('setReady')
      .effect(isReady, true);

    await expect(setReady()).rejects.toBeInstanceOf(ActionEffectError);
  });
});
