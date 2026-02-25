import { State, Collection, type StateFunction } from '../../src/primitives';

interface TestItem {
  getText: StateFunction<string>;
  getCount: StateFunction<number>;
  isCompleted: StateFunction<boolean>;
  toggle(): Promise<void>;
}

declare const items: Collection<TestItem>;

// ============ Valid filter() calls ============

async function testValidFilters() {
  items.filter({ isCompleted: true });
  items.filter({ isCompleted: false });
  items.filter({ getText: 'hello' });
  items.filter({ getCount: 42 });

  // Predicate functions
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
  const item1 = await items.find({ getText: 'hello' });
  const item2 = await items.find({ isCompleted: true });
  const item3 = await items.find({ getText: (t: string) => t.length > 5 });

  // Return type should be TestItem | undefined
  const foundItem: TestItem | undefined = item1;
}

// ============ Invalid calls ============

async function testInvalidFilters() {
  // @ts-expect-error - wrong type: string not boolean
  items.filter({ isCompleted: 'yes' });

  // @ts-expect-error - wrong type: number not string
  items.filter({ getText: 123 });

  // @ts-expect-error - wrong type: boolean not number
  items.filter({ getCount: true });

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
