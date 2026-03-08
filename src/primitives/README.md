# @qaide/test/primitives

Framework-agnostic primitives for state-driven testing.

## Why Use This

Most E2E tests become brittle because they assert through implementation details: DOM structure, CSS classes, selector shape, or driver-specific mechanics. A small UI refactor breaks many tests even when the behavior is unchanged.

`@qaide/test/primitives` offers an alternative: define *what should be true* as named semantic queries (`State`), then assert those queries directly. The implementation detail (how to observe the value) is isolated in the state definition — not scattered across every test.

The mental model:

- `State` — a named live query: `() => Promise<T>`. Encapsulates how to read a fact about the system.
- `waitFor` — a polling assertion engine. Waits until all states match expectations.
- `Collection` — typed item sets with state-based filtering and lookup.

**When to use primitives directly**

Use `@qaide/test/primitives` when you want the state-driven assertion model without a POM framework. Typical cases:

- building custom test harnesses
- incremental adoption in existing test suites alongside other tools
- using a driver or framework not covered by the Playwright adapter

## Exports

**Values**

- `State(fn)`
- `States({...})`
- `Collection<T>`
- `waitFor(...)`
- `StateTimeoutError`

**Types**

- `StateFunction<R>`
- `WaitForOptions`
- `WaitForStateOptions`
- `StateMismatch`
- `FilterExpectations<T>`

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
).named('itemCount'); // name appears in timeout error messages

await itemCount();                                         // read current value
await itemCount.waitFor(1);                                // wait until count equals 1
await itemCount.waitFor(n => n > 0);                      // wait until count > 0
await itemCount.waitFor(1, { stableFor: 200 });            // wait until stable for 200ms
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
  isReady: async () => document.querySelector('.loading') === null,   // auto-named 'isReady'
  itemCount: async () => document.querySelectorAll('.todo-list li').length, // auto-named 'itemCount'
});
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
  [itemCount, (n: number) => n >= 1],                    // [state, expectation]
  [isReady, true],
], { timeout: 5000, stableFor: 200 });                   // all conditions evaluated together
```

Also supports sleep:

```typescript
await waitFor(250);
```

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
const inconsistentRow = await rows.find(async row =>
  (await row.getDoneCount()) > (await row.getTotalCount())
);

for await (const item of items) {
  console.log(await item.getText());
}

for await (const item of items.filter({ isCompleted: true })) {
  console.log(await item.getText());
}
```

Each `for await...of` run resolves one snapshot of the current matching items. Iteration is not a live stream and does not cache across separate runs.

---

## Errors

`waitFor(...)` and `state.waitFor(...)` throw `StateTimeoutError` on timeout.

**`StateTimeoutError`**

| | |
|---|---|
| `message` | Human-readable summary of all failing expectations. |
| `timeout` | The timeout value used for the wait (ms). |
| `mismatches` | Array of `StateMismatch` — one entry per failing expectation. |

**`StateMismatch`**

| | |
|---|---|
| `stateName?` | Display name from `.named(...)` or `States({...})`, if set. |
| `expected` | The expected value or predicate. |
| `actual` | The last observed value. |
| `isPredicate` | `true` when `expected` is a function. |

**Single state failure** — `error.message`:

```
StateTimeoutError: State expectations not met within 5000ms:
  - itemCount: expected 3, got 1
```

**Multiple state failures** — when using the array form, all failing expectations are reported:

```
StateTimeoutError: State expectations not met within 5000ms:
  - itemCount: expected 3, got 1
  - isReady: predicate failed (actual: false)
```

**Catch block example**

```typescript
import { StateTimeoutError } from '@qaide/test/primitives';

try {
  await waitFor(itemCount, 3);
} catch (e) {
  if (e instanceof StateTimeoutError) {
    console.log(e.timeout);       // ms used for this wait
    for (const m of e.mismatches) {
      console.log(m.stateName);   // 'itemCount'
      console.log(m.expected);    // 3
      console.log(m.actual);      // 1
      console.log(m.isPredicate); // false (true when expectation was a function)
    }
  }
}
```

---

## See Also

- 🎭 Playwright-specific step reporting, POM classes, and `toHaveState`: [`src/playwright/README.md`](../playwright/README.md)
- Universal POM base classes and adapter pattern: [`src/pom-universal/README.md`](../pom-universal/README.md)
