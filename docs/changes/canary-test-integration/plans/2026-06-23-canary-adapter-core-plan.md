# Plan: canary Adapter Core (Phase 1)

**Date:** 2026-06-23 | **Spec:** `docs/changes/canary-test-integration/proposal.md` | **Tasks:** 8 | **Time:** ~34 min | **Integration Tier:** medium

> **Scope:** ONLY Phase 1 ("Adapter core") of the spec's Implementation Order. Phase 2 (skill wiring, blocked by PR #501), Phase 3 (docs/ADR/knowledge), and Phase 4 (validation pass) are out of scope and planned separately.

## Goal

Implement a total, gracefully-degrading `CanaryAdapter` in `packages/intelligence/src/adapters/canary.ts` that execs the deterministic `canary` CLI, zod-validates its JSON, and exposes `probe` / `recommendFramework` / `reviewTest`, with the `canary-test-cli` optionalDependency declared and the boundary enforced by a test.

## Observable Truths (Acceptance Criteria)

1. **The system shall** declare `canary-test-cli@^5.4.0` under `optionalDependencies` in `packages/intelligence/package.json` (precedent: `packages/graph`). (Verify: field present; `pnpm install` succeeds even if the optional install fails.)
2. **When** `canary version` succeeds, `probe()` **shall** resolve `{ status: 'available', version }`. (Test: mocked `execFile` returns version stdout.)
3. **If** canary is not installed (ENOENT / spawn error), **then** `probe()` **shall** resolve `{ status: 'degraded', reason: 'not-installed' }` and **shall not** throw. (Test: mocked `execFile` rejects with `ENOENT`.)
4. **If** the launcher is present but the native binary is missing (exit 1 with `"canary binary not found"`), **then** `probe()` **shall** resolve `{ status: 'degraded', reason: 'binary-missing' }`. (Test: mocked `execFile` rejects with `{ code: 1, stderr: 'canary binary not found' }`.)
5. **If** canary exits non-zero for any other reason, **then** `probe()` **shall** resolve `{ status: 'degraded', reason: 'exec-failed' }`. (Test: mocked `execFile` rejects with `{ code: 2 }`.)
6. **When** `canary recommend "<prompt>" --json` returns the captured schema, `recommendFramework(prompt)` **shall** resolve a zod-validated `FrameworkRecommendation` with `framework`, `test_type`, `file_extension`, `reasoning[]`, `alternatives[]` asserted. (Test: fixture from spike schema.)
7. **If** `recommend`/`review-test` output fails zod validation (bad JSON or schema mismatch), **then** the method **shall** resolve a degraded/empty result (`reviewTest` → `[]`; `recommendFramework` → a sentinel with `status` reflecting degradation) and **shall not** throw. (Tests: bad-JSON and schema-mismatch fixtures.)
8. **When** `canary review-test <path> --json` returns the captured array schema, `reviewTest(path)` **shall** resolve a zod-validated `CanaryFinding[]`. (Test: fixture from spike schema.)
9. **The system shall** export the canary types and `createCanaryAdapter` from `adapters/index.ts` and the package `index.ts`; barrels regenerate clean. (Verify: `pnpm --filter @harness-engineering/intelligence build` + `generate:barrels:check`.)
10. **The system shall** confine all `canary-test-cli` / `canary` bin references to `canary.ts`; a test greps the `packages/intelligence/src` tree and asserts no other module references them. (Test: boundary grep.)
11. **Portability:** `harness validate` and `harness check-deps` introduce no new canary-attributable violations with canary absent. (Verify in Task 8.)

## Uncertainties

