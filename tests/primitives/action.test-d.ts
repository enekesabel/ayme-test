import {
  Action,
  State,
  type ActionFunction,
  type ActionWithEffects,
} from '../../src/primitives';

const text = State(async () => 'before').named('text');
const isEditing = State(async () => true).named('isEditing');
const itemCount = State(async () => 0).named('itemCount');
const activeCount = State(async () => 0).named('activeCount');

const rename = Action(async (newText: string) => {
  void newText;
})
  .effect((effect, newText) => effect(text, newText)
    .effect(isEditing, false));

const addMany = Action(async (count: number) => {
  void count;
})
  .effect((effect, count) => effect(
    { itemCount, activeCount },
    (current, previous) =>
      current.itemCount === previous.itemCount + count &&
      current.activeCount === previous.activeCount + count,
  ));

const setReady = Action(async () => {})
  .effect(isEditing, true);

const typedRename: ActionFunction<[string], void> = rename;
const typedAddMany: ActionFunction<[number], void> = addMany;
const typedSetReady: ActionFunction<[], void> = setReady;

// .effect() returns ActionWithEffects which has .options()
const withEffects: ActionWithEffects<[], void> = Action(async () => {})
  .effect(isEditing, true);

const withOptions: ActionWithEffects<[], void> = Action(async () => {})
  .effect(isEditing, true)
  .options({ timeout: 1000 });

const withStableFor: ActionWithEffects<[], void> = Action(async () => {})
  .effect(isEditing, true)
  .options({ timeout: 1000, stableFor: 200 });

// .options() is chainable with further .effect() and .options()
const chainedEffectsAndOptions: ActionWithEffects<[], void> = Action(async () => {})
  .effect(isEditing, true)
  .effect(text, 'done')
  .options({ timeout: 500 });

// .options() followed by another .options() overrides
const overriddenOptions: ActionWithEffects<[], void> = Action(async () => {})
  .effect(isEditing, true)
  .options({ timeout: 1000 })
  .options({ timeout: 500 });

// ActionWithEffects is assignable to ActionFunction
const asFunction: ActionFunction<[], void> = withEffects;

// .named() on ActionFunction returns ActionFunction (no .options())
const namedAction: ActionFunction<[], void> = Action(async () => {}).named('test');

// @ts-expect-error .options() is NOT available on ActionFunction (before .effect())
Action(async () => {}).options({ timeout: 1000 });

// @ts-expect-error .options() is NOT available after .named() on ActionFunction
Action(async () => {}).named('test').options({ timeout: 1000 });

// @ts-expect-error wrong expected type for string state
Action(async () => {}).effect(text, 123);

// @ts-expect-error wrong expected type for boolean state
Action(async () => {}).effect(isEditing, 'yes');

// @ts-expect-error callback arg type should be inferred as number
Action(async (count: number) => {}).effect((effect, count) => effect(itemCount, count.toUpperCase()));

// @ts-expect-error unknown key on current snapshot
Action(async () => {}).effect({ itemCount, activeCount }, current => current.missing > 0);

export {};
