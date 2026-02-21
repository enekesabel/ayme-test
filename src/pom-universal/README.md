# @ayde/test/pom-universal

Framework-neutral base classes for building typed Page Object Model adapters.

## Purpose

Use this package when you want the `PageFragment` model with a non-Playwright driver and locator system.

The preferred adapter pattern is:

1. implement an adapter-specific `PageFragment`
2. generate matching `PageObject` and `PageComponent` with `createPomAdapter(PageFragment)`

`@ayde/test/playwright` is a concrete adapter built on top of this layer.

## Generic Contract

`PageFragment<Driver, Locator>` is parameterized by:

- `Driver`: top-level automation handle (for example browser page/session)
- `Locator`: element reference type in your framework

The universal layer provides protected factories:

- `this.State(...)`
- `this.Action(...)`
- `this.Effect(...)`
- `this.Collection(...)`

## Core Building Blocks

- `PageFragment<Driver, Locator>`: abstract base for state/action/effect composition
- `createPomAdapter(PageFragment)`: creates adapter-specific `PageObject` and `PageComponent` classes

## Adapter Responsibilities

A concrete adapter typically defines a base fragment class that extends `PageFragment` and implements:

1. `resolveAll(...)`: how to resolve a locator into all component instances.
2. `executeAction(...)` (optional override): wrap action execution (for example reporting/step hooks).

## Minimal Adapter Sketch

```typescript
import { PageFragment, createPomAdapter } from '@ayde/test/pom-universal';

type Driver = MyDriver;
type Locator = MyLocator;

abstract class AdapterFragment extends PageFragment<Driver, Locator> {
  protected async resolveAll<T>(
    Ctor: new (locator: Locator, driver: Driver) => T,
    locator: Locator
  ): Promise<T[]> {
    const locators = await locator.all();
    return locators.map(l => new Ctor(l, this.driver));
  }

  protected executeAction<R>(
    action: (...args: unknown[]) => Promise<R>,
    args: unknown[]
  ): Promise<R> {
    // Optional adapter hook (for logging/reporting)
    return action(...args);
  }
}

const { PageObject, PageComponent } = createPomAdapter(AdapterFragment);

class MyPageObject extends PageObject {}

class MyComponent extends PageComponent {
  getText = this.State(() => this.rootLocator.text());
}
```

### Optional Single-Arg Components

If your adapter can derive the driver from a locator, add a static hook:

```typescript
abstract class AdapterFragment extends PageFragment<Driver, Locator> {
  static driverFromLocator(locator: Locator): Driver {
    return locator.driver();
  }
}
```

Then generated components use constructor `(rootLocator)` instead of `(rootLocator, driver)`.

This is how the Playwright adapter gets single-arg components.

## API Reference

### Values

| Export | Description |
|---|---|
| `PageFragment<Driver, Locator>` | Abstract base class for adapter-specific fragments |
| `createPomAdapter(PageFragment)` | Generate adapter `PageObject` and `PageComponent` classes |
| `PageObject<Driver, Locator>` | Base class for full-page objects |
| `PageComponent<Driver, Locator>` | Base class for locator-rooted components |

### Types

| Export | Description |
|---|---|
| `ActionFunction<Args, R>` | Promise-returning action function signature |
| `ActionDefinition<R>` | Action factory return (`{ execute, effects? }`) |
| `ComponentConstructor<Driver, Locator, T>` | Constructor shape used by `Collection(...)` |
