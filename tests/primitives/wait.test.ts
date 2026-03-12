import { test, expect } from '@playwright/test';
import { State } from '../../src/primitives/state';
import { waitFor } from '../../src/primitives/wait';
import {
  StateExpectationStabilityError,
  StateExpectationTimeoutError,
} from '../../src/primitives/errors';

function serializeExpectationError(error: StateExpectationTimeoutError | StateExpectationStabilityError) {
  if (error instanceof StateExpectationTimeoutError) {
    return {
      name: error.name,
      message: error.message,
      timeout: error.timeout,
      mismatches: error.mismatches.map(mismatch => ({
        label: mismatch.label,
        expected: typeof mismatch.expected === 'function' ? '[Function]' : mismatch.expected,
        current: mismatch.current,
        previous: mismatch.previous,
        isPredicate: mismatch.isPredicate,
      })),
    };
  }

  return {
    name: error.name,
    message: error.message,
    timeout: error.timeout,
    stableFor: error.stableFor,
  };
}

function stringifySnapshot(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

test.describe('waitFor()', () => {
  test('resolves immediately when state already matches', async () => {
    const count = State(async () => 5);
    await waitFor([[count, 5]], { timeout: 1000 });
  });

  test('resolves when state changes to expected value', async () => {
    let value = 0;
    const count = State(async () => value);

    const promise = waitFor([[count, 5]], { timeout: 2000 });
    setTimeout(() => { value = 5; }, 50);
    await promise;
  });

  test('resolves when multiple states all match', async () => {
    let count = 0;
    let loading = true;

    const itemCount = State(async () => count);
    const isLoading = State(async () => loading);

    const promise = waitFor([
      [itemCount, 3],
      [isLoading, false],
    ], { timeout: 2000 });

    setTimeout(() => { count = 3; }, 30);
    setTimeout(() => { loading = false; }, 60);
    await promise;
  });

  test('resolves with predicate', async () => {
    let count = 0;
    const itemCount = State(async () => count);

    const promise = waitFor(
      [[itemCount, ((n: number) => n >= 5) as (v: unknown) => boolean]],
      { timeout: 2000 },
    );

    for (let i = 1; i <= 5; i++) {
      setTimeout(() => { count = i; }, i * 20);
    }
    await promise;
  });

  test('throws StateExpectationTimeoutError with mismatches on timeout', async () => {
    const count = State(async () => 0).named('itemCount');
    const active = State(async () => false).named('isActive');

    try {
      await waitFor([
        [count, 5],
        [active, true],
      ], { timeout: 200 });
      throw new Error('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(StateExpectationTimeoutError);
      const err = e as StateExpectationTimeoutError;
      expect(err.timeout).toBe(200);
      expect(err.mismatches.length).toBeGreaterThan(0);

      const countMismatch = err.mismatches.find(m => m.label === 'itemCount');
      expect(countMismatch).toBeTruthy();
      expect(countMismatch!.expected).toBe(5);
      expect(countMismatch!.current).toBe(0);
      expect(countMismatch!.isPredicate).toBe(false);
    }
  });

  test('formats StateExpectationTimeoutError consistently', async () => {
    const count = State(async () => 0).named('itemCount');
    const active = State(async () => false).named('isActive');

    try {
      await waitFor([
        [count, 5],
        [active, true],
      ], { timeout: 200 });
      throw new Error('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(StateExpectationTimeoutError);
      expect(
        stringifySnapshot(serializeExpectationError(error as StateExpectationTimeoutError)),
      ).toBe(`{
  "name": "StateExpectationTimeoutError",
  "message": "State expectations not met within 200ms:\\n  - itemCount: expected 5, got 0\\n  - isActive: expected true, got false",
  "timeout": 200,
  "mismatches": [
    {
      "label": "itemCount",
      "expected": 5,
      "current": 0,
      "isPredicate": false
    },
    {
      "label": "isActive",
      "expected": true,
      "current": false,
      "isPredicate": false
    }
  ]
}`);
    }
  });

  test('resolves immediately with empty expectations', async () => {
    await waitFor([], { timeout: 100 });
  });

  test('stableFor requires expectations to hold for duration', async () => {
    let value = 0;
    const count = State(async () => value);

    const start = Date.now();
    const promise = waitFor([[count, 5]], { timeout: 3000, stableFor: 200 });

    value = 5;
    await promise;

    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(150); // stableFor period (with some tolerance)
  });

  test('stableFor throws StateExpectationStabilityError when value flickers', async () => {
    let callCount = 0;
    const count = State(async () => {
      callCount++;
      return callCount % 3 !== 0 ? 5 : 4;
    });

    await expect(
      waitFor([[count, 5]], { timeout: 500, stableFor: 200 }),
    ).rejects.toBeInstanceOf(StateExpectationStabilityError);
  });

  test('formats StateExpectationStabilityError consistently', async () => {
    let callCount = 0;
    const count = State(async () => {
      callCount++;
      return callCount % 3 !== 0 ? 5 : 4;
    });

    try {
      await waitFor([[count, 5]], { timeout: 500, stableFor: 200 });
      throw new Error('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(StateExpectationStabilityError);
      expect(
        stringifySnapshot(serializeExpectationError(error as StateExpectationStabilityError)),
      ).toBe(`{
  "name": "StateExpectationStabilityError",
  "message": "State expectations did not remain stable for 200ms within 500ms",
  "timeout": 500,
  "stableFor": 200
}`);
    }
  });

  test('direct form: waitFor(state, value)', async () => {
    const count = State(async () => 5);
    await waitFor(count, 5);
  });

  test('direct form: waitFor(state, predicate, options)', async () => {
    let value = 0;
    const count = State(async () => value);
    const promise = waitFor(count, (n: number) => n >= 5, { timeout: 2000 });
    setTimeout(() => { value = 5; }, 50);
    await promise;
  });

  test('single tuple form: waitFor([state, value])', async () => {
    const count = State(async () => 5);
    await waitFor([count, 5]);
  });

  test('sleep form: waitFor(ms)', async () => {
    const start = Date.now();
    await waitFor(100);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(80);
  });
});
