import { State, Action, Actions, Effect, type ActionFunction, type StateFunction } from '../../src/primitives';

const boolState = State(async () => true);
const numState = State(async () => 42);
const strState = State(async () => 'hello');

// ============ Form 1: Fire-and-forget ============

const noArgs = Action(async () => {});
type _NoArgsCheck = typeof noArgs extends ActionFunction<[], void> ? true : never;
const _noArgsOk: _NoArgsCheck = true;

const withArgs = Action(async (text: string, count: number) => { return text; });
type _WithArgsCheck = typeof withArgs extends ActionFunction<[string, number], string> ? true : never;
const _withArgsOk: _WithArgsCheck = true;

// ============ Form 2: With Effect() ============

const setBool = Action(async () => {}, Effect(boolState, true));

const toggleBool = Action(async () => {}, Effect(boolState, (cur, prev) => cur === !prev));

const incNum = Action(async () => {}, Effect(numState, (cur, prev) => cur === prev + 1));

// @ts-expect-error - wrong effect value type: string not boolean
const wrongType = Action(async () => {}, Effect(boolState, 'wrong'));

// @ts-expect-error - wrong effect value type: boolean not number
const wrongType2 = Action(async () => {}, Effect(numState, true));

// Multi-effect via Effect() with deps
const multiEffect = Action(async () => {}, Effect(
  { boolState, numState },
  prev => ({
    boolState: !prev.boolState,
    numState: prev.numState + 1,
  })
));

const crossState = Action(async () => {}, Effect(
  { numState, strState },
  prev => ({
    numState: prev.strState.length,
    strState: String(prev.numState),
  })
));

const partialAssert = Action(async () => {}, Effect(
  { numState, strState },
  prev => ({
    numState: prev.strState.length,
  })
));

// @ts-expect-error - invalidKey is not in deps
const invalidKey = Action(async () => {}, Effect(
  { numState, strState },
  prev => ({
    numState: prev.strState.length,
    invalidKey: 999,
  })
));

// ============ Form 3: Factory (object return) ============

const factory = Action((text: string) => ({
  execute: async () => {},
  effects: Effect(strState, text),
}));

type _FactoryCheck = typeof factory extends ActionFunction<[string], void> ? true : never;
const _factoryOk: _FactoryCheck = true;

// ============ .named() returns same type ============

const named = Action(async () => {}).named('myAction');
type _NamedCheck = typeof named extends ActionFunction<[], void> ? true : never;
const _namedOk: _NamedCheck = true;

// ============ .meta() returns ActionMeta ============

import type { ActionMeta } from '../../src/primitives';

const metaResult = Action(async () => {}).meta();
type _MetaCheck = typeof metaResult extends ActionMeta ? true : never;
const _metaOk: _MetaCheck = true;

const _nameField: string | undefined = metaResult.name;
const _paramsField: string[] = metaResult.params;

export {};
