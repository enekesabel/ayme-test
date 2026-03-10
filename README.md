# @qaide/test

State-driven, semantic web UI and E2E testing.

## Why

Most E2E tests become brittle because they assert through implementation details: DOM structure, CSS classes, selector shape, or driver-specific mechanics. A small UI refactor breaks many tests even when the behavior is unchanged.

`@qaide/test` offers a different model — define *what should be true* as named semantic queries (`State`), then assert those queries directly:

- **`State` + `waitFor`** — framework-agnostic semantic state queries and polling assertions. Define facts about the system (`itemCount`, `isReady`) and wait for them to become true.
- **Semantic POM** — structure tests with typed page objects and components. Each POM class encapsulates its locators, states (`this.State(...)`), and collections (`this.Collection(...)`), keeping implementation details out of tests.
- **`@Action` + `toHaveState`** 🎭 *(Playwright only)* — `@Action` wraps methods in `test.step(...)` for readable reports; `toHaveState` provides retrying state assertions on any POM or plain stateful object.

Implementation details stay in one place. Tests express intent and stay resilient to UI changes.

## Install

```bash
npm install @qaide/test
```

If you're using the Playwright adapter ([`@qaide/test/playwright`](src/playwright/README.md)) 🎭, also install `@playwright/test`:

```bash
npm install @playwright/test @qaide/test
```

Run tests with the standard Playwright runner:

```bash
npx playwright test
```

## Quick Start

```typescript
import type { Locator } from '@playwright/test';
import { test, expect, Action, PageObject, PageComponent } from '@qaide/test/playwright';

class TodoItem extends PageComponent {
  locators = this.Locators({
    label: this.root.locator('label'),
    checkbox: this.root.locator('.toggle'),
  });

  // Semantic state query — encapsulates how to read "is this completed"
  isCompleted = this.State(async () =>
    (await this.locators.root.getAttribute('class') ?? '').includes('completed')
  );

  getText = this.State(() => this.locators.label.innerText());

  @Action
  async toggle() {
    await this.locators.checkbox.click();
  }
}

class TodoPage extends PageObject {
  locators = this.Locators({
    newTodoInput: this.page.locator('.new-todo'),
    todoItems: this.page.locator('.todo-list li'),
  });

  // Collection backed by a component class and a locator
  items = this.Collection(TodoItem, this.locators.todoItems);

  // State derived from the collection
  itemCount = this.State(async () => this.items.count());

  @Action
  async goto() {
    await this.page.goto('https://demo.playwright.dev/todomvc/#/');
  }

  @Action
  async addTodo(text: string) {
    await this.locators.newTodoInput.fill(text);
    await this.locators.newTodoInput.press('Enter');
  }
}

test('adds and completes a todo', async ({ page }) => {
  const todoPage = new TodoPage(page);

  await todoPage.goto();
  await todoPage.addTodo('Ship docs');

  const first = await todoPage.items.at(0);
  await expect(first).toBeDefined();
  await first!.toggle();

  // toHaveState polls until all expectations are met simultaneously
  await expect(todoPage).toHaveState({ itemCount: 1 });
});
```

For the full 🎭 Playwright API reference (all exports, `@Action` step names, `toHaveState` options, POM class details): [`src/playwright/README.md`](src/playwright/README.md)

## Core Model

### `State` — semantic queries
*Framework-agnostic · [`@qaide/test/primitives`](src/primitives/README.md)*

`State` defines how to read a fact about the system. It's a named async function — call it directly, wait on it, or assert it.

Inside a POM class, `this.State(...)` auto-names states from the property key:

```typescript
itemCount = this.State(async () => this.locators.todoItems.count());
// named 'TodoPage.itemCount' — shown in error messages

const n = await todoPage.itemCount();           // read
await todoPage.itemCount.waitFor(3);            // wait
await expect(todoPage).toHaveState({ itemCount: 3 }); // assert 🎭
```

`State` and `waitFor` are part of [`@qaide/test/primitives`](src/primitives/README.md) and work without Playwright. `toHaveState` 🎭 is Playwright-specific.

### Locators — typed locator management
*Universal POM · [`@qaide/test/pom-universal`](src/pom-universal/README.md)*

Use `this.Locators()` to declare a component's locators as a typed field. On `PageComponent`s, `root` is automatically included. Components that only use `root` can skip the field entirely. Types are **auto-inferred** — no generics needed.

