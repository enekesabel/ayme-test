# @ayde/test/playwright

Playwright-compatible entrypoint with state-driven testing extensions.

## What This Module Is

`@ayde/test/playwright` re-exports Playwright's API and overrides `test` and `expect` with an extended `expect(...).toHaveState(...)` matcher.

You still use the Playwright runner/config as usual.

## Imports And Compatibility

```typescript
import { test, expect, defineConfig, devices } from '@ayde/test/playwright';
```

This module is intended as a drop-in replacement for `@playwright/test` imports.

Compatibility note: `@ayde/test/playwright/reporter` is exported only for import-path parity.

## Exports

From this module you get:

- Playwright exports (`test`, `expect`, `defineConfig`, `devices`, etc.)
- Extended `expect` with `toHaveState`
- POM classes: `PageObject`, `PageComponent`, `PageFragment`
- POM type: `ActionFunction`
- `ToHaveStateExpectations`, `ToHaveStateOptions`, `PageFragmentMatchers`

## `toHaveState`

`toHaveState` polls state functions on a `PageFragment` until all expectations pass at the same time.

```typescript
await expect(todoPage).toHaveState({
  itemCount: 3,
  completedCount: (n: number) => n >= 1,
});
```

Behavior:

- Keys map to state functions on the fragment
- All expectations must be true at the same time
- Supports exact value or predicate expectations

## Matcher Options

```typescript
await expect(todoPage).toHaveState(
  { isReady: true },
  { timeout: 10000, stableFor: 250 }
);
```

- `timeout`: maximum wait time
- `stableFor`: duration (ms) expectations must remain true before passing

## Effects: Completion First

Effects are not a replacement for test assertions.

Use effects to define when an action is complete and safe for the next step.
Optionally, use them for invariants you deliberately want enforced in every call site of that action.

Keep scenario-specific expectations in tests with `expect(...).toHaveState(...)` or regular Playwright assertions.

## POM Usage In The Same Module

POM classes are imported from the same path as `test` and `expect`.
They are generated from the Playwright `PageFragment` via `createPomAdapter(...)` in `pom-universal`, so adapter-specific `PageObject`/`PageComponent` boilerplate stays minimal.

```typescript
import { PageObject, PageComponent } from '@ayde/test/playwright';

class TodoItem extends PageComponent {
  protected readonly checkbox = this.rootLocator.locator('.toggle');

  isCompleted = this.State(() =>
    this.rootLocator.evaluate(node => node.classList.contains('completed'))
  );

  toggle = this.Action(
    () => this.checkbox.click(),
    this.Effect(this.isCompleted, (cur, prev) => cur === !prev)
  );
}

class TodoPage extends PageObject {
  private todoItems = this.page.locator('.todo-list li');
  items = this.Collection(TodoItem, this.todoItems);
  itemCount = this.State(() => this.items.count());
}
```

## End-To-End Example

```typescript
import { test, expect, PageObject } from '@ayde/test/playwright';

class TodoPage extends PageObject {
  private newTodoInput = this.page.locator('.new-todo');
  private todoItems = this.page.locator('.todo-list li');
  itemCount = this.State(() => this.todoItems.count());

  goto = this.Action(() => this.page.goto('https://demo.playwright.dev/todomvc/#/'));

  addTodo = this.Action(
    async (text: string) => {
      await this.newTodoInput.fill(text);
      await this.newTodoInput.press('Enter');
    },
    this.Effect(this.itemCount, (cur, prev) => cur === prev + 1)
  );
}

test('adds a todo', async ({ page }) => {
  const todoPage = new TodoPage(page);
  await todoPage.goto();
  await todoPage.addTodo('Read docs');
  await expect(todoPage).toHaveState({ itemCount: 1 });
});
```

## Troubleshooting

- `State "..." is not a valid state function`: the key in `toHaveState` is not a state property on that fragment.
- Action throws `ActionEffectError`: action executed, but the declared effect did not become true before timeout.
