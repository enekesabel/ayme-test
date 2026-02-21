import { test as base, expect as playwrightExpect } from '@playwright/test';
import type { PageFragment } from './pom';
import type { StateFunction } from '../primitives/state';
import type { StateKeys } from '../primitives/types';
import { waitFor } from '../primitives/wait';

// ============ Types ============

/**
 * Maps State keys to their resolved return types or predicates.
 *
 * @example
 * ```typescript
 * // Exact value match
 * { isCompleted: true }
 *
 * // Predicate function
 * { getText: (text) => text.length > 10 }
 *
 * // Mixed
 * { isCompleted: true, getText: (text) => text.includes('urgent') }
 * ```
 */
export type ToHaveStateExpectations<T> = {
  [K in StateKeys<T>]?: T[K] extends StateFunction<infer R>
    ? R | ((value: R) => boolean)
    : never;
};

/**
 * Options for toHaveState matcher.
 */
export interface ToHaveStateOptions {
  /**
   * Maximum time to wait in milliseconds. Defaults to 5000ms.
   */
  timeout?: number;
  /**
   * Time in milliseconds that all expectations must remain true before resolving.
   */
  stableFor?: number;
}

// ============ Extend Playwright's expect ============

playwrightExpect.extend({
  /**
   * Custom matcher that polls states until all expectations are met.
   * Uses AND logic - all states must match simultaneously.
   *
   * Accepts an object of state expectations keyed by state property names.
   */
  async toHaveState(
    received: PageFragment,
    expectations: ToHaveStateExpectations<PageFragment>,
    options?: ToHaveStateOptions
  ) {
    const entries = Object.entries(expectations ?? {});
    const componentName = received.constructor.name;

    if (entries.length === 0) {
      return {
        pass: true,
        message: () => 'No state expectations provided',
      };
    }

    const normalizedExpectations: Array<[StateFunction<unknown>, unknown]> = [];
    for (const [key, expected] of entries) {
      const state = received[key as keyof PageFragment];
      if (typeof state !== 'function') {
        throw new Error(`State "${key}" is not a valid state function on ${componentName}`);
      }
      normalizedExpectations.push([state as StateFunction<unknown>, expected]);
    }

    try {
      await waitFor(normalizedExpectations, {
        timeout: options?.timeout,
        stableFor: options?.stableFor,
      });

      // All assertions passed
      return {
        pass: true,
        message: () => `Expected ${componentName} not to have the specified state`,
      };
    } catch (error) {
      // Timeout or assertion failure
      return {
        pass: false,
        message: () => {
          // Include component name and original error for context
          const errorMessage = error instanceof Error ? error.message : String(error);
          return `Expected ${componentName} to have state:\n${errorMessage}`;
        },
      };
    }
  },
});

// ============ Type Declarations ============

/**
 * Restricted matchers for PageFragments.
 * Exposes toHaveState, existence matchers, and not modifier.
 */
export interface PageFragmentMatchers<T extends PageFragment> {
  /**
   * Asserts that a PageFragment's states match the expected values.
   * Polls until all states match or timeout is reached.
   *
   * @param expectations - Object of state expectations keyed by state properties
   * @param options - Options including timeout and stability
   *
   * @example
   * ```typescript
   * // Single state
   * await expect(item).toHaveState({ isCompleted: true });
   *
   * // Multiple states
   * await expect(item).toHaveState({
   *   isCompleted: true,
   *   getText: 'hello',
   * });
   *
   * // With predicate
   * await expect(todoPage).toHaveState({ itemCount: n => n > 5 });
   *
   * // With stability requirement
   * await expect(todoPage).toHaveState({ isReady: true }, { stableFor: 250 });
   * ```
   */
  toHaveState(
    expectations: ToHaveStateExpectations<T>,
    options?: ToHaveStateOptions
  ): Promise<void>;

  // Existence matchers - useful for optional PageFragments
  /** Asserts that the value is not undefined. */
  toBeDefined(): void;
  /** Asserts that the value is undefined. */
  toBeUndefined(): void;
  /** Asserts that the value is truthy. */
  toBeTruthy(): void;
  /** Asserts that the value is falsy. */
  toBeFalsy(): void;
  /** Asserts that the value is null. */
  toBeNull(): void;

  /**
   * Negation modifier for asserting state is NOT a value.
   *
   * @example
   * ```typescript
   * await expect(item).not.toHaveState({ isCompleted: true });
   * await expect(item).not.toBeUndefined();
   * ```
   */
  not: PageFragmentMatchers<T>;
}

// Note: We intentionally do NOT augment Playwright's global namespace.
// This ensures users who don't import our expect don't get unexpected toHaveState.
// Only users who import expect from @ayde/test will have access to toHaveState.

// ============ Exports ============

/**
 * Extended test object from Playwright.
 */
export const test = base;

/**
 * Custom call signature for expect.
 * Overrides Playwright's default to provide restricted matchers for PageFragments.
 */
interface ExpectCallSignature {
  /**
   * When passed a PageFragment, returns only toHaveState and not (type-safe).
   */
  <T extends PageFragment>(actual: T): PageFragmentMatchers<T>;

  /**
   * When passed anything else, returns standard Playwright matchers.
   */
  <T>(actual: T): ReturnType<typeof playwrightExpect<T>>;
}

/**
 * Extended expect type.
 * Combines our custom call signature with Playwright's static methods (poll, extend, soft, configure).
 */
export type ExtendedExpect = ExpectCallSignature & Omit<typeof playwrightExpect, never>;

/**
 * Extended expect function.
 *
 * - When passed a PageFragment: returns only toHaveState and not (type-safe)
 * - When passed anything else: returns standard Playwright matchers
 * - Includes expect.poll, expect.soft, expect.extend, etc.
 *
 * @example
 * ```typescript
 * // PageFragment - only toHaveState available
 * await expect(item).toHaveState({ isCompleted: true });
 * await expect(item).not.toHaveState({ isCompleted: true });
 *
 * // Locator - normal Playwright matchers
 * await expect(locator).toBeVisible();
 *
 * // Values - normal Playwright matchers
 * await expect(5).toBe(5);
 *
 * // Poll for auto-retry
 * await expect.poll(item.isCompleted).toBe(true);
 * ```
 */
export const expect: ExtendedExpect = playwrightExpect as unknown as ExtendedExpect;
