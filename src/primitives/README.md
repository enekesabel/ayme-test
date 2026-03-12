# @qaide/test/primitives

Framework-agnostic primitives for state-driven testing.

## Why Use This

Most E2E tests become brittle because they assert through implementation details: DOM structure, CSS classes, selector shape, or driver-specific mechanics. A small UI refactor breaks many tests even when the behavior is unchanged.

`@qaide/test/primitives` offers an alternative: define *what should be true* as named semantic queries (`State`), then assert those queries directly. The implementation detail (how to observe the value) is isolated in the state definition — not scattered across every test.

The mental model:

- `State` — a named live query: `() => Promise<T>`. Encapsulates how to read a fact about the system.
- `Action` — wraps an async operation and declares what state changes it expects.
- `waitFor` — a polling assertion engine. Waits until all states match expectations.
- `Collection` — typed item sets with state-based filtering and lookup.

**When to use primitives directly**

Use `@qaide/test/primitives` when you want the state-driven assertion model without a POM framework. Typical cases:

- building custom test harnesses
- incremental adoption in existing test suites alongside other tools
- using a driver or framework not covered by the Playwright adapter

---

## `State`

Create a semantic async state query.

```typescript
function State<R>(fn: () => Promise<R>): StateFunction<R>
```

**Parameters**

| | |
|---|---|
| `fn` | Async getter called on each poll. May be sync — the return value is wrapped in a Promise. |

**Returns** `StateFunction<R>` — a callable with `.waitFor()` and `.named()`:

```typescript
// Call to read the current value
state(): Promise<R>

// Wait until state matches expectation
state.waitFor(expected: R | ((value: R) => boolean), options?: WaitForOptions): Promise<void>

// Set a display name used in timeout error messages (chainable)
state.named(name: string): StateFunction<R>
```

**Example**

```typescript
import { State } from '@qaide/test/primitives';

const itemCount = State(async () =>
  document.querySelectorAll('.todo-list li').length
).named('itemCount');

await itemCount();                              // read current value
await itemCount.waitFor(1);                     // wait until count equals 1
await itemCount.waitFor(n => n > 0);            // wait until count > 0
await itemCount.waitFor(1, { stableFor: 200 }); // wait until stable for 200ms
```

---

## `States`

Bulk-create named states from an object. Keys become state names automatically.

```typescript
function States<T extends Record<string, () => Promise<unknown>>>(
  definitions: T
): { [K in keyof T]: StateFunction<ReturnType<T[K]>> }
```

**Parameters**

| | |
|---|---|
| `definitions` | Object mapping state names to async getters. Each key becomes the state's `.named(...)` value. |

**Returns** Object with the same keys; each value is a named `StateFunction`.

**Example**

```typescript
import { States } from '@qaide/test/primitives';

const { isReady, itemCount } = States({
  isReady: async () => document.querySelector('.loading') === null,
  itemCount: async () => document.querySelectorAll('.todo-list li').length,
});
```

---

## `Action`

Wraps an async operation and declares what state changes it expects.

```typescript
function Action<Args, R>(fn: (...args: Args) => Promise<R>): ActionFunction<Args, R>
```

**Parameters**

| | |
|---|---|
| `fn` | Async function to execute. Arguments are preserved and forwarded. |

**Returns** `ActionFunction<Args, R>` — a callable with `.effect()`, `.named()`, and `.meta()`:

```typescript
// Call the action (runs fn, then verifies effects)
action(...args): Promise<R>

// Declare a state effect (chainable — returns ActionWithEffects)
action.effect(state, expected): ActionWithEffects<Args, R>

// Set a display name (chainable)
action.named(name: string): ActionFunction<Args, R>

// Read metadata (name, parameter names)
action.meta(): ActionMeta
```

Once `.effect()` has been called, the returned `ActionWithEffects` also exposes `.options()`:

```typescript
// Configure timeout and stability for effect polling (chainable)
action.options(opts: WaitForOptions): ActionWithEffects<Args, R>
```

When called, an action with effects:

1. Captures the current value of each effect state (before-snapshot)
2. Runs the wrapped function
3. Polls until all effects are satisfied, or throws `ActionEffectError` on timeout

**Example**

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

### Effect chaining

`.effect()` is chainable — call it multiple times to declare multiple post-conditions that must all be satisfied:

