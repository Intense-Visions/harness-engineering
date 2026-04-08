# Test Vitest Config

> Configure Vitest with workspaces, environments, coverage, and TypeScript integration

## When to Use

- Setting up Vitest in a new or existing project
- Configuring test environments (node, jsdom, happy-dom)
- Setting up workspaces for monorepo testing
- Integrating coverage, globals, and TypeScript paths

## Instructions

1. **Basic configuration:**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'e2e'],
    setupFiles: ['./test/setup.ts'],
    testTimeout: 10_000,
  },
});
```

2. **Share config with Vite** (if already using Vite):

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
  },
});
```

3. **Environment per file** using comments or config:

```typescript
// At the top of a test file:
// @vitest-environment jsdom

// Or in config, per glob pattern:
test: {
  environmentMatchGlobs: [
    ['src/components/**', 'jsdom'],
    ['src/services/**', 'node'],
  ],
},
```

4. **Workspace configuration** for monorepos:

```typescript
// vitest.workspace.ts
export default [
  'packages/*/vitest.config.ts',
  // Or inline:
  {
    test: {
      name: 'unit',
      include: ['src/**/*.test.ts'],
      environment: 'node',
    },
  },
  {
    test: {
      name: 'components',
      include: ['src/**/*.test.tsx'],
      environment: 'jsdom',
    },
  },
];
```

5. **Coverage configuration:**

```typescript
test: {
  coverage: {
    provider: 'v8',
    reporter: ['text', 'html', 'lcov'],
    include: ['src/**/*.ts'],
    exclude: ['src/**/*.test.ts', 'src/**/*.d.ts'],
    thresholds: {
      branches: 80,
      functions: 80,
      lines: 80,
    },
  },
},
```

6. **Path aliases** — sync with tsconfig:

```typescript
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // ...
  },
});
```

7. **Setup files** for global test configuration:

```typescript
// test/setup.ts
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
```

8. **Type support** — add vitest types to tsconfig:

```json
{
  "compilerOptions": {
    "types": ["vitest/globals"]
  }
}
```

9. **Parallel execution** and pooling:

```typescript
test: {
  pool: 'forks',       // 'threads' | 'forks' | 'vmThreads'
  poolOptions: {
    forks: { maxForks: 4 },
  },
  fileParallelism: true, // Run test files in parallel
},
```

10. **Snapshot configuration:**

```typescript
test: {
  snapshotFormat: {
    printBasicPrototype: false,
  },
  resolveSnapshotPath: (testPath, snapExtension) =>
    testPath.replace('src/', '__snapshots__/') + snapExtension,
},
```

## Details

Vitest is a Vite-native test framework that shares Vite's configuration, plugins, and transform pipeline. This means your tests use the same module resolution, path aliases, and transforms as your application code.

**Environment options:**

- `node` — Node.js runtime. For services, utilities, API tests
- `jsdom` — Browser-like DOM via jsdom. For React/Svelte/Vue component tests
- `happy-dom` — Faster alternative to jsdom with more Web API support
- `edge-runtime` — Cloudflare Workers/Vercel Edge runtime simulation

**`globals: true`** makes `describe`, `it`, `expect`, `vi` available without imports. Cleaner test files but requires TypeScript types configuration.

**Pool options:**

- `threads` (default) — worker threads, shared memory, fastest for CPU-bound tests
- `forks` — child processes, full isolation, best for tests with global state leaks
- `vmThreads` — VM contexts, lighter than forks, good middle ground

**Performance tips:**

- Use `pool: 'threads'` for fastest execution
- Set `fileParallelism: true` to run files in parallel
- Use `--reporter=dot` in CI for minimal output
- Exclude unnecessary files from test discovery
- Use `--changed` flag to run only tests affected by changed files

## Source

https://vitest.dev/config/
