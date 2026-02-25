# @ayde/test/playwright 🎭

Playwright-compatible entrypoint with state-driven testing extensions.

## What This Module Is

`@ayde/test/playwright` is a drop-in replacement for `@playwright/test` imports. It re-exports all of Playwright's API and overrides `test` and `expect` with extended versions that add `toHaveState` and typed POM support.

It also exports typed POM classes (`PageObject`, `PageComponent`) and the `@Action` decorator for step reporting.

---

## Exports

**Values**

- `test` — Playwright test (re-export)
- `expect` — extended expect with `toHaveState` for `PageFragment` instances
- `Action` — decorator for POM methods
- `PageObject`, `PageComponent`, `PageFragment` — Playwright POM classes
- All other Playwright exports (`defineConfig`, `devices`, etc.)

**Types**

- `ToHaveStateExpectations<T>`
- `ToHaveStateOptions`
- `StateMatchers<T>`

---

## `@Action` Decorator

Wraps async POM methods in `test.step(...)` for readable HTML reports and trace viewer output.

**Two overloads:**

```typescript
// Auto-generates step name from class and method name
@Action

// Overrides the action name used in the step
@Action('custom step name')
```

**Step name format**

Step names always follow: `{actionName}(param1: value1, param2: value2)`.

- Parameter names are extracted from the method signature at decoration time.
- Values are formatted inline: strings as `"value"`, numbers/booleans as-is, objects as JSON.
- When there are no arguments: `{actionName}()`.

| | Step produced |
|---|---|
| `@Action` on `TodoPage.goto()` | `TodoPage.goto()` |
| `@Action` on `TodoPage.addTodo('Buy milk')` | `TodoPage.addTodo(text: "Buy milk")` |
| `@Action('add')` on `addTodo('Buy milk')` | `add(text: "Buy milk")` |

**Parameters** (when using the string form)

| | |
|---|---|
| `stepName` | Replaces the auto-generated `ClassName.methodName` prefix. Argument formatting still applies. |

**Example**

```typescript
import { Action, PageObject } from '@ayde/test/playwright';

class TodoPage extends PageObject {
  @Action                            // step: 'TodoPage.goto()'
  async goto() {
    await this.page.goto('https://demo.playwright.dev/todomvc/#/');
  }

  @Action                            // step: 'TodoPage.addTodo(text: "Buy milk")'
  async addTodo(text: string) {
    await this.page.locator('.new-todo').fill(text);
    await this.page.locator('.new-todo').press('Enter');
  }

  @Action('add item')                // step: 'add item(text: "Buy milk")'
  async addItem(text: string) { /* ... */ }
}
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
class PageObject extends PageFragment<Page, Locator> {
  constructor(page: Page)
  get page(): Page   // the Playwright Page
}
```

### `PageComponent`

Base class for locator-rooted components. Takes only a `Locator` — `page` is derived automatically from `root.page()`.

```typescript
class PageComponent extends PageFragment<Page, Locator> {
  constructor(root: Locator)
  readonly root: Locator   // the root locator
  get page(): Page         // derived from root.page()
}
```

### `PageFragment`

Playwright-specific base class shared by both `PageObject` and `PageComponent`. Inherits all factories from the universal layer:

| | |
|---|---|
| `this.State(fn)` | Creates an auto-named `StateFunction<R>`. Name is `'ClassName.property'`. |
| `this.Collection(ComponentClass, locator)` | Creates a `Collection<T>` from a component class and Playwright locator. |
| `this.Collection(resolver)` | Creates a `Collection<T>` from any async resolver. |
| `this.waitFor(...)` | Same as `waitFor(...)` from `@ayde/test/primitives`. |

---

## End-To-End Example

```typescript
import { test, expect, Action, PageObject, PageComponent } from '@ayde/test/playwright';

class TodoItem extends PageComponent {
  protected readonly checkbox = this.root.locator('.toggle');

  isCompleted = this.State(async () =>
    (await this.root.getAttribute('class') ?? '').includes('completed')
  );

  @Action
  async toggle() {
    await this.checkbox.click();
  }
}

class TodoPage extends PageObject {
  private newTodoInput = this.page.locator('.new-todo');
  private todoItems = this.page.locator('.todo-list li');

  items = this.Collection(TodoItem, this.todoItems);
  itemCount = this.State(async () => this.todoItems.count());

  @Action
  async goto() {
    await this.page.goto('https://demo.playwright.dev/todomvc/#/');
  }

  @Action
  async addTodo(text: string) {
    await this.newTodoInput.fill(text);
    await this.newTodoInput.press('Enter');
  }
}

test('adds and completes a todo', async ({ page }) => {
  const todoPage = new TodoPage(page);

  await todoPage.goto();
  await todoPage.addTodo('Ship docs');

  const first = await todoPage.items.at(0);
  await expect(first).toBeDefined();
  await first.toggle();

  await expect(todoPage).toHaveState({ itemCount: 1 });
});
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `State "..." is not a valid state function` | The key in `toHaveState` is not a state property on that fragment. Check the property name. |
| No action step in report | Ensure the method is decorated with `@Action`. Only `async` methods are supported. |
| `@Action` throws `TypeError: @Action can only decorate methods` | Decorator applied to a non-method (e.g. a property). Only works on class methods. |

---

## See Also

- Framework-agnostic primitives (`State`, `Collection`, `waitFor`): [`src/primitives/README.md`](../primitives/README.md)
- Universal POM base classes and adapter pattern: [`src/pom-universal/README.md`](../pom-universal/README.md)