```typescript
const modal = page.locator('.modal');
const closeButton = modal.locator('.close-btn');
const formInput = modal.locator('form input');
const isModalVisible = State(async () => modal.isVisible()).named('isModalVisible');
const isFormEmpty = State(async () => (await formInput.inputValue()) === '').named('isFormEmpty');

const closeModal = Action(async () => {
  await closeButton.click();
}).effect(isModalVisible, false)
  .effect(isFormEmpty, true);

await closeModal();  // waits for BOTH: modal hidden AND form inputs cleared
```

### Effect options

`.options()` configures the polling behavior for all effects on an action. It accepts `WaitForOptions`:

| | |
|---|---|
| `timeout?` | Maximum time to wait for effects in ms. Default: `5000`. |
| `stableFor?` | All effects must hold continuously for this many ms before resolving. Default: `0`. |

```typescript
const saveButton = page.locator('.save-btn');
const successBanner = page.locator('.success-banner');
const isSuccessVisible = State(async () => successBanner.isVisible()).named('isSuccessVisible');

const save = Action(async () => {
  await saveButton.click();
}).effect(isSuccessVisible, true)
  .options({ timeout: 10_000 });
```

Use `stableFor` when the UI might briefly flash the expected state before settling:

```typescript
const dropdown = page.locator('.dropdown');
const toggleButton = page.locator('.dropdown-toggle');
const isDropdownOpen = State(async () => dropdown.isVisible()).named('isDropdownOpen');

const openDropdown = Action(async () => {
  await toggleButton.click();
}).effect(isDropdownOpen, true)
  .options({ stableFor: 200 });
```

Subsequent `.options()` calls override previous values:

```typescript
const action = Action(async () => { /* ... */ })
  .effect(isReady, true)
  .options({ timeout: 10_000, stableFor: 100 })
  .options({ timeout: 3_000 });  // overrides: timeout=3000, stableFor is reset to default
```

### Effect styles

**Absolute** — state must equal an exact value after the action:

```typescript
const dialog = page.locator('[role="dialog"]');
const openButton = page.locator('button', { hasText: 'Open' });
const isDialogOpen = State(async () => dialog.isVisible()).named('isDialogOpen');

const openDialog = Action(async () => {
  await openButton.click();
}).effect(isDialogOpen, true);
```

**Relative** — a 2-argument predicate receives the current and before-snapshot values:

```typescript
const checkbox = page.locator('.toggle');
const isCompleted = State(async () => checkbox.isChecked()).named('isCompleted');

const toggle = Action(async () => {
  await checkbox.click();
}).effect(isCompleted, (current, previous) => current === !previous);
```

**Deferred** — when the expected value depends on the action's arguments:

```typescript
const activeTabLabel = page.locator('.tab.active');
const activeTab = State(async () => activeTabLabel.innerText()).named('activeTab');

const switchTab = Action(async (tabName: string) => {
  await page.locator('.tab', { hasText: tabName }).click();
}).effect((effect, tabName) => effect(activeTab, tabName));
```

The deferred builder receives an `ActionEffectBuilder` and the action's arguments. The builder is chainable:

```typescript
const nameInput = page.locator('#name-input');
const value = State(async () => nameInput.inputValue()).named('value');
const isDirty = State(async () =>
  (await nameInput.getAttribute('class') ?? '').includes('dirty')
).named('isDirty');

const fillName = Action(async (text: string) => {
  await nameInput.fill(text);
}).effect((effect, text) =>
  effect(value, text)
  (isDirty, true)
);
```

**Group effects** — cross-state predicates that receive all resolved state values at once:

```typescript
const sidebar = page.locator('.sidebar');
const mainContent = page.locator('.main-content');
const collapseButton = page.locator('.collapse-btn');
const layout = {
  sidebarWidth: State(async () =>
    (await sidebar.boundingBox())?.width ?? 0
  ).named('sidebarWidth'),
  mainWidth: State(async () =>
    (await mainContent.boundingBox())?.width ?? 0
  ).named('mainWidth'),
};

const collapseSidebar = Action(async () => {
  await collapseButton.click();
}).effect(layout, (current, previous) =>
  current.sidebarWidth < previous.sidebarWidth &&
  current.mainWidth > previous.mainWidth
);
```

### Actions without effects

