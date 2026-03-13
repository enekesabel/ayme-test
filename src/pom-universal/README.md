# @qaide/test/pom-universal

Framework-neutral base for building typed Page Object Model adapters.

## Why Use This

> The POM abstraction without coupling to any test driver.

`@qaide/test/pom-universal` is the foundation that all POM adapters are built on. It gives you:

- The same **state-driven model** as `@qaide/test/playwright` — State, Action, Collection, Locators, waitFor — without depending on any specific driver
- **Auto-naming** — states and actions discover their property names from the class, so error messages and reports are meaningful without manual `.named()` calls
- **Effect wiring** — the full `.effect()` / `.and()` / `.options()` API, handled at the base class level
- **Locator overrides** via `WithLocators` — swap locators without subclassing
- **`createAdapter()`** — a factory that turns your customized fragment into `PageObject` and `PageComponent` abstract base classes, ready for end users to extend

`@qaide/test/playwright` is a concrete adapter built on this layer. Use `pom-universal` directly when you need the same POM model with a different driver.

---

## At a Glance

> The examples below use `myLocator(...)` as a placeholder for your adapter's locator factory. See [Building an Adapter](#building-an-adapter) for a real implementation (Playwright).

`createAdapter()` takes a framework-specific `PageFragment` subclass and returns `PageObject` and `PageComponent` base classes:

```typescript
import { createAdapter } from '@qaide/test/pom-universal';
import { MyFragment, myLocator, type MyLocator } from './my-adapter'; // see Building an Adapter

// createAdapter returns PageObject and PageComponent —
// both extend MyFragment, so subclasses inherit adapter-specific capabilities
const { PageObject, PageComponent } = createAdapter(MyFragment);

// PageObject — for top-level pages
class TodoPage extends PageObject {
  locators = this.Locators({
    newTodoInput: myLocator('.new-todo'),
    todoListItems: myLocator('.todo-list li'),
  });

  // Collection with a resolver — creates TodoItem components from locator matches
  items = this.Collection(async () => {
    const elements = await this.locators.todoListItems.all();
    return elements.map(el => new TodoItem(el));
  });

  // Auto-named 'TodoPage.itemCount' — used in error messages and reports
  itemCount = this.State(async () => this.locators.todoListItems.count());

  // Auto-named 'TodoPage.addItem' — effects verified after each call
  addItem = this.Action(async (text: string) => {
    await this.locators.newTodoInput.fill(text);
    await this.locators.newTodoInput.press('Enter');
  }).effect(this.itemCount, (cur, prev) => cur === prev + 1);
}

// PageComponent — for scoped fragments, receives a root locator
class TodoItem extends PageComponent {
  constructor(root: MyLocator) {
    super(root);
  }

  locators = this.Locators({
    label: this.root.find('label'),     // scoped to root
    toggle: this.root.find('.toggle'),   // scoped to root
  });

  // Auto-named 'TodoItem.text'
  text = this.State(async () => (await this.locators.label.textContent()) ?? '');
  // Auto-named 'TodoItem.isCompleted'
  isCompleted = this.State(async () => this.locators.toggle.isChecked());
}
```

The sections below explain each piece in detail.

---

## `PageFragment<L>`

Abstract base class for all page fragments. `L` is the locator type — Playwright's `Locator`, a DOM `Element`, or whatever your driver provides. All common POM capabilities live here. `PageObject` and `PageComponent` both extend this class.

