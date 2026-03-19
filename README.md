# @ayme-dev/test

**State-driven, semantic testing for Playwright.**

`@ayme-dev/test` is a drop-in companion for `@playwright/test` that adds semantic state queries, self-verifying actions, and typed page objects.

It uses the same runner, config, and reports as Playwright. You just import from `@ayme-dev/test/playwright` instead of `@playwright/test`.

**What's inside:**

- **[`@ayme-dev/test/primitives`](src/primitives/README.md)**:`State`, `Action`, `Collection`, `waitFor` —  framework-agnostic, stateful testing primitives — works without classes
- **[`@ayme-dev/test/pom-universal`](src/pom-universal/README.md)**: universal Page Object Model, built on top of the primitives — driver-neutral, bring your own framework
- **[`@ayme-dev/test/playwright`](src/playwright/README.md)**: Playwright-specific POM implementation, improved Action reporting, `toHaveState` assertion — built on top of the universal POM

## Why

Playwright provides strong low-level primitives, but it does not define how to structure tests as a codebase grows.

In practice:

- Tests **break when the UI changes**, even though behavior didn't
- Selectors and assertion logic are **scattered** across every test file
- Page objects are just **bags of locators** with no semantic meaning
- Synchronization relies on **manual waits and timeouts**
- There's **no clear boundary** between *what* the test checks and *how*

This is the problem the library is trying to address.

**@ayme-dev/test gives you that missing layer:**

- Implementation details live in **one place** — tests express pure intent
- Actions **know when they're done** — no manual waits, no flaky timeouts
- **Named semantic states** replace brittle assertions
- **Typed page objects** with built-in collections and filtering
- **Built-in de-flickering** — `stableFor` ensures states hold before assertions pass, eliminating flaky transitions
- **Automatic step reporting** in Playwright's HTML report and trace viewer

## Example

Here's a typical Playwright test for TodoMVC:

```typescript
test('add todos and complete one', async ({ page }) => {
  await page.goto('https://demo.playwright.dev/todomvc/#/');

  // Same fill+press sequence repeated for each item
  await page.locator('.new-todo').fill('Buy milk');
  await page.locator('.new-todo').press('Enter');
  await page.waitForTimeout(300); // arbitrary wait to avoid input race condition
  await page.locator('.new-todo').fill('Ship docs');
  await page.locator('.new-todo').press('Enter');

  await page.locator('.todo-list li').first().locator('.toggle').click();

  // We want to verify: "2 items with the right text, first one completed"
  // But we're asserting implementation details, not meaningful user-perceived state
  await expect(page.locator('.todo-list li')).toHaveCount(2);                        // DOM element count
  await expect(page.locator('.todo-list li').nth(0).locator('label')).toHaveText('Buy milk');  // label text
  await expect(page.locator('.todo-list li').nth(1).locator('label')).toHaveText('Ship docs'); // label text
  await expect(page.locator('.todo-list li').first()).toHaveClass(/completed/);       // CSS class
  await expect(page.locator('.todo-count')).toHaveText('1 item left');               // counter element text
});
```

It works, but every assertion is coupled to *how* the UI represents state, not *what* the user perceives. Rename a class? Restructure the markup? The test breaks.

Here's the same test with `@ayme-dev/test`:

```typescript
import { test, expect } from '@ayme-dev/test/playwright';

test('add todos and complete one', async ({ page }) => {
  const todoPage = new TodoPage(page);     // typed page object, not a locator bag

  await todoPage.open();
  await todoPage.addTodo('Buy milk');       // step: TodoPage.addTodo(text: "Buy milk")
  await todoPage.addTodo('Ship docs');      // no arbitrary waits — action post-conditions are automatically ensured

  const first = await todoPage.items.at(0); // typed collection access
  const second = await todoPage.items.at(1);
  await expect(first).toHaveState({ text: 'Buy milk' });
  await expect(second).toHaveState({ text: 'Ship docs' });

  await first.toggle();                     // step: TodoItem.toggle()

  // Semantic state — what the user sees, not how the DOM represents it
  await expect(first).toHaveState({ text: 'Buy milk', isCompleted: true });
  await expect(todoPage).toHaveState({ itemCount: 2, completedCount: 1 });
});
```

No selectors in the test. No CSS classes. No DOM structure assumptions. The test expresses what the user perceives, not how the page is built.

Here's the `TodoPage` that makes it possible:

