# Plan: Phase 1 — Adapter core (`listFrameworks` + `resolveTestCommand`)

**Date:** 2026-08-07
**Spec:** docs/changes/canary-tdd-verify-wiring/proposal.md (resolves #913)
**Integration Tier:** medium
**Estimated tasks:** 4
**Estimated time:** 20 minutes

> **Phase 0 gate already run (2026-08-07) — spec contract corrected.** `canary` is on PATH; `canary frameworks --json` was executed. The live CLI emits `{ "frameworks": CanaryFrameworkInfo[] }` (27 entries) with **no** top-level `details[]` key — the `frameworks` key **is** the array of detail objects. This contradicts the spec's stated contract (`{ frameworks: string[], details: CanaryFrameworkInfo[] }`, proposal lines 82 & 160). Per the spec's own Phase-0 rule ("if the CLI verb differs, record it and adjust"), this plan parses the top-level `frameworks` array directly. Parsing `details[]` (as the spec literally wrote) would make `listFrameworks()` **always** return `[]`, silently disabling the whole feature. Each entry also carries extra keys (`category`, `categories`, `capabilities`) that the permissive schema ignores. See the "Feasibility notes" section at the end.

## Goal

Extend the total, gracefully-degrading `CanaryAdapter` with a `listFrameworks()` method (execs `canary frameworks --json`, zod-parses the framework array, returns `[]` on any degrade) and a pure `resolveTestCommand()` helper, without breaking the adapter boundary.

## Observable Truths (Acceptance Criteria)

1. `createCanaryAdapter(execResolves(<frameworks json>)).listFrameworks()` resolves a typed `CanaryFrameworkInfo[]` parsed from the top-level `frameworks` array.
2. `listFrameworks()` resolves `[]` on ENOENT (`not-installed`), `binary-missing`, other non-zero exit, malformed JSON, and schema mismatch — never throws.
3. `canaryFrameworkInfoSchema` applies permissive defaults: `execution_command` nullable→`null`, missing arrays→`[]`, missing `status`/`tier`→`''`; unknown keys (`category`, `capabilities`, …) are ignored, not rejected.
4. `resolveTestCommand(fw, 'login.spec.ts')` fills `{file}` → `'npx --yes playwright test login.spec.ts'`.
5. `resolveTestCommand(fw, file, { ci: true })` appends joined `ci_flags`; without `ci` it does not.
6. `resolveTestCommand` returns `null` when `execution_command` is `null`.
7. `resolveTestCommand` returns `null` when `execution_command` has no `{file}` placeholder (`{target}`-only scanners and whole-suite commands like `npx --yes stryker run`).
8. The adapter object returned by `createCanaryAdapter` exposes `listFrameworks`; the boundary test (`canary-boundary.test.ts`) still passes.
9. `import { resolveTestCommand, type CanaryFrameworkInfo } from '@harness-engineering/intelligence'` resolves after barrel exports are added.
10. `harness validate` passes.

## File Map

```
MODIFY packages/intelligence/src/adapters/canary.ts          (+ schema, type, resolveTestCommand, listFrameworks, interface + factory wiring)
MODIFY packages/intelligence/tests/adapters/canary.test.ts   (+ resolveTestCommand unit tests, + listFrameworks degrade/success tests)
MODIFY packages/intelligence/src/adapters/index.ts           (+ export resolveTestCommand, type CanaryFrameworkInfo)
MODIFY packages/intelligence/src/index.ts                    (+ re-export resolveTestCommand, type CanaryFrameworkInfo)
```

> Node 22 is required for this repo (native `better-sqlite3` ABI + `String.prototype.replaceAll`). Run all commands under Node 22.

## Tasks

### Task 1: Add `CanaryFrameworkInfo` schema/type + pure `resolveTestCommand` (TDD)

**Depends on:** none
**Files:** `packages/intelligence/tests/adapters/canary.test.ts`, `packages/intelligence/src/adapters/canary.ts`

1. **RED** — append to `packages/intelligence/tests/adapters/canary.test.ts` (after the existing imports, add `resolveTestCommand` + `canaryFrameworkInfoSchema` to the import line; then append this describe block at end of file):

```typescript
import {
  createCanaryAdapter,
  resolveTestCommand,
  canaryFrameworkInfoSchema,
  type CanaryExec,
} from '../../src/adapters/canary.js';

describe('resolveTestCommand (pure)', () => {
  // Build inputs through the schema so permissive defaults fill in.
  const fw = (over: Record<string, unknown>) =>
    canaryFrameworkInfoSchema.parse({ name: 'x', ...over });

  it('fills the {file} placeholder', () => {
    const playwright = fw({ execution_command: 'npx --yes playwright test {file}' });
    expect(resolveTestCommand(playwright, 'login.spec.ts')).toBe(
      'npx --yes playwright test login.spec.ts'
    );
  });

  it('appends joined ci_flags only under ci', () => {
    const playwright = fw({
      execution_command: 'npx --yes playwright test {file}',
      ci_flags: ['--reporter=list'],
    });
    expect(resolveTestCommand(playwright, 'a.spec.ts', { ci: true })).toBe(
      'npx --yes playwright test a.spec.ts --reporter=list'
    );
    expect(resolveTestCommand(playwright, 'a.spec.ts')).toBe('npx --yes playwright test a.spec.ts');
  });

  it('returns null when execution_command is null (catalog-tier framework)', () => {
    expect(resolveTestCommand(fw({ execution_command: null }), 'a.ts')).toBeNull();
  });

  it('returns null for {target}-only security scanners', () => {
    const semgrep = fw({ execution_command: 'semgrep --config auto {target}' });
    expect(resolveTestCommand(semgrep, 'rules.yaml')).toBeNull();
  });

  it('returns null for whole-suite commands with no {file} placeholder', () => {
    const stryker = fw({ execution_command: 'npx --yes stryker run' });
    expect(resolveTestCommand(stryker, 'a.ts')).toBeNull();
  });

  it('applies permissive schema defaults for a bare entry', () => {
    const parsed = canaryFrameworkInfoSchema.parse({ name: 'bare', category: 'ignored' });
    expect(parsed).toEqual({
      name: 'bare',
      languages: [],
      file_extensions: [],
      execution_command: null,
      ci_flags: [],
      status: '',
      tier: '',
    });
  });
});
```

2. Run: `npx vitest run packages/intelligence/tests/adapters/canary.test.ts`
3. **Observe failure** — import of `resolveTestCommand` / `canaryFrameworkInfoSchema` fails (symbols do not exist yet).
4. **GREEN** — in `packages/intelligence/src/adapters/canary.ts`, add the schema + type immediately after the `canaryFindingsSchema`/`CanaryFinding` block (around line 45):

```typescript
// canary frameworks --json → { frameworks: CanaryFrameworkInfo[] }.
// NOTE: the live CLI returns the detail array under the `frameworks` key itself
// (no separate `details[]` key — confirmed against canary 27-framework registry).
// Permissive by design (D6): the live registry has null execution_command catalog
// frameworks (opentelemetry, tosca) and non-{file} commands (stryker, semgrep). A
// strict schema would drop the whole array on one unmodeled value; unknown keys
// (category, categories, capabilities) are ignored rather than rejected.
export const canaryFrameworkInfoSchema = z.object({
  name: z.string(),
  languages: z.array(z.string()).default([]),
  file_extensions: z.array(z.string()).default([]),
  execution_command: z.string().nullable().default(null),
  ci_flags: z.array(z.string()).default([]),
  status: z.string().default(''), // preferred | supported | commercial | ...
  tier: z.string().default(''), //   full | executable | catalog
});
export type CanaryFrameworkInfo = z.infer<typeof canaryFrameworkInfoSchema>;

export const canaryFrameworksResponseSchema = z.object({
  frameworks: z.array(canaryFrameworkInfoSchema).default([]),
});

/**
 * Pure resolution of a per-file test command from a registry entry. No exec.
 *  - null execution_command  → null (catalog-tier frameworks have no runner)
 *  - command without {file}   → null (whole-suite / {target}-only scanners are not
 *                               resolvable to a per-file test command)
 * Otherwise substitutes {file} and, under opts.ci, appends the joined ci_flags.
 */
export function resolveTestCommand(
  fw: CanaryFrameworkInfo,
  file: string,
  opts?: { ci?: boolean }
): string | null {
  const command = fw.execution_command;
  if (command === null) return null;
  if (!command.includes('{file}')) return null;
  let resolved = command.replaceAll('{file}', file);
  if (opts?.ci && fw.ci_flags.length > 0) {
    resolved = `${resolved} ${fw.ci_flags.join(' ')}`;
  }
  return resolved;
}
```

5. Run: `npx vitest run packages/intelligence/tests/adapters/canary.test.ts`
6. **Observe pass** — the `resolveTestCommand (pure)` suite is green; existing suites unaffected.
7. Run: `harness validate`
8. Commit: `feat(intelligence): add CanaryFrameworkInfo schema and pure resolveTestCommand`

---

### Task 2: Add `listFrameworks()` to the adapter (TDD)

**Depends on:** Task 1
**Files:** `packages/intelligence/tests/adapters/canary.test.ts`, `packages/intelligence/src/adapters/canary.ts`

1. **RED** — append this describe block at the end of `packages/intelligence/tests/adapters/canary.test.ts` (fixture mirrors the real CLI shape, including ignored extra keys):

```typescript
describe('CanaryAdapter.listFrameworks', () => {
  // Captured from the live CLI (`canary frameworks --json`): the detail objects live
  // directly under `frameworks` (no `details[]` key); each carries extra ignored keys.
  const FRAMEWORKS_FIXTURE = {
    frameworks: [
      {
        name: 'playwright',
        category: 'e2e_ui',
        categories: ['e2e_ui', 'api'],
        languages: ['typescript', 'javascript'],
        file_extensions: ['spec.ts', 'spec.js', 'test.ts', 'test.js'],
        execution_command: 'npx --yes playwright test {file}',
        ci_flags: ['--reporter=list'],
        status: 'preferred',
        capabilities: { scaffold: true, execute: true, tier: 'full' },
        tier: 'full',
      },
      {
        name: 'opentelemetry',
        file_extensions: [],
        execution_command: null,
        ci_flags: [],
        status: 'supported',
        tier: 'catalog',
      },
    ],
  };

  it('parses the top-level frameworks array on success', async () => {
    const list = await createCanaryAdapter(
      execResolves(JSON.stringify(FRAMEWORKS_FIXTURE))
    ).listFrameworks();
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe('playwright');
    expect(list[0].execution_command).toBe('npx --yes playwright test {file}');
    expect(list[1].execution_command).toBeNull(); // catalog-tier preserved, not dropped
  });

  it('returns [] on bad JSON (no throw)', async () => {
    expect(await createCanaryAdapter(execResolves('not json')).listFrameworks()).toEqual([]);
  });

  it('returns [] on schema mismatch (no throw)', async () => {
    expect(
      await createCanaryAdapter(
        execResolves(JSON.stringify({ frameworks: [{ name: 123 }] }))
      ).listFrameworks()
    ).toEqual([]);
  });

  it('returns [] when canary is not installed (ENOENT)', async () => {
    expect(await createCanaryAdapter(execRejects({ code: 'ENOENT' })).listFrameworks()).toEqual([]);
  });

  it('returns [] when the native binary is missing', async () => {
    expect(
      await createCanaryAdapter(
        execRejects({ code: 1, stderr: 'canary binary not found' })
      ).listFrameworks()
    ).toEqual([]);
  });

  it('returns [] on other non-zero exit', async () => {
    expect(
      await createCanaryAdapter(execRejects({ code: 2, stderr: 'boom' })).listFrameworks()
    ).toEqual([]);
  });
});
```

2. Run: `npx vitest run packages/intelligence/tests/adapters/canary.test.ts`
3. **Observe failure** — `adapter.listFrameworks is not a function`.
4. **GREEN** — in `packages/intelligence/src/adapters/canary.ts`:

   a. Add `listFrameworks` to the `CanaryAdapter` interface (after `reviewTest`, ~line 50):

   ```typescript
     listFrameworks(): Promise<CanaryFrameworkInfo[]>; // NEW — [] when unavailable/malformed
   ```

   b. Add the exec-backed impl next to `reviewTestCanary` (after line 186):

   ```typescript
   async function listFrameworksCanary(exec: CanaryExec): Promise<CanaryFrameworkInfo[]> {
     const res = await execCanary(exec, ['frameworks', '--json']);
     if (!res.ok) return [];
     const parsed = canaryFrameworksResponseSchema.safeParse(safeJson(res.stdout));
     return parsed.success ? parsed.data.frameworks : [];
   }
   ```

   c. Wire it into the factory (`createCanaryAdapter`, ~line 188):

   ```typescript
   const listFrameworks = (): Promise<CanaryFrameworkInfo[]> => listFrameworksCanary(exec);

   return { probe, recommendFramework, reviewTest, listFrameworks };
   ```

5. Run: `npx vitest run packages/intelligence/tests/adapters/canary.test.ts`
6. **Observe pass** — all `listFrameworks` cases green.
7. Run: `npx vitest run packages/intelligence/tests/adapters/canary-boundary.test.ts` — boundary still passes (new code stays inside `adapters/canary.ts`).
8. Run: `harness validate`
9. Commit: `feat(intelligence): add total listFrameworks() to CanaryAdapter`

---

### Task 3: Export `resolveTestCommand` + `CanaryFrameworkInfo` from the barrels

**Depends on:** Task 2
**Files:** `packages/intelligence/src/adapters/index.ts`, `packages/intelligence/src/index.ts`

1. In `packages/intelligence/src/adapters/index.ts`, extend the canary exports:

```typescript
export { createCanaryAdapter, resolveTestCommand } from './canary.js';
export type {
  CanaryAdapter,
  CanaryProbe,
  CanaryDegradeReason,
  CanaryExec,
  FrameworkRecommendation,
  CanaryFinding,
  CanaryFrameworkInfo,
} from './canary.js';
```

2. In `packages/intelligence/src/index.ts`, mirror it:

```typescript
export { createCanaryAdapter, resolveTestCommand } from './adapters/index.js';
export type {
  CanaryAdapter,
  CanaryProbe,
  CanaryDegradeReason,
  CanaryExec,
  FrameworkRecommendation,
  CanaryFinding,
  CanaryFrameworkInfo,
} from './adapters/index.js';
```

3. Run: `npx tsc --noEmit -p packages/intelligence/tsconfig.json`
4. Run: `npx vitest run packages/intelligence/tests/adapters/canary.test.ts packages/intelligence/tests/adapters/canary-boundary.test.ts`
5. Run: `harness validate`
6. Commit: `feat(intelligence): export resolveTestCommand and CanaryFrameworkInfo from package barrel`

---

### Task 4: Verify degrade-with-real-binary + full adapter suite green

**Depends on:** Task 3
**Files:** (verification only — no edits expected)

1. Run the full intelligence adapter test file plus boundary:
   `npx vitest run packages/intelligence/tests/adapters/`
2. **Observe** all suites green (probe, recommendFramework, reviewTest, listFrameworks, resolveTestCommand, boundary).
3. Run: `harness check-deps` — no new dependency/boundary violations.
4. Run: `harness validate`
5. If any check fails, fix and fold into the relevant prior task's commit; otherwise no commit (this is a gate task).

---

## Traceability Matrix

| Observable Truth                                   | Delivered by Task(s)   |
| -------------------------------------------------- | ---------------------- |
| 1. Parses top-level `frameworks` array             | Task 2                 |
| 2. `[]` on every degrade, never throws             | Task 2, Task 4         |
| 3. Permissive schema defaults / ignored extra keys | Task 1, Task 2         |
| 4. `resolveTestCommand` fills `{file}`             | Task 1                 |
| 5. `ci_flags` appended only under `ci`             | Task 1                 |
| 6. `null` for null `execution_command`             | Task 1                 |
| 7. `null` for no-`{file}` commands                 | Task 1                 |
| 8. Adapter exposes `listFrameworks`; boundary OK   | Task 2, Task 3, Task 4 |
| 9. Barrel exports resolve                          | Task 3                 |
| 10. `harness validate` passes                      | All tasks              |

## Feasibility notes (carried into Phases 2–4)

- **CLI shape correction (baked in).** `canary frameworks --json` → `{ frameworks: CanaryFrameworkInfo[] }`, not `{ frameworks: string[], details: [...] }`. The adapter parses `parsed.data.frameworks`. Update the spec's technical-design snippet (proposal lines 82, 160) to match, or note the correction in the knowledge doc (Phase 4).
- **Extension collisions are broad.** `spec.ts` maps to playwright, vitest, axe-core, wdio, fast-check; `test.ts` to playwright, vitest, fast-check. playwright and vitest are both `status: preferred` / `tier: full`, so the `preferred`/`full` tie-break does not separate them. Phase 2's matcher resolves the residual tie deterministically by registry order (first-listed wins → playwright, which satisfies success criterion 2). See the Phase 2 plan's feasibility note for the semantic caveat (a `.test.ts` vitest project would still be offered playwright) and the recommended DETECT reconciliation.
