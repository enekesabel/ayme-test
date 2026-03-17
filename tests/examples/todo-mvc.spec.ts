import { test, expect } from '../../src/playwright';
import { TodoPage } from './TodoPage';

/**
 * Showcase tests demonstrating @ayme-dev/test framework capabilities.
 * Uses the TodoMVC demo app to illustrate patterns and best practices.
 */

test.describe('Basic Usage', () => {
  test('navigate, add todos, and verify state', async ({ page }) => {
    const todoPage = new TodoPage(page);

    await todoPage.goto();
    await todoPage.addTodo('Learn @ayme-dev/test');
    await todoPage.addTodo('Build great tests');

    // Assert states using toHaveState
    await expect(todoPage).toHaveState({
      itemCount: 2,
      activeCount: 2,
      completedCount: 0,
    });
  });
});

test.describe('State Queries', () => {
  test('query component states', async ({ page }) => {
    const todoPage = new TodoPage(page);
    await todoPage.goto();
    await todoPage.addTodo('My task');

    // Get a TodoItem and query its states
    const item = await todoPage.items.at(0);
    expect(item).toBeDefined();
    expect(await item!.text()).toBe('My task');
    expect(await item!.isCompleted()).toBe(false);
  });

  test('derived states from filtered collections', async ({ page }) => {
    const todoPage = new TodoPage(page);
    await todoPage.goto();
    await todoPage.addTodos(['Task 1', 'Task 2', 'Task 3']);

    const firstItem = await todoPage.items.at(0);
    await firstItem!.markAsCompleted();

    // States computed from filterByState
    await expect(todoPage).toHaveState({
      completedCount: 1,
      activeCount: 2,
    });
  });
});

test.describe('Collection Operations', () => {
  test('filterByState - filter items by state values', async ({ page }) => {
    const todoPage = new TodoPage(page);
    await todoPage.goto();
    await todoPage.addTodos(['Active 1', 'Active 2', 'Will complete']);

    const lastItem = await todoPage.items.at(2);
    await lastItem!.markAsCompleted();

    // Filter to get only completed items
    const completedItems = await todoPage.items.filter({ isCompleted: true }).all();
    expect(completedItems).toHaveLength(1);
    await expect(completedItems[0]!).toHaveState({ text: 'Will complete' });

    // Filter to get only active items
    const activeItems = await todoPage.items.filter({ isCompleted: false }).all();
    expect(activeItems).toHaveLength(2);
  });

  test('find - find single item by state', async ({ page }) => {
    const todoPage = new TodoPage(page);
    await todoPage.goto();
    await todoPage.addTodos(['Find me', 'Not me', 'Neither']);

    // Find specific item by text
    const item = await todoPage.items.find({ text: 'Find me' });
    expect(item).toBeDefined();
    // Verify found item's other state (text was already used for finding)
    await expect(item!).toHaveState({ isCompleted: false });
  });

  test('filter with custom predicate', async ({ page }) => {
    const todoPage = new TodoPage(page);
    await todoPage.goto();
    await todoPage.addTodos(['Short', 'Medium length', 'A very long task name']);

    // Custom filter: items with text longer than 10 characters
    const longItems = await todoPage.items
      .filter({ text: (text: string) => text.length > 10 })
      .all();

    expect(longItems).toHaveLength(2);
  });
});

test.describe('Page Object Model', () => {
  test('TodoPage composes TodoItems through Collection', async ({ page }) => {
    const todoPage = new TodoPage(page);
    await todoPage.goto();
    await todoPage.addTodo('First task');
    await todoPage.addTodo('Second task');

    await expect(todoPage).toHaveState({ itemCount: 2 });

    const first = await todoPage.items.at(0);
    await expect(first!).toHaveState({ text: 'First task', isCompleted: false });
  });

  test('page-level states derive from component states', async ({ page }) => {
    const todoPage = new TodoPage(page);
    await todoPage.goto();
    await todoPage.addTodos(['Task A', 'Task B', 'Task C']);

    const first = await todoPage.items.at(0);
    await first!.markAsCompleted();

    await expect(todoPage).toHaveState({
      itemCount: 3,
      completedCount: 1,
      activeCount: 2,
    });
  });

  test('Action methods appear as named steps in reports', async ({ page }) => {
    const todoPage = new TodoPage(page);
    await todoPage.goto();
    await todoPage.addTodo('Check steps');

    const item = await todoPage.items.at(0);
    await item!.markAsCompleted();
    await expect(item!).toHaveState({ isCompleted: true });
  });
});