An `Action` with no `.effect()` calls simply runs the function without post-condition verification:

```typescript
const scrollToTop = Action(async () => {
  await page.evaluate(() => window.scrollTo(0, 0));
});
```

### When to use effects

Effects serve two purposes:

1. **Signaling UI completion** — waiting for the UI to settle after an interaction. This is the primary use case and is always safe:

```typescript
const label = page.locator('label');
const editInput = page.locator('.edit-input');
const isEditing = State(async () => editInput.isVisible()).named('isEditing');

const startEdit = Action(async () => {
  await label.dblclick();
}).effect(isEditing, true);
```

```typescript
const modal = page.locator('.modal');
const overlay = page.locator('.overlay');
const isModalVisible = State(async () => modal.isVisible()).named('isModalVisible');

const dismissModal = Action(async () => {
  await overlay.click();
}).effect(isModalVisible, false);
```

2. **Encoding expected application state transitions** — declaring what *should* happen to the application state after an action. This is powerful but requires care:

```typescript
const todoItems = page.locator('.todo-list li');
const newTodoInput = page.locator('.new-todo');
const itemCount = State(async () => todoItems.count()).named('itemCount');

const addItem = Action(async (text: string) => {
  await newTodoInput.fill(text);
  await newTodoInput.press('Enter');
}).effect(itemCount, (cur, prev) => cur === prev + 1);
```

The second case encodes an application-level invariant. If the invariant doesn't hold for all possible inputs (e.g. empty text is rejected by validation), the effect will time out. Only attach effects that are universally true for how the action is used in your tests.

### `ActionEffectError`

Thrown when effects are not satisfied within the timeout after the action completes.

| | |
|---|---|
| `message` | Human-readable summary including the action call and failing effects. |
| `actionCall` | Formatted string of the action call (e.g. `addTodo(text: "Buy milk")`). |
| `args` | The arguments passed to the action. |
| `timeout` | The timeout value used for effect polling (ms). |
| `details` | Detailed breakdown of which effects failed. |
| `cause` | The underlying `StateExpectationTimeoutError`, `StateExpectationStabilityError`, or original error. |

```
ActionEffectError: Action "addTodo(text: "")" effects not met within 5000ms:
  - itemCount: expected predicate to pass, got 0
```

---

## `waitFor`

Poll state expectations until they pass. Four overloads:

```typescript
// Sleep for a fixed duration
waitFor(ms: number): Promise<void>

// Single state with an expected value or predicate
waitFor<T>(state: StateFunction<T>, expected: T | ((v: T) => boolean), options?: WaitForOptions): Promise<void>

// Single [state, expectation] tuple
waitFor<T>(expectation: [StateFunction<T>, T | ((v: T) => boolean)], options?: WaitForOptions): Promise<void>

// Multiple [state, expectation] tuples — all evaluated together
waitFor(expectations: [StateFunction<unknown>, unknown][], options?: WaitForOptions): Promise<void>
```

**`WaitForOptions`**

| | |
|---|---|
| `timeout?` | Maximum wait time in ms. Default: `5000`. |
| `stableFor?` | All expectations must hold continuously for this many ms before resolving. Default: `0`. |

**Example**

```typescript
import { State, waitFor } from '@qaide/test/primitives';

const itemCount = State(async () => document.querySelectorAll('.todo-list li').length);
const isReady = State(async () => document.querySelector('.loading') === null);

await waitFor(itemCount, 3);                              // exact value match
await waitFor(itemCount, n => n > 0, { timeout: 5000 }); // predicate with custom timeout
await waitFor(itemCount, 3, { stableFor: 200 });          // must hold true for 200ms
await waitFor([
  [itemCount, (n: number) => n >= 1],
  [isReady, true],
], { timeout: 5000, stableFor: 200 });                   // all conditions evaluated together
```

Also supports sleep:

```typescript
await waitFor(250);
```

### `StateExpectationTimeoutError`

Thrown by `waitFor(...)` and `state.waitFor(...)` when expectations are not met within the timeout.

| | |
|---|---|
| `message` | Human-readable summary of all failing expectations. |
| `timeout` | The timeout value used for the wait (ms). |
| `mismatches` | Array of `StateExpectationMismatch` — one entry per failing expectation. |

**`StateExpectationMismatch`**

