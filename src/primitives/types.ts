import type { StateFunction } from './state';

/**
 * Extracts keys of State properties from a type.
 * Excludes actions, methods, and other non-state properties.
 */
export type StateKeys<T> = {
  [K in keyof T]: K extends string
    ? T[K] extends StateFunction<unknown> ? K
      : T[K] extends (...args: unknown[]) => unknown ? never
      : never
    : never;
}[keyof T];

/**
 * Maps State keys to their resolved return types or predicates.
 * Used for filter() and find() on collections.
 */
export type FilterExpectations<T> = {
  [K in StateKeys<T>]?: T[K] extends StateFunction<infer R>
    ? R | ((value: R) => boolean)
    : never;
};
