import { PageComponent, PageObject, StateFunction, ActionFunction } from '../src';

/**
 * Type tests for Action effects with this.Effect.
 * This file validates that:
 * - Actions require effects to be declared
 * - Effect value types are checked against state return types
 * - prev() returns correct type for current effect's state
 * - prev(state) returns correct type for any state
 */

// ============ Basic Single Effects ============

class BasicComponent extends PageComponent {
  boolState = this.State(async () => true);
  numState = this.State(async () => 42);
  strState = this.State(async () => 'hello');

  // Static value effects
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

  // prev() with no arg - uses current effect's state
  toggleBool = this.Action(
    async () => {},
    this.Effect(this.boolState, prev => !prev())
  );

  incrementNum = this.Action(
    async () => {},
    this.Effect(this.numState, prev => prev() + 1)
  );

  appendStr = this.Action(
    async () => {},
    this.Effect(this.strState, prev => prev() + '!')
  );

  // Multiple effects with this.Effect
  multipleEffects = this.Action(
    async () => {},
    this.Effect(
      [this.boolState, prev => !prev()],
      [this.numState, 42]
    )
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
    // @ts-expect-error - prev function returns string, not boolean
    this.Effect(this.boolState, prev => 'wrong string')
  );

  // Multiple effects with wrong type
  wrongTypeInMultiple = this.Action(
    async () => {},
    // @ts-expect-error - first effect has wrong type
    this.Effect(
      [this.boolState, 'not a boolean'],
      [this.numState, 42]
    )
  );
}

// ============ Cross-State Effects ============

class CrossStateComponent extends PageComponent {
  stateA = this.State(async () => 10);
  stateB = this.State(async () => 20);
  stateC = this.State(async () => 0);

  // Effect that reads other state values via prev(state)
  swapAB = this.Action(
    async () => {},
    this.Effect(
      [this.stateA, prev => prev(this.stateB)],
      [this.stateB, prev => prev(this.stateA)]
    )
  );

  // Effect that reads multiple states
  sumAll = this.Action(
    async () => {},
    this.Effect(this.stateC, prev => prev(this.stateA) + prev(this.stateB))
  );
}

// ============ Factory Form Actions ============

class FactoryComponent extends PageComponent {
  getText = this.State(async () => 'initial');
  itemCount = this.State(async () => 0);

  // Factory form with single effect
  edit = this.Action((newText: string) => ({
    execute: async () => {},
    effects: this.Effect(this.getText, newText),
  }));

  // Factory form with multiple effects
  complexEdit = this.Action((newText: string, increment: number) => ({
    execute: async () => {},
    effects: this.Effect(
      [this.getText, newText],
      [this.itemCount, prev => prev() + increment]
    ),
  }));
}

// Verify factory form action types
type EditType = FactoryComponent['edit'];
const _editCheck: ActionFunction<[string], void> = null as unknown as EditType;

type ComplexEditType = FactoryComponent['complexEdit'];
const _complexEditCheck: ActionFunction<[string, number], void> = null as unknown as ComplexEditType;

// ============ State Type Inference ============

// Verify StateFunction brand carries correct return type
type _BoolStateCheck = BasicComponent['boolState'] extends StateFunction<boolean> ? true : never;
const _boolStateOk: _BoolStateCheck = true;

type _NumStateCheck = BasicComponent['numState'] extends StateFunction<number> ? true : never;
const _numStateOk: _NumStateCheck = true;

type _StrStateCheck = BasicComponent['strState'] extends StateFunction<string> ? true : never;
const _strStateOk: _StrStateCheck = true;

// ============ Action Type Verification ============

// Verify Action returns correct ActionFunction type
type _ToggleBoolCheck = BasicComponent['toggleBool'] extends ActionFunction<[], void> ? true : never;
const _toggleBoolOk: _ToggleBoolCheck = true;

type _MultipleEffectsCheck = BasicComponent['multipleEffects'] extends ActionFunction<[], void> ? true : never;
const _multipleEffectsOk: _MultipleEffectsCheck = true;

export {};
