import { test, expect } from '@playwright/test';
import {
  Action,
  ActionEffectError,
  State,
  StateExpectationStabilityError,
  StateExpectationTimeoutError,
} from '../../src/primitives';

function serializeActionError(error: ActionEffectError) {
  const cause = error.cause;
  return {
    name: error.name,
    message: error.message,
    actionCall: error.actionCall,
    args: error.args,
    timeout: error.timeout,
    details: error.details,
    cause: cause instanceof StateExpectationTimeoutError
      ? {
        name: cause.name,
        message: cause.message,
        timeout: cause.timeout,
        mismatches: cause.mismatches.map(mismatch => ({
          label: mismatch.label,
          expected: typeof mismatch.expected === 'function' ? '[Function]' : mismatch.expected,
          current: mismatch.current,
          previous: mismatch.previous,
          isPredicate: mismatch.isPredicate,
        })),
      }
      : cause instanceof StateExpectationStabilityError
        ? {
          name: cause.name,
          message: cause.message,
          timeout: cause.timeout,
          stableFor: cause.stableFor,
        }
        : cause,
  };
}

function stringifySnapshot(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

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
        .and(isEditing, false));

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

    try {
      await setReady();
      throw new Error('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ActionEffectError);
      expect((error as ActionEffectError).cause).toBeInstanceOf(StateExpectationTimeoutError);
    }
  });

  test('formats ActionEffectError with timeout cause consistently', async () => {
    let ready = false;
    const isReady = State(async () => ready).named('isReady');

    const setReady = Action(async () => {
      ready = false;
    })
      .named('setReady')
      .effect(isReady, true)
      .options({ timeout: 200 });

    try {
      await setReady();
      throw new Error('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ActionEffectError);
      expect(
        stringifySnapshot(serializeActionError(error as ActionEffectError)),
      ).toBe(`{
  "name": "ActionEffectError",
  "message": "Action \\"setReady()\\" effects not met within 200ms:\\nState expectations not met within 200ms:\\n  - isReady: expected true, got false",
  "actionCall": "setReady()",
  "args": [],
  "timeout": 200,
  "details": "State expectations not met within 200ms:\\n  - isReady: expected true, got false",
  "cause": {
    "name": "StateExpectationTimeoutError",
    "message": "State expectations not met within 200ms:\\n  - isReady: expected true, got false",
    "timeout": 200,
    "mismatches": [
      {
        "label": "isReady",
        "expected": true,
        "current": false,
        "isPredicate": false
      }
    ]
  }
}`);
    }
  });

  test('.options({ timeout }) overrides the default 5s timeout', async () => {
    let ready = false;

    const isReady = State(async () => ready).named('isReady');

    const setReady = Action(async () => {
      ready = false;
    })
      .named('setReady')
      .effect(isReady, true)
      .options({ timeout: 200 });

    const start = Date.now();
    await expect(setReady()).rejects.toBeInstanceOf(ActionEffectError);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(1000);
  });

  test('.options({ stableFor }) requires effects to remain true', async () => {
    let count = 0;
    let flickering = true;

    const isStable = State(async () => {
      count++;
      if (flickering && count === 3) return false;
      return true;
    }).named('isStable');

    const stabilize = Action(async () => {
      flickering = false;
    })
      .named('stabilize')
      .effect(isStable, true)
      .options({ stableFor: 100 });

    await stabilize();
    expect(await isStable()).toBe(true);
  });

  test('.options({ stableFor }) times out when effects flicker', async () => {
    let callCount = 0;

    const isStable = State(async () => {
      callCount++;
      return callCount % 3 !== 0;
    }).named('isStable');

    const flickerAction = Action(async () => {})
      .named('flickerAction')
      .effect(isStable, true)
      .options({ timeout: 500, stableFor: 200 });

    await expect(flickerAction()).rejects.toBeInstanceOf(ActionEffectError);

    try {
      await flickerAction();
      throw new Error('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ActionEffectError);
      expect((error as ActionEffectError).cause).toBeInstanceOf(StateExpectationStabilityError);
    }
  });

  test('formats ActionEffectError with stability cause consistently', async () => {
    let callCount = 0;

    const isStable = State(async () => {
      callCount++;
      return callCount % 3 !== 0;
    }).named('isStable');

    const flickerAction = Action(async () => {})
      .named('flickerAction')
      .effect(isStable, true)
      .options({ timeout: 500, stableFor: 200 });

    try {
      await flickerAction();
      throw new Error('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ActionEffectError);
      expect(
        stringifySnapshot(serializeActionError(error as ActionEffectError)),
      ).toBe(`{
  "name": "ActionEffectError",
  "message": "Action \\"flickerAction()\\" effects not met within 500ms:\\nState expectations did not remain stable for 200ms within 500ms",
  "actionCall": "flickerAction()",
  "args": [],
  "timeout": 500,
  "details": "State expectations did not remain stable for 200ms within 500ms",
  "cause": {
    "name": "StateExpectationStabilityError",
    "message": "State expectations did not remain stable for 200ms within 500ms",
    "timeout": 500,
    "stableFor": 200
  }
}`);
    }
  });

  test('.options() is chainable with .and()', async () => {
    let value = 0;

    const counter = State(async () => value).named('counter');
    const labelText = State(async () => `value:${value}`).named('labelText');

    const increment = Action(async () => {
      value += 1;
    })
      .named('increment')
      .effect(counter, (current, previous) => current === previous + 1)
      .and(labelText, 'value:1')
      .options({ timeout: 2000 });

    await increment();
    expect(await counter()).toBe(1);
    expect(await labelText()).toBe('value:1');
  });

  test('subsequent .options() calls override previous values', async () => {
    let ready = false;

    const isReady = State(async () => ready).named('isReady');

    const setReady = Action(async () => {
      ready = false;
    })
      .named('setReady')
      .effect(isReady, true)
      .options({ timeout: 5000 })
      .options({ timeout: 200 });

    const start = Date.now();
    await expect(setReady()).rejects.toBeInstanceOf(ActionEffectError);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(1000);
  });

  test('supports .and() for multiple effects', async () => {
    let text = 'before';
    let editing = true;

    const labelText = State(async () => text).named('labelText');
    const isEditing = State(async () => editing).named('isEditing');

    const rename = Action(async (newText: string) => {
      text = newText;
      editing = false;
    })
      .named('rename')
      .effect(labelText, 'after')
      .and(isEditing, false);

    await rename('after');

    expect(await labelText()).toBe('after');
    expect(await isEditing()).toBe(false);
  });

  test('reports separate mismatches for chained effects', async () => {
    const count = State(async () => 0).named('count');
    const isReady = State(async () => false).named('isReady');

    const fail = Action(async () => {})
      .named('fail')
      .effect(count, 1)
      .and(isReady, true)
      .options({ timeout: 200 });

    try {
      await fail();
      throw new Error('Should have thrown');
    } catch (error) {
      const cause = (error as ActionEffectError).cause;
      expect(cause).toBeInstanceOf(StateExpectationTimeoutError);
      expect((cause as StateExpectationTimeoutError).mismatches).toHaveLength(2);
    }
  });

  test('reports grouped predicate failures as one mismatch', async () => {
    const completedCount = State(async () => 0).named('completedCount');
    const activeCount = State(async () => 2).named('activeCount');

    const fail = Action(async () => {})
      .named('failGrouped')
      .effect(
        { completedCount, activeCount },
        (current, previous) =>
          current.completedCount === previous.completedCount + 1 &&
          current.activeCount === previous.activeCount - 1,
      )
      .options({ timeout: 200 });

    try {
      await fail();
      throw new Error('Should have thrown');
    } catch (error) {
      const cause = (error as ActionEffectError).cause;
      expect(cause).toBeInstanceOf(StateExpectationTimeoutError);
      const mismatches = (cause as StateExpectationTimeoutError).mismatches;
      expect(mismatches).toHaveLength(1);
      expect(mismatches[0]?.label).toBe('[completedCount, activeCount]');
    }
  });

  test('action body errors still bubble unchanged', async () => {
    const boom = new Error('boom');
    const fail = Action(async () => {
      throw boom;
    }).effect(State(async () => true).named('ready'), true);

    await expect(fail()).rejects.toBe(boom);
  });
});
