# @qaide/test/pom-universal

Framework-neutral base classes and factory for building typed Page Object Model adapters.

## Why Use This

`@qaide/test/pom-universal` defines the POM abstraction without coupling to any specific test driver or locator system. It provides:

- `PageFragment<L>` — base class with `State`, `Collection`, `waitFor` factories, and a type-safe `Locators()` helper. The generic `L` is the locator type your adapter uses.
- `createAdapter` — factory that generates `PageObject` and `PageComponent` abstract classes from a customized fragment.

`@qaide/test/playwright` 🎭 is a concrete adapter built on top of this layer. Use `pom-universal` directly when you want the same POM model with a different driver.

---

## Exports

**Values**

- `PageFragment`
- `createAdapter`

---

## `PageFragment<L>`

Abstract base class for all page fragments. Provides factories for state queries, collections, polling, and a typed locator system.

```typescript
abstract class PageFragment<L = unknown> {
  constructor(locatorOverrides: Record<string, L> | undefined)

  protected Locators<T extends Record<string, L>>(bag: T): T
  protected State<R>(fn: () => Promise<R>): StateFunction<R>
  protected Collection<T>(resolver: () => Promise<T[]>): Collection<T>
  protected waitFor: typeof waitFor
}
```

The generic `L` is the locator type used by your adapter. For example, the Playwright adapter extends `PageFragment<Locator>`.

### `this.Locators()` — defining locators

Use `this.Locators()` to define a component's locators as a class field. The return type is **auto-inferred** from the bag you pass — no generics or interface declarations needed.

```typescript
// Component with custom locators — uses this.root to scope
class SearchBar extends PageComponent {
  locators = this.Locators({
    input: this.root.find('input'),
    submitButton: this.root.find('button[type=submit]'),
  });

  async search(query: string) {
    await this.locators.input.fill(query);       // ✓ typed
    await this.locators.submitButton.click();     // ✓ typed
    await this.locators.nonExistent;              // ✗ compile error
  }
}

// Component that only uses root — no locators field needed
class Checkbox extends PageComponent {
  isChecked = this.State(() => this.locators.root.isChecked());
}
```

For `PageComponent`s, `root` is **automatically included** in `locators`:

```typescript
class Widget extends PageComponent {
  locators = this.Locators({
    label: this.root.find('label'),
  });

  isVisible = this.State(() => this.locators.root.isVisible());
  getText = this.State(() => this.locators.label.innerText());
}
```

`PageObject`s do **not** get `root` in their `locators`.

#### Override mechanism

Locators defined via `this.Locators()` are defaults. They can be **overridden at instantiation time** via the constructor, enabling a test-component-harness approach — the component declares how it normally finds its elements, but a test can swap individual locators when the context requires it.

The override logic lives in `PageFragment` — when `locatorOverrides` are passed to the constructor, `this.Locators()` automatically merges them with the defaults:

```typescript
class SearchBox extends PageComponent {
  locators = this.Locators({
    input: this.root.locator('input'),
    submitButton: this.root.locator('button[type="submit"]'),
  });
}

// Default — SearchBox finds its own elements:
const search = new SearchBox(rootLocator);
search.locators.input;        // → this.root.locator('input')
search.locators.submitButton;  // → this.root.locator('button[type="submit"]')

// Override — swap the input locator for a specific test:
const search = new SearchBox({
  root: rootLocator,
  input: rootLocator.locator('[data-testid="search-input"]'),
});
search.locators.input;        // → the overridden locator
search.locators.submitButton;  // → still the default
```

Only the keys you provide are overridden; the rest keep their defaults. This makes `this.Locators()` provide *defaults* rather than *the* locators — a specific test, or a parent composing the component in an unusual layout, can override individual locators without subclassing.

### Protected factories

| | |
|---|---|
| `this.Locators(bag)` | Creates a typed locator bag. On `PageComponent`s, auto-includes `root`. Applies constructor overrides if present. |
| `this.State(fn)` | Creates a `StateFunction<R>`. Auto-discovers its property name (`ClassName.propertyName`) for error messages. |
| `this.Collection(resolver)` | Creates a `Collection<T>` from any async resolver function. |
| `this.waitFor` | Same as `waitFor(...)` from `@qaide/test/primitives`. |

> `this.State(fn)` auto-names states using the property key: a state assigned to `this.itemCount` in class `TodoPage` is automatically named `'TodoPage.itemCount'`.

---

## `createAdapter`

Factory that generates `PageObject` and `PageComponent` abstract classes from a customized `PageFragment`. You subclass `PageFragment<L>` with your driver-specific setup, pass it to `createAdapter`, and get back ready-to-use base classes.

