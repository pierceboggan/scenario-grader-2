import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  noExternal: [],
  shims: true,
  minify: false,
  treeshake: false,
  banner: {
    js: `import { createRequire } from 'module';
const require = createRequire(import.meta.url);`
  },
});
