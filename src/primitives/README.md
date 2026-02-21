# @ayde/test/primitives

Framework-agnostic testing primitives for state-driven automation.

## When To Use Primitives Directly

Use `@ayde/test/primitives` when you want the state/action/effect model without depending on our POM framework.

Typical cases:

- building custom test harnesses
- incremental adoption of state-driven assertions in existing tests

## Mental Model

- `State`: a named live query (`() => Promise<T>`) for semantic truth
- `Action`: behavior that may declare expected postconditions
- `Effect`: action completion contract, with optional invariant checks
- `waitFor`: polling assertion engine used by states, actions, and explicit checks

The goal is to assert what should be true, not how to probe it with low-level selectors.

## Quick Start

```typescript
import { State, Action, Effect, waitFor } from '@ayde/test/primitives';

const itemCount = State(async () => getItems().length).named('itemCount');

const addItem = Action(
  async (text: string) => {
    await createItem(text);
  },
  Effect(itemCount, (cur, prev) => cur === prev + 1)
);

await addItem('Buy milk');
await waitFor(itemCount, 1);
```

## Core APIs

### `State` and `States`

```typescript
import { State, States } from '@ayde/test/primitives';

const isReady = State(async () => app.ready).named('isReady');
await isReady.waitFor(true, { timeout: 5000 });

const { count, isEmpty } = States({
  count: async () => items.length,
  isEmpty: async () => items.length === 0,
});
```

### `Action` and `Actions`

```typescript
import { State, Action, Actions, Effect } from '@ayde/test/primitives';

const count = State(async () => items.length);

const add = Action(
  async (text: string) => {
    await createItem(text);
  },
  Effect(count, (cur, prev) => cur === prev + 1)
);

const actions = Actions({
  clear: async () => {
    await clearItems();
  },
  addWithEffect: [
    async (text: string) => {
      await createItem(text);
    },
    Effect(count, (cur, prev) => cur === prev + 1),
  ],
});
```

### `Effect`

Single-state effect:

```typescript
Effect(count, 0);
Effect(count, cur => cur > 0);
Effect(count, (cur, prev) => cur === prev + 1);
```

Multi-state effect with named deps:

```typescript
const isCompleted = State(async () => todo.completed);
const completedCount = State(async () => todos.filter(t => t.completed).length);

Effect({ isCompleted, completedCount }, prev => ({
  isCompleted: true,
  completedCount: prev.completedCount + 1,
}));
```

### `Collection`

```typescript
import { Collection } from '@ayde/test/primitives';

const items = Collection.create(async () => loadTodoItems());

const completed = items.filter({ isCompleted: true });
const urgent = items.filter({ getText: (t: string) => t.includes('urgent') });

const first = await items.first();
const count = await items.count();
const found = await items.find({ getText: 'Buy milk' });
```

### `waitFor`

```typescript
import { State, waitFor } from '@ayde/test/primitives';

const itemCount = State(async () => items.length);
const isReady = State(async () => app.ready);

await waitFor(250); // sleep

await waitFor(itemCount, 3, { timeout: 3000 });
await waitFor([itemCount, n => n > 0], { timeout: 3000 });

await waitFor([
  [itemCount, 3],
  [isReady, true],
], { timeout: 5000, stableFor: 200 });
```

## Effect Semantics

Effects are not a replacement for test assertions.

Use effects to define when an action has finished and when follow-up steps can safely continue.
Use invariant effects deliberately for rules you want enforced in every call site of an action.

Keep scenario-specific checks in tests (`waitFor(...)`, `toHaveState(...)`, or framework-native assertions).

Single-state effects:

- exact value: `Effect(count, 3)`
- predicate on current value: `Effect(count, cur => cur > 0)`
- predicate on current and previous value: `Effect(count, (cur, prev) => cur === prev + 1)`

```typescript
Effect(count, 3);
Effect(count, cur => cur > 0);
Effect(count, (cur, prev) => cur === prev + 1);
```

Multi-state effects:

