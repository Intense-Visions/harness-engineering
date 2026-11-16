---
'@harness-engineering/core': patch
---

Coupling detector (`check-perf` and the `coupling` arch category) now resolves TypeScript ESM runtime-extension specifiers to their sources: `./foo.js` → `foo.ts`/`foo.tsx`, `./foo.mjs` → `foo.mts`, `./foo.cjs` → `foo.cts`. Before, every importer that wrote the extension `"module": "NodeNext"` requires was invisible, so `fanIn` stayed 0 and `couplingRatio` pinned to 1.00 in ESM projects (#2153).
