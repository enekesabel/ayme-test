# @qaide/test/pom-universal

Framework-neutral base class for building typed Page Object Model adapters.

## Why Use This

`@qaide/test/pom-universal` defines the POM abstraction without coupling to any specific test driver or locator system. It provides `PageFragment` — a base class that supplies `State`, `Collection`, and `waitFor` factories.

`@qaide/test/playwright` 🎭 is a concrete adapter built on top of this layer. Use `pom-universal` directly when you want the same POM model with a different driver.

---

## Exports

**Values**

- `PageFragment`

---

## `PageFragment`

Abstract base class for all page fragments. Provides factories for state queries, collections, and polling.

```typescript
abstract class PageFragment {
  protected State<R>(fn: () => Promise<R>): StateFunction<R>
  protected Collection<T>(resolver: () => Promise<T[]>): Collection<T>
  protected waitFor: typeof waitFor
}
```

**Protected factories** — available in all subclasses:

| | |
|---|---|
| `this.State(fn)` | Creates a `StateFunction<R>`. Auto-discovers its property name (`ClassName.propertyName`) for error messages. |
| `this.Collection(resolver)` | Creates a `Collection<T>` from any async resolver function. |
| `this.waitFor` | Same as `waitFor(...)` from `@qaide/test/primitives`. |

> `this.State(fn)` auto-names states using the property key: a state assigned to `this.itemCount` in class `TodoPage` is automatically named `'TodoPage.itemCount'`.

---

## Minimal Adapter Example

```typescript
import { PageFragment } from '@qaide/test/pom-universal';

type MyDriver = { /* your driver API */ };
type MyLocator = { /* your locator API */ };

abstract class MyPageFragment extends PageFragment {
  constructor(readonly driver: MyDriver) {
    super();
  }
}

class MyPageObject extends MyPageFragment {
  itemCount = this.State(async () => this.driver.getCount());
}

class MyPageComponent extends MyPageFragment {
  constructor(readonly root: MyLocator, driver: MyDriver) {
    super(driver);
  }

  getText = this.State(async () => this.root.textContent());
}
```

---

## `this.Collection(resolver)`

Creates a `Collection<T>` from an async resolver function. Returns `Collection<T>` from `@qaide/test/primitives`.

```typescript
import { State } from '@qaide/test/primitives';

items = this.Collection(async () => {
  const locators = await this.driver.findAll('.todo-list li');
  return locators.map(el => ({
    getText: State(async () => el.text()),
    isCompleted: State(async () => el.hasClass('completed')),
  }));
});
```

Adapters can add their own shorthand overloads on top. For example, the Playwright adapter adds `this.Collection(ComponentClass, locator)` which resolves via `Locator.all()`.

---

## API Reference

| Export | Description |
|---|---|
| `PageFragment` | Abstract base class with `State`, `Collection`, and `waitFor` factories |

---

## See Also

- 🎭 Playwright adapter built on this layer: [`src/playwright/README.md`](../playwright/README.md)
- Framework-agnostic primitives (`State`, `Collection`, `waitFor`): [`src/primitives/README.md`](../primitives/README.md)
