import { Page, Locator, test, expect as playwrightExpect } from '@playwright/test';

export * from '@playwright/test';
export { default } from '@playwright/test';

// ============ Action Parameter Logging ============

/**
 * Extracts parameter names from a function's source code.
 * Works with arrow functions and regular functions.
 *
 * @internal
 */
function extractParamNames(fn: Function): string[] {
  const fnStr = fn.toString();

  // Match arrow function params: (a, b) => or single param: a =>
  const arrowMatch = fnStr.match(/^\s*(?:async\s+)?(?:\(([^)]*)\)|(\w+))\s*=>/);
  // Match regular function params: function(a, b) or function name(a, b)
  const funcMatch = fnStr.match(/^\s*(?:async\s+)?function\s*\w*\s*\(([^)]*)\)/);

  const paramsStr = arrowMatch?.[1] ?? arrowMatch?.[2] ?? funcMatch?.[1] ?? '';
  if (!paramsStr.trim()) return [];

  return paramsStr.split(',').map(p => {
    // Remove type annotations (: string), defaults (= 'foo'), and trim
    const cleaned = p.trim().split(/[=:]/)[0]?.trim() ?? '';
    if (cleaned.startsWith('{')) return '{...}';
    if (cleaned.startsWith('[')) return '[...]';
    return cleaned;
  }).filter(Boolean);
}

/**
 * Formats a value for display in action logs.
 * Truncates long values to keep logs readable.
 *
 * @internal
 */
function formatValue(value: unknown, maxLength = 50): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') {
    if (value.length > maxLength) {
      return `"${value.slice(0, maxLength)}..."`;
    }
    return `"${value}"`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.length > 3) {
      return `[${value.slice(0, 3).map(v => formatValue(v, 20)).join(', ')}, ...]`;
    }
    return `[${value.map(v => formatValue(v, 20)).join(', ')}]`;
  }
  if (typeof value === 'object') {
    try {
      const str = JSON.stringify(value);
      if (str.length > maxLength) {
        return str.slice(0, maxLength) + '...';
      }
      return str;
    } catch {
      // Handle circular references, BigInt, Symbol, etc.
      return '[Complex Object]';
    }
  }
  return String(value);
}

/**
 * Formats a value for error messages.
 * @internal
 */
function formatValueForMessage(value: unknown): string {
  return formatValue(value, 100);
}

/**
 * Formats action call with parameter names and values.
 *
 * @internal
 */
function formatActionCall(actionName: string, paramNames: string[], args: unknown[]): string {
  if (args.length === 0) return `${actionName}()`;

  const formattedArgs = paramNames.map((name, i) => {
    const value = args[i];
    return `${name}: ${formatValue(value)}`;
  }).join(', ');

  return `${actionName}(${formattedArgs})`;
}

// ============ State Branding ============

/**
 * Runtime symbol for identifying StateFunction instances.
 * @internal
 */
const StateBrandSymbol = Symbol('StateFunction');
const StateNameSymbol = Symbol('StateName');

/**
 * Type-level brand for StateFunction.
 * @internal
 */
declare const StateBrand: unique symbol;

/**
 * A branded function type representing a state query.
 * States are parameterless async functions that return a value.
 * The brand allows TypeScript to distinguish States from regular functions.
 */
export type StateFunction<R> = (() => Promise<R>) & {
  [StateBrand]: R;
  [StateBrandSymbol]: true;
  [StateNameSymbol]?: string;
  // Method syntax (not property) enables bivariant parameter checking
  waitFor(
    expected: R | ((value: R) => boolean),
    options?: WaitForStateOptions
  ): Promise<void>;
};

// ============ Scope ============

/**
 * Type for the Scope property that can reference parent classes.
 * Can be a string or a class reference.
 */
export type ScopeValue = string | (new (...args: any[]) => PageFragment);

/**
 * Resolves the scope for a class by recursively following Scope references.
 *
 * @param classWithScope - A class that may have a static Scope property
 * @returns The resolved scope string, or empty string if no scope
 *
 * @example
 * ```typescript
 * class Pages {
 *   static Scope = 'App';
 * }
 *
 * class TodoPage extends PageObject {
 *   static Scope = Pages;
 * }
 *
 * resolveScope(TodoPage) // Returns: "App.Pages"
 * ```
 */
function resolveScope(classWithScope: new (...args: any[]) => any): string {
  const scope = (classWithScope as any).Scope;

  if (!scope) {
    return '';
  }

  if (typeof scope === 'string') {
    return scope;
  }

  // It's a class reference - recursively resolve and append class name
  const parentScope = resolveScope(scope);
  const scopeName = scope.name;

  if (parentScope) {
    return `${parentScope}.${scopeName}`;
  }

  return scopeName;
}

// ============ Auto TestId Branding ============

/**
 * Runtime symbol for marking auto testId children.
 * Used internally to identify components created with auto testId.
 */
const AutoTestIdBrand = Symbol('AutoTestIdBrand');

