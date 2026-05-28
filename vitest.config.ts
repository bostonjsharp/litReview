import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: [],
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    // Integration tests share a single Neon test database and each resets its
    // schema in beforeAll, so test files must run sequentially, not in parallel.
    fileParallelism: false,
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
