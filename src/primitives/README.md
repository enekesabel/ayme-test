# @qaide/test/primitives

Framework-agnostic primitives for state-driven testing.

## Why Use This

> The state-driven model without the POM framework.

Most E2E tests become brittle because they assert through implementation details: DOM structure, CSS classes, selector shapes. A small UI refactor breaks many tests even when the behavior is unchanged.

`@qaide/test/primitives` offers the foundation layer for an alternative — framework-agnostic building blocks for state-driven testing:

- `State` — a named live query: `() => Promise<T>`. Encapsulates how to read a fact about the system.
- `Action` — wraps an async operation and declares what state changes it expects.
- `waitFor` — a polling assertion engine. Waits until all states match expectations.
- `Collection` — typed item sets with state-based filtering and lookup.

No classes, no framework dependency. Everything the POM layer uses internally, available for direct composition.

**When to use primitives directly**

Use `@qaide/test/primitives` when you want the state-driven assertion model without page object classes. Typical cases:

- Composing your own abstractions (functional, class-based, or hybrid)
- Incremental adoption in existing test suites alongside other tools
- Building custom adapters for drivers not covered by the Playwright package

If you're using Playwright and want the full typed POM experience, start with [`@qaide/test/playwright`](../playwright/README.md).

---

## State

A `State` is a named async query that reads a fact about the system.

```typescript
import { State } from '@qaide/test/primitives';

const itemCount = State(async () =>
  document.querySelectorAll('.todo-list li').length
).named('itemCount');

await itemCount();                              // read the current value
await itemCount.waitFor(3);                     // poll until count equals 3
await itemCount.waitFor(n => n > 0);            // poll with a predicate
await itemCount.waitFor(3, { stableFor: 200 }); // must hold for 200ms
```

