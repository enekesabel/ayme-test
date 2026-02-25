import { PageFragment } from './PageFragment';

type DriverOf<T> = T extends PageFragment<infer Driver, any> ? Driver : never;
type LocatorOf<T> = T extends PageFragment<any, infer Locator> ? Locator : never;

type AdapterResult<T> = {
  PageObject: abstract new (driver: DriverOf<T>) => T;
  PageComponent: abstract new (root: LocatorOf<T>, driver: DriverOf<T>) => T & { readonly root: LocatorOf<T> };
};

/**
 * Build adapter-specific PageObject/PageComponent classes from a concrete PageFragment.
 */
export function createPomAdapter<T extends object>(
  Fragment: { prototype: T }
): AdapterResult<T> {
  type Driver = DriverOf<T>;
  type Locator = LocatorOf<T>;

  const Base = Fragment as unknown as abstract new (driver: Driver) => object;

  const AdapterPageObject = class extends Base {
    constructor(driver: Driver) {
      super(driver);
    }
  } as unknown as AdapterResult<T>['PageObject'];

  const AdapterPageComponent = class extends Base {
    constructor(readonly root: Locator, driver: Driver) {
      super(driver);
    }
  } as unknown as AdapterResult<T>['PageComponent'];

  return {
    PageObject: AdapterPageObject,
    PageComponent: AdapterPageComponent,
  };
}
