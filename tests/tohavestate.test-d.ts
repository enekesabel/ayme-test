import { PageComponent, PageObject, expect } from '../src';

/**
 * Type tests for toHaveState custom matcher.
 * This file validates that:
 * - toHaveState accepts correct state references and value types
 * - toHaveState accepts predicates with correct types
 * - Only toHaveState and existence matchers are exposed for PageFragments
 */

// ============ Test Component with Various State Types ============

class TestComponent extends PageComponent {
  // States with different return types
  boolState = this.State(async () => true);
  numState = this.State(async () => 42);
  strState = this.State(async () => 'hello');

  // Non-state properties (should not be usable in toHaveState)
  someMethod() { return 'not a state'; }
}

class TestPage extends PageObject {
  constructor(page: any) {
    super(page);
  }

  itemCount = this.State(async () => 0);
  isLoading = this.State(async () => false);
  currentFilter = this.State(async () => 'all' as 'all' | 'active' | 'completed');
}

// ============ Valid toHaveState Calls - Should Compile ============

async function testValidToHaveState(comp: TestComponent) {
  // Single state - exact value
  await expect(comp).toHaveState({ boolState: true });
  await expect(comp).toHaveState({ boolState: false });
  await expect(comp).toHaveState({ numState: 42 });
  await expect(comp).toHaveState({ strState: 'hello' });

  // Single state - predicate
  await expect(comp).toHaveState({ boolState: (val: boolean) => val === true });
  await expect(comp).toHaveState({ numState: (n: number) => n > 0 });
  await expect(comp).toHaveState({ strState: (s: string) => s.length > 0 });

  // Multiple states (AND logic)
  await expect(comp).toHaveState({
    boolState: true,
    numState: 42,
  });

  await expect(comp).toHaveState({
    boolState: true,
    numState: (n: number) => n > 0,
    strState: 'hello',
  });
}

async function testValidToHaveStateWithOptions(comp: TestComponent) {
  // With timeout option
  await expect(comp).toHaveState({ boolState: true }, { timeout: 10000 });
  await expect(comp).toHaveState({ numState: (n: number) => n > 0 }, { timeout: 5000 });

  // Empty options object
  await expect(comp).toHaveState({ strState: 'hello' }, {});
}

async function testPageObjectToHaveState(page: TestPage) {
  // Valid calls on PageObject
  await expect(page).toHaveState({ itemCount: 5 });
  await expect(page).toHaveState({ itemCount: (n: number) => n > 0 });
  await expect(page).toHaveState({ isLoading: false });
  await expect(page).toHaveState({ currentFilter: 'active' });

  // Multiple states
  await expect(page).toHaveState({
    itemCount: 5,
    isLoading: false,
    currentFilter: 'all',
  });
}

// ============ Verify Only toHaveState and Existence Matchers Are Exposed ============

import type { PageFragmentMatchers } from '../src';

// Verify PageFragmentMatchers has the expected keys
type PageFragmentMatchersKeys = keyof PageFragmentMatchers<TestComponent>;
type ExpectedKeys = 'toHaveState' | 'toBeDefined' | 'toBeUndefined' | 'toBeTruthy' | 'toBeFalsy' | 'toBeNull' | 'not';

// Type assertion: keys should exactly equal ExpectedKeys
type _AssertExactKeys = PageFragmentMatchersKeys extends ExpectedKeys
  ? ExpectedKeys extends PageFragmentMatchersKeys
    ? true
    : never
  : never;
const _keysMatch: _AssertExactKeys = true;

// Verify toHaveState and existence matchers work
async function testAllowedMatchers(comp: TestComponent, page: TestPage) {
  await expect(comp).toHaveState({ boolState: true });
  await expect(comp).not.toHaveState({ boolState: true });
  await expect(page).toHaveState({ itemCount: 5 });
  await expect(page).not.toHaveState({ isLoading: true });

  // Existence matchers
  expect(comp).toBeDefined();
  expect(comp).not.toBeUndefined();
  expect(comp).toBeTruthy();
  expect(comp).not.toBeFalsy();
  expect(comp).not.toBeNull();
}

// Verify generic matchers are NOT available for PageFragments
async function testRestrictedMatchers(comp: TestComponent) {
  // @ts-expect-error - toBe is not available for PageFragment
  await expect(comp).toBe(comp);

  // @ts-expect-error - toEqual is not available for PageFragment
  await expect(comp).toEqual(comp);
}

async function testInvalidToHaveState(comp: TestComponent) {
  // @ts-expect-error - wrong type for boolState
  await expect(comp).toHaveState({ boolState: 'true' });

  // @ts-expect-error - predicate param type mismatch
  await expect(comp).toHaveState({ numState: (value: string) => value.length > 0 });

  // @ts-expect-error - unknown state key
  await expect(comp).toHaveState({ missingState: true });

  // @ts-expect-error - non-state property not allowed
  await expect(comp).toHaveState({ someMethod: 'not a state' });
}

export {};