test.describe('Action Effects System', () => {
  test.describe('Basic effect verification', () => {
    test('action with effect correctly waits for state transition', async ({ page }) => {
      const todoPage = new TodoPage(page);
      await todoPage.goto();
      await todoPage.addTodo('Test item');

      const item = await todoPage.items.at(0);
      expect(await item!.isCompleted()).toBe(false);

      // toggle action has effect: [isCompleted, (cur, prev) => cur === !prev]
      // The action completes only after the effect is satisfied
      await item!.toggle();

      // Direct query works here - no toHaveState retry needed because
      // the action's effect already waited for isCompleted to change
      expect(await item!.isCompleted()).toBe(true);
    });

    test('toggle effect works from false to true', async ({ page }) => {
      const todoPage = new TodoPage(page);
      await todoPage.goto();
      await todoPage.addTodo('Toggle test');

      const item = await todoPage.items.at(0);
      expect(await item!.isCompleted()).toBe(false);

      // Effect: [isCompleted, (cur, prev) => cur === !prev] waits for false => true
      await item!.toggle();

      // Direct query - effect already ensured state changed
      expect(await item!.isCompleted()).toBe(true);
    });

    test('toggle effect works from true to false', async ({ page }) => {
      const todoPage = new TodoPage(page);
      await todoPage.goto();
      await todoPage.addTodo('Toggle back test');

      const item = await todoPage.items.at(0);
      await item!.markAsCompleted();
      expect(await item!.isCompleted()).toBe(true);

      // Effect: [isCompleted, (cur, prev) => cur === !prev] waits for true => false
      await item!.toggle();

      // Direct query - effect already ensured state changed
      expect(await item!.isCompleted()).toBe(false);
    });
  });

  test.describe('Multiple effects', () => {
    test('action verifies all effects together', async ({ page }) => {
      const todoPage = new TodoPage(page);
      await todoPage.goto();

      const beforeCount = await todoPage.itemCount();
      const beforeCompletedCount = await todoPage.completedCount();

      // addTodo has effect: [itemCount, (cur, prev) => cur === prev + 1]
      await todoPage.addTodo('First item');

      const afterCount = await todoPage.itemCount();
      expect(afterCount).toBe(beforeCount + 1);

      // Completed count should remain the same
      expect(await todoPage.completedCount()).toBe(beforeCompletedCount);
    });

    test('multiple sequential effects with different state values', async ({ page }) => {
      const todoPage = new TodoPage(page);
      await todoPage.goto();

      // Add multiple items
      const countBefore = await todoPage.itemCount();
      await todoPage.addTodo('Item 1');
      expect(await todoPage.itemCount()).toBe(countBefore + 1);

      // Complete one item
      const item = await todoPage.items.at(0);
      await item!.markAsCompleted();
      expect(await item!.isCompleted()).toBe(true);
      expect(await todoPage.completedCount()).toBe(1);
      expect(await todoPage.activeCount()).toBe(countBefore);

      // Add another item
      const countAfterFirst = await todoPage.itemCount();
      await todoPage.addTodo('Item 2');
      expect(await todoPage.itemCount()).toBe(countAfterFirst + 1);
    });

    test('addTodos adds multiple items sequentially', async ({ page }) => {
      const todoPage = new TodoPage(page);
      await todoPage.goto();

      const countBefore = await todoPage.itemCount();
      const textsToAdd = ['Task 1', 'Task 2', 'Task 3'];

      // addTodos composes multiple addTodo calls, each with effect
      await todoPage.addTodos(textsToAdd);

      const countAfter = await todoPage.itemCount();
      expect(countAfter).toBe(countBefore + textsToAdd.length);
    });
  });

  test.describe('Effect types', () => {
    test('relative transition - toggle boolean ((cur, prev) => cur === !prev)', async ({ page }) => {
      const todoPage = new TodoPage(page);
      await todoPage.goto();
      await todoPage.addTodo('Relative test');

      const item = await todoPage.items.at(0);

      // First toggle: false => true
      let before = await item!.isCompleted();
      expect(before).toBe(false);

      await item!.toggle(); // Effect: (cur, prev) => cur === !prev
      let after = await item!.isCompleted();
      expect(after).toBe(!before);

      // Second toggle: true => false
      before = after;
      await item!.toggle(); // Effect: (cur, prev) => cur === !prev
      after = await item!.isCompleted();
      expect(after).toBe(!before);
    });

    test('relative transition - increment number ((cur, prev) => cur === prev + 1)', async ({ page }) => {
      const todoPage = new TodoPage(page);
      await todoPage.goto();

      const countBefore = await todoPage.itemCount();
      expect(countBefore).toBe(0);

      // Effect: [itemCount, (cur, prev) => cur === prev + 1]
      await todoPage.addTodo('Item 1');
      expect(await todoPage.itemCount()).toBe(countBefore + 1);

      // Add another
      const countAfter1 = await todoPage.itemCount();
      await todoPage.addTodo('Item 2');
      expect(await todoPage.itemCount()).toBe(countAfter1 + 1);
    });

    test('absolute transition - boolean (false)', async ({ page }) => {
      const todoPage = new TodoPage(page);
      await todoPage.goto();
      await todoPage.addTodo('Test');

      const item = await todoPage.items.at(0);
      await item!.markAsCompleted();
      await expect(item!).toHaveState({ isCompleted: true });

      // markAsActive has effect: [isCompleted, false]
      // This is an absolute transition regardless of previous value
      await item!.markAsActive();
      await expect(item!).toHaveState({ isCompleted: false });
    });

    test('absolute transition - boolean (true)', async ({ page }) => {
      const todoPage = new TodoPage(page);
      await todoPage.goto();
      await todoPage.addTodo('Test');

      const item = await todoPage.items.at(0);
      await expect(item!).toHaveState({ isCompleted: false });

      // markAsCompleted has effect: [isCompleted, true]
      // This is an absolute transition regardless of previous value
      await item!.markAsCompleted();
      await expect(item!).toHaveState({ isCompleted: true });
    });

    test('absolute transition - number (0)', async ({ page }) => {
      const todoPage = new TodoPage(page);
      await todoPage.goto();
      await todoPage.addTodos(['Item 1', 'Item 2', 'Item 3']);
      expect(await todoPage.itemCount()).toBe(3);

      // Complete all items
      const allItems = await todoPage.items.filter({ isCompleted: false }).all();
      for (const item of allItems) {
        await item.markAsCompleted();
      }
      expect(await todoPage.completedCount()).toBe(3);

      // clearCompleted has effect: [completedCount, 0]
      await todoPage.clearCompleted();
      expect(await todoPage.completedCount()).toBe(0);
    });
  });

  test.describe('Before-state capture', () => {
    test('effects work with count = 0 (increment by 1)', async ({ page }) => {
      const todoPage = new TodoPage(page);
      await todoPage.goto();

      expect(await todoPage.itemCount()).toBe(0);

      // Effect: [itemCount, (cur, prev) => cur === prev + 1]
      await todoPage.addTodo('First item');

      expect(await todoPage.itemCount()).toBe(1);
    });

    test('effects work with count = 5 (increment by 1)', async ({ page }) => {
      const todoPage = new TodoPage(page);
      await todoPage.goto();
      await todoPage.addTodos(['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5']);

      expect(await todoPage.itemCount()).toBe(5);

      // Effect: [itemCount, (cur, prev) => cur === prev + 1]
      // Should work regardless of starting count
      await todoPage.addTodo('Item 6');

      expect(await todoPage.itemCount()).toBe(6);
    });

    test('relative effects use before-state for calculation', async ({ page }) => {
      const todoPage = new TodoPage(page);
      await todoPage.goto();

      // Test with count = 0
      let count = await todoPage.itemCount();
      expect(count).toBe(0);

      await todoPage.addTodo('Item 1');
      expect(await todoPage.itemCount()).toBe(count + 1);

      // Test with count = 2
      count = await todoPage.itemCount();
      expect(count).toBe(1);

      await todoPage.addTodos(['Item 2', 'Item 3']);
      expect(await todoPage.itemCount()).toBe(count + 2);

      // Test with count = 3
      count = await todoPage.itemCount();
      expect(count).toBe(3);

      await todoPage.addTodo('Item 4');
      expect(await todoPage.itemCount()).toBe(count + 1);
    });

    test('boolean toggles work from any before-state', async ({ page }) => {
      const todoPage = new TodoPage(page);
      await todoPage.goto();
      await todoPage.addTodo('Toggle test');

      const item = await todoPage.items.at(0);

      // Before-state: false
      expect(await item!.isCompleted()).toBe(false);
      await item!.toggle(); // (cur, prev) => cur === !prev
      expect(await item!.isCompleted()).toBe(true);

      // Before-state: true
      expect(await item!.isCompleted()).toBe(true);
      await item!.toggle(); // (cur, prev) => cur === !prev
      expect(await item!.isCompleted()).toBe(false);

      // Before-state: false again
      expect(await item!.isCompleted()).toBe(false);
      await item!.toggle(); // (cur, prev) => cur === !prev
      expect(await item!.isCompleted()).toBe(true);
    });
  });

  test.describe('Effect validation', () => {
    test('effect successfully waits for state change before returning', async ({ page }) => {
      const todoPage = new TodoPage(page);
      await todoPage.goto();
      await todoPage.addTodo('Timing test');

      const item = await todoPage.items.at(0);

      // If effect waiting fails, the test would fail here
      // If effect succeeds, we know waitFor worked
      await item!.markAsCompleted();

      // If we reach here, the effect's waitFor completed successfully
      await expect(item!).toHaveState({ isCompleted: true });
    });

    test('action completes only after effect is satisfied', async ({ page }) => {
      const todoPage = new TodoPage(page);
      await todoPage.goto();

      const countBefore = await todoPage.itemCount();

      // This action has effect [itemCount, (cur, prev) => cur === prev + 1]
      // It should wait for itemCount to actually increment
      const addAction = todoPage.addTodo('Timing test');

      // If we reach here without timeout, the effect was satisfied
      await addAction;

      const countAfter = await todoPage.itemCount();
      expect(countAfter).toBe(countBefore + 1);
    });

    test('multiple completed items can be toggled with effects', async ({ page }) => {
      const todoPage = new TodoPage(page);
      await todoPage.goto();
      await todoPage.addTodos(['Item 1', 'Item 2', 'Item 3']);

      const items = await todoPage.items.all();

      // Toggle each with effect waiting
      for (const item of items) {
        const before = await item.isCompleted();
        await item.toggle();
        const after = await item.isCompleted();
        expect(after).toBe(!before);
      }
    });
  });

  test.describe('Empty effects', () => {
    test('action with no effects completes without waiting', async ({ page }) => {
      const todoPage = new TodoPage(page);
      await todoPage.goto();

      // First add a todo so the filterAll action can complete
      await todoPage.addTodo('Item');

      // filterAll action has effect but it completes quickly
      await todoPage.filterAll();

      // If we reach here, action completed
      expect(true).toBe(true);
    });

    test('delete method (not Action) completes without waiting', async ({ page }) => {
      const todoPage = new TodoPage(page);
      await todoPage.goto();
      await todoPage.addTodo('Delete me');

      const item = await todoPage.items.at(0);

      // delete is an Action without effects
      await item!.delete();

      // After deletion, there should be no items
      await expect(todoPage).toHaveState({ itemCount: 0 });
    });
  });

  test.describe('Effect composition with nested actions', () => {
    test('composed actions verify effects through the chain', async ({ page }) => {
      const todoPage = new TodoPage(page);
      await todoPage.goto();

      const countBefore = await todoPage.itemCount();

      // addTodos is a composed action that calls addTodo multiple times
      // Each addTodo has effect: [itemCount, (cur, prev) => cur === prev + 1]
      const textsToAdd = ['A', 'B', 'C'];
      await todoPage.addTodos(textsToAdd);

      expect(await todoPage.itemCount()).toBe(countBefore + textsToAdd.length);
    });

    test('nested actions all wait for their effects', async ({ page }) => {
      const todoPage = new TodoPage(page);
      await todoPage.goto();
      await todoPage.addTodo('Parent test');

      const item = await todoPage.items.at(0);

      // markAsCompleted has effect: [isCompleted, true]
      // The action waits for its effect before returning
      await item!.markAsCompleted();

      await expect(item!).toHaveState({ isCompleted: true });
    });
  });

  test.describe('State snapshot accuracy', () => {
    test('before-state is captured before interaction', async ({ page }) => {
      const todoPage = new TodoPage(page);
      await todoPage.goto();

      // Add items with different before-states
      await todoPage.addTodo('Item 1');
      let count = await todoPage.itemCount();
      expect(count).toBe(1);

      // Before-state captured as 1, effect: (cur, prev) => cur === prev + 1 = 2
      await todoPage.addTodo('Item 2');
      count = await todoPage.itemCount();
      expect(count).toBe(2);

      // Before-state captured as 2, effect: (cur, prev) => cur === prev + 1 = 3
      await todoPage.addTodo('Item 3');
      count = await todoPage.itemCount();
      expect(count).toBe(3);
    });

    test('effects correctly computed from various before-states', async ({ page }) => {
      const todoPage = new TodoPage(page);
      await todoPage.goto();

      // Capture at count = 0
      const startCount = await todoPage.itemCount();
      expect(startCount).toBe(0);

      // Apply relative effect multiple times
      for (let i = 1; i <= 5; i++) {
        await todoPage.addTodo(`Item ${i}`);
        expect(await todoPage.itemCount()).toBe(startCount + i);
      }
    });
  });

  test.describe('Edit action with effects', () => {
    test('edit action updates text correctly', async ({ page }) => {
      const todoPage = new TodoPage(page);
      await todoPage.goto();
      await todoPage.addTodo('Original text');

      const item = await todoPage.items.at(0);
      await expect(item!).toHaveState({ text: 'Original text' });

      const newText = 'Updated text';
      // edit action has effect: [text, newText]
      await item!.edit(newText);

      await expect(item!).toHaveState({ text: newText });
    });
  });
});