/**
 * Branded type for components created with auto testId generation.
 * Used by TestIdOf<T> to extract only auto testId properties.
 */
export type AutoTestIdChild<T> = T & { [AutoTestIdBrand]: true };

// ============ Action Function ============

/**
 * Type for action functions - async functions that can be called with arguments.
 */
export type ActionFunction<Args extends any[], R> = (...args: Args) => Promise<R>;

// ============ Effect Types ============

/**
 * Callable snapshot interface for accessing previous state values.
 * Used in effect functions to access state before-values.
 *
 * @example
 * ```typescript
 * // No arg: returns previous value of current effect's state
 * [this.isCompleted, prev => !prev()]
 *
 * // With arg: returns previous value of specified state
 * [this.stateA, prev => prev(this.stateB)]
 * ```
 */
interface PrevSnapshot<CurrentT = unknown> {
  /** Returns the previous value of the current effect's state */
  (): CurrentT;
  /** Returns the previous value of the specified state */
  <T>(state: StateFunction<T>): T;
}

/**
 * Effect value: static value or function that computes expected value from snapshot.
 *
 * @example
 * ```typescript
 * // Static value
 * [this.isCompleted, true]
 *
 * // Function using prev() - no arg returns current state's value
 * [this.isCompleted, prev => !prev()]
 * [this.itemCount, prev => prev() + 1]
 *
 * // Cross-state effects - specify state explicitly
 * [this.stateA, prev => prev(this.stateB)]
 * ```
 */
export type EffectValue<T> = T | ((prev: PrevSnapshot<T>) => T);

/**
 * A single effect entry: a state function paired with its expected value.
 *
 * @example
 * ```typescript
 * [this.isCompleted, true]
 * [this.itemCount, prev => prev(this.itemCount) + 1]
 * ```
 */
export type EffectEntry<T> = readonly [StateFunction<T>, EffectValue<T>];

/**
 * Runtime type for effects - used internally.
 * Type safety is enforced via the effect() helper function.
 * @internal
 */
export type Effects = EffectEntry<unknown> | readonly EffectEntry<unknown>[];

/**
 * Validates a single effect entry: [StateFunction<T>, EffectValue<T>].
 * Returns the validated type or `never` if invalid.
 * @internal
 */
type ValidateEffect<T> = 
  T extends readonly [StateFunction<infer V>, infer Value]
    ? Value extends EffectValue<V>
      ? readonly [StateFunction<V>, EffectValue<V>]
      : never
    : never;

/**
 * Validates an array of effect entries using mapped tuple types.
 * Each element is independently validated against its state's type.
 * Supports any number of effects without needing explicit overloads.
 * @internal
 */
type ValidateEffects<T extends readonly unknown[]> = {
  [K in keyof T]: ValidateEffect<T[K]>
};

/**
 * Action definition for factory form.
 * Used when action needs arguments that effects depend on.
 *
 * @example
 * ```typescript
 * edit = this.Action((newText: string) => ({
 *   execute: async () => {
 *     await this.input.fill(newText);
 *   },
 *   effects: [this.getText, newText],
 * }));
 * ```
 */
export interface ActionDefinition<R> {
  execute: () => Promise<R>;
  effects: Effects;
}

// ============ Type Utilities ============

/**
 * Extracts keys of State properties from a type.
 * Used internally for collection filtering.
 * Excludes methods, functions, and other non-state properties.
 */
type StateKeys<T> = {
  [K in keyof T]: T[K] extends StateFunction<unknown> ? K
    : T[K] extends ActionFunction<unknown[], unknown> ? never
    : T[K] extends (...args: unknown[]) => unknown ? never
    : never;
}[keyof T];

/**
 * Maps State keys to their resolved return types or predicates.
 * Used for filter() and find() on collections.
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
export type FilterExpectations<T> = {
  [K in StateKeys<T>]?: T[K] extends StateFunction<infer R>
    ? R | ((value: R) => boolean)
    : never;
};

/**
 * Extracts property names that are auto testId children (created with this.Child() or this.ChildCollection()).
 */
type AutoTestIdKeys<T> = {
  [K in keyof T]: T[K] extends { [AutoTestIdBrand]: true } ? K : never;
}[keyof T];

/**
 * Internal utility: Extracts property names that are auto testId children.
 * Used by AllTestIds<T> to generate full testIds.
 */
type TestIdOf<T> = AutoTestIdKeys<T>;

/**
 * Looks up the class name from an exports object by matching the class constructor.
 *
 * @internal
 */
type ClassToName<Exports, Class> = {
  [K in keyof Exports]: Exports[K] extends Class ? K : never;
}[keyof Exports];

/**
 * Recursively resolves the scope for a class type.
 * Handles both string scopes and class reference scopes.
 *
 * @internal
 */