- [ASSUMPTION] zod v3.25 house import is `import { z } from 'zod'`. **Verified** against `src/sel/prompts.ts`.
- [ASSUMPTION] `probe()` parses `canary version` leniently: any zero-exit run with non-empty stdout = available; the first non-empty trimmed line (or a `\d+\.\d+\.\d+` match) is `version`. If absent, still `available` with `version` undefined. (Spec only mandates the `status` branch; version is best-effort.)
- [ASSUMPTION] `recommendFramework`'s degraded sentinel uses `status: 'degraded'` with empty `reasoning`/`alternatives`. Callers branch on `status` (mirrors the probe contract). If a stricter caller contract emerges in Phase 2, revisit — does not block Phase 1.
- [DEFERRABLE] Bin resolution prefers a resolvable `canary` on PATH, else `npx -y canary-test-cli`. Both go through one private `execCanary` helper. Exact PATH-probe mechanics finalized in Task 3.

## File Map

```
MODIFY  packages/intelligence/package.json                     (add optionalDependencies)
CREATE  packages/intelligence/src/adapters/canary.ts           (CanaryAdapter + zod schemas + exec seam)
CREATE  packages/intelligence/tests/adapters/canary.test.ts    (unit tests, mocked execFile)
CREATE  packages/intelligence/tests/adapters/canary-boundary.test.ts  (boundary grep)
MODIFY  packages/intelligence/src/adapters/index.ts            (barrel export)
MODIFY  packages/intelligence/src/index.ts                     (package export)
```

Test fixtures (captured spike schemas) live inline in `canary.test.ts`.

## Skeleton

1. **Dependency + types/schemas foundation** (~2 tasks, ~8 min) — add optionalDependency; define interfaces + zod schemas + inferred types.
2. **Exec seam + probe** (~2 tasks, ~10 min) — `execCanary` wrapper with bin resolution + error classification; `probe()` TDD across the full degradation matrix.
3. **Data methods TDD** (~2 tasks, ~10 min) — `recommendFramework` and `reviewTest`, each with success + bad-JSON/schema-mismatch coverage.
4. **Wiring + boundary guard** (~2 tasks, ~6 min) — barrel + package export; boundary grep test; validate.

**Estimated total:** 8 tasks, ~34 minutes.
_Skeleton approved: pending (autopilot standard rigor; recorded for review at Phase 4 sign-off)._

## Skill annotations

Apply tier (per `SKILLS.md`): none flagged. Reference tier: `ts-zod-integration`, `zod-infer-types` (schema/type tasks), `ts-testing-types` (test tasks).

## Tasks

### Task 1: Declare `canary-test-cli` optionalDependency

**Depends on:** none | **Files:** `packages/intelligence/package.json` | **Skills:** —

1. In `packages/intelligence/package.json`, add a top-level `optionalDependencies` block after `"dependencies"` (mirror `packages/graph/package.json` placement):
   ```json
   "optionalDependencies": {
     "canary-test-cli": "^5.4.0"
   },
   ```
2. Install to refresh the lockfile (optional install failures must not break this):
   ```bash
   pnpm install --filter @harness-engineering/intelligence
   ```
   If the canary postinstall fails (offline/unsupported platform), confirm `pnpm install` still exits 0 — that is the non-breaking contract (Truth 1).
3. Run: `harness validate`
4. Commit: `chore(intelligence): add canary-test-cli optionalDependency`

### Task 2: Define canary types and zod schemas

**Depends on:** Task 1 | **Files:** `packages/intelligence/src/adapters/canary.ts` | **Skills:** `ts-zod-integration` (ref), `zod-infer-types` (ref)

Create `packages/intelligence/src/adapters/canary.ts` with the public types and the zod schemas that back them. Types are the verbatim spike contracts; schemas drive runtime validation.