```typescript
class SearchPage extends PageObject {
  locators = this.Locators({
    searchInput: this.page.locator('#search'),
    resultList: this.page.locator('.results'),
  });

  // Type-safe: only keys from this.Locators() are valid
  resultCount = this.State(() => this.locators.resultList.count());
}
```

For `PageComponent`s, `root` is automatically included in `locators`:

```typescript
class Checkbox extends PageComponent {
  isChecked = this.State(() => this.locators.root.isChecked());
}
```

### `@Action` — step reporting 🎭
*Playwright only · [`@qaide/test/playwright`](src/playwright/README.md)*

`@Action` wraps async POM methods in `test.step(...)`. Step names include the class name, method name, and argument values — visible in Playwright's HTML report and trace viewer.

```typescript
@Action
async addTodo(text: string) { ... }
// produces step: 'TodoPage.addTodo(text: "Ship docs")'
```

Use `@Action('custom name')` to override the auto-generated name.

### `toHaveState` — polling assertions 🎭
*Playwright only · [`@qaide/test/playwright`](src/playwright/README.md)*

`toHaveState` polls state functions until all expectations pass simultaneously. Supports exact values, predicates, and a `stableFor` option for flickery transitions.

It works with any object that has `StateFunction` properties — POM classes or plain objects:

```typescript
// On a POM class
await expect(todoPage).toHaveState({
  itemCount: 3,
  completedCount: (n: number) => n >= 1,
}, { timeout: 10000, stableFor: 200 });

// On a plain object — using States() to bulk-create named state functions
import { States } from '@qaide/test/primitives';

const counters = States({
  total: async () => getTotalCount(),
  active: async () => getActiveCount(),
});
await expect(counters).toHaveState({ total: 5, active: 3 });
```

### `Collection` — typed item sets
*Framework-agnostic · [`@qaide/test/primitives`](src/primitives/README.md) · with POM shorthand in [`@qaide/test/playwright`](src/playwright/README.md)*

`Collection` wraps a set of component instances with state-based filtering and lookup.

Inside a POM class, use `this.Collection(...)` to declare collections as properties:

```typescript
class TodoPage extends PageObject {
  locators = this.Locators({
    todoItems: this.page.locator('.todo-list li'),
  });

  // Component shorthand: resolves each locator into a TodoItem instance
  items = this.Collection(TodoItem, this.locators.todoItems);
}
```

The collection can then be queried:

```typescript
const first = await items.at(0);
const completed = await items.filter({ isCompleted: true }).all();
const found = await items.find({ getText: 'Ship docs' });
```

For advanced cases, `filter(...)` and `find(...)` also accept an item predicate:

```typescript
const urgentOrCompleted = await items
  .filter(async item =>
    (await item.isCompleted()) || (await item.getText()).includes('urgent')
  )
  .all();

const inconsistentRow = await rows.find(async row =>
  (await row.getDoneCount()) > (await row.getTotalCount())
);
```

Use state expectations when possible; predicates are the escape hatch for `OR` conditions, cross-state relations, or other custom item logic.

It also supports async iteration:

```typescript
for await (const item of items) {
  console.log(await item.getText());
}

for await (const item of items.filter({ isCompleted: true })) {
  console.log(await item.getText());
}
```

Each `for await...of` run resolves a fresh snapshot of the current matching items. It is not a live stream, and it does not cache across separate iteration runs.

Outside POM classes, use `Collection.create(...)` from `@qaide/test/primitives` directly.

---

## Other Packages

### `@qaide/test/primitives` — framework-agnostic core

`State`, `States`, `Collection`, and `waitFor` without any Playwright dependency. Use this when:

- building custom test harnesses with a different driver
- incrementally adopting state-driven assertions in existing tests
- using the state model outside of a browser context

→ [`src/primitives/README.md`](src/primitives/README.md)

### `@qaide/test/pom-universal` — POM adapter layer

The `PageFragment` base class and `createAdapter` factory that the Playwright package is built on. Use this when:

- building a POM adapter for a non-Playwright driver (Cypress, WebDriverIO, Appium, etc.)
- extending the POM model with driver-specific behavior

→ [`src/pom-universal/README.md`](src/pom-universal/README.md)

---

## Stability

Current package version is beta (`0.x`). APIs may evolve while the model is being refined.

## License

MIT