type ResolveScope<Exports, T> = T extends { Scope: infer S }
  ? S extends string
    ? S
    : S extends new (...args: any[]) => any
    ? ResolveScope<Exports, S> extends infer ParentScope
      ? ParentScope extends string
        ? ParentScope extends ''
          ? ClassToName<Exports, S> & string
          : `${ParentScope}.${ClassToName<Exports, S> & string}`
        : ClassToName<Exports, S> & string
      : never
    : never
  : '';

/**
 * Generates full testId string literals for all exported POM classes.
 * Combines scope, class names, and auto testId property names: `${Scope}.${ClassName}.${PropertyName}`.
 * Classes without auto testId children are automatically filtered out.
 *
 * @example
 * ```typescript
 * // In pages/index.ts
 * export class Pages {
 *   static Scope = 'App';
 * }
 *
 * export class TodoPage extends PageObject {
 *   static Scope = Pages;
 *   newTodoInput = this.Child(NewTodoInput);
 *   items = this.ChildCollection(TodoItem);
 * }
 *
 * export class TodoItem extends PageComponent {
 *   checkbox = this.Child(Checkbox);
 * }
 *
 * // Usage
 * import * as Pages from './pages';
 * type AllIds = AllTestIds<typeof Pages>;
 * // AllIds = "App.Pages.TodoPage.newTodoInput" | "App.Pages.TodoPage.items" | "TodoItem.checkbox" | ...
 *
 * const testId: AllIds = "App.Pages.TodoPage.newTodoInput"; // ✅ Type-safe
 * const badId: AllIds = "TodoPage.wrong"; // ❌ Type error
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AllTestIds<T extends Record<string, new (...args: any[]) => any>> = {
  [ClassName in keyof T]: T[ClassName] extends new (...args: any[]) => infer Instance
    ? TestIdOf<Instance> extends never
      ? never // Filter out classes with no auto testId children
      : ResolveScope<T, T[ClassName]> extends infer Scope
      ? Scope extends string
        ? {
            [K in TestIdOf<Instance>]: Scope extends ''
              ? `${ClassName & string}.${K & string}`
              : `${Scope}.${ClassName & string}.${K & string}`;
          }[TestIdOf<Instance>]
        : never
      : never
    : never;
}[keyof T];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPageNode = PageNode;

// ============ Internal Effect Helpers ============

/**
 * Checks if the first element of an array is a StateFunction (single effect)
 * or an array (multiple effects).
 *
 * @internal
 */
function isSingleEffect(effects: Effects): effects is EffectEntry<unknown> {
  if (!Array.isArray(effects) || effects.length === 0) {
    return false;
  }
  // If first element is a function with StateBrandSymbol, it's a single effect
  const first = effects[0];
  return typeof first === 'function' && StateBrandSymbol in first;
}

/**
 * Normalizes effects to an array of effect entries.
 *
 * @internal
 */
function normalizeEffects(effects: Effects): readonly EffectEntry<unknown>[] {
  if (isSingleEffect(effects)) {
    return [effects];
  }
  return effects as readonly EffectEntry<unknown>[];
}

/**
 * Captures the current values of all states in the effect entries.
 *
 * @internal
 */
async function captureSnapshot(
  effectEntries: readonly EffectEntry<unknown>[]
): Promise<Map<StateFunction<unknown>, unknown>> {
  const snapshot = new Map<StateFunction<unknown>, unknown>();

  for (const [state] of effectEntries) {
    if (!snapshot.has(state)) {
      snapshot.set(state, await state());
    }
  }

  return snapshot;
}

/**
 * Creates a PrevSnapshot function for a specific effect entry.
 * - No args: returns the current effect's state value
 * - With state arg: returns the specified state's value
 *
 * @internal
 */
function createPrevSnapshot<T>(
  snapshot: Map<StateFunction<unknown>, unknown>,
  currentState: StateFunction<T>
): PrevSnapshot<T> {
  // Create a function with overloads
  const prev = function<U>(state?: StateFunction<U>): T | U {
    if (state === undefined) {
      // No arg: return current state's value
      return snapshot.get(currentState) as T;
    }
    // With arg: return specified state's value
    if (!snapshot.has(state)) {
      throw new Error(
        'State not found in snapshot. Make sure to include all states you access via prev() in your effects array.'
      );
    }
    return snapshot.get(state) as U;
  };
  return prev as PrevSnapshot<T>;
}

/**
 * Computes expected values from effect entries and before-state snapshot.
 *
 * @internal
 */
function computeExpectations(
  effectEntries: readonly EffectEntry<unknown>[],
  beforeSnapshot: Map<StateFunction<unknown>, unknown>
): Array<[StateFunction<unknown>, unknown]> {
  const expectations: Array<[StateFunction<unknown>, unknown]> = [];

  for (const [state, effectValue] of effectEntries) {
    if (typeof effectValue === 'function') {
      // Create a prev function bound to this specific state
      const prev = createPrevSnapshot(beforeSnapshot, state);
      const expected = effectValue(prev);
      expectations.push([state, expected]);
    } else {
      expectations.push([state, effectValue]);
    }
  }

  return expectations;
}

