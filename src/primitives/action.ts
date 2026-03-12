import { ActionEffectError, type StateExpectationMismatch } from './errors';
import { extractParamNames, formatValue } from './format';
import type { StateFunction } from './state';
import { StateBrandSymbol, StateNameSymbol } from './state';
import { createStateExpectation, pollExpectations, type WaitForOptions } from './wait';

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
  and: ActionEffectBuilder;
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
  and<T>(
    state: StateFunction<T>,
    expected: EffectValue<T>,
  ): ActionWithEffects<Args, R>;
  and<D extends StateDeps>(
    states: D,
    predicate: GroupEffectPredicate<D>,
  ): ActionWithEffects<Args, R>;
  and(
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
    const expectations = resolvedEffects.map((effect, index) =>
      createEffectExpectation(effect, snapshots[index]!));

    try {
      await pollExpectations(expectations, effectOpts);
    } catch (error) {
      if (error instanceof Error) {
        throw new ActionEffectError(
          formatActionCall(actionName ?? fn.name ?? 'unnamed action', params, args),
          args,
          timeout,
          error.message,
          error,
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
  (wrapper as unknown as ActionWithEffects<Args, R>).and = wrapper.effect;

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
  builder.and = builder;

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

function createEffectExpectation(
  effect: EffectDefinition,
  previous: unknown,
): { label?: string; evaluate: () => Promise<StateExpectationMismatch | undefined> } {
  if (effect.kind === 'state') {
    return createStateExpectationWithPrevious(effect, previous);
  }
  return createGroupExpectation(effect, previous);
}

function createStateExpectationWithPrevious(
  effect: StateEffectDefinition<unknown>,
  previous: unknown,
): { label?: string; evaluate: () => Promise<StateExpectationMismatch | undefined> } {
  if (typeof effect.expected !== 'function' || effect.expected.length < 2) {
    return createStateExpectation(
      effect.state,
      effect.expected as unknown,
    );
  }

  return {
    label: effect.state[StateNameSymbol],
    evaluate: async () => {
      const current = await effect.state();
      const isPredicate = true;
      const matches = (effect.expected as (current: unknown, prev: unknown) => boolean)(current, previous);

      if (matches) return undefined;

      return {
        state: effect.state,
        label: effect.state[StateNameSymbol],
        expected: effect.expected,
        current,
        previous,
        isPredicate,
      };
    },
  };
}

function createGroupExpectation(
  effect: GroupEffectDefinition<StateDeps>,
  previous: unknown,
): { label: string; evaluate: () => Promise<StateExpectationMismatch | undefined> } {
  return {
    label: `[${Object.keys(effect.states).join(', ')}]`,
    evaluate: async () => {
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
        label: `[${Object.keys(effect.states).join(', ')}]`,
        expected: effect.predicate,
        current,
        previous,
        isPredicate: true,
      };
    },
  };
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
