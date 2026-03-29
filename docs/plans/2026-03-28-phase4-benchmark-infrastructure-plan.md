# Plan: Phase 4 -- Benchmark Infrastructure

**Date:** 2026-03-28
**Spec:** docs/changes/ci-pipeline-hardening/proposal.md
**Estimated tasks:** 8
**Estimated time:** 30 minutes

## Goal

CI detects performance regressions in core validation and graph query hot paths by running Vitest benchmarks against checked-in baselines, failing the build when any benchmark's mean regresses more than 10%.

## Observable Truths (Acceptance Criteria)

1. When `pnpm bench` is run from the repo root, the system shall execute Vitest benchmarks in both `packages/core` and `packages/graph` and exit 0.
2. When `vitest bench` is run in `packages/core`, the system shall benchmark `validateConfig` (valid input), `validateConfig` (invalid input), `validateCommitMessage` (valid message), and `validateCommitMessage` (invalid message).
3. When `vitest bench` is run in `packages/graph`, the system shall benchmark `GraphStore.addNode`, `GraphStore.findNodes`, `ContextQL.execute` (depth-2 traversal), and `groupNodesByImpact` (100-node set).
4. When `node scripts/benchmark-check.mjs` is run, the system shall execute benchmarks for both packages, compare results against `benchmark-baselines.json`, and exit 0 if no regression exceeds 10%.
5. When `node scripts/benchmark-check.mjs --update` is run, the system shall write current benchmark values to `benchmark-baselines.json`.
6. If any benchmark's mean regresses more than 10% from baseline, then `node scripts/benchmark-check.mjs` shall exit 1 with a message identifying the regressed benchmark.
7. The file `benchmark-baselines.json` exists at the repo root with mean and p99 values for all 8 benchmarks.
8. The file `.github/workflows/benchmark.yml` exists and defines a `bench` job that runs `node scripts/benchmark-check.mjs` on pull requests to main.
9. The `turbo.json` pipeline contains a `bench` task that depends on `build` with no outputs.
10. `harness validate` passes after all tasks are complete.

## File Map

- CREATE `packages/core/benchmarks/validation.bench.ts`
- CREATE `packages/graph/benchmarks/queries.bench.ts`
- MODIFY `packages/core/package.json` (add `bench` script)
- MODIFY `packages/graph/package.json` (add `bench` script)
- MODIFY `packages/core/vitest.config.mts` (exclude benchmarks from test coverage)
- MODIFY `packages/graph/vitest.config.mts` (exclude benchmarks from test coverage)
- CREATE `scripts/benchmark-check.mjs`
- CREATE `benchmark-baselines.json`
- MODIFY `turbo.json` (add `bench` pipeline task)
- MODIFY `package.json` (add root `bench` script)
- CREATE `.github/workflows/benchmark.yml`

## Tasks

### Task 1: Add bench scripts to core and graph package.json

**Depends on:** none
**Files:** `packages/core/package.json`, `packages/graph/package.json`

1. In `packages/core/package.json`, add to `scripts`:
   ```json
   "bench": "vitest bench"
   ```
2. In `packages/graph/package.json`, add to `scripts`:
   ```json
   "bench": "vitest bench"
   ```
3. Run: `harness validate`
4. Commit: `ci(bench): add bench scripts to core and graph packages`

---

### Task 2: Exclude benchmark files from test coverage in vitest configs

**Depends on:** none
**Files:** `packages/core/vitest.config.mts`, `packages/graph/vitest.config.mts`

1. In `packages/core/vitest.config.mts`, add `'benchmarks/'` and `'**/*.bench.ts'` to the `coverage.exclude` array:
   ```typescript
   exclude: [
     'node_modules/',
     'tests/',
     'benchmarks/',
     '**/*.test.ts',
     '**/*.spec.ts',
     '**/*.bench.ts',
     'src/index.ts', // Re-exports
   ],
   ```
2. In `packages/graph/vitest.config.mts`, add `'benchmarks/'` and `'**/*.bench.ts'` to the `coverage.exclude` array:
   ```typescript
   exclude: ['node_modules/', 'tests/', 'benchmarks/', '**/*.test.ts', '**/*.bench.ts', 'src/index.ts'],
   ```
