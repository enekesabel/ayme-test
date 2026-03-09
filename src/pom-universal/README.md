# @qaide/test/pom-universal

Framework-neutral base class for building typed Page Object Model adapters.

## Why Use This

`@qaide/test/pom-universal` defines the POM abstraction without coupling to any specific test driver or locator system. It provides `PageFragment` — a base class that supplies `State`, `Action`, `Collection`, and `waitFor` factories.

`@qaide/test/playwright` 🎭 is a concrete adapter built on top of this layer. Use `pom-universal` directly when you want the same POM model with a different driver.

---

## Exports

**Values**

- `PageFragment`

**Types**

- `ActionFunction<Args, R>`
- `ActionWithEffects<Args, R>`

---

## `PageFragment`

Abstract base class for all page fragments. Provides factories for state queries, actions, collections, and polling.

```typescript
abstract class PageFragment {
  protected State<R>(fn: () => Promise<R>): StateFunction<R>
  protected Action<Args, R>(fn: (...args: Args) => Promise<R>): ActionFunction<Args, R>
  protected Collection<T>(resolver: () => Promise<T[]>): Collection<T>
  protected waitFor: typeof waitFor
}
```

**Protected factories** — available in all subclasses:

| | |
|---|---|
| `this.State(fn)` | Creates a `StateFunction<R>`. Auto-discovers its property name (`ClassName.propertyName`) for error messages. |
| `this.Action(fn)` | Creates an `ActionFunction`. Auto-discovers its property name. Supports `.effect()` chaining. Adapters can override `executeAction()` to add behavior (e.g. step reporting). |
| `this.Collection(resolver)` | Creates a `Collection<T>` from any async resolver function. |
| `this.waitFor` | Same as `waitFor(...)` from `@qaide/test/primitives`. |

> `this.State(fn)` and `this.Action(fn)` auto-name from the property key: a state assigned to `this.itemCount` in class `TodoPage` is automatically named `'TodoPage.itemCount'`.

---

## Minimal Adapter Example

```typescript
import { PageFragment } from '@qaide/test/pom-universal';

abstract class MyPageFragment extends PageFragment {
  // Override executeAction to add driver-specific behavior (e.g. step reporting)
  protected override executeAction<Args extends unknown[], R>(
    action: ActionFunction<Args, R>,
    args: Args,
  ): Promise<R> {
    console.log(`Running action: ${action.meta().name}`);
    return action(...args);
  }
}

class MyPageObject extends MyPageFragment {
  itemCount = this.State(async () => getCount());

  addItem = this.Action(async (text: string) => {
    await insert(text);
  }).effect(this.itemCount, (cur, prev) => cur === prev + 1);
}
```

---

## `this.Action(fn)`

Creates an `ActionFunction` that wraps the given function. The action:

- Auto-discovers its property name for display
- Supports `.effect()` chaining (same API as `Action()` from `@qaide/test/primitives`)
- Routes execution through `executeAction()`, which adapters can override

```typescript
increment = this.Action(async () => {
  this.counter += 1;
}).effect(this.count, (current, previous) => current === previous + 1);

rename = this.Action(async (newName: string) => {
  await updateName(newName);
}).effect((effect, newName) => effect(this.name, newName));

save = this.Action(async () => {
  await submit();
}).effect(this.isSaved, true)
  .options({ timeout: 10_000 });
```

Once `.effect()` is called, `.options(opts: WaitForOptions)` configures effect polling — `timeout` and `stableFor`. See [`src/primitives/README.md`](../primitives/README.md) for details.

### `executeAction()` hook

Adapters override this method to add driver-specific behavior around action execution. The default implementation simply calls the action directly.

```typescript
protected executeAction<Args extends unknown[], R>(
  action: ActionFunction<Args, R>,
  args: Args,
): Promise<R> {
  return action(...args);
}
```

The Playwright adapter overrides this to wrap each action call in `test.step(...)`:

```typescript
protected override executeAction<Args extends unknown[], R>(
  action: ActionFunction<Args, R>,
  args: Args,
): Promise<R> {
  const { name, params } = action.meta();
  const stepName = formatActionCall(name ?? '<unknown>', params, args);
  return test.step(stepName, () => action(...args));
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

## Exports

| Export | Description |
|---|---|
| `PageFragment` | Abstract base class with `State`, `Action`, `Collection`, and `waitFor` factories |
| `ActionFunction<Args, R>` | Type for action functions created by `this.Action(fn)` |
| `ActionWithEffects<Args, R>` | Type returned after `.effect()` — adds `.options()` for configuring effect polling |

---

## See Also

- 🎭 Playwright adapter built on this layer: [`src/playwright/README.md`](../playwright/README.md)
- Framework-agnostic primitives (`State`, `Action`, `Collection`, `waitFor`): [`src/primitives/README.md`](../primitives/README.md)
