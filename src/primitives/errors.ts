import type { StateFunction } from './state';
import { formatValue } from './format';

export interface StateMismatch {
  state: StateFunction<unknown>;
  stateName?: string;
  expected: unknown;
  actual: unknown;
  isPredicate: boolean;
}

export class StateTimeoutError extends Error {
  override readonly name = 'StateTimeoutError';

  constructor(
    readonly mismatches: StateMismatch[],
    readonly timeout: number,
  ) {
    const details = mismatches
      .map(m => {
        const label = m.stateName ?? 'unnamed';
        if (m.isPredicate) {
          return `  - ${label}: predicate failed (actual: ${formatValue(m.actual)})`;
        }
        return `  - ${label}: expected ${formatValue(m.expected)}, got ${formatValue(m.actual)}`;
      })
      .join('\n');
    super(`State expectations not met within ${timeout}ms:\n${details}`);
  }
}

export class ActionEffectError extends Error {
  override readonly name = 'ActionEffectError';

  constructor(
    readonly actionCall: string,
    readonly args: unknown[],
    readonly timeout: number,
    readonly details: string,
    override readonly cause?: Error,
  ) {
    super(`Action "${actionCall}" effects not met within ${timeout}ms:\n${details}`);
  }
}