3. Run: `harness validate`
4. Commit: `ci(bench): exclude benchmark files from coverage reporting`

---

### Task 3: Create core validation benchmark file

**Depends on:** Task 1
**Files:** `packages/core/benchmarks/validation.bench.ts`

1. Create directory `packages/core/benchmarks/`.
2. Create `packages/core/benchmarks/validation.bench.ts`:

   ```typescript
   import { bench, describe } from 'vitest';
   import { z } from 'zod';
   import { validateConfig } from '../src/validation/config';
   import { validateCommitMessage } from '../src/validation/commit-message';

   // --- Fixtures ---

   const appConfigSchema = z.object({
     name: z.string(),
     version: z.string(),
     port: z.number(),
     database: z.object({
       host: z.string(),
       port: z.number(),
       name: z.string(),
     }),
     features: z.array(z.string()),
   });

   const validConfig = {
     name: 'my-app',
     version: '1.0.0',
     port: 3000,
     database: { host: 'localhost', port: 5432, name: 'mydb' },
     features: ['auth', 'logging', 'metrics'],
   };

   const invalidConfig = {
     name: 123,
     version: null,
     port: 'not-a-number',
   };

   const validCommitMsg = 'feat(core): add validation benchmarks';
   const invalidCommitMsg = 'this is not a conventional commit';

   // --- Benchmarks ---

   describe('validateConfig', () => {
     bench('valid config object', () => {
       validateConfig(validConfig, appConfigSchema);
     });

     bench('invalid config object', () => {
       validateConfig(invalidConfig, appConfigSchema);
     });
   });

   describe('validateCommitMessage', () => {
     bench('valid conventional commit', () => {
       validateCommitMessage(validCommitMsg, 'conventional');
     });

     bench('invalid commit message', () => {
       validateCommitMessage(invalidCommitMsg, 'conventional');
     });
   });
   ```

3. Run: `cd packages/core && npx vitest bench --run` to verify benchmarks execute.
4. Run: `harness validate`
5. Commit: `ci(bench): add core validation benchmarks`

---

### Task 4: Create graph queries benchmark file

**Depends on:** Task 1
**Files:** `packages/graph/benchmarks/queries.bench.ts`

