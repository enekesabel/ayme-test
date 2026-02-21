import { PageFragment } from './PageFragment';

type DriverOf<T> = T extends PageFragment<infer Driver, any> ? Driver : never;
type LocatorOf<T> = T extends PageFragment<any, infer Locator> ? Locator : never;

type AdapterResult<T> = {
  PageObject: abstract new (driver: DriverOf<T>) => T;
  PageComponent: abstract new (rootLocator: LocatorOf<T>, driver?: DriverOf<T>) => T & { readonly rootLocator: LocatorOf<T> };
};

/**
 * Build adapter-specific PageObject/PageComponent classes from a concrete PageFragment.
 *
 * If the fragment class provides a static `driverFromLocator(locator)` method,
 * the generated PageComponent can be constructed with `(rootLocator)` only.
 * Otherwise, pass `(rootLocator, driver)`.
 */
export function createPomAdapter<T extends object>(
  Fragment: { prototype: T }
): AdapterResult<T> {
  type Driver = DriverOf<T>;
  type Locator = LocatorOf<T>;

  const Base = Fragment as unknown as abstract new (driver: Driver) => object;
  const maybe = Fragment as unknown as {
    driverFromLocator?: (locator: Locator) => Driver;
  };

  const AdapterPageObject = class extends Base {
    constructor(driver: Driver) {
      super(driver);
    }
  } as unknown as AdapterResult<T>['PageObject'];

  const AdapterPageComponent = class extends Base {
    constructor(readonly rootLocator: Locator, driver?: Driver) {
      const resolvedDriver = driver ?? maybe.driverFromLocator?.(rootLocator);
      if (resolvedDriver === undefined) {
        throw new Error(
          'Driver is required for PageComponent when adapter fragment does not define static driverFromLocator(locator).'
        );
      }
      super(resolvedDriver);
    }
  } as unknown as AdapterResult<T>['PageComponent'];

  return {
    PageObject: AdapterPageObject,
    PageComponent: AdapterPageComponent,
  };
}
