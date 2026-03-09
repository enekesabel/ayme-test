# @qaide/test/playwright 🎭

Playwright-compatible entrypoint with state-driven testing extensions.

## What This Module Is

`@qaide/test/playwright` is a drop-in replacement for `@playwright/test` imports. It re-exports all of Playwright's API and overrides `test` and `expect` with extended versions that add `toHaveState` and typed POM support.

It also exports typed POM classes (`PageObject`, `PageComponent`) with built-in `this.State(...)`, `this.Action(...)`, and `this.Collection(...)` factories. Actions defined via `this.Action(...)` automatically appear as named steps in Playwright's HTML report and trace viewer.

---

## Exports

**Values**

- `test` — Playwright test (re-export)
- `expect` — extended expect with `toHaveState` for `PageFragment` instances
- `PageObject`, `PageComponent`, `PageFragment` — Playwright POM classes
- All other Playwright exports (`defineConfig`, `devices`, etc.)

**Types**

- `ToHaveStateExpectations<T>`
- `ToHaveStateOptions`
- `StateMatchers<T>`

---

## Step Reporting

Actions created via `this.Action(...)` in Playwright POM classes are automatically wrapped in `test.step(...)`. Step names include the class name, property name, and argument values — visible in Playwright's HTML report and trace viewer.

**Step name format**

Step names follow: `{ClassName.propertyName}(param1: value1, param2: value2)`.

- Parameter names are extracted from the function signature.
- Values are formatted inline: strings as `"value"`, numbers/booleans as-is, objects as JSON.
- When there are no arguments: `{ClassName.propertyName}()`.

| Action definition | Call | Step produced |
|---|---|---|
| `goto = this.Action(async () => { ... })` | `todoPage.goto()` | `TodoPage.goto()` |
| `addTodo = this.Action(async (text: string) => { ... })` | `todoPage.addTodo('Buy milk')` | `TodoPage.addTodo(text: "Buy milk")` |

Use `.named('custom name')` to override the auto-generated name:

```typescript
addItem = this.Action(async (text: string) => {
  // ...
}).named('add');
// step: 'add(text: "Buy milk")'
```

---

## `toHaveState`

Polls state functions on a `PageFragment` until all expectations pass simultaneously. Uses AND logic — all states must match at the same time.

```typescript
expect(fragment: PageFragment).toHaveState(
  expectations: ToHaveStateExpectations<T>,
  options?: ToHaveStateOptions
): Promise<void>
```

**`ToHaveStateExpectations<T>`**

An object where keys are state property names on `T`, and values are exact values or predicates:

| Value form | Matches when |
|---|---|
| `true` / `3` / `'hello'` | State returns that exact value |
| `(v) => boolean` | Predicate returns `true` |

**`ToHaveStateOptions`**

| | |
|---|---|
| `timeout?` | Maximum wait time in ms. Default: `5000`. |
| `stableFor?` | All expectations must hold continuously for this many ms before resolving. Default: `0`. |

**Example**

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
  { timeout: 10000, stableFor: 250 }
);
```

> **How `expect` is overloaded:**
> - Arrays → standard Playwright matchers (e.g. `toHaveLength`)
> - Objects with at least one `StateFunction` property → `StateMatchers<T>` (only `toHaveState` + existence matchers + `not`)
> - Everything else (primitives, `Locator`, `Page`, etc.) → standard Playwright matchers
>
> This works for `PageFragment` subclasses AND plain objects — any object with `StateFunction` properties gets `toHaveState`.

---

## POM Classes

### `PageObject`

Base class for full-page objects. Takes a `Page` as its constructor argument.

```typescript
class PageObject {
  constructor(page: Page)
  readonly page: Page
}
```

### `PageComponent`

Base class for locator-rooted components. Takes only a `Locator` — `page` is derived automatically from `root.page()`.

```typescript
class PageComponent {
  constructor(root: Locator)
  readonly root: Locator
  readonly page: Page   // derived from root.page()
}
```

### `PageFragment`

Playwright-specific base class shared by both `PageObject` and `PageComponent`. Extends the universal `PageFragment` with Playwright-specific collection resolution and automatic step reporting.

| | |
|---|---|
| `this.State(fn)` | Creates an auto-named `StateFunction<R>`. Name is `'ClassName.property'`. |
| `this.Action(fn)` | Creates an auto-named `ActionFunction`. Wraps calls in `test.step(...)`. Supports `.effect()` chaining. |
| `this.Collection(ComponentClass, locator)` | Creates a `Collection<T>` from a component class and Playwright locator. *(Playwright-specific shorthand)* |
| `this.Collection(resolver)` | Creates a `Collection<T>` from any async resolver. |
| `this.waitFor(...)` | Same as `waitFor(...)` from `@qaide/test/primitives`. |

---

## End-To-End Example

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

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `State "..." is not a valid state function` | The key in `toHaveState` is not a state property on that fragment. Check the property name. |
| No action step in report | Ensure the action is created with `this.Action(...)`. Plain methods and arrow functions don't produce steps. |

---

## See Also

- Framework-agnostic primitives (`State`, `Action`, `Collection`, `waitFor`): [`src/primitives/README.md`](../primitives/README.md)
- Universal POM base classes and adapter pattern: [`src/pom-universal/README.md`](../pom-universal/README.md)
