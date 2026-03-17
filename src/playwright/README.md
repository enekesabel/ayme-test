# @ayme-dev/test/playwright

Drop-in replacement for `@playwright/test` with state-driven testing extensions.

```typescript
// Before
import { test, expect } from '@playwright/test';

// After — same API, plus toHaveState and typed POMs
import { test, expect } from '@ayme-dev/test/playwright';
```

Everything Playwright provides, plus:

- **Typed POM classes** — [`PageObject`](#pageobject) and [`PageComponent`](#pagecomponent) built on the [universal POM](../pom-universal/README.md)
- **[`toHaveState`](#tohavestate)** — polling assertion for semantic states on any object with state properties
- **[Step reporting](#step-reporting)** — actions automatically appear as named steps in Playwright's HTML report and trace viewer

---

## At a Glance

```typescript
import { test, expect, PageObject, PageComponent } from '@ayme-dev/test/playwright';
import type { Page, Locator } from '@playwright/test';

// PageComponent — scoped to a root Locator
class TodoItem extends PageComponent {
  constructor(root: Locator) { super(root); }

  locators = this.Locators({
    toggle: this.root.locator('.toggle'),  // this.root === root
  });

  // this.locators.root is auto-included by PageComponent
  isVisible = this.State(() => this.locators.root.isVisible());
  isCompleted = this.State(() => this.locators.toggle.isChecked());
}

// PageObject — scoped to a Playwright Page
class TodoPage extends PageObject {
  constructor(page: Page) { super(page); }

  locators = this.Locators({
    newTodoInput: this.page.locator('.new-todo'),
    todoListItems: this.page.locator('.todo-list li'),
  });

  // Playwright shorthand — resolves locator.all() into TodoItem instances
  items = this.Collection(TodoItem, this.locators.todoListItems);
  itemCount = this.State(() => this.locators.todoListItems.count());

  // step: TodoPage.addTodo(text: "Ship docs")
  addTodo = this.Action(async (text: string) => {
    await this.locators.newTodoInput.fill(text);
    await this.locators.newTodoInput.press('Enter');
  }).effect(this.itemCount, (cur, prev) => cur === prev + 1);
}

test('adds a todo', async ({ page }) => {
  const todoPage = new TodoPage(page);
  await todoPage.addTodo('Ship docs');

  // Polling assertion — retries until all states match
  await expect(todoPage).toHaveState({ itemCount: 1 });
});
```

---

## POM Classes

Built on [`@ayme-dev/test/pom-universal`](../pom-universal/README.md) — see the [universal POM docs](../pom-universal/README.md) for the full `PageFragment` API (`State`, `Action`, `Collection`, `Locators`, `waitFor`, `WithLocators`).

### `PageObject`

Constructor takes a Playwright `Page`. All subclasses have access to `this.page`.

### `PageComponent`

Constructor takes a `Locator`. `page` is derived automatically from `root.page()` — components only need a root locator.

### Playwright-specific additions

| | |
|---|---|
| `this.Collection(ComponentClass, locator)` | Shorthand — resolves `locator.all()` into component instances. |
| `this.Action(fn)` | Actions automatically wrapped in `test.step(...)` for report visibility. |

---

## `toHaveState`

Polls state functions until all expectations pass simultaneously. Works with `PageFragment` subclasses and plain objects — any object with `StateFunction` properties. Uses AND logic — all states must match at the same time.

```typescript
// Exact value
await expect(todoPage).toHaveState({ itemCount: 3 });

// Predicate
await expect(todoPage).toHaveState({ itemCount: (n: number) => n >= 1 });

// Multiple states — all must be true at the same time
await expect(todoPage).toHaveState({
  itemCount: 3,
  completedCount: (n: number) => n >= 1,
});

// With options
await expect(todoPage).toHaveState(
  { isReady: true },
  { timeout: 10000, stableFor: 250 },
);

// Negation
await expect(todoPage).not.toHaveState({ itemCount: 0 });
```

### Expectation values

| Value form | Matches when |
|---|---|
| `true` / `3` / `'hello'` | State returns that exact value |
| `(v) => boolean` | Predicate returns `true` |

### Options

| Option | Description |
|---|---|
| `timeout?` | Maximum wait time in ms. Default: `5000`. |
| `stableFor?` | All expectations must hold continuously for this many ms before resolving. Default: `0`. |

> **How `expect` is overloaded:**
> - Arrays → standard Playwright matchers (e.g. `toHaveLength`)
> - Objects with at least one `StateFunction` property → `StateMatchers<T>` (only `toHaveState` + existence matchers + `not`)
> - Everything else (primitives, `Locator`, `Page`, etc.) → standard Playwright matchers
>
> This works for `PageFragment` subclasses AND plain objects — any object with `StateFunction` properties gets `toHaveState`.

---

## Step Reporting

Actions created via `this.Action(...)` in Playwright POM classes are automatically wrapped in `test.step(...)`. Step names include the class name, property name, and argument values — visible in Playwright's HTML report and trace viewer.

### Step name format

Step names follow: `{ClassName.propertyName}(param1: value1, param2: value2)`.

- Parameter names are extracted from the function signature.
- Values are formatted inline: strings as `"value"`, numbers/booleans as-is, objects as JSON.
- When there are no arguments: `{ClassName.propertyName}()`.

| Action definition | Call | Step produced |
|---|---|---|
| `open = this.Action(async () => { ... })` | `todoPage.open()` | `TodoPage.open()` |
| `addTodo = this.Action(async (text: string) => { ... })` | `todoPage.addTodo('Buy milk')` | `TodoPage.addTodo(text: "Buy milk")` |

Use `.named('custom name')` to override the auto-generated name:

```typescript
addItem = this.Action(async (text: string) => {
  // ...
}).named('add');
// step: 'add(text: "Buy milk")'
```

---

## See Also

- Framework-agnostic primitives (`State`, `Action`, `Collection`, `waitFor`): [`src/primitives/README.md`](../primitives/README.md)
- Universal POM base classes and adapter pattern: [`src/pom-universal/README.md`](../pom-universal/README.md)
