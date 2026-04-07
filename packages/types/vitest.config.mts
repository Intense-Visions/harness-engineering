import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['./vitest.global-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      // Keep existing coverage dir — combined with globalSetup pre-creation this
      // means the provider only needs to mkdir .tmp (not coverage/.tmp), reducing
      // the window for the ENOENT race on fast packages in parallel CI runs.
      clean: false,
    },
  },
});
