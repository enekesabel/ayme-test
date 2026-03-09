# @qaide/test

State-driven, semantic web UI and E2E testing.

## Why

Most E2E tests become brittle because they assert through implementation details: DOM structure, CSS classes, selector shape, or driver-specific mechanics. A small UI refactor breaks many tests even when the behavior is unchanged.

`@qaide/test` offers a different model — define *what should be true* as named semantic queries (`State`), then assert those queries directly:

- **`State` + `waitFor`** — framework-agnostic semantic state queries and polling assertions. Define facts about the system (`itemCount`, `isReady`) and wait for them to become true.
- **`Action` + effects** — wrap operations with expected state changes. An action captures a before-snapshot, runs the operation, and polls until the declared effects are satisfied.
- **Semantic POM** — structure tests with typed page objects and components. Each POM class encapsulates its states (`this.State(...)`), actions (`this.Action(...)`), and collections (`this.Collection(...)`), keeping implementation details out of tests.
- **`toHaveState`** 🎭 *(Playwright only)* — retrying state assertions on any POM or plain stateful object.

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
import { test, expect, PageObject, PageComponent } from '@qaide/test/playwright';

class TodoItem extends PageComponent {
  checkbox = this.root.locator('.toggle');

  isCompleted = this.State(() => this.checkbox.isChecked());

  toggle = this.Action(async () => {
    await this.checkbox.click();
  }).effect(this.isCompleted, (cur, prev) => cur === !prev);
}

class TodoPage extends PageObject {
  newTodoInput = this.page.locator('.new-todo');

  items = this.Collection(TodoItem, this.page.locator('.todo-list li'));
  itemCount = this.State(() => this.items.count());

  goto = this.Action(async () => {
    await this.page.goto('https://demo.playwright.dev/todomvc/#/');
  });

  addTodo = this.Action(async (text: string) => {
    await this.newTodoInput.fill(text);
    await this.newTodoInput.press('Enter');
  }).effect(this.itemCount, (cur, prev) => cur === prev + 1);
}

test('adds and completes a todo', async ({ page }) => {
  const todoPage = new TodoPage(page);

  await todoPage.goto();
  await todoPage.addTodo('Ship docs');

  const first = await todoPage.items.at(0);
  await first!.toggle();

  await expect(todoPage).toHaveState({ itemCount: 1 });
});
```

For the full 🎭 Playwright API reference (`toHaveState` options, POM class details, step reporting): [`src/playwright/README.md`](src/playwright/README.md)

## Core Model

### `State` — semantic queries
*Framework-agnostic · [`@qaide/test/primitives`](src/primitives/README.md)*

`State` defines how to read a fact about the system. It's a named async function — call it directly, wait on it, or assert it.

Inside a POM class, `this.State(...)` auto-names states from the property key:

```typescript
itemCount = this.State(async () => this.todoItems.count());
// named 'TodoPage.itemCount' — shown in error messages

const n = await todoPage.itemCount();           // read
await todoPage.itemCount.waitFor(3);            // wait
await expect(todoPage).toHaveState({ itemCount: 3 }); // assert 🎭
```

`State` and `waitFor` are part of [`@qaide/test/primitives`](src/primitives/README.md) and work without Playwright. `toHaveState` 🎭 is Playwright-specific.

### `Action` — operations with expected effects
*Framework-agnostic · [`@qaide/test/primitives`](src/primitives/README.md)*

`Action` wraps an async operation and declares what state changes it expects. When called, it captures a before-snapshot, runs the operation, and polls until all effects are satisfied.

Inside a POM class, `this.Action(...)` auto-names actions from the property key. In Playwright POM classes, actions also appear as named steps in the HTML report and trace viewer.

```typescript
addTodo = this.Action(async (text: string) => {
  await this.newTodoInput.fill(text);
  await this.newTodoInput.press('Enter');
}).effect(this.itemCount, (cur, prev) => cur === prev + 1);
// named 'TodoPage.addTodo' — appears as a step in Playwright reports
// after running, waits for itemCount to increment by 1
```

Effects can be chained and come in several styles — absolute values, relative predicates (with before-snapshot), and deferred effects (when the expectation depends on the action's arguments):

```typescript
toggle = this.Action(async () => {
  await this.checkbox.click();
}).effect(this.isCompleted, (cur, prev) => cur === !prev);

markAsCompleted = this.Action(async () => {
  if (!(await this.isCompleted())) await this.checkbox.click();
}).effect(this.isCompleted, true);

edit = this.Action(async (newText: string) => {
  await this.label.dblclick();
  await this.editInput.fill(newText);
  await this.editInput.press('Enter');
}).effect((effect, newText) => effect(this.getText, newText));
```

Once effects are declared, `.options()` configures effect polling (timeout and stability):

```typescript
save = this.Action(async () => {
  await this.saveButton.click();
}).effect(this.isSaved, true)
  .options({ timeout: 10_000, stableFor: 200 });
```

Full API reference: [`src/primitives/README.md`](src/primitives/README.md)

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
  items = this.Collection(TodoItem, this.page.locator('.todo-list li'));
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

`State`, `States`, `Action`, `Collection`, and `waitFor` without any Playwright dependency. Use this when:

- building custom test harnesses with a different driver
- incrementally adopting state-driven assertions in existing tests
- using the state model outside of a browser context

→ [`src/primitives/README.md`](src/primitives/README.md)

### `@qaide/test/pom-universal` — POM adapter layer

The `PageFragment` base class that the Playwright package is built on. Use this when:

- building a POM adapter for a non-Playwright driver (Cypress, WebDriverIO, Appium, etc.)
- extending the POM model with driver-specific behavior

→ [`src/pom-universal/README.md`](src/pom-universal/README.md)

---

## Stability

Current package version is beta (`0.x`). APIs may evolve while the model is being refined.

## License

MIT
