import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Generous ceilings. The command-runner suite spawns a real node subprocess;
    // under a full-suite parallel run (many workers each launching node) that
    // launch can be starved of CPU, so a tighter budget timed out intermittently
    // on green code. A larger ceiling only tolerates a slow/loaded runner — a
    // genuine hang still fails — so it cannot mask a real bug. Kept above the
    // per-subprocess budget the runner tests widen to, so the child's own budget
    // (not the vitest ceiling) is what guards a true hang.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      exclude: ['node_modules/', 'tests/', '**/*.test.ts', 'src/index.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
