import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/reporter.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  minify: false,
  external: ['@playwright/test'],
});
