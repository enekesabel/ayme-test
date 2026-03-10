import { PageFragment } from '../../src/pom-universal/createAdapter';
import { createAdapter } from '../../src/pom-universal/createAdapter';

// ═══════════════════════════════════════════════════════════════════
// Mock locator type
// ═══════════════════════════════════════════════════════════════════

type MockLocator = { selector: string; find(sel: string): MockLocator };
declare function mockLocator(sel: string): MockLocator;

// ═══════════════════════════════════════════════════════════════════
// Minimal adapter — NO locators override, NO extra plumbing
// ═══════════════════════════════════════════════════════════════════

abstract class MockFragment extends PageFragment<MockLocator> {}

const { PageObject, PageComponent } = createAdapter(MockFragment);

// ═══════════════════════════════════════════════════════════════════
// Consumer classes — this.Locators() API
// ═══════════════════════════════════════════════════════════════════

class Widget extends PageComponent {
  locators = this.Locators({
    input: this.root.find('input'),
    label: this.root.find('label'),
  });
}

class EmptyComponent extends PageComponent {}

class Dashboard extends PageObject {
  locators = this.Locators({
    sidebar: mockLocator('.sidebar'),
    main: mockLocator('.main'),
  });
}

// ═══════════════════════════════════════════════════════════════════
// CONTRACT 1: locators includes keys from this.Locators(), typed
// ═══════════════════════════════════════════════════════════════════

function testLocatorKeys(w: Widget, d: Dashboard) {
  const input: MockLocator = w.locators.input;
  const label: MockLocator = w.locators.label;
  const sidebar: MockLocator = d.locators.sidebar;
  const main: MockLocator = d.locators.main;
  void input; void label; void sidebar; void main;
}

// ═══════════════════════════════════════════════════════════════════
// CONTRACT 2: invalid keys are type errors
// ═══════════════════════════════════════════════════════════════════

function testInvalidKeys(w: Widget, d: Dashboard) {
  // @ts-expect-error — 'nonExistent' is not in Widget's locators
  const _a = w.locators.nonExistent;

  // @ts-expect-error — 'footer' is not in Dashboard's locators
  const _b = d.locators.footer;

  void _a; void _b;
}

// ═══════════════════════════════════════════════════════════════════
// CONTRACT 3: PageComponent.locators.root is typed as the locator type
// ═══════════════════════════════════════════════════════════════════

function testLocatorsRoot(w: Widget, e: EmptyComponent) {
  const widgetRoot: MockLocator = w.locators.root;
  const emptyRoot: MockLocator = e.locators.root;
  void widgetRoot; void emptyRoot;
}

// ═══════════════════════════════════════════════════════════════════
// CONTRACT 4: this.root is NOT accessible externally (protected)
// ═══════════════════════════════════════════════════════════════════

function testNoThisRoot(w: Widget) {
  // @ts-expect-error — root should not be a public property
  const _root = w.root;
  void _root;
}

// ═══════════════════════════════════════════════════════════════════
// CONTRACT 5: this.Locators() is NOT accessible externally (protected)
// ═══════════════════════════════════════════════════════════════════

function testNoExternalLocatorsHelper(w: Widget) {
  // @ts-expect-error — Locators() helper should be protected
  w.Locators({});
}

// ═══════════════════════════════════════════════════════════════════
// CONTRACT 6: PageObject locators do NOT include root
// ═══════════════════════════════════════════════════════════════════

function testNoRootOnPageObject(d: Dashboard) {
  // @ts-expect-error — Dashboard does not have root
  const _r = d.locators.root;
  void _r;
}

// ═══════════════════════════════════════════════════════════════════
// CONTRACT 7: constructor override (options bag) is accepted
// ═══════════════════════════════════════════════════════════════════

function testConstructorOverride() {
  const root = mockLocator('.root');
  const customInput = mockLocator('.custom-input');

  new Widget(root, undefined);
  new Widget({ root, input: customInput }, undefined);
  new Widget({ root, input: customInput, label: mockLocator('.custom-label') }, undefined);

  // @ts-expect-error — options bag must include root
  new Widget({ input: customInput }, undefined);
}

export {};
