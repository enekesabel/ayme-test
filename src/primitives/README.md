# @ayde/test/primitives

Framework-independent testing primitives for state-driven test automation.

## Why primitives?

The `@ayde/test` POM framework is opinionated — it couples state management, effect verification, and collection querying to Playwright's `Page`, `Locator`, and `test.step()`. That makes it powerful for Playwright users but impossible to adopt incrementally or use with other frameworks.

**Primitives extract the core ideas** — `State`, `Action`, `Collection`, `waitForStates` — into standalone building blocks that work with any async getter, any UI framework, or no framework at all. You can:

- Use them standalone with Playwright, Cypress, Puppeteer, or plain Node.js
- Build your own opinionated layer on top (the POM framework does exactly this)
- Adopt incrementally: start with `State` + `waitForStates`, add `Action` effects later

## Installation

```bash
npm install @ayde/test
```

```typescript
import { State, Action, Collection, waitForStates } from '@ayde/test/primitives';
```

## Core concepts

### State

A `StateFunction<R>` is a branded async function that queries a current value. Think of it as a "live getter" — every call re-evaluates and returns the latest result.

```typescript
import { State, States } from '@ayde/test/primitives';

// Create a state from any async getter
const itemCount = State(async () => document.querySelectorAll('.item').length);

// Query the current value
const count = await itemCount(); // number

// Name it for better error messages
const isVisible = State(async () => {
  return getComputedStyle(el).display !== 'none';
}).named('isVisible');

// Wait until a state reaches an expected value (polls automatically)
await itemCount.waitFor(5);
await itemCount.waitFor(n => n > 0);
await isVisible.waitFor(true, { timeout: 3000 });
```

#### Bulk definition with `States()`

Define multiple states at once. Property keys become display names automatically.

```typescript
const { itemCount, isEmpty, lastItem } = States({
  itemCount: async () => items.length,
  isEmpty: async () => items.length === 0,
  lastItem: async () => items[items.length - 1],
});
// itemCount is StateFunction<number> named 'itemCount'
```

### Action

An `ActionFunction` performs a side effect and optionally declares expected state transitions (effects). When effects are declared, the action automatically:

1. Captures a "before" snapshot of affected states
2. Executes the action
3. Polls until all effects are satisfied (or throws)

Three forms:

```typescript
import { State, Action } from '@ayde/test/primitives';

const itemCount = State(async () => items.length);
const itemName = State(async () => items[0]?.name);

// Form 1: Fire-and-forget (no effects)
const scrollToTop = Action(async () => {
  window.scrollTo(0, 0);
});

// Form 2: Static effects (effects don't depend on arguments)
const addItem = Action(
  async (text: string) => { /* add the item */ },
  [itemCount, prev => prev() + 1],
);

// Form 3: Factory (effects depend on arguments)
const rename = Action((oldName: string, newName: string) => [
  async () => { /* perform rename */ },
  [itemName, newName],
]);
```

#### Effects

Effects are raw tuples declared inline with `Action()`. Each effect is a pair of `[state, expectedValue]`.

```typescript
// Single effect — exact value
Action(async () => { /* ... */ }, [itemCount, 5]);

// Single effect — relative to previous value
Action(async () => { /* ... */ }, [itemCount, prev => prev() + 1]);

// Multiple effects
Action(async () => { /* ... */ }, [
  [itemCount, prev => prev() + 1],
  [itemName, 'new name'],
  [isActive, true],
]);

// Cross-state reference via prev()
Action(async () => { /* ... */ }, [
  [itemCount, prev => prev() + 1],
  [label, prev => prev(itemCount) > 0 ? 'has items' : 'empty'],
]);
```

The `prev` parameter in relative effects is a `PrevSnapshot` — call `prev()` to get the state's own before-value, or `prev(otherState)` to reference another state's before-value.

#### Bulk definition with `Actions()`

```typescript
const { toggle, addItem, rename } = Actions({
  // Fire-and-forget
  toggle: async () => { await checkbox.click(); },

  // With effects — [executeFn, effects]
  addItem: [
    async (text: string) => { /* ... */ },
    [itemCount, prev => prev() + 1],
  ],

  // Factory form
  rename: (oldName: string, newName: string) => [
    async () => { /* ... */ },
    [itemName, newName],
  ],
});
```

### Collection

A generic typed collection with state-based filtering. Provide a resolver function that returns the current list of items.