| Factory | Returns | Description |
|---|---|---|
| [`this.Locators(bag)`](#thislocatorsbag) | `Record<string, L>` | Declares a locator bag. Returns the bag with `WithLocators` overrides applied. |
| [`this.State<R>(fn: () => Promise<R>)`](#thisstatefn) | `State<R>` | Named state query. Auto-named as `ClassName.propertyName`. |
| [`this.Action<Args, R>(fn: (...args: Args) => Promise<R>)`](#thisactionfn) | `Action<Args, R>` | Named action with `.effect()` support. Routes through `executeAction()`. |
| [`this.Collection<T>(resolver: () => Promise<T[]>)`](#thiscollectionresolver) | `Collection<T>` | Creates a collection from an async resolver. |
| `this.waitFor` | — | Same as `waitFor(...)` from [`@qaide/test/primitives`](../primitives/README.md). |
| [`WithLocators(overrides)`](#withlocatorsoverrides) | `this` | Returns a new instance with specific locators swapped out. |
| [`executeAction<Args, R>(action, args)`](#executeaction-hook) | `Promise<R>` | Hook for adapters — override to wrap action execution. |
| [`clone()`](#clone-hook) | `this` | Hook for adapters — override to enable `WithLocators` instance creation. |

### `this.Locators(bag)`

Declares the locator bag — the single connection point between page objects and the DOM. All locators go through this factory so that `WithLocators` overrides can be applied.

```typescript
import { myLocator } from './my-adapter';

class TodoPage extends PageObject {
  locators = this.Locators({
    newTodoInput: myLocator('.new-todo'),
    todoList: myLocator('.todo-list'),
  });
}
```

States and actions reference locators via `this.locators.*` — never raw selectors.

### `this.State(fn)`

Identical to `State()` from [`@qaide/test/primitives`](../primitives/README.md) but with automatic naming. The property key and class name are discovered at first use:

```typescript
class TodoPage extends PageObject {
  locators = this.Locators({ todoList: myLocator('.todo-list li') });

  // Automatically named 'TodoPage.itemCount'
  itemCount = this.State(async () => this.locators.todoList.count());
}
```

This name appears in `StateExpectationTimeoutError` messages, `ActionEffectError` messages, and Playwright step reports. No `.named()` needed — unless you want to override the auto-discovered name.

Supports `.waitFor()`, composition, and all other State features — see [primitives docs](../primitives/README.md).

### `this.Action(fn)`

Identical to `Action()` from [`@qaide/test/primitives`](../primitives/README.md) but with auto-naming and routing through `executeAction()`. Adapters override `executeAction()` to add step reporting, logging, etc.

```typescript
class TodoPage extends PageObject {
  locators = this.Locators({
    newTodoInput: myLocator('.new-todo'),
    todoListItems: myLocator('.todo-list li'),
  });

  itemCount = this.State(async () => this.locators.todoListItems.count());

  // Automatically named 'TodoPage.addItem'
  addItem = this.Action(async (text: string) => {
    await this.locators.newTodoInput.fill(text);
    await this.locators.newTodoInput.press('Enter');
  }).effect(this.itemCount, (cur, prev) => cur === prev + 1);
}
```

Supports `.effect()`, `.and()`, `.options()` — see [primitives docs](../primitives/README.md).

### `this.Collection(resolver)`

Same as `Collection.create()` from [`@qaide/test/primitives`](../primitives/README.md). Adapters can add shorthand overloads — the Playwright adapter adds `this.Collection(ComponentClass, locator)` which resolves via `Locator.all()`.

```typescript
class TodoPage extends PageObject {
  locators = this.Locators({ todoListItems: myLocator('.todo-list li') });

  items = this.Collection(async () => {
    const elements = await this.locators.todoListItems.all();
    return elements.map(el => new TodoItem(el));
  });
}
```

### `WithLocators(overrides)`

Returns a new instance with specific locators swapped out — without subclassing. Useful for testing the same component in different contexts (e.g. a modal vs inline form).

```typescript
const todoPage = new TodoPage(/* adapter args */);

// Same TodoPage, but with a custom input locator
const customPage = todoPage.WithLocators({
  newTodoInput: myLocator('#custom-input'),
});
```

---

## `PageObject`

Extends `PageFragment`. For top-level pages. No root locator — scopes to the entire page. Constructor signature depends on the adapter (e.g. Playwright's adapter takes a `Page`).

```typescript
class TodoPage extends PageObject {
  locators = this.Locators({
    newTodoInput: myLocator('.new-todo'),
    todoListItems: myLocator('.todo-list li'),
  });

  itemCount = this.State(async () => this.locators.todoListItems.count());
}
```

No additional API beyond what `PageFragment` provides.

---

## `PageComponent`

Extends `PageFragment`. For scoped UI fragments. Constructor receives a root locator available as `this.root`. `this.Locators()` auto-includes `root` in the returned bag. Child locators *can* be scoped to root, but don't have to be:

```typescript
class TodoItem extends PageComponent {
  constructor(root: MyLocator) {
    super(root);
  }

  locators = this.Locators({
    label: this.root.find('label'),              // scoped to root
    toggle: this.root.find('.toggle'),            // scoped to root
    optionsMenu: myLocator('.options-dropdown'),   // page-level overlay — not scoped to root
  });

  // this.locators.root is auto-included by PageComponent
  isVisible = this.State(async () => this.locators.root.isVisible());
  text = this.State(async () => (await this.locators.label.textContent()) ?? '');
  isCompleted = this.State(async () => this.locators.toggle.isChecked());
}
```

---

## Building an Adapter

`PageObject` and `PageComponent` are produced by `createAdapter()`. To create an adapter for a specific test driver:

1. **Extend `PageFragment<L>`** — set the locator type, override `executeAction()`, add driver-specific constructor args
2. **Call `createAdapter(Fragment)`** — returns `{ PageObject, PageComponent }` abstract base classes
3. **Export** `PageObject` and `PageComponent` for end users to extend

### `createAdapter(Fragment)`

Takes a customized `PageFragment` subclass and returns:

| Class | Description |
|---|---|
| `PageObject` | Top-level page. Constructor takes the fragment's args (minus the internal locator-overrides slot). |
| `PageComponent` | Scoped fragment. Constructor prepends a `root: L` parameter. `this.Locators()` auto-includes `root`. |

### `executeAction()` hook

The primary extension point for adapters. Override to add driver-specific behavior around action execution. The default implementation calls the action directly:

```typescript
protected executeAction<Args extends unknown[], R>(
  action: ActionFunction<Args, R>,
  args: Args,
): Promise<R> {
  return action(...args);
}
```

### `clone()` hook

Abstract method — adapters must implement this so `WithLocators` can create fresh instances with overridden locators. Typically reconstructs via the same constructor args:

```typescript
protected override clone(): this {
  const Ctor = this.constructor as new (arg: MyLocator) => this;
  if ('root' in this) {
    return new Ctor((this as { root: MyLocator }).root);
  }
  return new Ctor(/* your adapter's page/driver arg */);
}
```

### Example: Playwright Adapter

Here's how `@qaide/test/playwright` is built:

```typescript
import { Page, Locator, test } from '@playwright/test';
import { PageFragment, createAdapter } from '@qaide/test/pom-universal';
import type { ActionFunction } from '@qaide/test/primitives';
import { Collection } from '@qaide/test/primitives';
import { formatActionCall } from './format';

type ComponentConstructor<T> = new (locator: Locator, page: Page) => T;

abstract class PlaywrightFragment extends PageFragment<Locator> {
  // Store the Playwright Page — all subclasses get this.page
  constructor(
    locatorOverrides: Record<string, Locator> | undefined,
    readonly page: Page,
  ) {
    super(locatorOverrides);
  }

  // WithLocators creates fresh instances — tell it how to clone
  protected override clone(): this {
    const Ctor = this.constructor as new (arg: Locator | Page) => this;
    if ('root' in this) {
      return new Ctor((this as { root: Locator }).root);
    }
    return new Ctor(this.page);
  }

  // Wrap every action in test.step() for Playwright report visibility
  protected override executeAction<Args extends unknown[], R>(
    action: ActionFunction<Args, R>,
    args: Args,
  ): Promise<R> {
    const { name, params } = action.meta();
    const stepName = formatActionCall(name ?? '<unknown>', params, args);
    return test.step(stepName, () => action(...args));
  }

  // Resolve a Playwright locator into component instances
  private async resolveAll<T>(
    Cls: ComponentConstructor<T>,
    locator: Locator,
  ): Promise<T[]> {
    return (await locator.all()).map(l => new Cls(l, this.page));
  }

  // Add a Collection(ComponentClass, locator) shorthand
  // alongside the standard Collection(resolver) form
  protected override Collection<T>(resolver: () => Promise<T[]>): Collection<T>;
  protected override Collection<T>(
    ComponentClass: ComponentConstructor<T>,
    locator: Locator,
  ): Collection<T>;
  protected override Collection<T>(
    first: (() => Promise<T[]>) | ComponentConstructor<T>,
    locator?: Locator,
  ): Collection<T> {
    if (locator === undefined) {
      return super.Collection(first as () => Promise<T[]>);
    }
    return super.Collection(() =>
      this.resolveAll(first as ComponentConstructor<T>, locator),
    );
  }
}

// createAdapter produces the base classes
const {
  PageObject: BasePageObject,
  PageComponent: BasePageComponent,
} = createAdapter(PlaywrightFragment);

// Validate that the constructor receives a real Playwright Page
abstract class PageObject extends BasePageObject {
  constructor(page: Page) {
    if (typeof (page as any).goto !== 'function') {
      throw new Error('PageObject constructor requires a Playwright Page');
    }
    super(page);
  }
}

// Extract page from the root locator automatically —
// components only need `new TodoItem(locator)`, not `new TodoItem(locator, page)`
abstract class PageComponent extends BasePageComponent {
  constructor(root: Locator) {
    super(root, root.page());
  }
}

export { PlaywrightFragment as PageFragment, PageObject, PageComponent };
```

End users see `PageObject` and `PageComponent` — they never interact with `PageFragment` or `createAdapter` directly.

---

## See Also

- 🎭 Playwright adapter built on this layer: [`src/playwright/README.md`](../playwright/README.md)
- Framework-agnostic primitives (`State`, `Action`, `Collection`, `waitFor`): [`src/primitives/README.md`](../primitives/README.md)