/**
 * Options for waitForStates.
 */
export interface WaitForStatesOptions {
  /**
   * Maximum time to wait in milliseconds. Defaults to 5000ms.
   */
  timeout?: number;
  /**
   * Time in milliseconds that all expectations must remain true before resolving.
   */
  stableFor?: number;
}

/**
 * Options for waiting on a single state.
 */
export interface WaitForStateOptions {
  /**
   * Maximum time to wait in milliseconds. Defaults to 5000ms.
   */
  timeout?: number;
  /**
   * Require the state expectation to remain true for the specified duration.
   */
  stableFor?: number;
}

/**
 * Waits until all state expectations are met.
 * Uses Playwright's expect.toPass for auto-retry with proper error messages.
 *
 * @internal - Also exported for use by toHaveState matcher
 */
export async function waitForStates(
  expectations: ReadonlyArray<readonly [StateFunction<unknown>, unknown]>,
  options?: WaitForStatesOptions
): Promise<void> {
  if (expectations.length === 0) {
    return;
  }

  const timeout = options?.timeout ?? 5000;
  const stableFor = options?.stableFor ?? 0;
  let stableSince: number | null = null;

  await playwrightExpect(async () => {
    try {
      for (const [state, expected] of expectations) {
        const actual = await state();
        const stateName = state[StateNameSymbol];
        const stateLabel = stateName ? `State ${stateName}` : 'State';
        if (typeof expected === 'function') {
          // Predicate function
          playwrightExpect((expected as (value: unknown) => boolean)(actual), {
            message: `${stateLabel} predicate did not pass. Actual: ${formatValueForMessage(actual)}`
          }).toBe(true);
        } else {
          // Exact value
          playwrightExpect(actual, {
            message: `${stateLabel}: expected ${formatValueForMessage(expected)}, got ${formatValueForMessage(actual)}`
          }).toBe(expected);
        }
      }
    } catch (error) {
      stableSince = null;
      throw error;
    }

    if (stableFor > 0) {
      const now = Date.now();
      if (stableSince === null) {
        stableSince = now;
      }
      if (now - stableSince < stableFor) {
        throw new Error(`State expectations not stable for ${stableFor}ms`);
      }
    }
  }).toPass({ timeout });
}

// ============ Base Classes ============

/**
 * Base class for all page fragments.
 * A PageFragment has access to the Page and can define States and Actions.
 *
 */
export abstract class PageFragment {
  protected constructor(protected readonly page: Page) {}

  /**
   * Factory for creating child components.
   * 
   * Two modes:
   * - `this.Child(ComponentClass, locator)` - with custom locator
   * - `this.Child.withAutoTestId(ComponentClass)` - with auto-generated testId
   *
   * @example
   * ```typescript
   * class TodoItem extends PageComponent {
   *   // Custom locator (explicit)
   *   label = this.Child(PageElement, this.rootLocator.locator('label'));
   *   
   *   // Auto testId: "TodoItem.checkbox"
   *   checkbox = this.Child.withAutoTestId(Checkbox);
   * }
   * ```
   */
  protected readonly Child = Object.assign(
    // Main callable: requires locator
    <T extends PageNode>(
      ComponentClass: PageNodeConstructor<T>,
      locator: Locator
    ): T => {
      return new ComponentClass(locator);
    },
    // withAutoTestId method
    {
      withAutoTestId: <T extends PageNode>(
        ComponentClass: PageNodeConstructor<T>
      ): AutoTestIdChild<T> => {
        return this.createChildWithAutoTestId(ComponentClass) as AutoTestIdChild<T>;
      }
    }
  );

  /**
   * Creates a child component with automatic testId generation.
   * Uses a lazy proxy to discover the property name on first access.
   *
   * @internal
   */
  private createChildWithAutoTestId<T extends PageNode>(
    ComponentClass: PageNodeConstructor<T>
  ): T {
    // Capture 'this' in closure to avoid accessing it from proxy handler
    const instance = this;
    const ctor = instance.constructor as new (...args: any[]) => any;
    const scope = resolveScope(ctor);
    const className = ctor.name;

    // Cache for the real component instance once discovered
    let cachedInstance: T | null = null;
    let cachedPropertyName: string | null = null;

    const proxy = new Proxy({} as T, {
      get: (_target, prop) => {
        // If we've already discovered and cached the instance, use it
        if (cachedInstance !== null) {
          return (cachedInstance as any)[prop];
        }

        // Discover which property on the captured instance holds this proxy
        if (cachedPropertyName === null) {
          // Use Reflect to avoid triggering getters/proxies
          for (const key of Reflect.ownKeys(instance)) {
            if (key === prop) continue; // Skip current property to prevent recursion

            const descriptor = Reflect.getOwnPropertyDescriptor(instance, key);
            if (descriptor && 'value' in descriptor && descriptor.value === proxy) {
              cachedPropertyName = String(key);
              break;
            }
          }

          if (cachedPropertyName === null) {
            throw new Error(
              `Failed to discover property name for ${ComponentClass.name}. ` +
              `Make sure you're assigning the result of this.Child() to a class property.`
            );
          }

          // Generate testId and create the real component
          const testId = scope
            ? `${scope}.${className}.${cachedPropertyName}`
            : `${className}.${cachedPropertyName}`;
          const hostLocator = (instance as any).rootLocator || instance.page;
          const locator = hostLocator.getByTestId(testId);

          cachedInstance = new ComponentClass(locator);
          (cachedInstance as any)[AutoTestIdBrand] = true;
          (instance as any)[cachedPropertyName] = cachedInstance;
        }

        return (cachedInstance as any)[prop];
      }
    });

    return proxy;
  }