```typescript
import { State, Collection, type StateFunction } from '@ayde/test/primitives';

interface TodoItem {
  getText: StateFunction<string>;
  isCompleted: StateFunction<boolean>;
}

const items = Collection.create<TodoItem>(async () => getAllTodoItems());

// Filter by state values
const completed = items.filter({ isCompleted: true });
const urgent = items.filter({ getText: t => t.includes('urgent') });

// Chaining
const completedUrgent = items
  .filter({ isCompleted: true })
  .filter({ getText: t => t.includes('urgent') });

// Query methods
const all = await items.all();            // TodoItem[]
const first = await items.first();        // TodoItem | undefined
const last = await items.last();          // TodoItem | undefined
const count = await items.count();        // number
const third = await items.at(2);          // TodoItem | undefined
const found = await items.find({ getText: 'Buy milk' }); // TodoItem | undefined
```

`Collection` is subclassable — `filter()` preserves the concrete subclass type via a virtual constructor pattern.

### waitForStates

Polls multiple state expectations simultaneously until all are met or the timeout expires.

```typescript
import { waitForStates } from '@ayde/test/primitives';

await waitForStates([
  [itemCount, 5],
  [isEmpty, false],
], { timeout: 5000 });

// With stability: expectations must hold continuously for the given duration
await waitForStates([
  [itemCount, n => n > 0],
], { timeout: 5000, stableFor: 250 });
```

Uses an internal polling mechanism with escalating intervals for efficient retry behavior.

## Error handling

Primitives throw rich, inspectable error objects instead of plain strings.

### StateTimeoutError

Thrown by `waitForStates()` and `state.waitFor()` when expectations aren't met within the timeout.

```typescript
import { StateTimeoutError } from '@ayde/test/primitives';

try {
  await waitForStates([[count, 5]], { timeout: 3000 });
} catch (e) {
  if (e instanceof StateTimeoutError) {
    e.timeout;                    // 3000
    e.mismatches;                 // StateMismatch[]
    e.mismatches[0].stateName;    // 'itemCount' (if named)
    e.mismatches[0].expected;     // 5
    e.mismatches[0].actual;       // 3
    e.mismatches[0].isPredicate;  // false
  }
}
```

### ActionEffectError

Thrown by `Action` when declared effects aren't met after execution. Wraps the underlying `StateTimeoutError`.

```typescript
import { ActionEffectError } from '@ayde/test/primitives';

try {
  await addItem('Buy milk');
} catch (e) {
  if (e instanceof ActionEffectError) {
    e.actionName;   // 'addItem' (if named)
    e.args;         // ['Buy milk']
    e.cause;        // StateTimeoutError (with mismatches)
  }
}
```

## API reference

### Values

| Export | Description |
|---|---|
| `State(fn)` | Create a `StateFunction<R>` from an async getter |
| `States(defs)` | Bulk-create named states from an object |
| `Action(fn, effects?)` | Create an `ActionFunction` with optional effects |
| `Action(factory)` | Create an `ActionFunction` with a factory for parameterized effects |
| `Actions(defs)` | Bulk-create named actions from an object |
| `Collection.create(resolver)` | Create a `Collection<T>` from a resolver function |
| `waitForStates(expectations, options?)` | Poll until all state expectations are met |
| `StateTimeoutError` | Error class for timed-out state expectations |
| `ActionEffectError` | Error class for failed action effects |

### Types

| Export | Description |
|---|---|
| `StateFunction<R>` | Branded async function type with `.waitFor()` and `.named()` |
| `ActionFunction<Args, R>` | Async function type with `.named()` |
| `EffectEntry<T>` | A `[StateFunction<T>, EffectValue<T>]` tuple |
| `EffectValue<T>` | Exact value `T` or relative function `(prev: PrevSnapshot<T>) => T` |
| `Effects` | Single `EffectEntry` or array of `EffectEntry` |
| `PrevSnapshot<T>` | Before-value accessor, callable as `prev()` or `prev(otherState)` |
| `FilterExpectations<T>` | Object mapping state keys to expected values or predicates |
| `StateMismatch` | Details of a single failed state expectation |
| `WaitForStatesOptions` | Options for `waitForStates()`: `timeout`, `stableFor` |
| `WaitForStateOptions` | Options for `state.waitFor()`: `timeout`, `stableFor` |