| | |
|---|---|
| `label?` | Display name for the failing expectation, if available. |
| `expected` | The expected value or predicate. |
| `current` | The last observed value. |
| `previous?` | The captured previous value when the expectation depends on it. |
| `isPredicate` | `true` when `expected` is a function. |

**Example error messages**

```
StateExpectationTimeoutError: State expectations not met within 5000ms:
  - itemCount: expected 3, got 1
```

```
StateExpectationTimeoutError: State expectations not met within 5000ms:
  - itemCount: expected 3, got 1
  - isReady: predicate failed (current: false)
```

### `StateExpectationStabilityError`

Thrown by `waitFor(...)` and `state.waitFor(...)` when expectations become true but do not remain true for the configured `stableFor` period within the timeout.

| | |
|---|---|
| `message` | Human-readable summary of the unmet stability requirement. |
| `stableFor` | Required stability duration in ms. |
| `timeout` | The timeout value used for the wait (ms). |

---

## `Collection<T>`

A typed collection with state-based filtering. The resolver is any async function that returns an array of items. Each item exposes state functions — those are what `filter` and `find` primarily match against, with optional item predicates for advanced cases.

**Factory**

```typescript
Collection.create<T>(resolver: () => Promise<T[]>): Collection<T>
```

**Methods**

| | |
|---|---|
| `.filter(expectations \| predicate)` | Returns a new filtered collection (chainable). Prefer state expectations; item predicates are the escape hatch for custom logic. |
| `.all()` | Resolves all items after applying filters. Returns `Promise<T[]>`. |
| `for await...of` | Iterates over one resolved snapshot of the current matching items. Each iteration run resolves fresh items. |
| `.first()` | First item, or `undefined`. Returns `Promise<T \| undefined>`. |
| `.last()` | Last item, or `undefined`. Returns `Promise<T \| undefined>`. |
| `.at(index)` | Item at 0-based index, or `undefined`. Returns `Promise<T \| undefined>`. |
| `.count()` | Number of items after filters. Returns `Promise<number>`. |
| `.find(expectations \| predicate)` | First item matching expectations or a predicate, or `undefined`. Returns `Promise<T \| undefined>`. |

**Filter expectations** are an object where keys are state property names on `T` and values are exact values or predicates `(v) => boolean`.

**Item predicates** receive the item instance and return `boolean | Promise<boolean>`. Use them when the query needs `OR` conditions, cross-state relations, or other custom logic.

**Example**

```typescript
import { State, Collection } from '@qaide/test/primitives';

const items = Collection.create(async () =>
  Array.from(document.querySelectorAll('.todo-list li')).map(el => ({
    isCompleted: State(async () => el.classList.contains('completed')),
    getText: State(async () => el.textContent ?? ''),
  }))
);

const first = await items.first();                              // first item or undefined
const completed = await items.filter({ isCompleted: true }).all(); // filter by state value
const byText = await items.find({ getText: 'Ship docs' });     // first match or undefined
const urgentOrCompleted = await items
  .filter(async item => (await item.isCompleted()) || (await item.getText()).includes('urgent'))
  .all();

for await (const item of items) {
  console.log(await item.getText());
}

for await (const item of items.filter({ isCompleted: true })) {
  console.log(await item.getText());
}
```

Each `for await...of` run resolves one snapshot of the current matching items. Iteration is not a live stream and does not cache across separate runs.

---

## Exports

**Values**

- `State(fn)`
- `States({...})`
- `Action(fn)`
- `Collection<T>`
- `waitFor(...)`
- `StateExpectationError`
- `StateExpectationTimeoutError`
- `StateExpectationStabilityError`
- `ActionEffectError`

**Types**

- `StateFunction<R>`
- `ActionFunction<Args, R>`
- `ActionWithEffects<Args, R>`
- `ActionEffectBuilder`
- `ActionMeta`
- `EffectValue<T>`
- `GroupEffectPredicate<D>`
- `ResolvedDeps<D>`
- `StateDeps`
- `WaitForOptions`
- `WaitForStateOptions`
- `StateExpectationMismatch`
- `FilterExpectations<T>`

---

## See Also

- 🎭 Playwright POM classes, step reporting, and `toHaveState`: [`src/playwright/README.md`](../playwright/README.md)
- Universal POM base classes and adapter pattern: [`src/pom-universal/README.md`](../pom-universal/README.md)
