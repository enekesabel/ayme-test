import type { Locator } from '@playwright/test';
import { PageObject, PageComponent } from '../../../src/playwright/pom';

// ═══════════════════════════════════════════════════════════════════
// Test fixtures — this.Locators() API
// ═══════════════════════════════════════════════════════════════════

class Widget extends PageComponent {
  locators = this.Locators({
    input: this.root.locator('input'),
    label: this.root.locator('label'),
    clearButton: this.root.locator('.clear'),
  });

  value = this.State(async () => this.locators.input.inputValue());
}

class SimpleComponent extends PageComponent {
  isVisible = this.State(async () => this.locators.root.isVisible());
}

class Dashboard extends PageObject {
  locators = this.Locators({
    sidebar: this.page.locator('.sidebar'),
    mainContent: this.page.locator('.main'),
  });
}

// ═══════════════════════════════════════════════════════════════════
// 1. Typed locator access — known keys resolve to Locator
// ═══════════════════════════════════════════════════════════════════

function testTypedAccess(w: Widget, d: Dashboard) {
  const input: Locator = w.locators.input;
  const label: Locator = w.locators.label;
  const clearButton: Locator = w.locators.clearButton;
  const root: Locator = w.locators.root;

  const sidebar: Locator = d.locators.sidebar;
  const mainContent: Locator = d.locators.mainContent;

  void input; void label; void clearButton; void root;
  void sidebar; void mainContent;
}

// ═══════════════════════════════════════════════════════════════════
// 2. Invalid locator keys — should be type errors
// ═══════════════════════════════════════════════════════════════════

function testInvalidKeys(w: Widget, d: Dashboard) {
  // @ts-expect-error — 'nonExistent' is not a key in Widget's locators
  const _a = w.locators.nonExistent;

  // @ts-expect-error — 'footer' is not a key in Dashboard's locators
  const _b = d.locators.footer;

  void _a; void _b;
}

// ═══════════════════════════════════════════════════════════════════
// 3. PageComponent has root in locators (auto-included)
// ═══════════════════════════════════════════════════════════════════

function testRootOnComponent(w: Widget, s: SimpleComponent) {
  const root1: Locator = w.locators.root;
  const root2: Locator = s.locators.root;
  void root1; void root2;
}

// ═══════════════════════════════════════════════════════════════════
// 4. PageObject does NOT have root in locators
// ═══════════════════════════════════════════════════════════════════

function testNoRootOnPageObject(d: Dashboard) {
  // @ts-expect-error — Dashboard doesn't have root
  const _r = d.locators.root;
  void _r;
}

// ═══════════════════════════════════════════════════════════════════
// 5. States on components use typed locators correctly
// ═══════════════════════════════════════════════════════════════════

async function testStatesWithLocators(w: Widget, s: SimpleComponent) {
  const val: string = await w.value();
  const vis: boolean = await s.isVisible();
  void val; void vis;
}

export {};