1. Create the file with this header content (exec/probe logic arrives in Task 3):

   ```ts
   import { z } from 'zod';

   /** Why probe() degraded. */
   export type CanaryDegradeReason =
     | 'not-installed'
     | 'binary-missing'
     | 'exec-failed'
     | 'bad-output';

   export interface CanaryProbe {
     status: 'available' | 'degraded';
     version?: string;
     reason?: CanaryDegradeReason;
   }

   // canary recommend "<prompt>" --json
   export const frameworkRecommendationSchema = z.object({
     status: z.string(),
     test_type: z.string(),
     framework: z.string(),
     file_extension: z.string(),
     reasoning: z.array(z.string()),
     alternatives: z.array(z.string()),
   });
   export type FrameworkRecommendation = z.infer<typeof frameworkRecommendationSchema>;

   // canary review-test <path> --json → array
   export const canaryFindingSchema = z.object({
     file: z.string(),
     line: z.number(),
     rule: z.string(),
     severity: z.enum(['info', 'warning', 'error']),
     message: z.string(),
     suggestion: z.string(),
   });
   export const canaryFindingsSchema = z.array(canaryFindingSchema);
   export type CanaryFinding = z.infer<typeof canaryFindingSchema>;

   export interface CanaryAdapter {
     probe(): Promise<CanaryProbe>;
     recommendFramework(prompt: string): Promise<FrameworkRecommendation>;
     reviewTest(path: string, framework?: string): Promise<CanaryFinding[]>;
   }
   ```

2. Typecheck only (no impl yet): `pnpm --filter @harness-engineering/intelligence typecheck`
3. Run: `harness validate`
4. Commit: `feat(intelligence): add canary adapter types and zod schemas`

### Task 3: Implement exec seam and `probe()` (TDD)

**Depends on:** Task 2 | **Files:** `packages/intelligence/tests/adapters/canary.test.ts`, `packages/intelligence/src/adapters/canary.ts` | **Skills:** `ts-testing-types` (ref)

[checkpoint:human-verify] — After the probe tests pass, pause and show the full degradation matrix (not-installed / binary-missing / exec-failed / available) so the human confirms the `reason` classification matches the spike's runtime model before the data methods build on it.

1. Create `packages/intelligence/tests/adapters/canary.test.ts`. Mock `node:child_process` `execFile` (precedent: `packages/cli/tests` child_process mocks). Drive `execFile` through `node:util` `promisify`, so the adapter must call `promisify(execFile)`. Write the probe block:

   ```ts
   import { describe, it, expect, vi, beforeEach } from 'vitest';

   const execFileMock = vi.fn();
   vi.mock('node:child_process', () => ({
     execFile: (...args: unknown[]) => execFileMock(...args),
   }));

   // Adapter calls promisify(execFile); model resolve/reject via the mock's callback.
   function resolveExec(stdout: string) {
     execFileMock.mockImplementation((_cmd, _args, _opts, cb) => cb(null, { stdout, stderr: '' }));
   }
   function rejectExec(err: { code?: number; stderr?: string } & Partial<NodeJS.ErrnoException>) {
     execFileMock.mockImplementation((_cmd, _args, _opts, cb) =>
       cb(Object.assign(new Error('exec'), err))
     );
   }

   import { createCanaryAdapter } from '../../src/adapters/canary.js';

   describe('CanaryAdapter.probe', () => {
     beforeEach(() => execFileMock.mockReset());

     it('returns available with version on success', async () => {
       resolveExec('canary 5.4.0\n');
       const probe = await createCanaryAdapter().probe();
       expect(probe.status).toBe('available');
       expect(probe.version).toBe('5.4.0');
     });

     it('degrades not-installed when binary cannot be spawned (ENOENT)', async () => {
       rejectExec({ code: undefined, ...({ code: 'ENOENT' } as object) });
       const probe = await createCanaryAdapter().probe();
       expect(probe).toEqual({ status: 'degraded', reason: 'not-installed' });
     });

     it('degrades binary-missing when launcher exits 1 with "canary binary not found"', async () => {
       rejectExec({ code: 1, stderr: 'canary binary not found' });
       const probe = await createCanaryAdapter().probe();
       expect(probe).toEqual({ status: 'degraded', reason: 'binary-missing' });
     });

     it('degrades exec-failed on other non-zero exit', async () => {
       rejectExec({ code: 2, stderr: 'boom' });
       const probe = await createCanaryAdapter().probe();
       expect(probe).toEqual({ status: 'degraded', reason: 'exec-failed' });
     });
   });
   ```

