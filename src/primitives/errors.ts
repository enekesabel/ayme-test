import type { StateFunction } from './state';
import { formatValue } from './format';

export interface StateExpectationMismatch {
  state?: StateFunction<unknown>;
  label?: string;
  expected: unknown;
  current: unknown;
  previous?: unknown;
  isPredicate: boolean;
}

function formatMismatch(mismatch: StateExpectationMismatch): string[] {
  const label = mismatch.label ?? 'unnamed';
  if (mismatch.isPredicate) {
    const lines = [`  - ${label}: predicate failed (current: ${formatValue(mismatch.current)})`];
    if (mismatch.previous !== undefined) {
      lines.push(`    previous: ${formatValue(mismatch.previous, 200)}`);
    }
    return lines;
  }

  return [
    `  - ${label}: expected ${formatValue(mismatch.expected)}, got ${formatValue(mismatch.current)}`,
  ];
}

export abstract class StateExpectationError extends Error {}

export class StateExpectationTimeoutError extends StateExpectationError {
  override readonly name = 'StateExpectationTimeoutError';

  constructor(
    readonly mismatches: StateExpectationMismatch[],
    readonly timeout: number,
  ) {
    const details = mismatches
      .flatMap(formatMismatch)
      .join('\n');
    super(`State expectations not met within ${timeout}ms:\n${details}`);
  }
}

export class StateExpectationStabilityError extends StateExpectationError {
  override readonly name = 'StateExpectationStabilityError';

  constructor(
    readonly stableFor: number,
    readonly timeout: number,
  ) {
    super(`State expectations did not remain stable for ${stableFor}ms within ${timeout}ms`);
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