  /**
   * Factory for creating child component collections.
   * 
   * Two modes:
   * - `this.ChildCollection(ComponentClass, locator)` - with custom locator
   * - `this.ChildCollection.withAutoTestId(ComponentClass)` - with auto-generated testId
   * 
   * @example
   * ```typescript
   * class TodoPage extends PageObject {
   *   // Custom locator (explicit)
   *   buttons = this.ChildCollection(Button, this.page.locator('.btn'));
   *   
   *   // Auto testId: "TodoPage.items"
   *   items = this.ChildCollection.withAutoTestId(TodoItem);
   * }
   * ```
   */
  protected readonly ChildCollection = Object.assign(
    // Main callable: requires locator
    <T extends PageNode>(
      ComponentClass: PageNodeConstructor<T>,
      locator: Locator
    ): PageNodeCollection<T> => {
      return PageNodeCollection.create(ComponentClass, locator);
    },
    // withAutoTestId method
    {
      withAutoTestId: <T extends PageNode>(
        ComponentClass: PageNodeConstructor<T>
      ): AutoTestIdChild<PageNodeCollection<T>> => {
        return this.createChildCollectionWithAutoTestId(ComponentClass) as AutoTestIdChild<PageNodeCollection<T>>;
      }
    }
  );

  /**
   * Creates a child collection with automatic testId generation.
   * Uses a lazy proxy to discover the property name on first access.
   *
   * @internal
   */
  private createChildCollectionWithAutoTestId<T extends PageNode>(
    ComponentClass: PageNodeConstructor<T>
  ): PageNodeCollection<T> {
    // Capture 'this' in closure to avoid accessing it from proxy handler
    const instance = this;
    const ctor = instance.constructor as new (...args: any[]) => any;
    const scope = resolveScope(ctor);
    const className = ctor.name;

    // Cache for the real collection instance once discovered
    let cachedCollection: PageNodeCollection<T> | null = null;
    let cachedPropertyName: string | null = null;

    const proxy = new Proxy({} as PageNodeCollection<T>, {
      get: (_target, prop) => {
        // If we've already discovered and cached the collection, use it
        if (cachedCollection !== null) {
          return (cachedCollection as any)[prop];
        }

        // Discover which property on the captured instance holds this proxy
        if (cachedPropertyName === null) {
          // Use Reflect to avoid triggering getters/proxies
          for (const key of Reflect.ownKeys(instance)) {
            if (key === prop) continue; // Skip current property to prevent recursion

            const descriptor = Reflect.getOwnPropertyDescriptor(instance, key);
            if (descriptor && 'value' in descriptor && descriptor.value === proxy) {
              cachedPropertyName = String(key);
              break;
            }
          }

          if (cachedPropertyName === null) {
            throw new Error(
              `Failed to discover property name for ${ComponentClass.name} collection. ` +
              `Make sure you're assigning the result of this.ChildCollection() to a class property.`
            );
          }

          // Generate testId and create the real collection
          const testId = scope
            ? `${scope}.${className}.${cachedPropertyName}`
            : `${className}.${cachedPropertyName}`;
          const hostLocator = (instance as any).rootLocator || instance.page;
          const locator = hostLocator.getByTestId(testId);

          cachedCollection = PageNodeCollection.create(ComponentClass, locator);
          (cachedCollection as any)[AutoTestIdBrand] = true;
          (instance as any)[cachedPropertyName] = cachedCollection;
        }

        return (cachedCollection as any)[prop];
      }
    });

    return proxy;
  }