```typescript
import { PageObject, PageComponent } from '@ayme-dev/test/playwright';

class TodoItem extends PageComponent {
  locators = this.Locators({
    label: this.root.locator('label'),
    checkbox: this.root.locator('.toggle'),
  });

  text = this.State(() => this.locators.label.innerText());
  isCompleted = this.State(() => this.locators.checkbox.isChecked());

  // Action — logged as step: TodoItem.toggle()
  toggle = this.Action(async () => {
    await this.locators.checkbox.click();
  });
}

class TodoPage extends PageObject {
  locators = this.Locators({
    newTodoInput: this.page.locator('.new-todo'),
    todoListItems: this.page.locator('.todo-list li'),
  });

  // Not everything needs to be exposed to tests
  private inputIsEmpty = this.State(async () =>
    (await this.locators.newTodoInput.inputValue()) === ''
  );

  items = this.Collection(TodoItem, this.locators.todoListItems);
  itemCount = this.State(() => this.items.count());
  completedCount = this.State(() => this.items.filter({ isCompleted: true }).count());
  activeCount = this.State(() => this.items.filter({ isCompleted: false }).count());

  // Regular method — Action wrapper is optional
  async open() {
    await this.page.goto('https://demo.playwright.dev/todomvc/#/');
  }

  // Action — logged as step: TodoPage.addTodo(text: "Buy milk")
  // Effect waits for the input to clear before returning —
  // prevents race conditions when adding multiple todos in sequence
  addTodo = this.Action(async (text: string) => {
    await this.locators.newTodoInput.fill(text);
    await this.locators.newTodoInput.press('Enter');
  }).effect(this.inputIsEmpty, true);
}
```

All the selectors and mechanics live in the page object. If the DOM changes, you update one place. The tests don't move.

## Install

```bash
npm install @ayme-dev/test @playwright/test
```

`@ayme-dev/test/playwright` re-exports everything from `@playwright/test`, so you can replace your imports without changing anything else. Works with your existing `playwright.config.ts` — no extra configuration needed.

```typescript
// Before
import { test, expect } from '@playwright/test';

// After — same API, plus toHaveState and typed POMs
import { test, expect } from '@ayme-dev/test/playwright';
```

Run tests with the standard Playwright runner:

```bash
npx playwright test
```

## Core Concepts

> The examples below use `@ayme-dev/test/playwright` — the typed POM layer built on top of Playwright.  
>
> For framework-agnostic primitives (`State`, `Action`, `Collection`, `waitFor`) without classes, see the [primitives docs](src/primitives/README.md).

### Locators — the bridge to the DOM

`this.Locators({...})` defines the **single connection point** between your page object and the actual DOM. Everything else — states, actions, collections — references these locators, never raw selectors.

When the DOM changes, you update locators in one place. States, actions, and tests don't move.

```typescript
class TodoPage extends PageObject {
  locators = this.Locators({
    newTodoInput: this.page.locator('.new-todo'),
    todoListItems: this.page.locator('.todo-list li'),
  });

  // Everything below references this.locators, not raw selectors
  items = this.Collection(TodoItem, this.locators.todoListItems);
  itemCount = this.State(() => this.items.count());
}
```

### State — semantic queries

A `State` defines how to read a fact about the system. It's a named async function that returns the current value of something you care about.

Instead of asserting on DOM attributes (`toHaveClass`, `toHaveAttribute`, `toBeVisible`), you define what "completed" or "item count" means once, and then assert on the *meaning*:

```typescript
class TodoItem extends PageComponent {
  locators = this.Locators({
    checkbox: this.root.locator('.toggle'),
  });

  // Define what "completed" means for this component
  isCompleted = this.State(() => this.locators.checkbox.isChecked());
}
```

Now your tests never mention checkboxes:

```typescript
await expect(item).toHaveState({ isCompleted: true });
```

If the implementation of "completed" changes (say, from a checkbox to a data attribute), you update the state definition. Tests stay the same.

States can be read directly, waited on, or asserted:

```typescript
const completed = await item.isCompleted();                   // read current value
await item.isCompleted.waitFor(true);                          // poll until true
await todoPage.itemCount.waitFor(n => n > 0);                 // poll with predicate
await expect(item).toHaveState({ isCompleted: true });         // assert with retry (Playwright)
```

Both `state.waitFor()` and `toHaveState` accept shared expectation options (`timeout`, `stableFor`) — see below.

### Action — operations with expected effects

An `Action` wraps an async operation. Optionally, it declares what state changes it expects — when called, it runs the operation and then polls until all declared effects are satisfied.

This eliminates manual synchronization. You don't need `waitForSelector`, `waitForTimeout`, or retry loops — the action *knows when it's done*:

```typescript
class TodoPage extends PageObject {
  // ...
  private inputIsEmpty = this.State(async () =>
    (await this.locators.newTodoInput.inputValue()) === ''
  );

  addTodo = this.Action(async (text: string) => {
    await this.locators.newTodoInput.fill(text);
    await this.locators.newTodoInput.press('Enter');
  }).effect(this.inputIsEmpty, true);
  // After running, waits for the input to clear before returning
}

// In your test — no waits needed between sequential calls
await todoPage.addTodo('Buy milk');
await todoPage.addTodo('Ship docs');
```

