# @qaide/test/pom-universal

Framework-neutral base classes for building typed Page Object Model adapters.

## Why Use This

`@qaide/test/pom-universal` defines the POM abstraction without coupling to any specific test driver or locator system. It provides `PageFragment` — a base class that supplies `State`, `Collection`, and `waitFor` factories — and `createPomAdapter`, which generates `PageObject` and `PageComponent` classes for a given driver/locator system.

`@qaide/test/playwright` 🎭 is a concrete adapter built on top of this layer. Use `pom-universal` directly when you want the same POM model with a different driver.

---

## Exports

**Values**

- `PageFragment<Driver, Locator>`
- `createPomAdapter(Fragment)`

**Types**

- `ComponentConstructor<Driver, Locator, T>`
- `FragmentConstructor<Driver, Locator>`

---

## `PageFragment<Driver, Locator>`

Abstract base class for all page fragments. Parameterized by the driver and locator types of your framework.

```typescript
abstract class PageFragment<Driver, Locator> {
  constructor(protected readonly driver: Driver)
}
```

**Abstract method** — must be implemented by the adapter:

```typescript
protected abstract resolveAll<T>(
  ComponentClass: ComponentConstructor<Driver, Locator, T>,
  locator: Locator
): Promise<T[]>
```

Resolves a locator into an array of component instances. Called by `this.Collection(ComponentClass, locator)`.

**Protected factories** — available in all subclasses:

| | |
|---|---|
| `this.State(fn)` | Creates a `StateFunction<R>`. Auto-discovers its property name (`ClassName.propertyName`) for error messages. |
| `this.Collection(resolver)` | Creates a `Collection<T>` from any async resolver. |
| `this.Collection(ComponentClass, locator)` | Creates a `Collection<T>` from a component class and locator. Calls `resolveAll` internally. |
| `this.waitFor` | Same as `waitFor(...)` from `@qaide/test/primitives`. |

> `this.State(fn)` auto-names states using the property key: a state assigned to `this.itemCount` in class `TodoPage` is automatically named `'TodoPage.itemCount'`.

---

## `createPomAdapter`

Generates adapter-specific `PageObject` and `PageComponent` classes from a concrete fragment base class.

```typescript
function createPomAdapter<T extends PageFragment<Driver, Locator>>(
  Fragment: abstract new (driver: Driver) => T
): {
  PageObject: abstract new (driver: Driver) => T;
  PageComponent: abstract new (root: Locator, driver: Driver) => T & { readonly root: Locator };
}
```

**Parameters**

| | |
|---|---|
| `Fragment` | Your adapter-specific base class that extends `PageFragment` and implements `resolveAll`. |

**Returns**

| | |
|---|---|
| `PageObject` | Takes `(driver)`. Use for full-page objects. |
| `PageComponent` | Takes `(root, driver)`. Exposes `this.root` (the element locator). Use for locator-rooted components. |

---

## Minimal Adapter Example

```typescript
import { PageFragment, createPomAdapter } from '@qaide/test/pom-universal';

type Driver = MyDriver;
type Locator = MyLocator;

abstract class AdapterFragment extends PageFragment<Driver, Locator> {
  protected async resolveAll<T>(
    Ctor: new (locator: Locator, driver: Driver) => T,
    locator: Locator
  ): Promise<T[]> {
    const locators = await locator.all();           // driver-specific
    return locators.map(l => new Ctor(l, this.driver));
  }
}

const { PageObject, PageComponent } = createPomAdapter(AdapterFragment);

class MyPageObject extends PageObject {
  private items = this.page.locator('.list li');
  itemCount = this.State(async () => this.items.count());
}

class MyComponent extends PageComponent {
  getText = this.State(async () => this.root.textContent());
}
```

---

## `this.Collection(...)` Overloads

Two forms, both return `Collection<T>` from `@qaide/test/primitives`:

**Component shorthand** — resolves via `resolveAll`:

```typescript
items = this.Collection(MyItemComponent, someLocator);
```

**Generic resolver** — any async function returning items with state functions:

```typescript
import { State } from '@qaide/test/primitives';

items = this.Collection(async () => {
  const locators = await this.driver.findAll('.todo-list li'); // driver-specific
  return locators.map(el => ({
    getText: State(async () => el.text()),               // used by .find({ getText: '...' })
    isCompleted: State(async () => el.hasClass('completed')), // used by .filter({ isCompleted: true })
  }));
});
```

---

## API Reference

| Export | Description |
|---|---|
| `PageFragment<Driver, Locator>` | Abstract base class for adapter-specific fragments |
| `createPomAdapter(Fragment)` | Generate adapter `PageObject` and `PageComponent` classes |
| `ComponentConstructor<Driver, Locator, T>` | Constructor shape: `new (locator: Locator, driver: Driver) => T` |
| `FragmentConstructor<Driver, Locator>` | Constructor shape: `abstract new (driver: Driver) => PageFragment<Driver, Locator>` |

---

## See Also

- 🎭 Playwright adapter built on this layer: [`src/playwright/README.md`](../playwright/README.md)
- Framework-agnostic primitives (`State`, `Collection`, `waitFor`): [`src/primitives/README.md`](../primitives/README.md)