1. Create directory `packages/graph/benchmarks/`.
2. Create `packages/graph/benchmarks/queries.bench.ts`:

   ```typescript
   import { bench, describe, beforeEach } from 'vitest';
   import { GraphStore } from '../src/store/GraphStore.js';
   import { ContextQL } from '../src/query/ContextQL.js';
   import { groupNodesByImpact } from '../src/query/groupImpact.js';
   import type { GraphNode, GraphEdge } from '../src/types.js';

   // --- Helpers ---

   const mkNode = (id: string, type: GraphNode['type'], name: string): GraphNode => ({
     id,
     type,
     name,
     metadata: {},
   });

   const mkEdge = (from: string, to: string, type: GraphEdge['type']): GraphEdge => ({
     from,
     to,
     type,
   });

   // --- Fixtures: build a graph with ~100 nodes ---

   function buildMediumGraph(): { store: GraphStore; nodeIds: string[] } {
     const store = new GraphStore();
     const nodeIds: string[] = [];

     // 10 modules, each with 5 files, each file with 1 function = 60 nodes
     for (let m = 0; m < 10; m++) {
       const moduleId = `module:mod${m}`;
       store.addNode(mkNode(moduleId, 'module', `mod${m}`));
       nodeIds.push(moduleId);

       for (let f = 0; f < 5; f++) {
         const fileId = `file:mod${m}/file${f}.ts`;
         store.addNode(mkNode(fileId, 'file', `file${f}.ts`));
         nodeIds.push(fileId);
         store.addEdge(mkEdge(moduleId, fileId, 'contains'));

         const fnId = `fn:mod${m}/file${f}/main`;
         store.addNode(mkNode(fnId, 'function', `main_${m}_${f}`));
         nodeIds.push(fnId);
         store.addEdge(mkEdge(fileId, fnId, 'contains'));
       }
     }

     // Cross-module imports: each module imports the next
     for (let m = 0; m < 9; m++) {
       store.addEdge(mkEdge(`file:mod${m}/file0.ts`, `file:mod${m + 1}/file0.ts`, 'imports'));
     }

     // Add some test_result and document nodes for groupNodesByImpact
     for (let t = 0; t < 10; t++) {
       const testId = `test:result${t}`;
       store.addNode(mkNode(testId, 'test_result', `test${t}`));
       nodeIds.push(testId);
       store.addEdge(mkEdge(testId, `fn:mod${t}/file0/main`, 'references'));
     }

     for (let d = 0; d < 5; d++) {
       const docId = `doc:adr${d}`;
       store.addNode(mkNode(docId, 'adr', `ADR-${d}`));
       nodeIds.push(docId);
       store.addEdge(mkEdge(docId, `file:mod${d}/file0.ts`, 'documents'));
     }

     return { store, nodeIds };
   }

   // --- Benchmarks ---

   let store: GraphStore;
   let cql: ContextQL;
   let allNodes: GraphNode[];

   beforeEach(() => {
     const graph = buildMediumGraph();
     store = graph.store;
     cql = new ContextQL(store);
     allNodes = store.findNodes({});
   });

   describe('GraphStore', () => {
     bench('addNode - single node', () => {
       store.addNode(mkNode(`bench:temp:${Math.random()}`, 'file', 'temp.ts'));
     });

     bench('findNodes - by type', () => {
       store.findNodes({ type: 'file' });
     });
   });

   describe('ContextQL', () => {
     bench('execute - depth 2 from module root', () => {
       cql.execute({
         rootNodeIds: ['module:mod0'],
         maxDepth: 2,
       });
     });
   });

   describe('groupNodesByImpact', () => {
     bench('categorize ~85 nodes', () => {
       groupNodesByImpact(allNodes, 'module:mod0');
     });
   });
   ```

3. Run: `cd packages/graph && npx vitest bench --run` to verify benchmarks execute.
4. Run: `harness validate`
5. Commit: `ci(bench): add graph query benchmarks`

---

### Task 5: Add bench to Turbo pipeline and root package.json

**Depends on:** none
**Files:** `turbo.json`, `package.json`

1. In `turbo.json`, add `bench` task to the `pipeline` object after the existing `test:coverage` entry:
   ```json
   "bench": {
     "dependsOn": ["build"],
     "outputs": []
   }
   ```
2. In root `package.json`, add to `scripts`:
   ```json
   "bench": "turbo run bench"
   ```
3. Run: `harness validate`
4. Commit: `ci(bench): add bench task to Turbo pipeline and root scripts`

---

### Task 6: Create benchmark-check.mjs script

**Depends on:** Tasks 3, 4 (benchmark files must exist to test the script)
**Files:** `scripts/benchmark-check.mjs`

