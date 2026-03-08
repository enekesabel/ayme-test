import {
  Action,
  State,
  type ActionFunction,
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

// @ts-expect-error wrong expected type for string state
Action(async () => {}).effect(text, 123);

// @ts-expect-error wrong expected type for boolean state
Action(async () => {}).effect(isEditing, 'yes');

// @ts-expect-error callback arg type should be inferred as number
Action(async (count: number) => {}).effect((effect, count) => effect(itemCount, count.toUpperCase()));

// @ts-expect-error unknown key on current snapshot
Action(async () => {}).effect({ itemCount, activeCount }, current => current.missing > 0);

export {};
