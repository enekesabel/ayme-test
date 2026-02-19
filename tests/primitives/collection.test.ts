import { test, expect } from '@playwright/test';
import { State } from '../../src/primitives/state';
import { Collection } from '../../src/primitives/collection';

interface Item {
  getText: ReturnType<typeof State<string>>;
  isCompleted: ReturnType<typeof State<boolean>>;
}

function createItem(text: string, completed: boolean): Item {
  return {
    getText: State(async () => text),
    isCompleted: State(async () => completed),
  };
}

test.describe('Collection', () => {
  const items = [
    createItem('Buy milk', false),
    createItem('Write tests', true),
    createItem('Deploy app', false),
    createItem('Review PR', true),
  ];

  const collection = Collection.create<Item>(async () => items);

  test('.all() returns all items', async () => {
    const all = await collection.all();
    expect(all.length).toBe(4);
  });

  test('.count() returns item count', async () => {
    expect(await collection.count()).toBe(4);
  });

  test('.first() returns first item', async () => {
    const first = await collection.first();
    expect(first).toBeTruthy();
    expect(await first!.getText()).toBe('Buy milk');
  });

  test('.last() returns last item', async () => {
    const last = await collection.last();
    expect(last).toBeTruthy();
    expect(await last!.getText()).toBe('Review PR');
  });

  test('.at() returns item by index', async () => {
    const second = await collection.at(1);
    expect(second).toBeTruthy();
    expect(await second!.getText()).toBe('Write tests');
  });

  test('.at() returns undefined for out-of-bounds', async () => {
    expect(await collection.at(99)).toBeUndefined();
  });

  test('.filter() by exact value', async () => {
    const completed = collection.filter({ isCompleted: true });
    const all = await completed.all();
    expect(all.length).toBe(2);

    const texts = await Promise.all(all.map(i => i.getText()));
    expect(texts).toEqual(['Write tests', 'Review PR']);
  });

  test('.filter() by predicate', async () => {
    const longNames = collection.filter({
      getText: ((t: string) => t.length > 8) as (v: unknown) => boolean,
    });
    const all = await longNames.all();
    expect(all.length).toBe(3);
  });

  test('.filter() chaining', async () => {
    const completedLong = collection
      .filter({ isCompleted: true })
      .filter({
        getText: ((t: string) => t.length > 9) as (v: unknown) => boolean,
      });
    const all = await completedLong.all();
    expect(all.length).toBe(1);
    expect(await all[0]!.getText()).toBe('Write tests');
  });

  test('.find() returns first match', async () => {
    const found = await collection.find({ getText: 'Deploy app' });
    expect(found).toBeTruthy();
    expect(await found!.isCompleted()).toBe(false);
  });

  test('.find() returns undefined when no match', async () => {
    const found = await collection.find({ getText: 'nonexistent' });
    expect(found).toBeUndefined();
  });

  test('.find() with multiple conditions', async () => {
    const found = await collection.find({
      isCompleted: true,
      getText: ((t: string) => t.includes('Review')) as (v: unknown) => boolean,
    });
    expect(found).toBeTruthy();
    expect(await found!.getText()).toBe('Review PR');
  });
});