1. Create `scripts/benchmark-check.mjs`:

   ```javascript
   #!/usr/bin/env node

   /**
    * Benchmark regression gate.
    *
    * Usage:
    *   node scripts/benchmark-check.mjs          # Compare against baselines
    *   node scripts/benchmark-check.mjs --update  # Write current values as new baselines
    */

   import { execSync } from 'node:child_process';
   import { readFileSync, writeFileSync } from 'node:fs';
   import { resolve, dirname } from 'node:path';
   import { fileURLToPath } from 'node:url';

   const __dirname = dirname(fileURLToPath(import.meta.url));
   const ROOT = resolve(__dirname, '..');
   const BASELINES_PATH = resolve(ROOT, 'benchmark-baselines.json');
   const THRESHOLD = 0.1; // 10% regression threshold

   const PACKAGES = [
     { name: 'core', dir: resolve(ROOT, 'packages/core') },
     { name: 'graph', dir: resolve(ROOT, 'packages/graph') },
   ];

   const isUpdate = process.argv.includes('--update');

   /**
    * Run vitest bench for a package and return parsed JSON results.
    * Uses --outputJson to write structured output to a temp file.
    */
   function runBenchmarks(pkg) {
     const outputFile = resolve(ROOT, `.bench-output-${pkg.name}.json`);
     try {
       execSync(`npx vitest bench --run --outputJson ${outputFile}`, {
         cwd: pkg.dir,
         stdio: 'pipe',
         timeout: 120_000,
       });
     } catch (err) {
       // vitest bench may exit non-zero on first run; check if output file exists
       try {
         readFileSync(outputFile);
       } catch {
         console.error(`Failed to run benchmarks for ${pkg.name}:`);
         console.error(err.stderr?.toString() || err.message);
         process.exit(1);
       }
     }

     const raw = readFileSync(outputFile, 'utf-8');
     // Clean up temp file
     try {
       execSync(`rm ${outputFile}`);
     } catch {
       /* ignore */
     }
     return JSON.parse(raw);
   }

   /**
    * Extract benchmark results from Vitest bench JSON output.
    * Returns a map of "package/suiteName - benchName" => { mean, p99 }.
    *
    * Vitest bench JSON structure:
    * { testResults: [{ children: [{ name, benchmarks: [{ name, rank, ... }] }] }] }
    */
   function extractResults(packageName, json) {
     const results = {};

     const testFiles = json.testResults || [];
     for (const file of testFiles) {
       const suites = file.children || [];
       for (const suite of suites) {
         const suiteName = suite.name || 'default';
         const benchmarks = suite.benchmarks || [];
         for (const b of benchmarks) {
           const key = `${packageName}/${suiteName} - ${b.name}`;
           results[key] = {
             mean: (b.mean ?? b.hz) ? 1e9 / b.hz : 0,
             p99: b.p99 ?? b.percentiles?.['99'] ?? 0,
           };
         }
       }
     }

     return results;
   }

   /**
    * Main
    */
   function main() {
     console.log('Running benchmarks...\n');

     const allResults = {};

     for (const pkg of PACKAGES) {
       console.log(`  Benchmarking ${pkg.name}...`);
       const json = runBenchmarks(pkg);
       const results = extractResults(pkg.name, json);
       Object.assign(allResults, results);
     }

     console.log(`\n  Found ${Object.keys(allResults).length} benchmarks.\n`);

     if (isUpdate) {
       writeFileSync(BASELINES_PATH, JSON.stringify(allResults, null, 2) + '\n');
       console.log(`Baselines updated: ${BASELINES_PATH}`);
       return;
     }

     // Compare against baselines
     let baselines;
     try {
       baselines = JSON.parse(readFileSync(BASELINES_PATH, 'utf-8'));
     } catch {
       console.error('No baselines file found. Run with --update to create initial baselines.');
       process.exit(1);
     }

     let regressions = 0;

     for (const [key, baseline] of Object.entries(baselines)) {
       const current = allResults[key];
       if (!current) {
         console.warn(
           `  WARN: Baseline "${key}" not found in current results (benchmark removed?)`
         );
         continue;
       }

       // Skip comparison if baseline mean is 0 (initial placeholder)
       if (baseline.mean === 0) continue;

       const delta = (current.mean - baseline.mean) / baseline.mean;

       if (delta > THRESHOLD) {
         console.error(
           `  REGRESSION: "${key}" — mean ${baseline.mean.toFixed(2)}ns -> ${current.mean.toFixed(2)}ns (+${(delta * 100).toFixed(1)}%, threshold ${THRESHOLD * 100}%)`
         );
         regressions++;
       } else {
         const sign = delta >= 0 ? '+' : '';
         console.log(`  OK: "${key}" — ${sign}${(delta * 100).toFixed(1)}%`);
       }
     }

     // Check for new benchmarks not in baselines
     for (const key of Object.keys(allResults)) {
       if (!baselines[key]) {
         console.warn(`  NEW: "${key}" — not in baselines (run --update to add)`);
       }
     }

     if (regressions > 0) {
       console.error(
         `\n${regressions} benchmark(s) regressed. Run \`node scripts/benchmark-check.mjs --update\` to accept new baselines.`
       );
       process.exit(1);
     }

     console.log('\nAll benchmarks within threshold.');
   }

   main();
   ```

2. Run: `node scripts/benchmark-check.mjs --update` to verify it runs benchmarks and writes baselines.
3. Run: `harness validate`
4. Commit: `ci(bench): add benchmark-check.mjs regression gate script`

---

### Task 7: Capture initial benchmark baselines

**Depends on:** Task 6
**Files:** `benchmark-baselines.json`

[checkpoint:human-verify] -- Verify the benchmark-check.mjs script runs without errors before capturing baselines.

1. Run: `node scripts/benchmark-check.mjs --update`
2. Verify `benchmark-baselines.json` was created at the repo root with non-zero mean values for all 8 benchmarks.
3. Run: `node scripts/benchmark-check.mjs` (without `--update`) to verify comparison passes.
4. Run: `harness validate`
5. Commit: `ci(bench): capture initial benchmark baselines`

Note: If `--outputJson` produces a different structure than expected, the `extractResults` function in `benchmark-check.mjs` will need adjustment. The executor should inspect the raw JSON output from `vitest bench --run --outputJson /tmp/test-output.json` to verify the structure before proceeding. Key things to check:

- The top-level property name (could be `testResults`, `benchmarks`, or `results`)
- How suite names and benchmark names are nested
- Where `mean` and `p99` values live (might be `median`, `hz`, or inside a `stats` object)

If the structure differs, update `extractResults` accordingly and re-run.

---

### Task 8: Create benchmark.yml GitHub Actions workflow

**Depends on:** Task 6
**Files:** `.github/workflows/benchmark.yml`

1. Create `.github/workflows/benchmark.yml`:

   ```yaml
   name: Benchmarks

   on:
     pull_request:
       branches: [main]

   concurrency:
     group: ${{ github.workflow }}-${{ github.ref }}
     cancel-in-progress: true

   jobs:
     bench:
       runs-on: ubuntu-latest
       timeout-minutes: 10

       steps:
         - uses: actions/checkout@v6

         - uses: pnpm/action-setup@v5

         - uses: actions/setup-node@v6
           with:
             node-version: 22
             cache: pnpm

         - run: pnpm install --frozen-lockfile

         - run: pnpm build

         - name: Benchmark regression check
           run: node scripts/benchmark-check.mjs
   ```

2. Run: `harness validate`
3. Commit: `ci(bench): add benchmark.yml workflow for PR regression checks`

---

## Dependency Graph

```
Task 1 (pkg scripts)  ──┬──> Task 3 (core bench file) ──┐
                        └──> Task 4 (graph bench file) ──┤
