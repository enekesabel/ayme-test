import { defineConfig, devices, test, expect } from '../src';
import type { Reporter } from '../src/reporter';

const config = defineConfig({
  use: { ...devices['Desktop Chrome'] },
});

test('playwright compatibility exports are available', async ({ page }) => {
  await page.goto('about:blank');
  await expect(page).toHaveURL('about:blank');
});

void config;
const _reporterTypeCheck: Reporter | undefined = undefined;
void _reporterTypeCheck;
