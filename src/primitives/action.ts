import { ActionEffectError, StateTimeoutError, type StateMismatch } from './errors';
import { extractParamNames, formatValue } from './format';
import { poll } from './poll';
import type { StateFunction } from './state';
import { StateBrandSymbol, StateNameSymbol } from './state';
import type { WaitForOptions } from './wait';

export interface ActionMeta {
  readonly name?: string;
  readonly params: string[];
}

export type EffectValue<T> =
  | T
  | ((current: T) => boolean)
  | ((current: T, prev: T) => boolean);

export type StateDeps = Record<string, StateFunction<unknown>>;

export type ResolvedDeps<D extends StateDeps> = {
  [K in keyof D]: D[K] extends StateFunction<infer T> ? T : never;
};

export type GroupEffectPredicate<D extends StateDeps> =
  | ((current: ResolvedDeps<D>) => boolean)
  | ((current: ResolvedDeps<D>, prev: ResolvedDeps<D>) => boolean);

interface StateEffectDefinition<T> {
  readonly kind: 'state';
  readonly state: StateFunction<T>;
  readonly expected: EffectValue<T>;
}

interface GroupEffectDefinition<D extends StateDeps> {
  readonly kind: 'group';
  readonly states: D;
  readonly predicate: GroupEffectPredicate<D>;
}

type EffectDefinition =
  | StateEffectDefinition<unknown>
  | GroupEffectDefinition<StateDeps>;

type DeferredEffects<Args extends unknown[]> =
  (builder: ActionEffectBuilder, ...args: Args) => ActionEffectBuilder | void;

export interface ActionEffectBuilder {
  <T>(
    state: StateFunction<T>,
    expected: EffectValue<T>,
  ): ActionEffectBuilder;
  <D extends StateDeps>(
    states: D,
    predicate: GroupEffectPredicate<D>,
  ): ActionEffectBuilder;
  effect: ActionEffectBuilder;
}

export type ActionWithEffects<Args extends unknown[], R> = ((...args: Args) => Promise<R>) & {
  effect<T>(
    state: StateFunction<T>,
    expected: EffectValue<T>,
  ): ActionWithEffects<Args, R>;
  effect<D extends StateDeps>(
    states: D,
    predicate: GroupEffectPredicate<D>,
  ): ActionWithEffects<Args, R>;
  effect(
    build: DeferredEffects<Args>,
  ): ActionWithEffects<Args, R>;
  options(opts: WaitForOptions): ActionWithEffects<Args, R>;
  named(name: string): ActionWithEffects<Args, R>;
  meta(): ActionMeta;
};

export type ActionFunction<Args extends unknown[], R> = ((...args: Args) => Promise<R>) & {
  effect<T>(
    state: StateFunction<T>,
    expected: EffectValue<T>,
  ): ActionWithEffects<Args, R>;
  effect<D extends StateDeps>(
    states: D,
    predicate: GroupEffectPredicate<D>,
  ): ActionWithEffects<Args, R>;
  effect(
    build: DeferredEffects<Args>,
  ): ActionWithEffects<Args, R>;
  named(name: string): ActionFunction<Args, R>;
  meta(): ActionMeta;
};

interface GroupEffectMismatch {
  readonly stateNames: string[];
  readonly current: Record<string, unknown>;
  readonly previous: Record<string, unknown>;
}

class PendingActionEffectsError extends Error {
  constructor(
    readonly stateMismatches: readonly StateMismatch[],
    readonly groupMismatches: readonly GroupEffectMismatch[],
    readonly timeout: number,
  ) {
    super(formatEffectFailures(stateMismatches, groupMismatches));
  }
}

export function Action<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>,
): ActionFunction<Args, R> {
  let actionName: string | undefined;
  let effectOpts: WaitForOptions = {};
  const params = extractParamNames(fn);
  const staticEffects: EffectDefinition[] = [];
  const deferredEffects: DeferredEffects<Args>[] = [];

  const wrapper = (async (...args: Args): Promise<R> => {
    const resolvedEffects = resolveEffects(staticEffects, deferredEffects, args);
    if (resolvedEffects.length === 0) {
      return fn(...args);
    }

    const snapshots = await captureSnapshots(resolvedEffects);
    const result = await fn(...args);
    const timeout = effectOpts.timeout ?? 5000;
    const stableFor = effectOpts.stableFor ?? 0;
    let stableSince: number | null = null;

    try {
      await poll(async () => {
        const stateMismatches: StateMismatch[] = [];
        const groupMismatches: GroupEffectMismatch[] = [];

        for (let i = 0; i < resolvedEffects.length; i++) {
          const effect = resolvedEffects[i]!;
          const snapshot = snapshots[i]!;

          if (effect.kind === 'state') {
            const mismatch = await evaluateStateEffect(effect, snapshot);
            if (mismatch) stateMismatches.push(mismatch);
            continue;
          }

          const mismatch = await evaluateGroupEffect(effect, snapshot);
          if (mismatch) groupMismatches.push(mismatch);
        }

        if (stateMismatches.length > 0 || groupMismatches.length > 0) {
          stableSince = null;
          throw new PendingActionEffectsError(stateMismatches, groupMismatches, timeout);
        }

        if (stableFor > 0) {
          const now = Date.now();
          if (stableSince === null) stableSince = now;
          if (now - stableSince < stableFor) {
            throw new PendingActionEffectsError([], [], timeout);
          }
        }
      }, { timeout });
    } catch (error) {
      if (error instanceof PendingActionEffectsError) {
        throw new ActionEffectError(
          formatActionCall(actionName ?? fn.name ?? 'unnamed action', params, args),
          args,
          timeout,
          error.message,
          buildActionEffectCause(error),
        );
      }
      throw error;
    }

    return result;
  }) as ActionFunction<Args, R>;

  wrapper.effect = ((
    first: StateFunction<unknown> | StateDeps | DeferredEffects<Args>,
    second?: unknown,
  ): ActionWithEffects<Args, R> => {
    if (typeof first === 'function' && !(StateBrandSymbol in first)) {
      deferredEffects.push(first as DeferredEffects<Args>);
      return wrapper as unknown as ActionWithEffects<Args, R>;
    }

    appendEffect(staticEffects, first as StateFunction<unknown> | StateDeps, second);
    return wrapper as unknown as ActionWithEffects<Args, R>;
  }) as ActionFunction<Args, R>['effect'];

  (wrapper as unknown as ActionWithEffects<Args, R>).options = (opts: WaitForOptions): ActionWithEffects<Args, R> => {
    effectOpts = opts;
    return wrapper as unknown as ActionWithEffects<Args, R>;
  };

  wrapper.named = (name: string): ActionFunction<Args, R> => {
    actionName = name;
    return wrapper;
  };

  wrapper.meta = (): ActionMeta => ({
    name: actionName,
    params,
  });

  return wrapper;
}

