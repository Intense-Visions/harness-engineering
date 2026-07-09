# Plan: harness:rollback — Phase 2 (CLI command + composer)

**Date:** 2026-07-08 | **Spec:** docs/changes/harness-rollback/proposal.md (Implementation Order #2) | **Tasks:** 11 | **Time:** ~44 min | **Integration Tier:** medium

## Goal

`harness rollback evaluate --pr <n>` resolves a merged PR, classifies revert-readiness through a real Node/`gh` `RollbackIO` adapter, composes an idempotent full-context revert PR via `gh` (or prints its body under `--dry-run`), and appends a `rollback_event` breadcrumb — all exercised end-to-end against an injected fake git/gh seam.

## Scope

This plan covers **only** Implementation Order #2 from the spec. Out of scope (later phases, do NOT plan): `rollback.signals` sweep + `.github/workflows/rollback-propose.yml` (Phase 3); skill 4-platform copies, ADR, AGENTS.md/reference-doc regen, SDLC-coverage `gap → partial` (Phase 4).

Phase 1 is DONE and committed: `packages/core/src/rollback/{types.ts,io.ts,classify.ts,index.ts}` (pure `classifyRevert`, `RollbackDecision`, `RollbackIO` seam) and the `rollback` config block in `packages/cli/src/config/schema.ts`. This plan also folds in carried-forward Phase-1 review findings (#1–#4, #6) that harden `classify.ts` now that the caller is being built.

## Observable Truths (Acceptance Criteria)

1. **[SC1/G1]** When `evaluate --pr <n>` classifies a target as revert-ready and no open revert PR exists, exactly one PR labeled `harness:rollback` is opened via the injected gh seam; the returned `RollbackDecision.action === 'proposed'` with a `prUrl`.
2. **[SC1/G1]** When an open revert PR already carrying the `harness:rollback` label for the target already exists, `evaluate` opens no second PR; `action === 'skipped'` with an idempotency reason and the existing `prUrl`.
3. **[SC2/G2]** When the target's `git revert` conflicts, `action === 'skipped'`, `revertReady === false`, and no PR is opened.
4. **[SC2/G2]** When the target has a dependent later merge, `action === 'blocked'`, `revertReady === false`, and no PR is opened.
5. **[SC3/G3]** The composed PR body (and `--dry-run` output) contains: trigger, target PR number, blast-radius (when present), migration warnings (when present), and classification reasons.
6. **[SC4/G4]** Each `evaluate` call appends exactly one `rollback_event` record to `.harness/signals/` carrying `{ targetPr, trigger, revertReady, action, prUrl, ts }`.
7. **`--dry-run`** prints the PR body and does NOT call the gh open-PR seam.
8. **[Finding #2]** `classifyRevert` with an empty `changedFiles` set returns `action === 'skipped'` with an explanatory reason (never silently `proposed`).
9. **[Finding #3]** The dependent-merge check excludes the target PR itself (self-intersection guard).
10. The command registers in the CLI table: `node packages/cli/dist/bin/harness.js rollback evaluate --help` lists the flags `--pr`, `--trigger`, `--reason`, `--dry-run`.
11. All new tests pass (`pnpm --filter @harness-engineering/cli test`, `pnpm --filter @harness-engineering/core test`) and `harness validate` passes (modulo pre-existing dashboard design-token warnings).

## Uncertainties

- **[ASSUMPTION]** The real IO adapter shells `git`/`gh` via `execFileSync` (matching `review-ci.ts`/`pre-merge-brief.ts` convention), not async `execFile`. The spec says "execFile (not exec)"; `execFileSync` satisfies the "no shell / arg-array" intent and matches the codebase. If async is required, Task 4's adapter signature changes only.
- **[ASSUMPTION]** The scratch-index `git revert` uses a temporary `GIT_INDEX_FILE` env + `git read-tree HEAD` so the working tree and real index are untouched, then the temp index file is discarded (no `git revert --abort` needed because `-n` stages without committing and we never touch the real index). Verified approach below in Task 4.
- **[ASSUMPTION]** Merged-PR merge-commit + changed-files resolution uses `gh pr view <n> --json mergeCommit,files` and later-merges via `gh pr list --state merged --json number,files,mergedAt`. Field availability confirmed against `gh` schema used elsewhere in the repo (`pre-merge-brief.ts` uses `gh pr view --json`).
- **[DEFERRABLE]** Graph-node linking of the breadcrumb to `execution_outcome` is best-effort/degrade-safe (mirrors `outcome-eval.ts` `loadGraphStore` fallback). If `@harness-engineering/graph` load fails, the JSONL breadcrumb still lands. Kept in its own task so it can be dropped without affecting SC4.
- **[DEFERRABLE]** Exact PR-body markdown wording. Finalized in Task 5; body is snapshot-tested loosely (contains-assertions, not exact-match).

## File Map

- CREATE `packages/cli/src/commands/rollback.ts` — `createRollbackCommand()` + `evaluate` action + `runRollbackEvaluate` (pure orchestrator over injected seams).
- CREATE `packages/cli/src/rollback/io.ts` — real `NodeRollbackIO` adapter (git scratch-index revert, merge-commit/changed-files + later-merges resolution via `gh`) implementing the extended IO surface.
- CREATE `packages/cli/src/rollback/compose.ts` — `composeRevertPr()` (idempotency check, title/label/body build, dry-run) over an injected gh seam.
- CREATE `packages/cli/src/rollback/breadcrumb.ts` — `appendRollbackEvent()` JSONL writer + optional graph-node link.
- CREATE `packages/cli/tests/commands/rollback.test.ts` — command-level tests against fake git/gh seam (proposed / skipped-conflict / blocked-dependent / idempotent-skip / dry-run + SC4 breadcrumb).
- CREATE `packages/cli/tests/rollback/compose.test.ts` — composer unit tests (idempotency, body content, dry-run no-open).
- MODIFY `packages/core/src/rollback/classify.ts` — findings #1 (comment + case-insensitive migration heuristic), #2 (empty-set → skipped), #3 (self-intersection guard), #4 (conflict-fallback wording).
- MODIFY `packages/core/src/rollback/classify.test.ts` — findings #2/#6 (empty-set, exact migration-warning count, unknown-conflict fallback branch, self-intersection).
- MODIFY `packages/core/src/rollback/io.ts` — extend `RollbackIO` with the resolver methods (`resolveTarget`, `listLaterMerges`) so the real adapter + command share one seam. (Type-only change; `classify.ts` still uses only `revertDryRun`.)
- MODIFY `packages/cli/src/commands/_registry.ts` — regenerated (do not hand-edit) via `pnpm run generate-barrel-exports`.

_(Core barrel: no new core runtime export is required — the CLI imports `classifyRevert`/types from the existing `@harness-engineering/core` barrel already wired in Phase 1. Only `packages/core/src/rollback/io.ts`'s exported `RollbackIO` type is extended, and it is already re-exported by `packages/core/src/rollback/index.ts`. Confirm in Task 3 that `generate:barrels:check` stays green; if it flags the new resolver types, edit `scripts/generate-core-barrel.mjs` allowlist per the curated-allowlist rule.)_

## Skills

_No SKILLS.md found alongside the spec. Relevant repo conventions applied inline: `execFileSync` no-shell seam (`review-ci.ts`), commander `create*Command` + `_registry.ts` regen, vitest injected-seam tests, degrade-safe graph load (`outcome-eval.ts`)._

## Skeleton

Standard rigor, 11 tasks (>= 8) → skeleton produced.

1. Harden core `classify` per Phase-1 findings, TDD (~2 tasks, ~8 min)
2. Extend the `RollbackIO` seam type for the caller (~1 task, ~3 min)
3. Composer + breadcrumb building blocks, TDD (~3 tasks, ~14 min)
4. Real Node/gh IO adapter (~1 task, ~5 min)
5. CLI command orchestration + registration, TDD (~3 tasks, ~12 min)
6. Validate + wiring check (~1 task, ~2 min)

**Estimated total:** 11 tasks, ~44 minutes.

_Skeleton approved: pending (see sign-off request)._

## Tasks

### Task 1: Harden classify.ts per findings #1–#4 (test-first)

**Depends on:** none | **Files:** `packages/core/src/rollback/classify.test.ts`, `packages/core/src/rollback/classify.ts`

TDD. First add failing tests to `packages/core/src/rollback/classify.test.ts`, then implement.

1. Add these test cases (findings #2, #3, #6) to the existing describe block:

```ts
it('classifies an empty changedFiles set as skipped, not proposed (#2)', async () => {
  const io = { revertDryRun: async () => ({ clean: true, conflictPaths: [] }) };
  const decision = await classifyRevert(
    { targetPr: 10, trigger: 'signal', mergeSha: 'abc', changedFiles: [], laterMerges: [] },
    io
  );
  expect(decision.action).toBe('skipped');
  expect(decision.revertReady).toBe(false);
  expect(decision.reasons.join(' ')).toMatch(/no changed files/i);
});

it('excludes the target PR itself from dependent-merge detection (#3)', async () => {
  const io = { revertDryRun: async () => ({ clean: true, conflictPaths: [] }) };
  const decision = await classifyRevert(
    {
      targetPr: 42,
      trigger: 'signal',
      mergeSha: 'abc',
      changedFiles: ['src/a.ts'],
      laterMerges: [{ pr: 42, changedFiles: ['src/a.ts'] }],
    },
    io
  );
  expect(decision.dependentMerges).toEqual([]);
  expect(decision.action).toBe('proposed');
});

it('emits the exact migration-warning count for multiple migration files (#6)', async () => {
  const io = { revertDryRun: async () => ({ clean: true, conflictPaths: [] }) };
  const decision = await classifyRevert(
    {
      targetPr: 7,
      trigger: 'signal',
      mergeSha: 'abc',
      changedFiles: ['db/migrations/001.SQL', 'prisma/schema.prisma', 'src/x.ts'],
      laterMerges: [],
    },
    io
  );
  expect(decision.migrationWarnings).toHaveLength(2); // .SQL (case-insensitive) + schema.prisma
});

it('uses "unknown" conflict fallback when conflictPaths is empty (#6/#4)', async () => {
  const io = { revertDryRun: async () => ({ clean: false, conflictPaths: [] }) };
  const decision = await classifyRevert(
    {
      targetPr: 9,
      trigger: 'signal',
      mergeSha: 'abc',
      changedFiles: ['src/a.ts'],
      laterMerges: [],
    },
    io
  );
  expect(decision.action).toBe('skipped');
  expect(decision.reasons.join(' ')).toMatch(/conflicting paths unavailable|unknown/i);
});
```

2. Run: `pnpm --filter @harness-engineering/core test -- classify` — observe the 4 new tests FAIL.
3. Implement in `packages/core/src/rollback/classify.ts`:
   - **#1** — make `MIGRATION_PATTERNS` case-insensitive by lower-casing the path once before testing, and update the `.sql`/`migrations`/`schema.` matchers to run against the lower-cased path. Add a comment above `MIGRATION_PATTERNS`:
     ```ts
     // NOTE (v1, deliberately narrow): heuristic only — matches migrations/, *.sql,
     // and schema.{prisma,sql,graphql,rb}. It does NOT recognize db/migrate, Flyway
     // (V__*.sql conventions), Alembic (versions/*.py), or ORM-specific layouts.
     // Broaden with evidence, not speculation. Case-insensitive per finding #1.
     ```
     Change `detectMigrationWarnings` to test `const p = file.toLowerCase();` and keep the ORIGINAL `file` in the emitted warning string.
   - **#2** — at the top of `classifyRevert`, before the `revertDryRun` call, add:
     ```ts
     if (input.changedFiles.length === 0) {
       return {
         targetPr: input.targetPr,
         trigger: input.trigger,
         revertReady: false,
         reasons: ['no changed files resolved for the target PR — cannot classify a revert'],
         cleanRevert: false,
         dependentMerges: [],
         migrationWarnings: [],
         ...(input.blastRadius !== undefined ? { blastRadius: input.blastRadius } : {}),
         action: 'skipped',
       };
     }
     ```
   - **#3** — in the `dependentMerges` computation add the self-guard:
     ```ts
     const dependentMerges = input.laterMerges
       .filter((m) => m.pr !== input.targetPr)
       .filter((m) => intersects(input.changedFiles, m.changedFiles))
       .map((m) => m.pr);
     ```
   - **#4** — reword the conflict-fallback (classify.ts:57 region):
     ```ts
     const detail =
       conflictPaths.length > 0
         ? `conflicts: ${conflictPaths.join(', ')}`
         : 'conflicting paths unavailable';
     reasons.push(`git revert did not apply cleanly (${detail})`);
     ```
4. Run: `pnpm --filter @harness-engineering/core test -- classify` — observe ALL pass.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `fix(core): harden rollback classify per phase-1 review (#1-#4)`

### Task 2: Migration-heuristic case-insensitivity regression + count assertions (test-first tidy)

**Depends on:** Task 1 | **Files:** `packages/core/src/rollback/classify.test.ts`

_(Small: consolidates finding #6 coverage that isn't already in Task 1 — the mixed-case and non-migration exclusion assertions, kept separate so Task 1 stays a single logical change.)_

1. Add to `classify.test.ts`:

```ts
it('matches migration paths case-insensitively (#1)', async () => {
  const io = { revertDryRun: async () => ({ clean: true, conflictPaths: [] }) };
  const d = await classifyRevert(
    {
      targetPr: 1,
      trigger: 'signal',
      mergeSha: 'a',
      changedFiles: ['DB/Migrations/x.Sql'],
      laterMerges: [],
    },
    io
  );
  expect(d.migrationWarnings).toHaveLength(1);
  expect(d.migrationWarnings[0]).toContain('DB/Migrations/x.Sql'); // original casing preserved
});

it('emits no migration warnings for non-migration changes', async () => {
  const io = { revertDryRun: async () => ({ clean: true, conflictPaths: [] }) };
  const d = await classifyRevert(
    {
      targetPr: 1,
      trigger: 'signal',
      mergeSha: 'a',
      changedFiles: ['src/app.ts', 'README.md'],
      laterMerges: [],
    },
    io
  );
  expect(d.migrationWarnings).toEqual([]);
});
```

2. Run: `pnpm --filter @harness-engineering/core test -- classify` — observe PASS (Task 1 already implemented case-insensitivity).
3. Run: `node packages/cli/dist/bin/harness.js validate`
4. Commit: `test(core): rollback migration-heuristic case + exclusion coverage (#6)`

### Task 3: Extend the RollbackIO seam type with resolver methods

**Depends on:** none | **Files:** `packages/core/src/rollback/io.ts`

_(Type-only. `classify.ts` continues to use only `revertDryRun`; the command + real adapter share the full seam.)_

1. In `packages/core/src/rollback/io.ts`, extend the interface:

```ts
/** A merged PR's resolved revert inputs (merge commit + changed files). */
export interface ResolvedTarget {
  /** Merge commit sha of the target PR, fed to the scratch-index revert. */
  mergeSha: string;
  /** Files the target PR changed. Empty => classify returns `skipped` (finding #2). */
  changedFiles: string[];
  /** Original PR title, used to compose the revert PR title. */
  title: string;
}

export interface RollbackIO {
  revertDryRun(mergeSha: string): Promise<{ clean: boolean; conflictPaths: string[] }>;
  /** Resolve a merged PR to its merge commit, changed files, and title. */
  resolveTarget(pr: number): Promise<ResolvedTarget>;
  /** PRs merged after the target, with their changed-file sets (dependency check). */
  listLaterMerges(pr: number): Promise<import('./types').LaterMerge[]>;
}
```

2. Run: `pnpm --filter @harness-engineering/core typecheck` — observe clean (classify.ts uses a structural subtype; if the classify tests construct `io` literals lacking the new methods, they still satisfy the `RollbackIO` param only where `classifyRevert` is typed — verify no type error; if TS complains, relax the classify signature to `Pick<RollbackIO, 'revertDryRun'>`).
3. Run: `pnpm run generate:barrels:check` — confirm the core barrel stays green (the new types flow through the existing `rollback/index.ts` re-export). If it flags staleness, run `pnpm run generate:barrels` and include the diff.
4. Run: `node packages/cli/dist/bin/harness.js validate`
5. Commit: `feat(core): extend RollbackIO seam with target/later-merge resolvers`

### Task 4: Real Node/gh RollbackIO adapter (scratch-index revert + gh resolvers)

**Depends on:** Task 3 | **Files:** `packages/cli/src/rollback/io.ts`

_(No unit test here — this is the untestable-by-design real-process seam; it is exercised only via the fake in command tests. Keep it thin: all logic lives in composer/classify/command which ARE tested.)_

1. Create `packages/cli/src/rollback/io.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RollbackIO, ResolvedTarget, LaterMerge } from '@harness-engineering/core';

/** Trimmed stdout of `git <args>` (no shell — args are an array). */
const git = (args: string[], env?: NodeJS.ProcessEnv): string =>
  execFileSync('git', args, { encoding: 'utf-8', env: env ?? process.env }).toString();

/** Trimmed stdout of `gh <args>` (no shell). */
const gh = (args: string[]): string => execFileSync('gh', args, { encoding: 'utf-8' }).toString();

/**
 * Real RollbackIO. `revertDryRun` applies `git revert -n -m 1 <sha>` against a
 * TEMPORARY index file (GIT_INDEX_FILE) seeded from HEAD, so neither the working
 * tree nor the real index is mutated; the temp index is discarded afterward.
 */
export function createNodeRollbackIO(): RollbackIO {
  return {
    async revertDryRun(mergeSha) {
      const dir = mkdtempSync(join(tmpdir(), 'harness-rollback-'));
      const indexFile = join(dir, 'index');
      const env = { ...process.env, GIT_INDEX_FILE: indexFile };
      try {
        git(['read-tree', 'HEAD'], env); // seed the scratch index from HEAD
        git(['revert', '-n', '-m', '1', mergeSha], env);
        return { clean: true, conflictPaths: [] };
      } catch {
        // Non-zero exit == conflict. Recover the conflicted paths from the scratch
        // index's unmerged entries (stage != 0), best-effort.
        let conflictPaths: string[] = [];
        try {
          const out = git(['diff', '--name-only', '--diff-filter=U'], env);
          conflictPaths = out
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean);
        } catch {
          /* leave conflictPaths empty -> classify emits the 'unavailable' fallback */
        }
        return { clean: false, conflictPaths };
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },

    async resolveTarget(pr): Promise<ResolvedTarget> {
      const raw = gh(['pr', 'view', String(pr), '--json', 'mergeCommit,files,title']);
      const parsed = JSON.parse(raw) as {
        mergeCommit: { oid: string } | null;
        files: { path: string }[];
        title: string;
      };
      return {
        mergeSha: parsed.mergeCommit?.oid ?? '',
        changedFiles: (parsed.files ?? []).map((f) => f.path),
        title: parsed.title ?? `PR #${pr}`,
      };
    },

    async listLaterMerges(pr): Promise<LaterMerge[]> {
      // The target's mergedAt bounds "later"; fetch merged PRs and filter client-side.
      const targetRaw = gh(['pr', 'view', String(pr), '--json', 'mergedAt']);
      const targetMergedAt = (JSON.parse(targetRaw) as { mergedAt: string | null }).mergedAt;
      if (!targetMergedAt) return [];
      const raw = gh([
        'pr',
        'list',
        '--state',
        'merged',
        '--limit',
        '100',
        '--json',
        'number,files,mergedAt',
      ]);
      const list = JSON.parse(raw) as {
        number: number;
        files: { path: string }[];
        mergedAt: string;
      }[];
      return list
        .filter((p) => p.number !== pr && p.mergedAt > targetMergedAt)
        .map((p) => ({ pr: p.number, changedFiles: (p.files ?? []).map((f) => f.path) }));
    },
  };
}
```

2. Run: `pnpm --filter @harness-engineering/cli typecheck` — observe clean.
3. Run: `node packages/cli/dist/bin/harness.js validate`
4. Commit: `feat(cli): real Node/gh RollbackIO adapter (scratch-index revert + resolvers)`

### Task 5: PR composer with idempotency + dry-run (test-first)

**Depends on:** none | **Files:** `packages/cli/tests/rollback/compose.test.ts`, `packages/cli/src/rollback/compose.ts`

TDD. Composer takes an injected gh seam so tests never shell out.

1. Create `packages/cli/tests/rollback/compose.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { composeRevertPr, buildRevertBody, ROLLBACK_LABEL } from '../../src/rollback/compose';
import type { RollbackDecision } from '@harness-engineering/core';

const baseDecision: RollbackDecision = {
  targetPr: 42,
  trigger: 'signal',
  revertReady: true,
  reasons: ['clean revert with no dependent later merge'],
  cleanRevert: true,
  dependentMerges: [],
  blastRadius: 7,
  migrationWarnings: ['db/migrations/001.sql (migration directory) — verify...'],
  action: 'proposed',
};

function fakeGh(existing: number[] = [], url = 'https://gh/pr/99') {
  return {
    findOpenRevertPr: vi.fn(async () => (existing.length ? existing[0]! : null)),
    findOpenRevertPrUrl: vi.fn(async () => (existing.length ? url : null)),
    openPr: vi.fn(async () => url),
  };
}

describe('buildRevertBody', () => {
  it('includes trigger, target, blast-radius, migration warnings, and reasons (SC3)', () => {
    const body = buildRevertBody(baseDecision, 'Add feature X');
    expect(body).toMatch(/trigger.*signal/i);
    expect(body).toContain('#42');
    expect(body).toMatch(/blast.?radius.*7/i);
    expect(body).toContain('migration');
    expect(body).toContain('clean revert with no dependent later merge');
  });
});

describe('composeRevertPr', () => {
  it('opens exactly one labeled PR when none exists (SC1)', async () => {
    const gh = fakeGh([]);
    const res = await composeRevertPr(baseDecision, 'Add feature X', { gh });
    expect(gh.openPr).toHaveBeenCalledTimes(1);
    const [args] = gh.openPr.mock.calls[0]!;
    expect(args.title).toBe('revert: Add feature X (automated rollback)');
    expect(args.label).toBe(ROLLBACK_LABEL);
    expect(res).toEqual({ action: 'proposed', prUrl: 'https://gh/pr/99' });
  });

  it('is idempotent — skips when an open revert PR already exists (SC1)', async () => {
    const gh = fakeGh([99]);
    const res = await composeRevertPr(baseDecision, 'Add feature X', { gh });
    expect(gh.openPr).not.toHaveBeenCalled();
    expect(res.action).toBe('skipped');
    expect(res.prUrl).toBe('https://gh/pr/99');
  });

  it('dry-run prints the body and never opens a PR', async () => {
    const gh = fakeGh([]);
    const printed: string[] = [];
    const res = await composeRevertPr(baseDecision, 'Add feature X', {
      gh,
      dryRun: true,
      print: (s) => printed.push(s),
    });
    expect(gh.openPr).not.toHaveBeenCalled();
    expect(printed.join('\n')).toContain('#42');
    expect(res.action).toBe('proposed'); // dry-run reports what WOULD happen
    expect(res.prUrl).toBeUndefined();
  });

  it('does not compose for a non-revert-ready decision', async () => {
    const gh = fakeGh([]);
    const blocked = { ...baseDecision, revertReady: false, action: 'blocked' as const };
    const res = await composeRevertPr(blocked, 'Add feature X', { gh });
    expect(gh.openPr).not.toHaveBeenCalled();
    expect(res.action).toBe('blocked');
  });
});
```

2. Run: `pnpm --filter @harness-engineering/cli test -- compose` — observe FAIL (module missing).
3. Create `packages/cli/src/rollback/compose.ts`:

```ts
import type { RollbackDecision } from '@harness-engineering/core';

export const ROLLBACK_LABEL = 'harness:rollback';

/** Injected gh seam for the composer (real impl shells `gh` in the command). */
export interface ComposeGhSeam {
  /** PR number of an OPEN revert PR labeled ROLLBACK_LABEL for `targetPr`, else null. */
  findOpenRevertPr(targetPr: number, label: string): Promise<number | null>;
  /** URL of that existing open revert PR, else null. */
  findOpenRevertPrUrl(targetPr: number, label: string): Promise<string | null>;
  /** Open the revert PR; returns its URL. */
  openPr(args: { title: string; body: string; label: string; targetPr: number }): Promise<string>;
}

export interface ComposeOptions {
  gh: ComposeGhSeam;
  dryRun?: boolean;
  print?: (line: string) => void;
}

export interface ComposeResult {
  action: RollbackDecision['action'];
  prUrl?: string;
}

/** Full-context revert PR body (SC3): trigger, target, blast-radius, warnings, reasons. */
export function buildRevertBody(d: RollbackDecision, originalTitle: string): string {
  const lines = [
    `## Automated rollback proposal`,
    ``,
    `**Trigger:** ${d.trigger}`,
    `**Target PR:** #${d.targetPr} — ${originalTitle}`,
    `**Revert-ready:** ${d.revertReady}`,
    d.blastRadius !== undefined ? `**Blast radius:** ${d.blastRadius}` : ``,
    ``,
    `### Classification`,
    ...d.reasons.map((r) => `- ${r}`),
  ];
  if (d.migrationWarnings.length > 0) {
    lines.push(
      ``,
      `### Migration / irreversibility warnings`,
      ...d.migrationWarnings.map((w) => `- ${w}`)
    );
  }
  if (d.dependentMerges.length > 0) {
    lines.push(
      ``,
      `### Dependent later merges`,
      `- ${d.dependentMerges.map((n) => `#${n}`).join(', ')}`
    );
  }
  return lines.filter((l) => l !== undefined).join('\n');
}

/**
 * Compose (or dry-run) the revert PR. Only revert-ready decisions compose; the
 * ROLLBACK_LABEL makes re-runs idempotent (skip if an open revert PR exists).
 */
export async function composeRevertPr(
  decision: RollbackDecision,
  originalTitle: string,
  opts: ComposeOptions
): Promise<ComposeResult> {
  if (!decision.revertReady) return { action: decision.action };

  const body = buildRevertBody(decision, originalTitle);

  if (opts.dryRun) {
    const print = opts.print ?? ((s: string) => process.stdout.write(`${s}\n`));
    print(body);
    return { action: 'proposed' };
  }

  const existingUrl = await opts.gh.findOpenRevertPrUrl(decision.targetPr, ROLLBACK_LABEL);
  const existing = await opts.gh.findOpenRevertPr(decision.targetPr, ROLLBACK_LABEL);
  if (existing !== null) {
    return { action: 'skipped', ...(existingUrl ? { prUrl: existingUrl } : {}) };
  }

  const prUrl = await opts.gh.openPr({
    title: `revert: ${originalTitle} (automated rollback)`,
    body,
    label: ROLLBACK_LABEL,
    targetPr: decision.targetPr,
  });
  return { action: 'proposed', prUrl };
}
```

4. Run: `pnpm --filter @harness-engineering/cli test -- compose` — observe PASS.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(cli): rollback PR composer with harness:rollback idempotency + dry-run`

### Task 6: rollback_event breadcrumb writer (test-first)

**Depends on:** none | **Files:** `packages/cli/tests/rollback/breadcrumb.test.ts`, `packages/cli/src/rollback/breadcrumb.ts`

TDD. JSONL append to `.harness/signals/`; graph link is best-effort/degrade-safe.

1. Create `packages/cli/tests/rollback/breadcrumb.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendRollbackEvent, ROLLBACK_EVENTS_FILE } from '../../src/rollback/breadcrumb';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rb-crumb-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('appendRollbackEvent', () => {
  it('appends exactly one JSONL record with the required fields (SC4)', async () => {
    await appendRollbackEvent(
      {
        targetPr: 42,
        trigger: 'signal',
        revertReady: true,
        action: 'proposed',
        prUrl: 'https://gh/pr/99',
      },
      { root }
    );
    const file = join(root, ROLLBACK_EVENTS_FILE);
    expect(existsSync(file)).toBe(true);
    const lines = readFileSync(file, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const rec = JSON.parse(lines[0]!);
    expect(rec).toMatchObject({
      targetPr: 42,
      trigger: 'signal',
      revertReady: true,
      action: 'proposed',
      prUrl: 'https://gh/pr/99',
    });
    expect(typeof rec.ts).toBe('string');
  });

  it('appends (not overwrites) on a second call', async () => {
    const ev = {
      targetPr: 1,
      trigger: 'signal' as const,
      revertReady: false,
      action: 'skipped' as const,
    };
    await appendRollbackEvent(ev, { root });
    await appendRollbackEvent({ ...ev, targetPr: 2 }, { root });
    const lines = readFileSync(join(root, ROLLBACK_EVENTS_FILE), 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
  });
});
```

2. Run: `pnpm --filter @harness-engineering/cli test -- breadcrumb` — observe FAIL.
3. Create `packages/cli/src/rollback/breadcrumb.ts`:

```ts
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const ROLLBACK_EVENTS_FILE = join('.harness', 'signals', 'rollback-events.jsonl');

export interface RollbackEvent {
  targetPr: number;
  trigger: 'signal' | 'eval';
  revertReady: boolean;
  action: 'proposed' | 'skipped' | 'blocked';
  prUrl?: string;
}

export interface AppendOptions {
  /** Project root (default cwd). */
  root?: string;
  /** Injected clock for deterministic tests. */
  now?: () => string;
}

/**
 * Append-only rollback_event breadcrumb (spec D5/G4). Writes one JSONL line to
 * `.harness/signals/rollback-events.jsonl`. Best-effort graph linking to the
 * target's execution_outcome happens in a separate, degrade-safe step.
 */
export async function appendRollbackEvent(
  event: RollbackEvent,
  opts: AppendOptions = {}
): Promise<void> {
  const root = opts.root ?? process.cwd();
  const ts = (opts.now ?? (() => new Date().toISOString()))();
  const file = join(root, ROLLBACK_EVENTS_FILE);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify({ ...event, ts })}\n`, 'utf-8');
}
```

4. Run: `pnpm --filter @harness-engineering/cli test -- breadcrumb` — observe PASS.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(cli): append-only rollback_event breadcrumb writer`

### Task 7: Best-effort graph-node link for the breadcrumb

**Depends on:** Task 6 | **Files:** `packages/cli/src/rollback/breadcrumb.ts`

_(Degrade-safe, mirrors `outcome-eval.ts`'s `loadGraphStore` fallback. Isolated so it can be dropped without touching SC4.)_

1. Add to `packages/cli/src/rollback/breadcrumb.ts` a `linkRollbackEventToGraph(event, opts)` that dynamically imports `@harness-engineering/graph` inside a try/catch; on any failure it returns silently (the JSONL breadcrumb already landed). Use `loadGraphStore` from `../mcp/utils/graph-loader.js` if present (grep to confirm the exported name), else the dynamic-import `GraphStore` fallback pattern from `outcome-eval.ts`. Add a node of kind `rollback_event` with an edge to the target PR's `execution_outcome` node when one is found; skip the edge if not.

```ts
export async function linkRollbackEventToGraph(
  event: RollbackEvent,
  opts: AppendOptions = {}
): Promise<void> {
  try {
    const { loadGraphStore } = await import('../mcp/utils/graph-loader.js');
    const store = await loadGraphStore(opts.root ?? process.cwd());
    if (!store) return; // no graph — degrade-safe no-op
    // best-effort: add rollback_event node + link to execution_outcome for targetPr
    // (exact GraphStore API mirrors outcome-eval.ts; keep failures swallowed)
    // ...store.addNode({ kind: 'rollback_event', ... }) etc.
  } catch {
    /* graph package/store unavailable — JSONL breadcrumb is the source of truth */
  }
}
```

2. Add a test to `breadcrumb.test.ts` asserting `linkRollbackEventToGraph` resolves (does not throw) when no graph exists under a temp root:
   ```ts
   it('graph link is a degrade-safe no-op when no graph exists', async () => {
     await expect(
       linkRollbackEventToGraph(
         { targetPr: 1, trigger: 'signal', revertReady: true, action: 'proposed' },
         { root }
       )
     ).resolves.toBeUndefined();
   });
   ```
3. Run: `pnpm --filter @harness-engineering/cli test -- breadcrumb` — observe PASS.
4. Run: `node packages/cli/dist/bin/harness.js validate`
5. Commit: `feat(cli): best-effort graph link for rollback_event breadcrumb`

### Task 8: Command orchestrator `runRollbackEvaluate` (test-first, fake seam)

**Depends on:** Task 1, Task 3, Task 5, Task 6 | **Files:** `packages/cli/tests/commands/rollback.test.ts`, `packages/cli/src/commands/rollback.ts`

TDD. The orchestrator wires resolve → classify → compose → breadcrumb over injected seams. This is the SC1/SC2/SC4 end-to-end coverage against the FAKE git/gh seam.

1. Create `packages/cli/tests/commands/rollback.test.ts` covering the five required scenarios:

```ts
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runRollbackEvaluate } from '../../src/commands/rollback';
import { ROLLBACK_EVENTS_FILE } from '../../src/rollback/breadcrumb';

function fakeIo(
  over: Partial<{
    clean: boolean;
    conflictPaths: string[];
    changedFiles: string[];
    later: { pr: number; changedFiles: string[] }[];
    title: string;
  }> = {}
) {
  return {
    revertDryRun: vi.fn(async () => ({
      clean: over.clean ?? true,
      conflictPaths: over.conflictPaths ?? [],
    })),
    resolveTarget: vi.fn(async () => ({
      mergeSha: 'sha1',
      changedFiles: over.changedFiles ?? ['src/a.ts'],
      title: over.title ?? 'Add A',
    })),
    listLaterMerges: vi.fn(async () => over.later ?? []),
  };
}
function fakeGh(existing: number[] = []) {
  return {
    findOpenRevertPr: vi.fn(async () => (existing.length ? existing[0]! : null)),
    findOpenRevertPrUrl: vi.fn(async () => (existing.length ? 'https://gh/pr/99' : null)),
    openPr: vi.fn(async () => 'https://gh/pr/100'),
  };
}

function withRoot(fn: (root: string) => Promise<void>) {
  return async () => {
    const root = mkdtempSync(join(tmpdir(), 'rb-cmd-'));
    try {
      await fn(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };
}

describe('runRollbackEvaluate', () => {
  it(
    'proposes a PR for a clean, independent target (SC1)',
    withRoot(async (root) => {
      const io = fakeIo();
      const gh = fakeGh([]);
      const d = await runRollbackEvaluate({ pr: 42, trigger: 'signal' }, { io, gh, root });
      expect(d.action).toBe('proposed');
      expect(d.prUrl).toBe('https://gh/pr/100');
      expect(gh.openPr).toHaveBeenCalledTimes(1);
      const rec = JSON.parse(readFileSync(join(root, ROLLBACK_EVENTS_FILE), 'utf-8').trim());
      expect(rec).toMatchObject({ targetPr: 42, action: 'proposed' });
    })
  );

  it(
    'skips on conflicting revert and opens no PR (SC2)',
    withRoot(async (root) => {
      const io = fakeIo({ clean: false, conflictPaths: ['src/a.ts'] });
      const gh = fakeGh([]);
      const d = await runRollbackEvaluate({ pr: 42, trigger: 'signal' }, { io, gh, root });
      expect(d.action).toBe('skipped');
      expect(gh.openPr).not.toHaveBeenCalled();
    })
  );

  it(
    'blocks on a dependent later merge and opens no PR (SC2)',
    withRoot(async (root) => {
      const io = fakeIo({ later: [{ pr: 50, changedFiles: ['src/a.ts'] }] });
      const gh = fakeGh([]);
      const d = await runRollbackEvaluate({ pr: 42, trigger: 'signal' }, { io, gh, root });
      expect(d.action).toBe('blocked');
      expect(d.dependentMerges).toContain(50);
      expect(gh.openPr).not.toHaveBeenCalled();
    })
  );

  it(
    'is idempotent when an open revert PR already exists (SC1)',
    withRoot(async (root) => {
      const io = fakeIo();
      const gh = fakeGh([99]);
      const d = await runRollbackEvaluate({ pr: 42, trigger: 'signal' }, { io, gh, root });
      expect(d.action).toBe('skipped');
      expect(gh.openPr).not.toHaveBeenCalled();
      expect(d.prUrl).toBe('https://gh/pr/99');
    })
  );

  it(
    'dry-run prints the body, opens no PR, still writes a breadcrumb',
    withRoot(async (root) => {
      const io = fakeIo();
      const gh = fakeGh([]);
      const printed: string[] = [];
      const d = await runRollbackEvaluate(
        { pr: 42, trigger: 'signal', dryRun: true },
        { io, gh, root, print: (s) => printed.push(s) }
      );
      expect(gh.openPr).not.toHaveBeenCalled();
      expect(printed.join('\n')).toContain('#42');
      expect(d.action).toBe('proposed');
      const rec = JSON.parse(readFileSync(join(root, ROLLBACK_EVENTS_FILE), 'utf-8').trim());
      expect(rec.targetPr).toBe(42);
    })
  );
});
```

2. Run: `pnpm --filter @harness-engineering/cli test -- rollback` — observe FAIL (module missing).
3. Create `packages/cli/src/commands/rollback.ts` with `runRollbackEvaluate` (command wiring added in Task 9):

```ts
import { classifyRevert } from '@harness-engineering/core';
import type { RollbackDecision, RollbackIO } from '@harness-engineering/core';
import { composeRevertPr, type ComposeGhSeam } from '../rollback/compose';
import { appendRollbackEvent } from '../rollback/breadcrumb';

export interface RollbackEvaluateArgs {
  pr: number;
  trigger?: 'signal' | 'eval';
  reason?: string;
  dryRun?: boolean;
}

export interface RollbackEvaluateDeps {
  io: RollbackIO;
  gh: ComposeGhSeam;
  root?: string;
  print?: (line: string) => void;
}

/** resolve → classify → compose → breadcrumb, all over injected seams (testable). */
export async function runRollbackEvaluate(
  args: RollbackEvaluateArgs,
  deps: RollbackEvaluateDeps
): Promise<RollbackDecision> {
  const trigger = args.trigger ?? 'signal';
  const target = await deps.io.resolveTarget(args.pr);
  const laterMerges = await deps.io.listLaterMerges(args.pr);

  const decision = await classifyRevert(
    {
      targetPr: args.pr,
      trigger,
      mergeSha: target.mergeSha,
      changedFiles: target.changedFiles,
      laterMerges,
    },
    deps.io
  );

  const composed = await composeRevertPr(decision, target.title, {
    gh: deps.gh,
    ...(args.dryRun ? { dryRun: true } : {}),
    ...(deps.print ? { print: deps.print } : {}),
  });

  // Composer may downgrade proposed->skipped (idempotent existing PR); reflect it.
  const finalDecision: RollbackDecision = {
    ...decision,
    action: composed.action,
    ...(composed.prUrl ? { prUrl: composed.prUrl } : {}),
  };

  await appendRollbackEvent(
    {
      targetPr: finalDecision.targetPr,
      trigger: finalDecision.trigger,
      revertReady: finalDecision.revertReady,
      action: finalDecision.action,
      ...(finalDecision.prUrl ? { prUrl: finalDecision.prUrl } : {}),
    },
    deps.root !== undefined ? { root: deps.root } : {}
  );

  return finalDecision;
}
```

4. Run: `pnpm --filter @harness-engineering/cli test -- rollback` — observe PASS.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(cli): rollback evaluate orchestrator (resolve→classify→compose→breadcrumb)`

### Task 9: `createRollbackCommand` commander wiring + real-seam binding

**Depends on:** Task 4, Task 7, Task 8 | **Files:** `packages/cli/src/commands/rollback.ts`

1. Add to `packages/cli/src/commands/rollback.ts`:
   - Import `Command`, `Option` from `commander`; `createNodeRollbackIO` from `../rollback/io`; `linkRollbackEventToGraph` from `../rollback/breadcrumb`; `logger` from `../output/logger`.
   - A real `ComposeGhSeam` implementation shelling `gh` via `execFileSync` (mirror `review-ci.ts`): `findOpenRevertPr`/`findOpenRevertPrUrl` via `gh pr list --state open --label harness:rollback --search "revert #<targetPr>" --json number,url` (client-filter the body/title for the target reference), `openPr` via `gh pr create --title ... --body-file - --label harness:rollback` reading the branch it just created. Keep this seam thin — no test needed (exercised via the fake).
   - `createRollbackCommand()`:

```ts
export function createRollbackCommand(): Command {
  const rollback = new Command('rollback').description(
    'Post-ship revert circuit breaker (propose-only in v1)'
  );
  rollback
    .command('evaluate')
    .description('Classify a merged PR for revert-readiness and, if ready, propose a revert PR')
    .requiredOption('--pr <n>', 'target merged PR number', (v) => Number.parseInt(v, 10))
    .addOption(
      new Option('--trigger <trigger>', 'what fired this evaluation')
        .choices(['signal', 'eval'])
        .default('signal')
    )
    .option('--reason <str>', 'human-readable reason recorded on the proposal')
    .option('--dry-run', 'print the revert PR body without opening a PR', false)
    .action(async (opts: Record<string, unknown>) => {
      const decision = await runRollbackEvaluate(
        {
          pr: opts.pr as number,
          trigger: opts.trigger as 'signal' | 'eval',
          reason: opts.reason as string | undefined,
          dryRun: opts.dryRun as boolean | undefined,
        },
        { io: createNodeRollbackIO(), gh: createGhSeam() }
      );
      // Best-effort graph link (never blocks the verdict).
      await linkRollbackEventToGraph({
        targetPr: decision.targetPr,
        trigger: decision.trigger,
        revertReady: decision.revertReady,
        action: decision.action,
        ...(decision.prUrl ? { prUrl: decision.prUrl } : {}),
      });
      logger.info(JSON.stringify(decision, null, 2));
      // Non-proposed verdicts are legitimate outcomes, not failures — exit 0.
    });
  return rollback;
}
```

2. Run: `pnpm --filter @harness-engineering/cli typecheck` — observe clean.
3. Run: `pnpm --filter @harness-engineering/cli test -- rollback` — observe PASS (unchanged).
4. Run: `node packages/cli/dist/bin/harness.js validate`
5. Commit: `feat(cli): wire harness rollback evaluate command with real git/gh seams`

### Task 10: Register `rollback` in the CLI command table

**Depends on:** Task 9 | **Files:** `packages/cli/src/commands/_registry.ts` | **Category:** integration

_(The registry is AUTO-GENERATED — regenerate, do not hand-edit.)_

1. Run: `pnpm run generate-barrel-exports` — regenerates `packages/cli/src/commands/_registry.ts` to include `createRollbackCommand`.
2. Verify the diff adds `import { createRollbackCommand } from './rollback';` and `createRollbackCommand,` to the exported array (grep the file).
3. Rebuild the CLI so the local binary reflects the new command: `pnpm --filter @harness-engineering/cli build` (or `pnpm turbo build --filter @harness-engineering/cli`).
4. Verify registration end-to-end: `node packages/cli/dist/bin/harness.js rollback evaluate --help` lists `--pr`, `--trigger`, `--reason`, `--dry-run` (Observable Truth 10).
5. Run: `pnpm run generate:barrels:check` — confirm barrels are up to date.
6. Run: `node packages/cli/dist/bin/harness.js validate`
7. Commit: `feat(cli): register rollback command in the CLI table`

### Task 11: Full-suite validation + wiring check

**Depends on:** Task 2, Task 10 | **Files:** _(none — verification only)_ | **Category:** integration

1. Run: `pnpm --filter @harness-engineering/core test` — all pass (classify hardening).
2. Run: `pnpm --filter @harness-engineering/cli test` — all pass (compose, breadcrumb, command).
3. Run: `pnpm --filter @harness-engineering/cli typecheck && pnpm --filter @harness-engineering/core typecheck` — clean.
4. Run: `node packages/cli/dist/bin/harness.js check-deps` — passes.
5. Run: `node packages/cli/dist/bin/harness.js validate` — passes (pre-existing dashboard design-token warnings are the only findings; confirm no NEW rollback-related findings).
6. `[checkpoint:human-verify]` — Present the test summary and `rollback evaluate --help` output. Confirm Phase 2 is complete and the observable truths hold before handing off to Phase 3.
7. If arch baselines drift from the new CLI module, run `node packages/cli/dist/bin/harness.js check-arch --update-baseline` (full-project, scope-safe per Phase-1 learning) and commit: `chore: refresh arch baselines for rollback CLI module`.

## Sequencing & Parallelism

- **No-dependency roots (can start in parallel):** Task 1, Task 3, Task 5, Task 6.
- Task 2 → after Task 1 (same file). Task 4 → after Task 3 (needs the extended seam type). Task 7 → after Task 6 (same file). Task 8 → after 1/3/5/6 (integrates all). Task 9 → after 4/7/8. Task 10 → after 9. Task 11 → after 2/10.
- Critical path: 1 → 3 → 4 → 9 → 10 → 11 (and 5/6 → 8 → 9), ~30 min.

## Risks

- **gh JSON field drift** — `gh pr view --json mergeCommit,files,title` field names must match the installed `gh`. Mitigation: the resolvers live in the untested real adapter (Task 4); if a field is wrong, only that adapter changes — the fake-seam tests and classification logic are unaffected.
- **Scratch-index revert leaving state** — mitigated by an isolated `GIT_INDEX_FILE` temp dir + `rmSync` in `finally`; the real index/working tree are never touched (`-n` stages only into the scratch index).
- **Idempotency false-negative** — `findOpenRevertPr` relies on label + body target-reference search; a revert PR opened without the label would evade the check. Mitigation: the composer always applies `ROLLBACK_LABEL`, so harness-opened PRs are always found.

## Decisions (planning-phase)

- **Findings folded into Phase 2, not deferred** — #1–#4/#6 harden `classify.ts` exactly when the real caller/adapter lands, so the empty-set and self-intersection guards are covered by the resolver's real inputs.
- **`RollbackIO` extended (not a second seam)** — one injected seam (`revertDryRun` + `resolveTarget` + `listLaterMerges`) keeps the command's fake single-object and mirrors the existing single-seam convention.
- **Real adapters left untested-by-design** — git/gh shell adapters (Task 4, Task 9 `createGhSeam`) are thin; all branching logic is in tested pure functions, matching `review-ci.ts`/`pre-merge-brief.ts`.
