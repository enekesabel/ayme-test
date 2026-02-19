import { State, States, type StateFunction } from '../../src/primitives';

// ============ State type inference ============

const boolState = State(async () => true);
const numState = State(async () => 42);
const strState = State(async () => 'hello');

// Verify brand carries correct return type
type _BoolCheck = typeof boolState extends StateFunction<boolean> ? true : never;
const _boolOk: _BoolCheck = true;

type _NumCheck = typeof numState extends StateFunction<number> ? true : never;
const _numOk: _NumCheck = true;

type _StrCheck = typeof strState extends StateFunction<string> ? true : never;
const _strOk: _StrCheck = true;

// ============ .named() returns same type ============

const named = State(async () => 42).named('count');
type _NamedCheck = typeof named extends StateFunction<number> ? true : never;
const _namedOk: _NamedCheck = true;

// ============ .waitFor() type safety ============

async function testWaitFor() {
  const count = State(async () => 42);

  // Valid: exact value
  await count.waitFor(5);

  // Valid: predicate
  await count.waitFor(n => n > 0);

  // Valid: with options
  await count.waitFor(10, { timeout: 3000, stableFor: 100 });

  // @ts-expect-error - wrong type: string not number
  await count.waitFor('five');

  // @ts-expect-error - predicate param mismatch
  await count.waitFor((s: string) => s.length > 0);
}

// ============ States() bulk helper type inference ============

const states = States({
  count: async () => 42,
  name: async () => 'test',
  active: async () => true,
});

type _BulkCountCheck = typeof states.count extends StateFunction<number> ? true : never;
const _bulkCountOk: _BulkCountCheck = true;

type _BulkNameCheck = typeof states.name extends StateFunction<string> ? true : never;
const _bulkNameOk: _BulkNameCheck = true;

type _BulkActiveCheck = typeof states.active extends StateFunction<boolean> ? true : never;
const _bulkActiveOk: _BulkActiveCheck = true;

export {};