2. Run — observe failure (`createCanaryAdapter` not exported yet):
   `pnpm --filter @harness-engineering/intelligence test -- canary.test.ts`
3. In `canary.ts`, add the exec seam + probe. Append to the file:

   ```ts
   import { execFile } from 'node:child_process';
   import { promisify } from 'node:util';

   const run = promisify(execFile);

   interface ExecResult {
     ok: true;
     stdout: string;
   }
   interface ExecError {
     ok: false;
     reason: CanaryDegradeReason;
   }

   // Prefers a resolvable `canary` bin; falls back to the npm wrapper via npx.
   function canaryInvocation(subArgs: string[]): [string, string[]] {
     // Single source of truth for how the CLI is invoked. Tests mock execFile,
     // so the concrete bin is irrelevant to unit tests but documented here.
     return ['canary', subArgs];
   }

   async function execCanary(subArgs: string[]): Promise<ExecResult | ExecError> {
     const [cmd, args] = canaryInvocation(subArgs);
     try {
       const { stdout } = await run(cmd, args, { encoding: 'utf8' });
       return { ok: true, stdout };
     } catch (err) {
       const e = err as NodeJS.ErrnoException & { code?: number | string; stderr?: string };
       if (e.code === 'ENOENT') return { ok: false, reason: 'not-installed' };
       if (e.code === 1 && /canary binary not found/i.test(e.stderr ?? '')) {
         return { ok: false, reason: 'binary-missing' };
       }
       return { ok: false, reason: 'exec-failed' };
     }
   }

   function parseVersion(stdout: string): string | undefined {
     const m = stdout.match(/\d+\.\d+\.\d+/);
     return m?.[0];
   }

   export function createCanaryAdapter(): CanaryAdapter {
     let cachedProbe: Promise<CanaryProbe> | undefined;
     const probe = (): Promise<CanaryProbe> => {
       cachedProbe ??= (async () => {
         const res = await execCanary(['version']);
         if (!res.ok) return { status: 'degraded', reason: res.reason };
         return { status: 'available', version: parseVersion(res.stdout) };
       })();
       return cachedProbe;
     };
     return {
       probe,
       // recommendFramework + reviewTest added in Tasks 4 & 5.
     } as CanaryAdapter;
   }
   ```

4. Run — observe pass: `pnpm --filter @harness-engineering/intelligence test -- canary.test.ts`
5. Run: `harness validate`
6. Commit: `feat(intelligence): add canary exec seam and total probe()`

### Task 4: Implement `recommendFramework()` (TDD)

**Depends on:** Task 3 | **Files:** `packages/intelligence/tests/adapters/canary.test.ts`, `packages/intelligence/src/adapters/canary.ts` | **Skills:** `ts-zod-integration` (ref), `ts-testing-types` (ref)

1. Add a `describe('CanaryAdapter.recommendFramework')` block to the test file using the captured spike fixture:

   ```ts
   const RECOMMEND_FIXTURE = {
     status: 'success',
     test_type: 'e2e_ui',
     framework: 'playwright',
     file_extension: 'spec.ts',
     reasoning: ['UI flow detected'],
     alternatives: ['cypress'],
   };

   describe('CanaryAdapter.recommendFramework', () => {
     beforeEach(() => execFileMock.mockReset());

     it('returns a validated FrameworkRecommendation on success', async () => {
       resolveExec(JSON.stringify(RECOMMEND_FIXTURE));
       const rec = await createCanaryAdapter().recommendFramework('login flow');
       expect(rec.framework).toBe('playwright');
       expect(rec.test_type).toBe('e2e_ui');
       expect(rec.reasoning).toEqual(['UI flow detected']);
     });

     it('returns a degraded sentinel on bad JSON (no throw)', async () => {
       resolveExec('not json');
       const rec = await createCanaryAdapter().recommendFramework('x');
       expect(rec.status).toBe('degraded');
       expect(rec.alternatives).toEqual([]);
     });

     it('returns a degraded sentinel on schema mismatch (no throw)', async () => {
       resolveExec(JSON.stringify({ framework: 123 }));
       const rec = await createCanaryAdapter().recommendFramework('x');
       expect(rec.status).toBe('degraded');
     });
   });
   ```

