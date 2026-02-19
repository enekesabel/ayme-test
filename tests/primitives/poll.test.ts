import { test, expect } from '@playwright/test';
import { poll } from '../../src/primitives/poll';

test.describe('poll()', () => {
  test('resolves immediately when action succeeds on first try', async () => {
    let calls = 0;
    await poll(async () => { calls++; return 42; });
    expect(calls).toBe(1);
  });

  test('retries until action succeeds', async () => {
    let attempt = 0;
    const result = await poll(async () => {
      attempt++;
      if (attempt < 3) throw new Error('not yet');
      return 'done';
    }, { timeout: 2000 });

    expect(result).toBe('done');
    expect(attempt).toBe(3);
  });

  test('throws last error on timeout', async () => {
    await expect(
      poll(async () => { throw new Error('always fails'); }, { timeout: 200 })
    ).rejects.toThrow('always fails');
  });

  test('uses escalating intervals', async () => {
    const timestamps: number[] = [];
    let attempt = 0;

    await poll(async () => {
      timestamps.push(Date.now());
      attempt++;
      if (attempt < 4) throw new Error('not yet');
    }, {
      timeout: 5000,
      intervals: [50, 100, 200],
    });

    expect(attempt).toBe(4);
    // First attempt should be immediate, subsequent ones should have increasing delays
    if (timestamps.length >= 3) {
      const gap1 = timestamps[1]! - timestamps[0]!;
      const gap2 = timestamps[2]! - timestamps[1]!;
      // Allow 30ms tolerance for timing
      expect(gap2).toBeGreaterThanOrEqual(gap1 - 30);
    }
  });

  test('clamps to last interval value', async () => {
    const timestamps: number[] = [];
    let attempt = 0;

    await poll(async () => {
      timestamps.push(Date.now());
      attempt++;
      if (attempt < 6) throw new Error('not yet');
    }, {
      timeout: 5000,
      intervals: [50, 100],
    });

    expect(attempt).toBe(6);
  });

  test('respects timeout even during sleep', async () => {
    const start = Date.now();

    await expect(
      poll(async () => { throw new Error('fail'); }, {
        timeout: 300,
        intervals: [1000],
      })
    ).rejects.toThrow('fail');

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(600);
  });
});
