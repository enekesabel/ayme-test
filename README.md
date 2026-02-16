# @ayde/test

A type-safe testing framework for [Playwright](https://playwright.dev/) that extends `@playwright/test` with declarative Page Object Model (POM) primitives, auto-retry state assertions, and verified action effects.

## Installation

```bash
npm install @playwright/test @ayde/test
# or
pnpm add @playwright/test @ayde/test
# or
yarn add @playwright/test @ayde/test
```

`@ayde/test` is a thin wrapper around `@playwright/test`, so you keep using the Playwright CLI and runner as-is (`npx playwright test`).

## Migration from @playwright/test

Switch imports from `@playwright/test` to `@ayde/test`:

```typescript
import { test, expect, defineConfig, devices } from '@ayde/test';
```

You can also switch reporter type imports:

```typescript
import type { Reporter } from '@ayde/test/reporter';
```

## Quick Start

### Creating a Component

```typescript
import { PageComponent, PageElement } from '@ayde/test';

export class TodoItem extends PageComponent {
  // Child components
  checkbox = this.Child(PageElement, this.rootLocator.locator('.toggle'));
  label = this.Child(PageElement, this.rootLocator.locator('label'));

  // States - queryable properties
  getText = this.State(() => this.label.rootLocator.innerText());
  isCompleted = this.State(() => this.rootLocator.hasClass('completed'));

  // Actions with verified effects
  toggle = this.Action(
    () => this.checkbox.rootLocator.click(),
    this.Effect(this.isCompleted, prev => !prev())
  );

  markAsCompleted = this.Action(
    async () => {
      if (!(await this.isCompleted())) await this.toggle();
    },
    this.Effect(this.isCompleted, true)
  );
}
```

### Creating a Page Object

```typescript
import { PageObject, PageElement } from '@ayde/test';
import { TodoItem } from './TodoItem';

export class TodoPage extends PageObject {
  // Child components
  newTodoInput = this.Child(PageElement, this.page.locator('.new-todo'));
  items = this.ChildCollection(TodoItem, this.page.locator('.todo-list li'));

  // States
  itemCount = this.State(() => this.items.count());
  completedCount = this.State(() => 
    this.items.filterByState({ isCompleted: true }).count()
  );

  // Actions with effects
  addTodo = this.Action(
    async (text: string) => {
      await this.newTodoInput.rootLocator.fill(text);
      await this.newTodoInput.rootLocator.press('Enter');
    },
    this.Effect(this.itemCount, prev => prev() + 1)
  );

  clearCompleted = this.Action(
    () => this.page.locator('.clear-completed').click(),
    this.Effect(this.completedCount, 0)
  );
}
```

### Using in Tests

```typescript
import { test, expect } from '@ayde/test';
import { TodoPage } from './pages/TodoPage';

test('add and complete todos', async ({ page }) => {
  const todoPage = new TodoPage(page);

  await todoPage.goto();
  await todoPage.addTodo('Buy milk');
  await todoPage.addTodo('Write tests');

  // Auto-retry state assertions
  await expect(todoPage).toHaveState({ itemCount: 2 });

  // Actions auto-verify their effects
  const firstItem = await todoPage.items.at(0);
  await firstItem!.toggle();

  // Multiple state assertions (AND logic)
  await expect(todoPage).toHaveState({
    completedCount: 1,
    itemCount: 2,
  });
});
```

## Core Concepts

### States

States are queryable properties that return the current value of some aspect of your component:

```typescript
class MyComponent extends PageComponent {
  // State from locator
  getText = this.State(() => this.rootLocator.innerText());
  isVisible = this.State(() => this.rootLocator.isVisible());
  
  // Computed state (depends on other states)
  isEmpty = this.State(async () => (await this.getText()) === '');
  hasContent = this.State(async () => (await this.getText()).length > 0);
}
```

### Actions with Effects

Actions are methods that interact with the UI and declare expected state changes:

```typescript
class Checkbox extends PageComponent {
  isChecked = this.State(() => this.rootLocator.isChecked());

  // Single effect
  toggle = this.Action(
    () => this.rootLocator.click(),
    this.Effect(this.isChecked, prev => !prev())
  );

  // Static value effect
  check = this.Action(
    async () => {
      if (!(await this.isChecked())) await this.toggle();
    },
    this.Effect(this.isChecked, true)
  );

  // Multiple effects
  resetAndCheck = this.Action(
    async () => { /* ... */ },
    this.Effect(
      [this.someState, 'value'],
      [this.isChecked, true]
    )
  );
}
```

#### The `prev()` Function

Use `prev()` in effect values to reference state values **before the action executed**:

```typescript
// No args: returns current effect's state value
toggle = this.Action(
  () => this.checkbox.click(),
  this.Effect(this.isCompleted, prev => !prev())
);

increment = this.Action(
  () => this.button.click(),
  this.Effect(this.count, prev => prev() + 1)
);
```

For cross-state effects, use `prev(state)` to read another state's before-value. **Note:** The state must be included in the effects array to be accessible via `prev()`:

```typescript
// Cross-state: swap values between two states
swapStates = this.Action(
  async () => { /* ... */ },
  this.Effect(
    [this.stateA, prev => prev(this.stateB)],  // A gets B's before-value
    [this.stateB, prev => prev(this.stateA)]   // B gets A's before-value
  )
);
```

#### Handling Action Parameters

For actions that need parameters affecting the expected effect:

```typescript
edit = this.Action((newText: string) => ({
  execute: async () => {
    await this.input.dblclick();
    await this.input.fill(newText);
    await this.input.press('Enter');
  },
  effects: this.Effect(this.getText, newText),
}));
```

### Auto-Retrying Assertions

Use `toHaveState` for assertions that poll until state matches, or time out:

```typescript
import { expect } from '@ayde/test';
import { TodoPage } from './pages/TodoPage';

const todoPage = new TodoPage(page);

// Single state
await expect(component).toHaveState({ isVisible: true });

// Multiple states (AND logic)
await expect(todoPage).toHaveState({
  itemCount: 5,
  isLoading: false,
});

// With predicate
await expect(todoPage).toHaveState({ itemCount: (n: number) => n > 3 });

// With timeout
await expect(todoPage).toHaveState({ isReady: true }, { timeout: 10000 });

// With stability requirement
await expect(todoPage).toHaveState({ isVisible: true }, { stableFor: 250 });
```

### Waiting on Individual States

Use `state.waitFor` to wait on a single state (with optional predicates) and add stability when needed:

```typescript
import { TodoPage } from './pages/TodoPage';

const todoPage = new TodoPage(page);

// Exact value
await todoPage.isVisible.waitFor(true);

// Predicate
await todoPage.itemCount.waitFor(count => count > 3, { timeout: 5000 });

// Stable for duration
await todoPage.isVisible.waitFor(true, { timeout: 5000, stableFor: 250 });
```

### Child Components and Collections

#### Single Child

Use `this.Child()` to compose child components:

```typescript
class TodoItem extends PageComponent {
  checkbox = this.Child(PageElement, this.rootLocator.locator('.toggle'));
  label = this.Child(PageElement, this.rootLocator.locator('label'));
}
```

#### Collections

Use `this.ChildCollection()` for multiple items of the same type:

```typescript
class TodoPage extends PageObject {
  items = this.ChildCollection(TodoItem, this.page.locator('.todo-list li'));
}
```

#### Collection Methods

Collections provide methods for accessing and filtering items:

```typescript
// Access by index
const firstItem = await todoPage.items.at(0);  // TodoItem | undefined
const allItems = await todoPage.items.all();   // TodoItem[]
const count = await todoPage.items.count();    // number

// Filter with exact value match
const completed = todoPage.items.filter({ isCompleted: true });
const activeItems = await completed.all();

// Filter with predicate function
const longItems = todoPage.items.filter({
  getText: (text) => text.length > 20
});

// Multiple conditions (AND logic)
const urgentActive = todoPage.items.filter({
  isCompleted: false,
  getText: (text) => text.includes('urgent')
});

// Chaining filters
const filtered = todoPage.items
  .filter({ isCompleted: true })
  .filter({ getText: (t) => t.length > 5 });

// Find single item
const milk = await todoPage.items.find({ getText: 'Buy milk' });
const longItem = await todoPage.items.find({
  getText: (text) => text.length > 50
});
```

## Class Hierarchy

```
PageFragment (base, has page)
├── PageObject (full pages)
└── PageComponent (rooted to locator)
    └── PageElement (simple element wrapper)
```

## Exports

```typescript
import {
  // Base classes
  PageObject,
  PageComponent,
  PageElement,
  PageFragment,

  // Test utilities (re-exported from Playwright)
  test,
  expect,

  // Types
  StateFunction,
  ActionFunction,
  EffectEntry,
  Effects,
  FilterExpectations,
} from '@ayde/test';
```

## License

MIT
