import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/primitives/index.ts',
    'src/playwright/pom/index.ts',
    'src/playwright/index.ts',
    'src/playwright/reporter.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  minify: false,
  external: ['@playwright/test'],
});