  /**
   * Creates an action function with declarative effects.
   *
   * **Simple form** (single effect):
   * ```typescript
   * toggle = this.Action(
   *   async () => this.checkbox.click(),
   *   [this.isCompleted, prev => !prev(this.isCompleted)]
   * );
   * ```
   *
   * **Multiple effects**:
   * ```typescript
   * addTodo = this.Action(
   *   async () => { ... },
   *   [
   *     [this.itemCount, prev => prev(this.itemCount) + 1],
   *     [this.isEmpty, false],
   *   ]
   * );
   * ```
   *
   * **Factory form** (when effects need action args):
   * ```typescript
   * edit = this.Action((newText: string) => ({
   *   execute: async () => {
   *     await this.input.fill(newText);
   *   },
   *   effects: [this.getText, newText],
   * }));
   * ```
   */
  /**
   * Simple form with effects: state reference paired with expected value.
   * Use the `effect()` or `effects()` helpers for compile-time type safety.
   * 
   * @example
   * ```typescript
 * import { effect, effects } from '@ayde/test';
   * 
   * // Single effect with type checking
   * toggle = this.Action(
   *   async () => this.checkbox.click(),
   *   effect(this.isCompleted, prev => !prev(this.isCompleted))
   * );
   * 
   * // Multiple effects
   * addTodo = this.Action(
   *   async () => { ... },
   *   effects(
   *     [this.itemCount, prev => prev(this.itemCount) + 1],
   *     [this.isEmpty, false]
   *   )
   * );
   * ```
   */
  protected Action<Args extends unknown[], R>(
    fn: (...args: Args) => Promise<R>,
    effects: Effects
  ): ActionFunction<Args, R>;

  /**
   * Factory form: args are available to both execute and effects via closure.
   */
  protected Action<Args extends unknown[], R>(
    factory: (...args: Args) => ActionDefinition<R>
  ): ActionFunction<Args, R>;

  protected Action<Args extends unknown[], R>(
    fnOrFactory: ((...args: Args) => Promise<R>) | ((...args: Args) => ActionDefinition<R>),
    effects?: Effects
  ): ActionFunction<Args, R> {
    // Cache for the discovered action name and parameter names
    let cachedActionName: string | null = null;
    let cachedParamNames: string[] | null = null;

    const wrapper = ((...args: Args): Promise<R> => {
      // Discover action name and param names on first call
      if (cachedActionName === null) {
        const className = this.constructor.name;
        for (const key of Object.keys(this)) {
          if ((this as Record<string, unknown>)[key] === wrapper) {
            cachedActionName = `${className}.${key}`;
            break;
          }
        }
        if (cachedActionName === null) {
          cachedActionName = `${className}.<unknown action>`;
        }
        cachedParamNames = extractParamNames(fnOrFactory);
      }

      const stepName = formatActionCall(cachedActionName, cachedParamNames!, args);

      return test.step(stepName, async () => {
        // Determine if we're using simple form or factory form
        let executeFn: () => Promise<R>;
        let effectsDef: Effects;

        if (effects !== undefined) {
          // Simple form: fn is the execute function, effects is provided
          executeFn = () => (fnOrFactory as (...args: Args) => Promise<R>).apply(this, args);
          effectsDef = effects;
        } else {
          // Factory form: call factory to get { execute, effects }
          const definition = (fnOrFactory as (...args: Args) => ActionDefinition<R>).apply(this, args);
          executeFn = definition.execute.bind(this);
          effectsDef = definition.effects;
        }

        // Normalize effects to array of entries
        const effectEntries = normalizeEffects(effectsDef);

        // If no effects, just execute and return
        if (effectEntries.length === 0) {
          return executeFn();
        }

        // Capture before-state for all effect states
        const beforeSnapshot = await captureSnapshot(effectEntries);

        // Execute the interaction
        const result = await executeFn();

        // Compute expected values and wait for them
        const expectations = computeExpectations(effectEntries, beforeSnapshot);
        await waitForStates(expectations);

        return result;
      });
    }) as ActionFunction<Args, R>;

    return wrapper;
  }

  /**
   * Creates a state function that queries a property of the component.
   * States are parameterless async functions that return a value.
   *
   * @param fn - The async function that queries the state
   * @returns A branded StateFunction for type-safe filtering and waiting
   *
   * @example
   * ```typescript
   * class TodoItem extends PageComponent {
   *   label = this.Child(PageElement, this.rootLocator.locator('label'));
   *   checkbox = this.Child(Checkbox, this.rootLocator.locator('.toggle'));
   *
   *   getText = this.State(async () => this.label.rootLocator.innerText());
   *   isCompleted = this.State(async () => this.checkbox.isChecked());
   * }
   * ```
   */
  protected State<R>(fn: () => Promise<R>): StateFunction<R> {
    let cachedStateName: string | null = null;
    const state = (async (): Promise<R> => {
      if (cachedStateName === null) {
        const className = this.constructor.name;
        for (const key of Object.keys(this)) {
          if ((this as Record<string, unknown>)[key] === state) {
            cachedStateName = `${className}.${key}`;
            Object.defineProperty(state, StateNameSymbol, {
              value: cachedStateName,
              configurable: true
            });
            break;
          }
        }
      }
      return fn();
    }) as StateFunction<R>;
    (state as any)[StateBrandSymbol] = true;
    const waitFor = (
      expected: R | ((value: R) => boolean),
      options?: WaitForStateOptions
    ): Promise<void> => {
      return waitForStates([[state, expected]], options);
    };
    (state as any).waitFor = waitFor;
    return state;
  }