Actions also appear as named steps in Playwright's HTML report and trace viewer:

```
TodoPage.addTodo(text: "Buy milk")
TodoPage.addTodo(text: "Ship docs")
```

### Collection — typed item sets

A `Collection` wraps a set of component instances with state-based filtering and lookup. Instead of manually iterating `locator.all()` and wrapping each element, you declare the collection once:

```typescript
class TodoPage extends PageObject {
  locators = this.Locators({
    // ...
    todoListItems: this.page.locator('.todo-list li'),
  });

  items = this.Collection(TodoItem, this.locators.todoListItems);
  itemCount = this.State(() => this.items.count());
  completedCount = this.State(() => this.items.filter({ isCompleted: true }).count());
}
```

Then query it using semantic state:

```typescript
const first = await todoPage.items.at(0);
const completed = await todoPage.items.filter({ isCompleted: true }).all();
const found = await todoPage.items.find({ text: 'Ship docs' });
```

Collections support async iteration too:

```typescript
for await (const item of todoPage.items) {
  console.log(await item.text());
}
```

### Assertions & Polling

#### `toHaveState`

`toHaveState` is a Playwright-compatible assertion that polls state functions until all expectations pass simultaneously. It uses AND logic — all states must match at the same time:

```typescript
await expect(todoPage).toHaveState({
  itemCount: 3,
  completedCount: 1,
  activeCount: 2,
});
```

It supports exact values and predicates:

```typescript
await expect(todoPage).toHaveState({
  itemCount: (n: number) => n >= 1,
});
```

`toHaveState` works with `PageObject`, `PageComponent`, or any object with state function properties.

#### Expectation options — `timeout` and `stableFor`

All state expectations share the same options:

| Option | Description | Default |
|---|---|---|
| `timeout` | Maximum time to wait (ms) | `5000` |
| `stableFor` | State must hold continuously for this many ms before resolving | `0` |

These options are accepted by:
- `state.waitFor(expected, options)`
- `expect(target).toHaveState(expectations, options)`
- `waitFor(state, expected, options)` (standalone polling)
- `.effect(...).options(options)` (action effects)

**`stableFor` is your de-flickering tool.** Ever had a test flake because the UI briefly showed the expected value before settling? `stableFor` fixes that — the state must *hold* for the specified duration before the expectation resolves:

```typescript
// Must hold for 200ms before resolving
await todoPage.itemCount.waitFor(3, { stableFor: 200 });
await expect(todoPage).toHaveState({ isReady: true }, { stableFor: 250 });
```

## Deep Dive

Advanced patterns and concepts.

### Locators

- [`WithLocators`](src/pom-universal/README.md#withlocatorsoverrides) — swap locators at runtime without subclassing

### State

- [State composition](src/primitives/README.md#state-composition) — derive states from other states or child components
- [Abstracting DOM representations](src/primitives/README.md#abstracting-dom-representations) — collapse multiple DOM signals into one semantic boolean

### Action

- [Step reporting](src/playwright/README.md#step-reporting) — automatic named steps in Playwright reports
- [Effect styles](src/primitives/README.md#effect) — absolute, relative, deferred, and cross-state effects
- [When to use effects](src/primitives/README.md#when-to-use-effects) — UI completion vs application invariants

### Assertions & Polling

- [`waitFor`](src/primitives/README.md#waitforstate-expected-options) — standalone polling for single states, tuples, or multi-condition waits

### Collection

- [Filtering](src/primitives/README.md#filtering) — by state conditions or custom predicates, chainable

## Under the Hood

`@ayme-dev/test` is built in three layers, each usable independently:

```
@ayme-dev/test/primitives    → framework-agnostic core
@ayme-dev/test/pom-universal → driver-neutral POM base
@ayme-dev/test/playwright    → Playwright adapter
```

**`@ayme-dev/test/primitives`** — `State`, `Action`, `Collection`, and `waitFor` without any Playwright dependency. Use this when building custom test harnesses, incrementally adopting state-driven assertions in existing tests, or using the state model outside of a browser context. → [API reference](src/primitives/README.md)

**`@ayme-dev/test/pom-universal`** — the `PageFragment` base class that the Playwright adapter is built on. Use this when building a POM adapter for a non-Playwright driver (Cypress, WebDriverIO, Appium, etc.). → [API reference](src/pom-universal/README.md)

**`@ayme-dev/test/playwright`** — the main entrypoint for most users. Re-exports all of Playwright's API and adds `toHaveState`, typed POM classes (`PageObject`, `PageComponent`), and automatic step reporting. → [API reference](src/playwright/README.md)

## Stability

Current package version is beta (`0.x`). APIs may evolve while the model is being refined.

## License

MIT
