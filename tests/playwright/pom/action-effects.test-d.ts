import { PageComponent } from '../../../src/playwright/pom';
import type { ActionFunction } from '../../../src/playwright/pom';
import type { StateFunction } from '../../../src/primitives';

/**
 * Type tests for Action + Effect API.
 * Validates:
 * - Single effect type safety via this.Effect(state, value)
 * - predicate effects can inspect current value (and optionally previous snapshot)
 * - Multi-effect via this.Effect(deps, compute) for cross-state
 * - this.Effect(this, compute) form for auto-discovered states
 * - Factory form with object return
 */

// ============ Basic Single Effects ============

class BasicComponent extends PageComponent {
  boolState = this.State(async () => true);
  numState = this.State(async () => 42);
  strState = this.State(async () => 'hello');

  setBoolTrue = this.Action(
    async () => {},
    this.Effect(this.boolState, true)
  );

  setBoolFalse = this.Action(
    async () => {},
    this.Effect(this.boolState, false)
  );

  setNum = this.Action(
    async () => {},
    this.Effect(this.numState, 100)
  );

  setStr = this.Action(
    async () => {},
    this.Effect(this.strState, 'world')
  );

  toggleBool = this.Action(
    async () => {},
    this.Effect(this.boolState, (cur, prev) => cur === !prev)
  );

  incrementNum = this.Action(
    async () => {},
    this.Effect(this.numState, (cur, prev) => cur === prev + 1)
  );

  appendStr = this.Action(
    async () => {},
    this.Effect(this.strState, (cur, prev) => cur === prev + '!')
  );

  multipleEffects = this.Action(
    async () => {},
    this.Effect({ boolState: this.boolState, numState: this.numState }, prev => ({
      boolState: !prev.boolState,
      numState: 42,
    }))
  );
}

// ============ Invalid Effects - Type Errors ============

class InvalidEffects extends PageComponent {
  boolState = this.State(async () => true);
  numState = this.State(async () => 42);
  strState = this.State(async () => 'hello');

  wrongTypeBool = this.Action(
    async () => {},
    // @ts-expect-error - boolState expects boolean, not string
    this.Effect(this.boolState, 'wrong')
  );

  wrongTypeNum = this.Action(
    async () => {},
    // @ts-expect-error - numState expects number, not boolean
    this.Effect(this.numState, true)
  );

  wrongTypeStr = this.Action(
    async () => {},
    // @ts-expect-error - strState expects string, not number
    this.Effect(this.strState, 123)
  );

  wrongPrevReturn = this.Action(
    async () => {},
    // @ts-expect-error - predicate must return boolean
    this.Effect(this.boolState, (_cur: boolean) => 'wrong string')
  );
}

// ============ Cross-State Effects via Effect(deps) ============

class CrossStateComponent extends PageComponent {
  stateA = this.State(async () => 10);
  stateB = this.State(async () => 20);
  stateC = this.State(async () => 0);

  swapAB = this.Action(
    async () => {},
    this.Effect({ stateA: this.stateA, stateB: this.stateB }, prev => ({
      stateA: prev.stateB,
      stateB: prev.stateA,
    }))
  );

  sumIntoC = this.Action(
    async () => {},
    this.Effect({ stateA: this.stateA, stateB: this.stateB, stateC: this.stateC }, prev => ({
      stateC: prev.stateA + prev.stateB,
    }))
  );

  // Invalid key in return — stateC not in deps
  invalidKey = this.Action(
    async () => {},
    // @ts-expect-error - stateC is not in the deps object
    this.Effect({ stateA: this.stateA, stateB: this.stateB }, prev => ({
      stateA: prev.stateB,
      stateC: 999,
    }))
  );
}

// ============ Factory Form Actions ============

class FactoryComponent extends PageComponent {
  getText = this.State(async () => 'initial');
  itemCount = this.State(async () => 0);

  edit = this.Action((newText: string) => ({
    execute: async () => {},
    effects: this.Effect(this.getText, newText),
  }));

  complexEdit = this.Action((newText: string, increment: number) => ({
    execute: async () => {},
    effects: this.Effect({ getText: this.getText, itemCount: this.itemCount }, prev => ({
      getText: newText,
      itemCount: prev.itemCount + increment,
    })),
  }));
}

// Verify factory form action types
type EditType = FactoryComponent['edit'];
const _editCheck: ActionFunction<[string], void> = null as unknown as EditType;

type ComplexEditType = FactoryComponent['complexEdit'];
const _complexEditCheck: ActionFunction<[string, number], void> = null as unknown as ComplexEditType;

// ============ State Type Inference ============

type _BoolStateCheck = BasicComponent['boolState'] extends StateFunction<boolean> ? true : never;
const _boolStateOk: _BoolStateCheck = true;

type _NumStateCheck = BasicComponent['numState'] extends StateFunction<number> ? true : never;
const _numStateOk: _NumStateCheck = true;

type _StrStateCheck = BasicComponent['strState'] extends StateFunction<string> ? true : never;
const _strStateOk: _StrStateCheck = true;

// ============ Action Type Verification ============

type _ToggleBoolCheck = BasicComponent['toggleBool'] extends ActionFunction<[], void> ? true : never;
const _toggleBoolOk: _ToggleBoolCheck = true;

type _MultipleEffectsCheck = BasicComponent['multipleEffects'] extends ActionFunction<[], void> ? true : never;
const _multipleEffectsOk: _MultipleEffectsCheck = true;

export {};