2. Run — observe failure.
3. In `canary.ts`, add a JSON parse helper and the method to the returned adapter object:

   ```ts
   function safeJson(stdout: string): unknown | undefined {
     try {
       return JSON.parse(stdout);
     } catch {
       return undefined;
     }
   }

   const DEGRADED_RECOMMENDATION: FrameworkRecommendation = {
     status: 'degraded',
     test_type: '',
     framework: '',
     file_extension: '',
     reasoning: [],
     alternatives: [],
   };
   ```

   Add to the returned object:

   ```ts
   async recommendFramework(prompt: string): Promise<FrameworkRecommendation> {
     const res = await execCanary(['recommend', prompt, '--json']);
     if (!res.ok) return DEGRADED_RECOMMENDATION;
     const parsed = frameworkRecommendationSchema.safeParse(safeJson(res.stdout));
     return parsed.success ? parsed.data : DEGRADED_RECOMMENDATION;
   },
   ```

4. Run — observe pass.
5. Run: `harness validate`
6. Commit: `feat(intelligence): add canary recommendFramework with zod validation`

### Task 5: Implement `reviewTest()` (TDD)

**Depends on:** Task 4 | **Files:** `packages/intelligence/tests/adapters/canary.test.ts`, `packages/intelligence/src/adapters/canary.ts` | **Skills:** `ts-zod-integration` (ref), `ts-testing-types` (ref)

1. Add a `describe('CanaryAdapter.reviewTest')` block using the captured array fixture:

   ```ts
   const REVIEW_FIXTURE = [
     {
       file: 'tests/login.spec.ts',
       line: 12,
       rule: 'LINT-005',
       severity: 'warning',
       message: 'Hardcoded sleep',
       suggestion: 'Use a wait condition',
     },
   ];

   describe('CanaryAdapter.reviewTest', () => {
     beforeEach(() => execFileMock.mockReset());

     it('returns validated CanaryFinding[] on success', async () => {
       resolveExec(JSON.stringify(REVIEW_FIXTURE));
       const findings = await createCanaryAdapter().reviewTest('tests/login.spec.ts');
       expect(findings).toHaveLength(1);
       expect(findings[0].rule).toBe('LINT-005');
       expect(findings[0].severity).toBe('warning');
     });

     it('returns [] on bad JSON (no throw)', async () => {
       resolveExec('not json');
       expect(await createCanaryAdapter().reviewTest('x')).toEqual([]);
     });

     it('returns [] on schema mismatch (no throw)', async () => {
       resolveExec(JSON.stringify([{ rule: 1 }]));
       expect(await createCanaryAdapter().reviewTest('x')).toEqual([]);
     });

     it('returns [] when canary is degraded/absent', async () => {
       rejectExec({ code: 'ENOENT' } as object);
       expect(await createCanaryAdapter().reviewTest('x')).toEqual([]);
     });
   });
   ```

2. Run — observe failure.
3. Add the method to the returned adapter object in `canary.ts`. Pass `framework` through only when provided:
   ```ts
   async reviewTest(path: string, framework?: string): Promise<CanaryFinding[]> {
     const args = ['review-test', path, '--json'];
     if (framework) args.push('--framework', framework);
     const res = await execCanary(args);
     if (!res.ok) return [];
     const parsed = canaryFindingsSchema.safeParse(safeJson(res.stdout));
     return parsed.success ? parsed.data : [];
   },
   ```
   Remove the `as CanaryAdapter` cast now that all three methods are present; the object satisfies the interface structurally.
4. Run — observe pass: `pnpm --filter @harness-engineering/intelligence test -- canary.test.ts`
5. Run: `harness validate`
6. Commit: `feat(intelligence): add canary reviewTest with zod validation`

