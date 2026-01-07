import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/*.integration.{test,spec}.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    testTimeout: 120000, // 2 minutes for integration tests
    hookTimeout: 60000,
    pool: 'forks', // Run in separate processes for isolation
    poolOptions: {
      forks: {
        singleFork: true, // Run sequentially
      },
    },
  },
});