- declare dependencies with an object
- callback receives previous values keyed by dependency name
- only returned keys are asserted

```typescript
Effect({ count, label }, prev => ({
  count: prev.label.length,
  // label omitted: used for computation, not asserted
}));
```

## Error Model

`waitFor` and state waits throw `StateTimeoutError` on timeout.

Actions with effects throw `ActionEffectError` when postconditions are not met.

### `StateTimeoutError`

Thrown when one or more state expectations are not satisfied within timeout.

Exposes:

- `name`: `'StateTimeoutError'`
- `timeout: number`: timeout used for the polling operation
- `mismatches: StateMismatch[]`: current failing expectations at timeout

`StateMismatch` fields:

- `state`: the original state function
- `stateName?: string`: optional state name (from `.named(...)` or auto-naming)
- `expected`: expected value or predicate
- `actual`: latest observed value
- `isPredicate: boolean`: whether `expected` is a predicate function

### `ActionEffectError`

Thrown by `Action(...)` when declared effects do not become true after execution.

Exposes:

- `name`: `'ActionEffectError'`
- `actionName?: string`: action display name (if named/discovered)
- `args: unknown[]`: action call arguments
- `cause: StateTimeoutError`: underlying timeout details for failed effects

### Practical Use

- inspect `cause.mismatches` in `ActionEffectError` for root-cause diagnostics
- branch error handling based on `actionName` for targeted logging
- log `stateName`, `expected`, and `actual` for actionable failure output

```typescript
import { ActionEffectError, StateTimeoutError } from '@ayde/test/primitives';

try {
  await addItem('x');
} catch (e) {
  if (e instanceof ActionEffectError) {
    console.error('Action failed:', e.actionName, e.args);
    for (const mismatch of e.cause.mismatches) {
      console.error(
        mismatch.stateName ?? '<unnamed>',
        'expected:',
        mismatch.expected,
        'actual:',
        mismatch.actual
      );
    }
  }
  if (e instanceof StateTimeoutError) {
    console.error('Timed out after', e.timeout, 'ms');
    console.error(e.mismatches);
  }
}
```

## Patterns That Scale

- Name states and actions for better failure output (`.named(...)`).
- Keep states semantic (`isEditing`, `itemCount`) rather than selector-shaped.
- Use effects for completion contracts and deliberate invariants.
- Keep scenario-specific outcomes in test assertions.
- Use `stableFor` for flickery UI transitions.

## API Reference

### Values

| Export | Description |
|---|---|
| `State(fn)` | Create a state from an async getter |
| `States(defs)` | Bulk-create named states |
| `Action(fn, effect?)` | Create an action with optional effect verification |
| `Action(factory)` | Create an action whose effects depend on arguments |
| `Actions(defs)` | Bulk-create named actions |
| `Effect(state, value)` | Single-state effect |
| `Effect(deps, compute)` | Multi-state effect |
| `Collection.create(resolver)` | Create a `Collection<T>` |
| `waitFor(...)` | Sleep/polling wait with overloaded forms |
| `StateTimeoutError` | Timeout error for state polling |
| `ActionEffectError` | Action postcondition failure |

### Types

| Export | Description |
|---|---|
| `StateFunction<R>` | Branded async state function with `.waitFor()` and `.named()` |
| `ActionFunction<Args, R>` | Async action function with `.named()` and `.meta()` |
| `ActionMeta` | `{ name?: string; params: string[] }` |
| `ActionDefinition<R>` | Factory return type for `Action(factory)` |
| `EffectResult` | Internal effect descriptor returned by `Effect(...)` |
| `EffectValue<T>` | `T`, `(current: T) => boolean`, or `(current: T, prev: T) => boolean` |
| `FilterExpectations<T>` | State expectations for `Collection.filter/find` |
| `StateMismatch` | Mismatch payload in timeout errors |
| `WaitForOptions` | `timeout`, `stableFor` |
| `WaitForStateOptions` | Alias used by `state.waitFor(...)` |