test.describe('State Assertions (Auto-Retry)', () => {
  test.describe('expect().toHaveState - auto-retry state assertions', () => {
    test('single state assertion', async ({ page }) => {
      const todoPage = new TodoPage(page);
      await todoPage.goto();
      await todoPage.addTodo('Test item');

      // Use type-safe toHaveState assertion with auto-retry
      await expect(todoPage).toHaveState({ itemCount: 1 });
    });

    test('multiple state assertions (AND logic)', async ({ page }) => {
      const todoPage = new TodoPage(page);
      await todoPage.goto();
      await todoPage.addTodos(['Item 1', 'Item 2']);

      // Mark first item as completed
      const firstItem = await todoPage.items.at(0);
      await firstItem!.markAsCompleted();

      // Assert multiple states at once - all must be true simultaneously
      await expect(todoPage).toHaveState({
        itemCount: 2,
        completedCount: 1,
        activeCount: 1,
      });
    });

    test('predicate assertion', async ({ page }) => {
      const todoPage = new TodoPage(page);
      await todoPage.goto();
      await todoPage.addTodos(['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5']);

      // Assert with predicate - itemCount should be greater than 3
      await expect(todoPage).toHaveState({ itemCount: (count: number) => count > 3 });
    });

    test('stableFor option waits for stable state', async ({ page }) => {
      const todoPage = new TodoPage(page);
      await todoPage.goto();
      await todoPage.addTodo('Stable item');

      await expect(todoPage).toHaveState({ itemCount: 1 }, { stableFor: 200 });
    });

    test('component state assertion', async ({ page }) => {
      const todoPage = new TodoPage(page);
      await todoPage.goto();
      await todoPage.addTodo('Buy milk');

      const item = await todoPage.items.at(0);

      // Assert component state
      await expect(item!).toHaveState({
        isCompleted: false,
        text: 'Buy milk',
      });

      // Toggle and assert again
      await item!.toggle();
      await expect(item!).toHaveState({ isCompleted: true });
    });
  });

  test.describe('expect.poll - native Playwright auto-retry', () => {
    test('expect.poll works with State functions', async ({ page }) => {
      const todoPage = new TodoPage(page);
      await todoPage.goto();
      await todoPage.addTodos(['Item 1', 'Item 2']);

      // State functions can be passed directly to expect.poll!
      await expect.poll(todoPage.itemCount).toBe(2);
      await expect.poll(todoPage.activeCount).toBe(2);
      await expect.poll(todoPage.completedCount).toBe(0);
    });

    test('expect.poll with component state', async ({ page }) => {
      const todoPage = new TodoPage(page);
      await todoPage.goto();
      await todoPage.addTodo('Test');

      const item = await todoPage.items.at(0);
      await item!.markAsCompleted();

      // Poll component state
      await expect.poll(item!.isCompleted).toBe(true);
    });
  });
});