  /**
   * Creates a type-safe effect entry for use with Action.
   * Supports both single and multiple effects.
   *
   * @example
   * ```typescript
   * // Single effect
   * toggle = this.Action(
   *   async () => this.checkbox.click(),
   *   this.Effect(this.isCompleted, prev => !prev())
   * );
   *
   * // Multiple effects
   * addTodo = this.Action(
   *   async () => { ... },
   *   this.Effect(
   *     [this.itemCount, prev => prev() + 1],
   *     [this.isEmpty, false]
   *   )
   * );
   * ```
   */
  // Single effect
  protected Effect<T>(
    state: StateFunction<T>,
    value: EffectValue<T>
  ): EffectEntry<T>;
  // 2 effects
  protected Effect<T1, T2>(
    e1: readonly [StateFunction<T1>, EffectValue<T1>],
    e2: readonly [StateFunction<T2>, EffectValue<T2>]
  ): [EffectEntry<T1>, EffectEntry<T2>];
  // 3 effects
  protected Effect<T1, T2, T3>(
    e1: readonly [StateFunction<T1>, EffectValue<T1>],
    e2: readonly [StateFunction<T2>, EffectValue<T2>],
    e3: readonly [StateFunction<T3>, EffectValue<T3>]
  ): [EffectEntry<T1>, EffectEntry<T2>, EffectEntry<T3>];
  // 4 effects
  protected Effect<T1, T2, T3, T4>(
    e1: readonly [StateFunction<T1>, EffectValue<T1>],
    e2: readonly [StateFunction<T2>, EffectValue<T2>],
    e3: readonly [StateFunction<T3>, EffectValue<T3>],
    e4: readonly [StateFunction<T4>, EffectValue<T4>]
  ): [EffectEntry<T1>, EffectEntry<T2>, EffectEntry<T3>, EffectEntry<T4>];
  // 5 effects
  protected Effect<T1, T2, T3, T4, T5>(
    e1: readonly [StateFunction<T1>, EffectValue<T1>],
    e2: readonly [StateFunction<T2>, EffectValue<T2>],
    e3: readonly [StateFunction<T3>, EffectValue<T3>],
    e4: readonly [StateFunction<T4>, EffectValue<T4>],
    e5: readonly [StateFunction<T5>, EffectValue<T5>]
  ): [EffectEntry<T1>, EffectEntry<T2>, EffectEntry<T3>, EffectEntry<T4>, EffectEntry<T5>];
  // 6+ effects: uses mapped type validation (prev requires explicit type)
  protected Effect<T extends readonly (readonly [StateFunction<any>, any])[]>(
    ...effects: T & ValidateEffects<T>
  ): T;
  // Implementation
  protected Effect(
    ...args: [StateFunction<unknown>, EffectValue<unknown>] | readonly (readonly [StateFunction<unknown>, unknown])[]
  ): EffectEntry<unknown> | EffectEntry<unknown>[] {
    // Check if first arg is a StateFunction (single effect) or array (multiple effects)
    if (typeof args[0] === 'function' && StateBrandSymbol in args[0]) {
      // Single effect: (state, value)
      return [args[0] as StateFunction<unknown>, args[1]] as const;
    }
    // Multiple effects: ([state, value], [state, value], ...)
    return args as EffectEntry<unknown>[];
  }
}

/**
 * Base class for page fragments rooted to a specific locator.
 * Use this for components and elements that have a root element.
 * 
 */
export abstract class PageNode extends PageFragment {
  constructor(readonly rootLocator: Locator) {
    super(rootLocator.page());
  }
}

/**
 * Represents a reusable UI component on a page.
 * Components are PageNodes that can be composed and reused.
 * 
 * @example
 * ```typescript
 * class Checkbox extends PageComponent {
 *   isChecked = this.State(async () => this.rootLocator.isChecked());
 *   
 *   toggle = this.Action(async () => {
 *     await this.rootLocator.click();
 *   });
 * }
 * ```
 */
export abstract class PageComponent extends PageNode {}

/**
 * Represents a full page in the application.
 * PageObjects own the entire page and coordinate components.
 * 
 * @example
 * ```typescript
 * class TodoPage extends PageObject {
 *   constructor(page: Page) {
 *     super(page);
 *   }
 *   
 *   // Define child elements and components
 *   newTodoInput = this.Child(NewTodoInput, this.page.locator('.new-todo'));
 *   items = this.ChildCollection(TodoItem, this.page.locator('.todo-list li'));
 *   
 *   // States delegate to child components
 *   itemCount = this.State(async () => this.items.count());
 *   
 *   // Actions use child components
 *   addTodo = this.Action(async (text: string) => {
 *     await this.newTodoInput.rootLocator.fill(text);
 *     await this.newTodoInput.rootLocator.press('Enter');
 *   });
 * }
 * ```
 */
export abstract class PageObject extends PageFragment {
  constructor(page: Page) {
    super(page);
  }
}

