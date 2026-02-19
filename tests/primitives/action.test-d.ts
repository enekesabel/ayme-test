import { State, Action, Actions, type ActionFunction, type StateFunction } from '../../src/primitives';

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

// ============ Form 2: With static effects ============

// Single effect — exact value
const setBool = Action(async () => {}, [boolState, true]);

// Single effect — prev function
const toggleBool = Action(async () => {}, [boolState, (prev: any) => !prev()]);

// Multiple effects
const multiEffect = Action(async () => {}, [
  [boolState, (prev: any) => !prev()],
  [numState, 42],
]);

// @ts-expect-error - wrong effect value type: string not boolean
const wrongType = Action(async () => {}, [boolState, 'wrong']);

// @ts-expect-error - wrong effect value type: boolean not number
const wrongType2 = Action(async () => {}, [numState, true]);

// ============ Form 3: Factory ============

const factory = Action((text: string) => [
  async () => {},
  [strState, text],
] as const);

type _FactoryCheck = typeof factory extends ActionFunction<[string], void> ? true : never;
const _factoryOk: _FactoryCheck = true;

// ============ .named() returns same type ============

const named = Action(async () => {}).named('myAction');
type _NamedCheck = typeof named extends ActionFunction<[], void> ? true : never;
const _namedOk: _NamedCheck = true;

export {};