function resolveEffects<Args extends unknown[]>(
  staticEffects: readonly EffectDefinition[],
  deferredEffects: readonly DeferredEffects<Args>[],
  args: Args,
): EffectDefinition[] {
  const resolvedEffects = [...staticEffects];

  for (const deferredEffect of deferredEffects) {
    const builder = createEffectBuilder(resolvedEffects);
    deferredEffect(builder, ...args);
  }

  return resolvedEffects;
}

function createEffectBuilder(
  target: EffectDefinition[],
): ActionEffectBuilder {
  const builder = ((
    first: StateFunction<unknown> | StateDeps,
    second: unknown,
  ): ActionEffectBuilder => {
    appendEffect(target, first, second);
    return builder;
  }) as ActionEffectBuilder;

  builder.effect = builder;

  return builder;
}

function appendEffect(
  target: EffectDefinition[],
  first: StateFunction<unknown> | StateDeps,
  second: unknown,
): void {
  if (typeof first === 'function' && StateBrandSymbol in first) {
    target.push({
      kind: 'state',
      state: first,
      expected: second as EffectValue<unknown>,
    });
    return;
  }

  target.push({
    kind: 'group',
    states: first as StateDeps,
    predicate: second as GroupEffectPredicate<StateDeps>,
  });
}

async function captureSnapshots(
  effects: readonly EffectDefinition[],
): Promise<unknown[]> {
  const snapshots: unknown[] = [];

  for (const effect of effects) {
    if (effect.kind === 'state') {
      snapshots.push(await effect.state());
      continue;
    }

    const snapshot: Record<string, unknown> = {};
    for (const [key, state] of Object.entries(effect.states)) {
      snapshot[key] = await state();
    }
    snapshots.push(snapshot);
  }

  return snapshots;
}

async function evaluateStateEffect(
  effect: StateEffectDefinition<unknown>,
  previous: unknown,
): Promise<StateMismatch | undefined> {
  const actual = await effect.state();
  const isPredicate = typeof effect.expected === 'function';
  const matches = isPredicate
    ? (effect.expected as (current: unknown, prev: unknown) => boolean)(actual, previous)
    : actual === effect.expected;

  if (matches) return undefined;

  return {
    state: effect.state,
    stateName: effect.state[StateNameSymbol],
    expected: effect.expected,
    actual,
    isPredicate,
  };
}

async function evaluateGroupEffect(
  effect: GroupEffectDefinition<StateDeps>,
  previous: unknown,
): Promise<GroupEffectMismatch | undefined> {
  const current: Record<string, unknown> = {};

  for (const [key, state] of Object.entries(effect.states)) {
    current[key] = await state();
  }

  const matches = (effect.predicate as (
    current: Record<string, unknown>,
    prev: Record<string, unknown>,
  ) => boolean)(current, previous as Record<string, unknown>);

  if (matches) return undefined;

  return {
    stateNames: Object.keys(effect.states),
    current,
    previous: previous as Record<string, unknown>,
  };
}

function formatEffectFailures(
  stateMismatches: readonly StateMismatch[],
  groupMismatches: readonly GroupEffectMismatch[],
): string {
  const lines: string[] = [];

  for (const mismatch of stateMismatches) {
    const label = mismatch.stateName ?? 'unnamed';
    if (mismatch.isPredicate) {
      lines.push(`  - ${label}: predicate failed (actual: ${formatValue(mismatch.actual)})`);
      continue;
    }
    lines.push(`  - ${label}: expected ${formatValue(mismatch.expected)}, got ${formatValue(mismatch.actual)}`);
  }

  for (const mismatch of groupMismatches) {
    const labels = mismatch.stateNames.join(', ');
    lines.push(`  - [${labels}]: cross-state predicate failed`);
    lines.push(`    previous: ${formatValue(mismatch.previous, 200)}`);
    lines.push(`    current: ${formatValue(mismatch.current, 200)}`);
  }

  return lines.join('\n');
}

function buildActionEffectCause(
  error: PendingActionEffectsError,
): Error {
  if (error.groupMismatches.length === 0) {
    return new StateTimeoutError([...error.stateMismatches], error.timeout);
  }
  return new Error(error.message);
}

function formatActionCall(
  actionName: string,
  params: readonly string[],
  args: readonly unknown[],
): string {
  if (args.length === 0) return `${actionName}()`;

  const formattedArgs = args.map((arg, index) => {
    const paramName = params[index] ?? `arg${index + 1}`;
    return `${paramName}: ${formatValue(arg)}`;
  }).join(', ');

  return `${actionName}(${formattedArgs})`;
}