Task 2 (vitest config)                                   │
Task 5 (turbo + root)                                    │
                                                         ├──> Task 6 (benchmark-check.mjs)
                                                         │         │
                                                         │         v
                                                         │    Task 7 (capture baselines) [checkpoint]
                                                         │
                                                         └──> Task 8 (benchmark.yml workflow)
```

**Parallel opportunities:** Tasks 1, 2, and 5 are independent. Tasks 3 and 4 are independent (only share Task 1 dependency). Task 8 is independent of Task 7.

## Traceability

| Observable Truth                              | Delivered by Task(s) |
| --------------------------------------------- | -------------------- |
| OT1: `pnpm bench` runs both packages          | Tasks 1, 3, 4, 5     |
| OT2: Core benchmarks cover 4 scenarios        | Task 3               |
| OT3: Graph benchmarks cover 4 scenarios       | Task 4               |
| OT4: benchmark-check.mjs compares and exits 0 | Tasks 6, 7           |
| OT5: --update writes baselines                | Task 6               |
| OT6: >10% regression causes exit 1            | Task 6               |
| OT7: benchmark-baselines.json has real values | Task 7               |
| OT8: benchmark.yml workflow exists            | Task 8               |
| OT9: turbo.json has bench task                | Task 5               |
| OT10: harness validate passes                 | All tasks            |
