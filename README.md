# @ayde/test

State-driven testing for Playwright. `@ayde/test` keeps Playwright's runner and assertions, and adds semantic state queries, action effect verification, and a typed POM layer.

## Motivation

Most E2E tests become brittle because they assert behavior through implementation details:
DOM structure, CSS classes, selector shape, or driver-specific mechanics.

`@ayde/test` aims to make tests express user intent and verify user-observable outcomes.

The model is:

- define semantic `State`s (`isCompleted`, `itemCount`, `isEditing`)
- execute behavior with `Action`s
- use `Effect`s to signal action completion (and optionally enforce always-on invariants)
- assert states (`toHaveState` / `waitFor`) instead of low-level probing in every test

Implementation details still exist, but they are localized in one place (state/component definitions), so test intent stays stable across UI refactors and driver changes.

## Package Map

| Import | Use it for |
|---|---|
| `@ayde/test/playwright` | Playwright wrapper: `test`, `expect`, `toHaveState`, and Playwright POM classes |
| `@ayde/test/primitives` | Framework-agnostic core: `State`, `Action`, `Effect`, `Collection`, `waitFor` |
| `@ayde/test/pom-universal` | Framework-neutral POM base classes for building adapters |

## Install

```bash
npm install @playwright/test @ayde/test
# or
pnpm add @playwright/test @ayde/test
# or
yarn add @playwright/test @ayde/test
```

Run tests with the standard Playwright runner:

```bash
npx playwright test
```

## Quick Start

```typescript
import { test, expect, PageObject, PageComponent } from '@ayde/test/playwright';

class TodoItem extends PageComponent {
  private checkbox = this.rootLocator.locator('.toggle');

  isCompleted = this.State(() =>
    this.rootLocator.evaluate(node => node.classList.contains('completed'))
  );

  toggle = this.Action(
    () => this.checkbox.click(),
    this.Effect(this.isCompleted, (cur, prev) => cur === !prev)
  );
}

class TodoPage extends PageObject {
  private newTodoInput = this.page.locator('.new-todo');
  private todoItems = this.page.locator('.todo-list li');
  items = this.Collection(TodoItem, this.todoItems);

  itemCount = this.State(() => this.items.count());
  completedCount = this.State(() => this.items.filter({ isCompleted: true }).count());

  goto = this.Action(() => this.page.goto('https://demo.playwright.dev/todomvc/#/'));

  addTodo = this.Action(
    async (text: string) => {
      await this.newTodoInput.fill(text);
      await this.newTodoInput.press('Enter');
    },
    this.Effect(this.itemCount, (cur, prev) => cur === prev + 1)
  );
}

test('adds and completes a todo', async ({ page }) => {
  const todoPage = new TodoPage(page);

  await todoPage.goto();
  await todoPage.addTodo('Ship docs');

  const first = await todoPage.items.at(0);
  await expect(first).toBeDefined();
  await first!.toggle();

  await expect(todoPage).toHaveState({
    itemCount: 1,
    completedCount: 1,
  });
});
```

## How The Pieces Fit

1. `State` defines a live, semantic query.
2. `Action` performs behavior.
3. `Effect` defines when an action is complete and safe for the next step.
4. `expect(...).toHaveState(...)` asserts state externally with polling.

Use effects for completion contracts and deliberate invariants. Keep scenario-specific outcomes in test assertions.

## Which Module Should I Use?

| If you want to... | Use |
|---|---|
| Keep Playwright ergonomics and add state-driven assertions | `@ayde/test/playwright` |
| Use the core model outside Playwright | `@ayde/test/primitives` |
| Build a custom adapter for another driver/locator system | `@ayde/test/pom-universal` |

## Documentation Index

- Playwright wrapper and POM usage: [`src/playwright/README.md`](src/playwright/README.md)
- Framework-agnostic primitives: [`src/primitives/README.md`](src/primitives/README.md)
- Universal POM base classes: [`src/pom-universal/README.md`](src/pom-universal/README.md)

## Stability

Current package version is beta (`0.x`). APIs may evolve while the model is being refined.

## License

MIT
