import { test, expect } from '@playwright/test';
import { State } from '../../src/primitives/state';
import { Action, Actions } from '../../src/primitives/action';
import { Effect } from '../../src/primitives/effect';
import { ActionEffectError, StateTimeoutError } from '../../src/primitives/errors';

test.describe('Action() — fire-and-forget', () => {
  test('executes and returns result', async () => {
    let called = false;
    const doSomething = Action(async () => { called = true; });

    await doSomething();
    expect(called).toBe(true);
  });

  test('passes arguments through', async () => {
    let received = '';
    const greet = Action(async (name: string) => { received = name; });

    await greet('world');
    expect(received).toBe('world');
  });
});

test.describe('Action() — with single Effect()', () => {
  test('verifies single effect after execution', async () => {
    let value = 0;
    const count = State(async () => value);

    const increment = Action(
      async () => { value++; },
      Effect(count, (cur: number, prev: number) => cur === prev + 1),
    );

    await increment();
    expect(value).toBe(1);
  });

  test('throws ActionEffectError when effects not met', async () => {
    const count = State(async () => 0).named('count');

    const badAction = Action(
      async () => { /* doesn't change count */ },
      Effect(count, 99),
    ).named('badAction');

    try {
      await badAction();
      throw new Error('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ActionEffectError);
      const err = e as ActionEffectError;
      expect(err.actionName).toBe('badAction');
      expect(err.cause).toBeInstanceOf(StateTimeoutError);
      expect(err.cause.mismatches.length).toBeGreaterThan(0);
    }
  });
});

test.describe('Action() — with multi Effect()', () => {
  test('verifies multiple effects after execution', async () => {
    let count = 0;
    let empty = true;

    const itemCount = State(async () => count);
    const isEmpty = State(async () => empty);

    const addItem = Action(
      async () => { count++; empty = false; },
      Effect({ itemCount, isEmpty }, prev => ({
        itemCount: prev.itemCount + 1,
        isEmpty: false,
      })),
    );

    await addItem();
    expect(count).toBe(1);
    expect(empty).toBe(false);
  });
});

test.describe('Action() — factory form', () => {
  test('factory returns { execute, effects }', async () => {
    let name = 'old';
    const itemName = State(async () => name);

    const rename = Action((newName: string) => ({
      execute: async () => { name = newName; },
      effects: Effect(itemName, newName),
    }));

    await rename('new');
    expect(name).toBe('new');
  });

  test('factory fire-and-forget (returns Promise)', async () => {
    let value = '';
    const setText = Action(async (text: string) => {
      value = text;
    });

    await setText('hello');
    expect(value).toBe('hello');
  });
});

test.describe('Action().named()', () => {
  test('sets action name and is chainable', async () => {
    const doSomething = Action(async () => {}).named('doSomething');
    await doSomething();
  });
});

test.describe('Action().meta()', () => {
  test('returns empty params for no-arg action', async () => {
    const doSomething = Action(async () => {});
    const meta = doSomething.meta();
    expect(meta.params).toEqual([]);
    expect(meta.name).toBeUndefined();
  });

  test('extracts param names from arrow function', async () => {
    const greet = Action(async (name: string, count: number) => {
      void name;
      void count;
    });
    const meta = greet.meta();
    expect(meta.params).toEqual(['name', 'count']);
  });

  test('returns name after .named()', async () => {
    const doSomething = Action(async () => {}).named('doSomething');
    const meta = doSomething.meta();
    expect(meta.name).toBe('doSomething');
    expect(meta.params).toEqual([]);
  });

  test('returns both name and params', async () => {
    const addItem = Action(async (text: string) => {
      void text;
    }).named('addItem');
    const meta = addItem.meta();
    expect(meta.name).toBe('addItem');
    expect(meta.params).toEqual(['text']);
  });

  test('extracts params from factory form', async () => {
    let name = 'old';
    const itemName = State(async () => name);
    const rename = Action((newName: string) => ({
      execute: async () => { name = newName; },
      effects: Effect(itemName, newName),
    }));
    const meta = rename.meta();
    expect(meta.params).toEqual(['newName']);
  });
});

test.describe('Actions() bulk helper', () => {
  test('creates multiple named actions', async () => {
    let count = 0;
    let text = '';

    const itemCount = State(async () => count);

    const { increment, setText } = Actions({
      increment: [
        async () => { count++; },
        Effect(itemCount, (cur: number, prev: number) => cur === prev + 1),
      ],
      setText: async (t: string) => { text = t; },
    });

    await increment();
    expect(count).toBe(1);

    await setText('hello');
    expect(text).toBe('hello');
  });
});
