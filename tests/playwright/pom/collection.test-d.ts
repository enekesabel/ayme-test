import { PageComponent } from '../../../src/playwright/pom';
import type { Collection } from '../../../src/primitives';

/**
 * Type tests for Collection filter() and find() methods.
 * Validates that:
 * - filter() accepts exact values for states
 * - filter() accepts predicate functions with correct types
 * - filter() rejects wrong value types
 * - find() has the same type safety
 */

class TestItem extends PageComponent {
  getText = this.State(async () => 'hello');
  getCount = this.State(async () => 42);
  isCompleted = this.State(async () => false);
}

// Mock collection for type testing
declare const items: Collection<TestItem>;

// ============ Valid filter() calls ============

async function testValidFilters() {
  // Exact value match
  items.filter({ isCompleted: true });
  items.filter({ isCompleted: false });
  items.filter({ getText: 'hello' });
  items.filter({ getCount: 42 });

  // Predicate functions with correct types
  items.filter({ isCompleted: (val: boolean) => val === true });
  items.filter({ getText: (text: string) => text.length > 5 });
  items.filter({ getCount: (n: number) => n > 10 });

  // Multiple conditions
  items.filter({
    isCompleted: true,
    getText: (t: string) => t.includes('hello'),
  });

  // Chaining
  items
    .filter({ isCompleted: true })
    .filter({ getText: (t: string) => t.length > 5 });
}

// ============ Valid find() calls ============

async function testValidFinds() {
  // Exact value match
  const item1 = await items.find({ getText: 'hello' });
  const item2 = await items.find({ isCompleted: true });
  
  // Predicate functions
  const item3 = await items.find({ getText: (t: string) => t.length > 5 });
  const item4 = await items.find({ getCount: (n: number) => n > 10 });

  // Multiple conditions
  const item5 = await items.find({
    isCompleted: false,
    getText: (t: string) => t.includes('urgent'),
  });

  // Return type should be TestItem | undefined
  const foundItem: TestItem | undefined = item1;
}

// ============ Invalid calls - should error ============

async function testInvalidFilters() {
  // @ts-expect-error - wrong type: string not boolean
  items.filter({ isCompleted: 'yes' });

  // @ts-expect-error - wrong type: number not string  
  items.filter({ getText: 123 });

  // @ts-expect-error - wrong type: boolean not number
  items.filter({ getCount: true });

  // @ts-expect-error - predicate returns wrong type
  items.filter({ isCompleted: (val: boolean) => 'wrong' });

  // @ts-expect-error - predicate param has wrong type
  items.filter({ getText: (n: number) => n > 5 });

  // @ts-expect-error - unknown state key
  items.filter({ unknownState: true });
  
  // @ts-expect-error - trying to filter by action (not state)
  items.filter({ toggle: true });
}

async function testInvalidFinds() {
  // @ts-expect-error - wrong type: string not boolean
  await items.find({ isCompleted: 'yes' });

  // @ts-expect-error - wrong type: number not string
  await items.find({ getText: 123 });

  // @ts-expect-error - unknown state key
  await items.find({ unknownState: 'value' });
}

export {};