### Why use it?

Without `createAdapter`, every adapter would need to manually wire up:
- A `PageObject` class (full-page, no root)
- A `PageComponent` class (root-scoped, with `root` auto-included in `locators`)
- Constructor plumbing and locator override support

`createAdapter` does all of this in one call. It also lets you customize behavior at the fragment level (e.g. harmonizing locators across frameworks) and have it apply to the entire class hierarchy.

### Harmonizing multiple test frameworks

A real-world use case: running the same component POMs in both Playwright E2E tests and Vitest component tests. Each framework has different locator types, but you want one POM hierarchy that works in both.

```typescript
import { PageFragment, createAdapter } from '@qaide/test/pom-universal';
import type { Locator as PlaywrightLocator } from '@playwright/test';
import type { Locator as VitestLocator } from 'vitest/browser';

type RawLocator = PlaywrightLocator | VitestLocator;

interface HarmonizedLocator {
  find(selector: string): HarmonizedLocator;
  click(): Promise<void>;
  fill(value: string): Promise<void>;
  text(): Promise<string>;
  isVisible(): Promise<boolean>;
  inputValue(): Promise<string>;
}

function isPlaywrightLocator(l: RawLocator): l is PlaywrightLocator {
  return 'page' in l && typeof (l as any).page === 'function';
}

// Playwright and Vitest locators share some methods (click, fill)
// but differ in others. harmonize() bridges the gaps:
function harmonize(loc: RawLocator): HarmonizedLocator {
  if (isPlaywrightLocator(loc)) return loc as HarmonizedLocator;
  const vitest = loc as VitestLocator;
  return {
    ...vitest,
    find: (sel: string) => harmonize(vitest.find(sel)),
    isVisible: async () => vitest.query() !== null,
    inputValue: async () => vitest.element().value,
  };
}

// Custom fragment — harmonizes locators at the base level
abstract class HarmonizedFragment extends PageFragment<HarmonizedLocator> {
  protected override Locators<T extends Record<string, HarmonizedLocator>>(bag: T): T {
    const base = super.Locators(bag);
    return Object.fromEntries(
      Object.entries(base).map(([key, loc]) => [key, harmonize(loc)]),
    ) as T;
  }
}

const { PageObject, PageComponent } = createAdapter(HarmonizedFragment);

// Components work identically both with Playwright and Vitest —
// locators are harmonized transparently by the fragment
class SearchField extends PageComponent {
  locators = this.Locators({
    input: this.root.find('input'),
    clearButton: this.root.find('.clear'),
  });

  getValue = this.State(() => this.locators.input.text());
}
```

### Simplifying the consumer API

Adapters can further extend the generated classes to simplify the consumer-facing API. For example, the Playwright adapter wraps both `PageObject` and `PageComponent` so consumers only pass the essentials:

```typescript
const { PageObject: BasePageObject, PageComponent: BasePageComponent } = createAdapter(PlaywrightPageFragment);

// PageObject: accepts Page or locator overrides
abstract class PageObject extends BasePageObject {
  constructor(pageOrOverrides: Page | Record<string, Locator>) { ... }
}

// PageComponent: accepts root Locator or options bag
abstract class PageComponent extends BasePageComponent {
  constructor(rootOrOptions: Locator | { root: Locator; [key: string]: Locator }) { ... }
}
```

---

## Type Safety

The locator system enforces type safety at compile time:

- **Auto-inferred keys** — locator keys and types are inferred from the `this.Locators()` bag, no generics needed.
- **Invalid key rejection** — accessing a key not in the locator bag is a compile error.
- **Automatic `root` inclusion** — `PageComponent.locators` always includes a typed `root`. `PageObject.locators` does not.
- **No public `this.root`** — root is `protected` and not accessible outside the class. Access it via `this.locators.root` or `this.root` within the class.
- **Constructor preservation** — `createAdapter` preserves the fragment's constructor signature.

---

## API Reference

| Export | Description |
|---|---|
| `PageFragment<L>` | Abstract base class with `Locators()`, `State`, `Collection`, and `waitFor`. `L` is the locator type. |
| `createAdapter(Fragment)` | Factory generating `PageObject` and `PageComponent` classes from a fragment |

---

## See Also

- 🎭 Playwright adapter built on this layer: [`src/playwright/README.md`](../playwright/README.md)
- Framework-agnostic primitives (`State`, `Collection`, `waitFor`): [`src/primitives/README.md`](../primitives/README.md)
