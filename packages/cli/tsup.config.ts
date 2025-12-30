import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  skipNodeModulesBundle: true,
  shims: true,
  minify: false,
  treeshake: false,
});
