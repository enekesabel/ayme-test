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
  items.filter(() => true);
  items.filter(async item => await item.isCompleted());

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
  const item4 = await items.find(async item => (await item.getCount()) > 10);

  // Return type should be TestItem | undefined
  const foundItem: TestItem | undefined = item1;
  const foundByPredicate: TestItem | undefined = item4;
}

async function testAsyncIteration() {
  for await (const item of items) {
    const iteratedItem: TestItem = item;
    void iteratedItem;
  }

  for await (const item of items.filter({ isCompleted: true })) {
    const text: string = await item.getText();
    void text;
  }
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

  // @ts-expect-error - predicate must return boolean
  items.filter(item => item.getText());
}

async function testInvalidFinds() {
  // @ts-expect-error - wrong type: string not boolean
  await items.find({ isCompleted: 'yes' });

  // @ts-expect-error - wrong type: number not string
  await items.find({ getText: 123 });

  // @ts-expect-error - unknown state key
  await items.find({ unknownState: 'value' });

  // @ts-expect-error - predicate must return boolean
  await items.find(async item => await item.getText());
}

export {};