/**
 * Represents a single element on a page.
 * Use for wrapping individual elements with custom behavior.
 */
export class PageElement extends PageNode {}

// ============ Collection ============

type FilterPredicate<T> = (item: T) => Promise<boolean>;
type PageNodeConstructor<T extends AnyPageNode> = new (rootLocator: Locator) => T;

/**
 * A collection of PageNode components with filtering and querying capabilities.
 * Created via this.ChildCollection() method.
 */
export class PageNodeCollection<T extends AnyPageNode> {
  /** @internal */
  static create<T extends AnyPageNode>(
    ctor: PageNodeConstructor<T>,
    rootLocator: Locator
  ): PageNodeCollection<T> {
    return new PageNodeCollection(ctor, rootLocator);
  }

  private constructor(
    private readonly ctor: PageNodeConstructor<T>,
    private readonly rootLocator: Locator,
    private readonly filterPredicates?: FilterPredicate<T>[]
  ) {}

  /**
   * Filter the collection by state expectations.
   * Supports exact values or predicate functions.
   * Returns a new collection with the filter applied (chainable).
   * 
   * @example
   * ```typescript
   * // Exact value match
   * const completed = items.filter({ isCompleted: true });
   * 
   * // Predicate function
   * const longText = items.filter({ getText: (t) => t.length > 10 });
   * 
   * // Mixed
   * const urgentActive = items.filter({
   *   isCompleted: false,
   *   getText: (t) => t.includes('urgent')
   * });
   * 
   * // Chaining
   * const filtered = items
   *   .filter({ isCompleted: true })
   *   .filter({ isUrgent: true });
   * ```
   */
  filter(expectations: FilterExpectations<T>): PageNodeCollection<T> {
    const predicate: FilterPredicate<T> = async (item) => {
      for (const [key, expected] of Object.entries(expectations)) {
        const getter = (item as any)[key];
        if (typeof getter === 'function') {
          const actual = await getter.call(item);
          if (typeof expected === 'function') {
            // Predicate function
            if (!(expected as (v: unknown) => boolean)(actual)) {
              return false;
            }
          } else {
            // Exact value match
            if (actual !== expected) {
              return false;
            }
          }
        }
      }
      return true;
    };

    return new PageNodeCollection(
      this.ctor,
      this.rootLocator,
      [...(this.filterPredicates ?? []), predicate]
    );
  }

  /**
   * Get all items in the collection (after applying filters).
   */
  async all(): Promise<T[]> {
    const allItems = (await this.rootLocator.all()).map(
      locator => new this.ctor(locator)
    ) as T[];

    if (!this.filterPredicates?.length) {
      return allItems;
    }

    const filteredItems: T[] = [];
    for (const item of allItems) {
      const results = await Promise.all(
        this.filterPredicates.map(predicate => predicate(item))
      );
      if (results.every(keep => keep)) {
        filteredItems.push(item);
      }
    }
    return filteredItems;
  }

  /** Get the first item in the collection. */
  async first(): Promise<T | undefined> {
    const items = await this.all();
    return items[0];
  }

  /** Get the last item in the collection. */
  async last(): Promise<T | undefined> {
    const items = await this.all();
    return items[items.length - 1];
  }

  /** Get the number of items in the collection. */
  async count(): Promise<number> {
    return (await this.all()).length;
  }

  /** Get an item by index (0-based). */
  async at(index: number): Promise<T | undefined> {
    const items = await this.all();
    return items[index];
  }

  /**
   * Find the first item matching state expectations.
   * Supports exact values or predicate functions.
   * 
   * @example
   * ```typescript
   * // Exact value match
   * const milk = await items.find({ getText: 'Buy milk' });
   * 
   * // Predicate function
   * const longItem = await items.find({ getText: (t) => t.length > 20 });
   * 
   * // Multiple conditions
   * const urgentActive = await items.find({
   *   isCompleted: false,
   *   getText: (t) => t.includes('urgent')
   * });
   * ```
   */
  async find(expectations: FilterExpectations<T>): Promise<T | undefined> {
    const items = await this.all();
    for (const item of items) {
      let matches = true;
      for (const [key, expected] of Object.entries(expectations)) {
        const getter = (item as any)[key];
        if (typeof getter === 'function') {
          const actual = await getter.call(item);
          if (typeof expected === 'function') {
            // Predicate function
            if (!(expected as (v: unknown) => boolean)(actual)) {
              matches = false;
              break;
            }
          } else {
            // Exact value match
            if (actual !== expected) {
              matches = false;
              break;
            }
          }
        }
      }
      if (matches) {
        return item;
      }
    }
    return undefined;
  }
}

// Re-export Playwright types for convenience
export type { Page, Locator } from '@playwright/test';

// Re-export extended test and expect from fixtures
export { test, expect } from './fixtures';
export type { ToHaveStateExpectations, ToHaveStateOptions, PageFragmentMatchers } from './fixtures';
