import { defineConfig } from 'tsup';

export default defineConfig([
  // Library entry — consumed by the CLI's `harness burn` command.
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    outDir: 'dist',
    tsconfig: 'tsconfig.build.json',
  },
  // Hot-path binary. Rendered on every statusline repaint and after every
  // assistant turn, so it is built as a single self-contained file with NO
  // dependency on @harness-engineering/* — importing the CLI's module graph
  // costs ~0.85s per invocation against a ~0.11s budget. Guarded by
  // tests/bin-startup.test.ts, which fails if a harness import creeps in.
  {
    entry: ['src/bin/burn-hud.ts'],
    format: ['esm'],
    dts: false,
    outDir: 'dist/bin',
    // `.mjs`, not `.js`: this package ships CJS too, so it cannot set
    // `"type": "module"`, and Node would then have to detect-and-reparse the
    // binary on every launch — it says so itself via MODULE_TYPELESS_PACKAGE_JSON
    // ("This incurs a performance overhead"). Paying a reparse on the statusline
    // hot path is exactly what this binary exists to avoid.
    outExtension: () => ({ js: '.mjs' }),
    tsconfig: 'tsconfig.build.json',
    banner: { js: '#!/usr/bin/env node' },
  },
]);