### Task 6: Export from adapter barrel and package index

**Depends on:** Task 5 | **Files:** `packages/intelligence/src/adapters/index.ts`, `packages/intelligence/src/index.ts` | **Category:** integration

1. In `packages/intelligence/src/adapters/index.ts`, append:
   ```ts
   export { createCanaryAdapter } from './canary.js';
   export type {
     CanaryAdapter,
     CanaryProbe,
     CanaryDegradeReason,
     FrameworkRecommendation,
     CanaryFinding,
   } from './canary.js';
   ```
2. In `packages/intelligence/src/index.ts`, under the `// Adapters` section, add:
   ```ts
   export { createCanaryAdapter } from './adapters/index.js';
   export type {
     CanaryAdapter,
     CanaryProbe,
     CanaryDegradeReason,
     FrameworkRecommendation,
     CanaryFinding,
   } from './adapters/index.js';
   ```
3. Build to confirm exports resolve: `pnpm --filter @harness-engineering/intelligence build`
4. If the repo has a barrel check, run it: `pnpm -w generate:barrels:check` (skip if the script is absent).
5. Run: `harness validate`
6. Commit: `feat(intelligence): export canary adapter from barrels`

### Task 7: Add boundary guard test

**Depends on:** Task 6 | **Files:** `packages/intelligence/tests/adapters/canary-boundary.test.ts` | **Category:** integration | **Skills:** `ts-testing-types` (ref)

Enforce Truth 10: only `canary.ts` may reference `canary-test-cli` or the `canary` bin.

1. Create `packages/intelligence/tests/adapters/canary-boundary.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { readdirSync, readFileSync, statSync } from 'node:fs';
   import { join } from 'node:path';
   import { fileURLToPath } from 'node:url';

   const srcRoot = fileURLToPath(new URL('../../src', import.meta.url));

   function walk(dir: string): string[] {
     return readdirSync(dir).flatMap((name) => {
       const p = join(dir, name);
       return statSync(p).isDirectory() ? walk(p) : [p];
     });
   }

   describe('canary boundary', () => {
     it('only adapters/canary.ts references canary-test-cli or the canary bin', () => {
       const offenders = walk(srcRoot)
         .filter((f) => f.endsWith('.ts') && !f.endsWith(`adapters${'/'}canary.ts`))
         .filter((f) => /canary-test-cli|['"`]canary['"`]/.test(readFileSync(f, 'utf8')));
       expect(offenders).toEqual([]);
     });
   });
   ```

2. Run — observe pass (barrels export symbols named `Canary*` but never the string `'canary'` bin nor `canary-test-cli`; if the regex flags a barrel, tighten it to match only the bin literal and the package name):
   `pnpm --filter @harness-engineering/intelligence test -- canary-boundary.test.ts`
3. Run: `harness validate`
4. Commit: `test(intelligence): enforce canary CLI boundary`

### Task 8: Full-suite validation and portability check

**Depends on:** Task 7 | **Files:** — | **Category:** integration

1. Run the package suite (canary absent in CI is the default mocked state):
   `pnpm --filter @harness-engineering/intelligence test`
2. Typecheck + lint: `pnpm --filter @harness-engineering/intelligence typecheck && pnpm --filter @harness-engineering/intelligence lint`
3. Run: `harness validate`
4. Run: `harness check-deps` — confirm no NEW canary-attributable dependency violations versus the pre-existing baseline (pre-existing cli circular deps are unrelated to this change).
5. Commit (only if steps 1-4 produced fixable diffs; otherwise no-op): `chore(intelligence): validate canary adapter core`

## Notes on pre-existing baseline

`harness validate` and `harness check-deps` already report unrelated findings on a clean tree (design-token warnings in `packages/graph` tests; circular deps in `packages/cli`). These are NOT introduced by this plan. Task 8 asserts only the absence of _new_ canary-attributable violations.