| Method | Description |
|---|---|
| `state()` | Read the current value |
| `state.waitFor(expected, options?)` | Poll until state matches — see [`.waitFor(expected, options?)`](#waitforexpected-options) |
| `state.named(name: string)` | Set a display name for error messages (chainable) |

### `.waitFor(expected, options?)`

Polls a state until it matches the expected value or predicate. Throws `StateExpectationTimeoutError` on timeout, or `StateExpectationStabilityError` if the value matches but doesn't hold for the required `stableFor` duration.

```typescript
await itemCount.waitFor(3);                                // exact value
await itemCount.waitFor(n => n > 0);                       // predicate
await itemCount.waitFor(3, { timeout: 10_000 });           // custom timeout
await itemCount.waitFor(3, { stableFor: 200 });            // must hold for 200ms
await itemCount.waitFor(n => n > 0, { stableFor: 200 });   // predicate + stability
```

| Option | Description | Default |
|---|---|---|
| `timeout` | Maximum time to wait (ms) | `5000` |
| `stableFor` | Value must hold continuously for this many ms before resolving | `0` |

### State composition

States can derive their value from other states. This keeps each layer focused on its own abstraction level:

```typescript
import { State, Collection } from '@qaide/test/primitives';

const isChecked = State(async () =>
  checkbox.getAttribute('aria-checked') === 'true'
).named('isChecked');

const items = Collection.create(async () =>
  Array.from(document.querySelectorAll('.todo-list li')).map(el => ({
    isCompleted: State(async () => el.classList.contains('completed')),
    text: State(async () => el.textContent ?? ''),
  }))
);

// A state built from a collection — count of completed items
const completedCount = State(async () =>
  items.filter({ isCompleted: true }).count()
).named('completedCount');
```

Tests see `completedCount` — they don't need to know it's derived from a filtered collection.

### Abstracting DOM representations

A single concept in the UI is often represented by multiple DOM signals. "Editing" in TodoMVC, for example, means the label is hidden, the edit input is visible, *and* the edit input is focused. A `State` collapses that into one semantic query:

```typescript
const isEditing = State(async () => {
  const [labelHidden, editInputVisible, editInputFocused] = await Promise.all([
    label.isHidden(),
    editInput.isVisible(),
    editInput.evaluate(el => el === document.activeElement),
  ]);
  return labelHidden && editInputVisible && editInputFocused;
}).named('isEditing');
```

Today "editing" means a hidden label, a visible input, and focus. Tomorrow it might mean a `data-editing` attribute. The state definition changes; the test doesn't.

---

## States

Convenience helper to create multiple named states at once. Keys become display names automatically.

```typescript
import { States } from '@qaide/test/primitives';

const { isReady, itemCount } = States({
  isReady: async () => document.querySelector('.loading') === null,
  itemCount: async () => document.querySelectorAll('.todo-list li').length,
});

// Equivalent to:
// const isReady = State(async () => ...).named('isReady');
// const itemCount = State(async () => ...).named('itemCount');
```

---

## Collection\<T\>

A typed, generic collection with state-based filtering and lookup. `T` is the item type — each item typically exposes state functions that filtering and lookup operate on.

```typescript
import { State, Collection } from '@qaide/test/primitives';

const items = Collection.create(async () =>
  Array.from(document.querySelectorAll('.todo-list li')).map(el => ({
    isCompleted: State(async () => el.classList.contains('completed')),
    text: State(async () => el.textContent ?? ''),
  }))
);

const first = await items.first();                                 // first item
const completed = await items.filter({ isCompleted: true }).all(); // filter by state
const found = await items.find({ text: 'Ship docs' });            // first match
const count = await items.count();                                 // number of items
```

| Method | Returns | Description |
|---|---|---|
| `Collection.create(resolver)` | `Collection<T>` | Create a collection from an async resolver |
| `.filter(expectations)` | `Collection<T>` | Filter by state values — chainable |
| `.filter(predicate)` | `Collection<T>` | Filter by custom predicate — chainable |
| `.find(expectations \| predicate)` | `Promise<T \| undefined>` | First matching item |
| `.all()` | `Promise<T[]>` | Resolve all items after filters |
| `.first()` | `Promise<T \| undefined>` | First item |
| `.last()` | `Promise<T \| undefined>` | Last item |
| `.at(index)` | `Promise<T \| undefined>` | Item at 0-based index |
| `.count()` | `Promise<number>` | Number of items after filters |
| `for await...of` | `T` | Iterate over one snapshot of matching items |

### Filtering

**State expectations** — the primary way to filter. Keys are state property names, values are exact values or predicates:

```typescript
const completed = await items.filter({ isCompleted: true }).all();
const longNames = await items.filter({ text: (t: string) => t.length > 20 }).all();
```

Filters are chainable:

```typescript
const activeLong = await items
  .filter({ isCompleted: false })
  .filter({ text: (t: string) => t.length > 10 })
  .all();
```

**Item predicates** — the escape hatch for `OR` conditions, cross-state relations, or other custom logic:

```typescript
const urgentOrCompleted = await items
  .filter(async item =>
    (await item.isCompleted()) || (await item.text()).includes('urgent')
  )
  .all();
```

### Async iteration

```typescript
for await (const item of items) {
  console.log(await item.text());
}

for await (const item of items.filter({ isCompleted: true })) {
  console.log(await item.text());
}
```

Each `for await...of` run resolves one snapshot of matching items. Iteration is not a live stream and does not cache across separate runs.

---

## Action

An `Action` wraps an async operation. Optionally, it declares what state changes it expects — when called, it runs the operation and then polls until all declared effects are satisfied.

```typescript
import { State, Action } from '@qaide/test/primitives';

const label = page.locator('label');
const editInput = page.locator('.edit-input');
const isEditing = State(async () => editInput.isVisible()).named('isEditing');

const startEdit = Action(async () => {
  await label.dblclick();
}).effect(isEditing, true);

await startEdit();   // double-clicks the label, then waits for the edit input to appear
```

When an action with effects is called, it:

1. Captures the current value of each effect state (before-snapshot)
2. Runs the wrapped function
3. Polls until all effects are satisfied, or throws `ActionEffectError` on timeout

| Method | Description |
|---|---|
| `action(...args)` | Run the action and verify effects |
| [`.named(name: string)`](#namedname-string) | Set a display name (chainable) |
| [`.meta()`](#meta) | Read metadata (name, parameter names) |
| [`.effect(...)`](#effects) | Declare post-conditions — see [Effects](#effects) |

### `.named(name: string)`

Sets a display name used in error messages and step reporting. Chainable — returns the same action:

```typescript
const addItem = Action(async (text: string) => {
  await input.fill(text);
  await input.press('Enter');
}).named('addItem');
```

When an effect times out, the error message includes the name and arguments:

```
ActionEffectError: Action "addItem(text: "Buy milk")" effects not met within 5000ms
```

### `.meta()`

Returns metadata about the action — its name and parameter names. Useful for building tooling, custom reporters, or debugging:

```typescript
const addItem = Action(async (text: string) => {
  await input.fill(text);
  await input.press('Enter');
}).named('addItem');

addItem.meta();  // { name: 'addItem', params: ['text'] }
```

### `.effect()`

Effects declare post-conditions that must be satisfied after an action runs. When called, the action captures before-snapshots, runs the operation, then polls until all effects hold — or throws `ActionEffectError` on timeout.

```typescript
const closeModal = Action(async () => {
  await closeButton.click();
}).effect(isModalVisible, false) // modal must disappear
  .and(isFormEmpty, true)        // AND form inputs must be cleared
  .options({ stableFor: 200 }); // must hold for 200ms

await closeModal();
```

An `Action` with no `.effect()` calls simply runs the function without post-condition verification.

| Method | Description |
|---|---|
| `.effect(state, expected)` | [Absolute](#absolute) — exact value or predicate |
| `.effect(state, (current, previous) => boolean)` | [Relative](#relative) — compare against before-snapshot |
| `.effect((builder, ...args) => ...)` | [Deferred](#deferred) — expected value depends on action arguments |
| `.effect(stateDeps, (current, previous) => boolean)` | [Cross-state](#cross-state) — predicate over multiple states |
| `.and(...)` | Alias for `.effect()` — reads more naturally when chaining |
| `.options({ timeout, stableFor })` | Configure polling — see [options](#effect-options) |
| `ActionEffectError` | Thrown on timeout — see [error](#actioneffecterror) |

#### Effect options

| Option | Description | Default |
|---|---|---|
| `timeout` | Maximum time to wait for effects (ms) | `5000` |
| `stableFor` | All effects must hold continuously for this many ms before resolving | `0` |

```typescript
const save = Action(async () => {
  await saveButton.click();
}).effect(isSuccessVisible, true)  // success banner must appear
  .options({ timeout: 10_000, stableFor: 200 }); // wait up to 10s, must hold for 200ms
```

#### `ActionEffectError`

Thrown when effects are not satisfied within the timeout after the action completes.

```
ActionEffectError: Action "addTodo(text: "")" effects not met within 5000ms:
  - itemCount: expected predicate to pass, got 0
```

| Property | Type | Description |
|---|---|---|
| `message` | `string` | Human-readable summary including the action call and failing effects |
| `actionCall` | `string` | Formatted action call (e.g. `addTodo(text: "Buy milk")`) |
| `args` | `unknown[]` | The arguments passed to the action |
| `timeout` | `number` | The timeout value used (ms) |
| `details` | `string` | Detailed breakdown of which effects failed |
| `cause` | `Error?` | The underlying `StateExpectationTimeoutError` or `StateExpectationStabilityError` |

#### Effect styles

**Absolute** — state must equal an exact value after the action:

```typescript
const openDialog = Action(async () => {
  await openButton.click();
}).effect(isDialogOpen, true); // after clicking, dialog must be open
```

**Relative** — a 2-argument predicate receives the current and before-snapshot values:

```typescript
const toggle = Action(async () => {
  await checkbox.click();
}).effect(isCompleted, (current, previous) => current === !previous); // must flip
```

**Deferred** — when the expected value depends on the action's arguments:

```typescript
const switchTab = Action(async (tabName: string) => {
  await page.locator('.tab', { hasText: tabName }).click();
}).effect((effect, tabName) => effect(activeTab, tabName)); // active tab must match the argument
```

The deferred builder supports `.and` for declaring multiple deferred effects in one call:

```typescript
const fillName = Action(async (text: string) => {
  await nameInput.fill(text);
}).effect((effect, text) =>
  effect(value, text)   // input value must equal the argument
  .and(isDirty, true)   // AND form must be marked dirty
);
```

**Cross-state** — when an effect involves multiple states at once, pass an object of states and a predicate that receives all resolved values:

```typescript
const layout = {
  sidebarWidth: State(async () => (await sidebar.boundingBox())?.width ?? 0).named('sidebarWidth'),
  mainWidth: State(async () => (await mainContent.boundingBox())?.width ?? 0).named('mainWidth'),
};

const collapseSidebar = Action(async () => {
  await collapseButton.click();
}).effect(layout, (current, previous) =>
  current.sidebarWidth < previous.sidebarWidth && // sidebar must shrink
  current.mainWidth > previous.mainWidth           // AND main content must expand
);
```

#### When to use effects

Effects serve two purposes. The first is always safe. The second is powerful but requires care.

**1. Signaling UI completion** — waiting for the UI to settle after an interaction. The input clears, the modal closes, the spinner disappears:

```typescript
const startEdit = Action(async () => {
  await label.dblclick();
}).effect(isEditing, true); // edit input must appear before proceeding
```

**2. Encoding application state transitions** — declaring invariants that should be verified every time the action runs:

```typescript
const addItem = Action(async (text: string) => {
  await newTodoInput.fill(text);
  await newTodoInput.press('Enter');
}).effect(itemCount, (cur, prev) => cur === prev + 1); // item count must increase by 1
```

The second case encodes an application-level invariant. If the invariant doesn't hold for all possible inputs (e.g. empty text is rejected by validation), the effect will time out. Only attach effects that are universally true for how the action is used in your tests.

---

## waitFor

The standalone polling engine. Waits until state expectations are met, or throws on timeout.

```typescript
import { State, waitFor } from '@qaide/test/primitives';

const itemCount = State(async () => document.querySelectorAll('.todo-list li').length);
const isReady = State(async () => document.querySelector('.loading') === null);

await waitFor(itemCount, 3);                              // exact value
await waitFor(itemCount, n => n > 0, { timeout: 5000 }); // predicate + custom timeout
await waitFor(itemCount, 3, { stableFor: 200 });          // must hold for 200ms
await waitFor([
  [itemCount, (n: number) => n >= 1],
  [isReady, true],
], { timeout: 5000, stableFor: 200 });                   // multiple conditions at once
await waitFor(250);                                        // simple sleep
```

| Form | Description |
|---|---|
| `waitFor(state, expected, options?)` | Single state — exact value or predicate |
| `waitFor([state, expected], options?)` | Single tuple |
| `waitFor([[s1, e1], [s2, e2], ...], options?)` | Multiple conditions — all evaluated together |
| `waitFor(ms)` | Sleep for a fixed duration |

| Option | Description | Default |
|---|---|---|
| `timeout` | Maximum time to wait (ms) | `5000` |
| `stableFor` | All expectations must hold continuously for this many ms before resolving | `0` |

### `StateExpectationTimeoutError`

Thrown by `waitFor(...)` and `state.waitFor(...)` when expectations are not met within the timeout.

```
StateExpectationTimeoutError: State expectations not met within 5000ms:
  - itemCount: expected 3, got 1
  - isReady: predicate failed (current: false)
```

| Property | Type | Description |
|---|---|---|
| `message` | `string` | Human-readable summary of all failing expectations |
| `timeout` | `number` | The timeout value used (ms) |
| `mismatches` | `StateExpectationMismatch[]` | One entry per failing expectation — see below |

#### `StateExpectationMismatch`

Each entry in `mismatches` describes one failing expectation:

| Property | Type | Description |
|---|---|---|
| `label` | `string?` | Display name of the failing state (from `.named()`) |
| `expected` | `unknown` | The expected value or predicate |
| `current` | `unknown` | The last observed value |
| `previous` | `unknown?` | The captured before-snapshot (for relative expectations) |
| `isPredicate` | `boolean` | `true` when `expected` is a function |

### `StateExpectationStabilityError`

Thrown by `waitFor(...)` and `state.waitFor(...)` when expectations match but don't remain stable for the required `stableFor` duration within the timeout.

```
StateExpectationStabilityError: State expectations did not remain stable for 200ms within 5000ms
```

| Property | Type | Description |
|---|---|---|
| `message` | `string` | Human-readable summary |
| `stableFor` | `number` | Required stability duration (ms) |
| `timeout` | `number` | The timeout value used (ms) |

---

## See Also

- 🎭 Playwright POM classes, step reporting, and `toHaveState`: [`src/playwright/README.md`](../playwright/README.md)
- Universal POM base classes and adapter pattern: [`src/pom-universal/README.md`](../pom-universal/README.md)
