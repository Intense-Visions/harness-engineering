# Plan: Phase 5 — Roadmap migration command (`harness roadmap migrate --to=file-less`)

**Date:** 2026-05-09
**Spec:** `docs/changes/roadmap-tracker-only/proposal.md` (§"Migration command", §"Implementation Order" Phase 5)
**Tasks:** 17
**Time:** ~80 minutes
**Integration Tier:** medium
**Session:** `changes--roadmap-tracker-only--proposal`

## Goal

Ship a one-shot, dry-run-capable, idempotent `harness roadmap migrate --to=file-less` command that converts a file-backed project to file-less mode end-to-end (parse `docs/roadmap.md`, create or update tracker issues, backfill assignment-history as comments, archive the markdown file, flip `harness.config.json`), plus a user-facing migration guide with a rollback recipe.

## Scope Notes (read first)

1. **In-scope surfaces (per the spec prompt).**
   - New CLI command tree `harness roadmap` (the group does not exist today; the only existing `migrate` is the unrelated `harness migrate` for legacy artifact layouts — see `packages/cli/src/commands/migrate.ts`).
   - New subcommand `harness roadmap migrate` with `--to=file-less` and `--dry-run` flags.
   - Reusable migration core in `packages/core/src/roadmap/migrate/` (body-block diff, history-event hashing, plan/execute split) so the CLI command stays a thin shell.
   - Migration guide doc: `docs/changes/roadmap-tracker-only/migration.md`.
   - Carry-forward cleanup REV-P4-5: extract `loadTrackerClientConfigFromProject` to `@harness-engineering/core` and replace the three copies (cli, dashboard, orchestrator).
2. **Out of scope (deferred per the prompt).**
   - Phase 6: business-knowledge entries (`File-less Roadmap Mode`, `Tracker as Source of Truth`, `Roadmap Migration to File-less Mode`), ADRs, knowledge-graph enrichment.
   - Phase 7: React/SSE conflict UX in the dashboard client.
3. **Decisions surfaced for sign-off.** D-P5-A through D-P5-G. See §Decisions.
4. **Layer rules.** `cli` may import from `core`; `core` MUST NOT import from `cli`. Migration helpers (parse, diff, hash, plan-builder, idempotent compare) live in `packages/core/src/roadmap/migrate/`. The CLI command (`packages/cli/src/commands/roadmap/migrate.ts`) only orchestrates I/O (config read/write, stdout, archive file rename) and calls the core helpers. The CLI command may shell out to `loadProjectRoadmapMode` / `createTrackerClient` already exported from core.
5. **Idempotence is the load-bearing invariant.** Every step must be safely repeatable. The migration guide documents the recovery flow when an intermediate step fails: re-running the command picks up where it left off because steps 6 + 7 (archive + config flip) are **gated behind ALL prior steps succeeding**.
6. **Auto-upgrade rule.** Per prompt: if task count >20 or checkpoint count >6, the plan auto-upgrades to high complexity for APPROVE_PLAN. This plan has 17 tasks and 3 checkpoints, so it stays at the default complexity band.

## Decisions

| #      | Decision                                                                                                                                                                                                                                                                                                                                                                                                                 | Rationale                                                                                                                                                                                                                                                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-P5-A | Create a NEW `roadmap` command group under `packages/cli/src/commands/roadmap/` (`index.ts` registers subcommands; `migrate.ts` contains the `migrate` subcommand). Register the group in `_registry.ts` via `createRoadmapCommand`. Mirror the structure of the existing `graph/` group (see `packages/cli/src/commands/graph/index.ts:61-70`).                                                                         | The proposal's Integration Points table says "Top-level subcommand under `harness roadmap` (group may need to be created)". A group keeps room for future `roadmap` subcommands (e.g. `roadmap validate`, `roadmap status`) without further reshuffles. Mirroring `graph/` keeps the codebase consistent.                                         |
| D-P5-B | Body-block "already matches" diff: structural equality on a canonical `BodyMeta` projection (spec, plan, blocked_by sorted, priority, milestone). String-equality on raw YAML is fragile (whitespace, key order, list rendering). Use `parseBodyBlock` to derive a `BodyMeta` from the live issue body and compare key-by-key against the expected `BodyMeta` synthesized from the parsed feature.                       | Phase 2 already gives us a tolerant `parseBodyBlock` + a canonical `serializeBodyBlock`. Re-using them keeps the migration in sync with the source of truth and avoids drift if the canonical serializer changes.                                                                                                                                 |
| D-P5-C | History-event deduplication: hash each event with a stable, content-addressed key `sha256(type + actor + at + JSON.stringify(details ?? {}))`, then emit it as an HTML comment marker on the issue: `<!-- harness-history hash:<short8> --> { "type": …, "actor": …, "at": …, "details": … }`. On re-run, `client.fetchHistory(id)` is parsed (already extracts the JSON); we collect existing hashes and skip matches.  | GitHub comments are append-only; without a stable hash a re-run posts duplicates. The Phase 2 history-comment format is the canonical event envelope. Adding `hash:<short8>` to the existing prefix is a tiny, additive contract change. If a teammate re-runs after an aborted migration the worst case is N unchanged hashes — zero duplicates. |
| D-P5-D | Archive file conflict policy: refuse to overwrite an existing `docs/roadmap.md.archived`. The migration aborts with a clear error and the operator must move the existing file aside (the migration guide documents `mv docs/roadmap.md.archived docs/roadmap.md.archived.<ISO>`). Do NOT auto-timestamp inside the migrator — that would silently shadow a prior rollback artifact.                                     | The archived file is the rollback source of truth. Auto-renaming it on collision risks losing the prior rollback. Refusing is loud and recoverable. Listed as a checkpoint case in the migration guide.                                                                                                                                           |
| D-P5-E | Title-only collision policy (issue with the same title exists but no `External-ID` is recorded in `roadmap.md`): refuse, do NOT auto-create. The migration prints `AMBIGUOUS: feature "<name>" matches existing issue #<n> by title; no External-ID is recorded. Resolve by adding "External-ID: github:owner/repo#<n>" to the roadmap entry, then re-run.` and exits non-zero.                                          | Auto-creating risks duplicating real features. Auto-binding risks attaching the wrong issue. The remediation is mechanical and one line per feature; a human decision is the safest default.                                                                                                                                                      |
| D-P5-F | Config rewrite: read `harness.config.json`, parse JSON, mutate `roadmap.mode` only, write with `JSON.stringify(parsed, null, 2) + '\n'`. Before write, copy the original byte-for-byte to `harness.config.json.pre-migration`. Acknowledge in the migration guide that formatting may be normalized (no comments, key-order may change for added fields).                                                                | A deterministic JSON serializer that perfectly preserves user formatting is out of scope. The backup makes any normalization losslessly recoverable. `harness.config.json` is generated by `harness init` and rarely hand-formatted, so this is low impact in practice.                                                                           |
| D-P5-G | Carry-forward REV-P4-5: include the dedup task in Phase 5. Extract `loadTrackerClientConfigFromProject(projectRoot): Result<TrackerClientConfig, Error>` to `@harness-engineering/core` (`packages/core/src/roadmap/load-tracker-client-config.ts`), then replace the three copies in `cli/src/mcp/tools/roadmap.ts`, `dashboard/src/server/routes/actions.ts`, and `orchestrator/src/server/routes/roadmap-actions.ts`. | The migration command needs the same helper for step 1 ("verify roadmap.tracker is configured"). Pulling it now (rather than re-quadruplicating it) is the right time. A separate PR would either block this one or risk a fourth copy.                                                                                                           |

## Observable Truths (Acceptance Criteria)

1. **Ubiquitous:** The command `harness roadmap migrate --to=file-less --dry-run` shall exit 0 against a file-backed fixture project and print a plan listing N features that would be created, M features that would have their body updated, and K history events that would be appended — without making any tracker write calls. _(Trace: Tasks 8, 9, 12.)_

2. **Ubiquitous:** A run of `harness roadmap migrate --to=file-less` (no `--dry-run`) against the same fixture shall: (a) call `client.create()` exactly once per feature lacking an `External-ID`, (b) call `client.update()` exactly once per feature whose body-block differs from the expected canonical block (and zero times for features whose body already matches), (c) call `client.appendHistory()` exactly once per unique assignment-history event, (d) rename `docs/roadmap.md` to `docs/roadmap.md.archived`, (e) rewrite `harness.config.json` with `roadmap.mode: "file-less"`, (f) write `harness.config.json.pre-migration` containing the byte-for-byte original config. _(Trace: Tasks 7, 8, 9, 10, 11, 12.)_

3. **Event-driven (idempotence — re-run on success):** When a successful migration is re-run from the now-file-less project state, the command shall detect `roadmap.mode: "file-less"` is already set and exit 0 with a "Already migrated; nothing to do." message after step 1, performing zero tracker calls. _(Trace: Tasks 8, 12.)_

4. **Event-driven (idempotence — re-run after partial failure):** When `client.create()` succeeds for the first 5 features then throws on the 6th, the migration shall: (a) abort without renaming `docs/roadmap.md`, (b) abort without rewriting `harness.config.json`, (c) print a partial-completion report listing which features were created (with externalIds for operator action: hand-edit `roadmap.md` to record those External-IDs before re-running). On re-run after the operator records the External-IDs, the migration shall skip the 5 already-created features at step 3 and proceed with the 6th. _(Trace: Tasks 9, 13, 15.)_

5. **Event-driven (history deduplication):** When `client.appendHistory()` is invoked for an event whose hash already exists in `fetchHistory()` output, the call shall be skipped. A test exercises a fixture with 3 events, two of which are already posted as comments on the issue; the migration calls `appendHistory()` exactly once. _(Trace: Tasks 10, 12.)_

6. **Event-driven (title-only collision policy, D-P5-E):** When the parsed `roadmap.md` has a feature `"Foo"` with no `External-ID` and the tracker has an existing issue titled `"Foo"`, the migration shall NOT create a new issue, shall NOT auto-bind, and shall exit non-zero with the AMBIGUOUS message. _(Trace: Tasks 9, 12.)_

7. **Unwanted (archive collision):** If `docs/roadmap.md.archived` already exists when step 6 runs, the migration shall not overwrite it. The command shall exit non-zero with a remediation message. The config rewrite (step 7) shall not have run. _(Trace: Tasks 11, 12.)_

8. **Ubiquitous (config preservation):** After a successful migration, `harness.config.json` shall (a) contain `roadmap.mode: "file-less"`, (b) preserve every other top-level field present before the migration (verified by a deep-equal comparison after deleting only the `roadmap.mode` key), and (c) have a sibling `harness.config.json.pre-migration` whose bytes equal the original file's bytes. _(Trace: Tasks 11, 12.)_

9. **Ubiquitous (no tracker.kind set):** When `roadmap.tracker` is absent or `roadmap.tracker.kind` is not `"github"`, the migration shall exit non-zero at step 1 with the message from `loadTrackerClientConfigFromProject`. _(Trace: Tasks 7, 12.)_

10. **Ubiquitous (migration guide):** `docs/changes/roadmap-tracker-only/migration.md` shall exist and contain sections titled (case-insensitive substring match accepted in the test) "Pre-flight checklist", "Dry run", "Real run", "Verification", "Rollback recipe", "Recovery from partial failure", "Title-only collision", and "Archive collision". _(Trace: Task 14, doc-presence test in Task 15.)_

11. **Ubiquitous (REV-P4-5 dedup):** A single `loadTrackerClientConfigFromProject` exported from `@harness-engineering/core` is the only definition in the workspace. `rg "function loadTrackerClientConfigFrom(Project|Root)" packages/{cli,dashboard,orchestrator}/src` shall return zero matches. _(Trace: Tasks 5, 6.)_

12. **Ubiquitous (validate):** `harness validate` and `harness check-deps` pass at every commit in the plan. _(Trace: every task's final step.)_

## File Map

**CREATE (core):**

- `packages/core/src/roadmap/load-tracker-client-config.ts` — extracted helper (D-P5-G).
- `packages/core/tests/roadmap/load-tracker-client-config.test.ts`
- `packages/core/src/roadmap/migrate/index.ts` — barrel re-exports.
- `packages/core/src/roadmap/migrate/types.ts` — `MigrationPlan`, `MigrationStep`, `MigrationOptions`, `MigrationReport`.
- `packages/core/src/roadmap/migrate/body-diff.ts` — `bodyMetaMatches(actual: BodyMeta, expected: BodyMeta): boolean`.
- `packages/core/src/roadmap/migrate/history-hash.ts` — `hashHistoryEvent(event)` + envelope helpers.
- `packages/core/src/roadmap/migrate/plan-builder.ts` — `buildMigrationPlan(roadmap, existingFeatures, fetchHistoryByExternalId)`.
- `packages/core/src/roadmap/migrate/run.ts` — `runMigrationPlan(plan, client, opts)`; partial-failure semantics.
- `packages/core/tests/roadmap/migrate/body-diff.test.ts`
- `packages/core/tests/roadmap/migrate/history-hash.test.ts`
- `packages/core/tests/roadmap/migrate/plan-builder.test.ts`
- `packages/core/tests/roadmap/migrate/run.test.ts`
- `packages/core/tests/roadmap/migrate/run-idempotent.test.ts`
- `packages/core/tests/roadmap/migrate/run-partial-failure.test.ts`

**CREATE (cli):**

- `packages/cli/src/commands/roadmap/index.ts` — `createRoadmapCommand()` (group).
- `packages/cli/src/commands/roadmap/migrate.ts` — `runRoadmapMigrate()` + `createRoadmapMigrateCommand()`.
- `packages/cli/tests/commands/roadmap/migrate.test.ts` — integration test against a mock `RoadmapTrackerClient`.
- `packages/cli/tests/commands/roadmap/migrate-dry-run.test.ts` — zero-write assertion.
- `packages/cli/tests/commands/roadmap/migrate-idempotent.test.ts` — re-run skips.
- `packages/cli/tests/commands/roadmap/migrate-config.test.ts` — config rewrite + backup + format check.

**CREATE (docs):**

- `docs/changes/roadmap-tracker-only/migration.md`
- `packages/cli/tests/docs/migration-guide.test.ts` — assertion that the guide contains required sections.

**MODIFY:**

- `packages/core/src/roadmap/index.ts` — re-export `loadTrackerClientConfigFromProject` + migration types/runner.
- `packages/cli/src/mcp/tools/roadmap.ts` — delete local `loadTrackerClientConfigFromProject`, import from core.
- `packages/dashboard/src/server/routes/actions.ts` — delete local copy, import from core.
- `packages/orchestrator/src/server/routes/roadmap-actions.ts` — delete local `loadTrackerClientConfigFromRoot`, import from core.
- `packages/cli/src/commands/_registry.ts` — register `createRoadmapCommand` (run barrel generator).

## Skeleton

_Skeleton produced (rigor=standard, task count >= 8)._

1. **Carry-forward dedup (REV-P4-5)** — extract `loadTrackerClientConfigFromProject` to core, replace 3 copies (~3 tasks, ~12 min)
2. **Migration core in `packages/core/src/roadmap/migrate/`** — types, body-diff, history-hash, plan-builder, runner; TDD per file (~5 tasks, ~25 min)
3. **CLI command** — `roadmap` group + `migrate` subcommand + registry wiring; integration test against mock client; idempotence, dry-run, partial-failure tests (~6 tasks, ~30 min)
4. **Migration guide** — write `migration.md`; doc-presence test (~2 tasks, ~8 min)
5. **Final validation** — `harness validate`, `harness check-deps`, audit greps for stub removal + dedup verification (~1 task, ~5 min)

**Estimated total:** 17 tasks, ~80 minutes. Three `[checkpoint:human-verify]` points — after Task 6 (dedup landed), Task 12 (full migration runner passes), Task 15 (migration guide approved).

_Skeleton approved: pending APPROVE_PLAN._

## Tasks

### Task 1: Extract `loadTrackerClientConfigFromProject` to core (TDD)

**Depends on:** none | **Files:** `packages/core/src/roadmap/load-tracker-client-config.ts`, `packages/core/tests/roadmap/load-tracker-client-config.test.ts`

1. Create `packages/core/tests/roadmap/load-tracker-client-config.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import * as os from 'node:os';
   import { loadTrackerClientConfigFromProject } from '../../src/roadmap/load-tracker-client-config';

   function tmp(): string {
     return fs.mkdtempSync(path.join(os.tmpdir(), 'load-trackercfg-'));
   }

   describe('loadTrackerClientConfigFromProject', () => {
     it('returns Err when harness.config.json is missing', () => {
       const dir = tmp();
       const result = loadTrackerClientConfigFromProject(dir);
       expect(result.ok).toBe(false);
       if (!result.ok) expect(result.error.message).toMatch(/not found/i);
     });

     it('returns Err when roadmap.tracker is absent', () => {
       const dir = tmp();
       fs.writeFileSync(path.join(dir, 'harness.config.json'), JSON.stringify({ docsDir: 'docs' }));
       const result = loadTrackerClientConfigFromProject(dir);
       expect(result.ok).toBe(false);
       if (!result.ok) expect(result.error.message).toMatch(/tracker config missing/i);
     });

     it('returns Err when tracker.kind is not "github"', () => {
       const dir = tmp();
       fs.writeFileSync(
         path.join(dir, 'harness.config.json'),
         JSON.stringify({ roadmap: { tracker: { kind: 'jira', repo: 'x/y' } } })
       );
       const result = loadTrackerClientConfigFromProject(dir);
       expect(result.ok).toBe(false);
       if (!result.ok) expect(result.error.message).toMatch(/only supports kind/i);
     });

     it('returns Ok with mapped kind "github-issues" when config is valid', () => {
       const dir = tmp();
       fs.writeFileSync(
         path.join(dir, 'harness.config.json'),
         JSON.stringify({ roadmap: { tracker: { kind: 'github', repo: 'owner/repo' } } })
       );
       const result = loadTrackerClientConfigFromProject(dir);
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.kind).toBe('github-issues');
         expect(result.value.repo).toBe('owner/repo');
       }
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/core test load-tracker-client-config` — observe 4 failures (module missing).
3. Create `packages/core/src/roadmap/load-tracker-client-config.ts`:

   ```ts
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import type { Result } from '@harness-engineering/types';
   import { Ok, Err } from '@harness-engineering/types';
   import type { TrackerClientConfig } from './tracker/factory';

   /**
    * Build a `TrackerClientConfig` from `<projectRoot>/harness.config.json`.
    *
    * REV-P4-5 consolidation (D-P5-G): single source of truth for the previously
    * triplicated helper in cli (`mcp/tools/roadmap.ts`), dashboard
    * (`server/routes/actions.ts`), and orchestrator
    * (`server/routes/roadmap-actions.ts`).
    *
    * Maps `roadmap.tracker.kind === 'github'` (file-backed sync engine
    * namespace) to the client-side `kind: 'github-issues'`. See
    * `packages/cli/src/config/schema.ts:265` for the long-form note on the
    * two namespaces.
    */
   export function loadTrackerClientConfigFromProject(
     projectRoot: string
   ): Result<TrackerClientConfig, Error> {
     try {
       const configPath = path.join(projectRoot, 'harness.config.json');
       if (!fs.existsSync(configPath)) {
         return Err(new Error('harness.config.json not found'));
       }
       const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
         roadmap?: { tracker?: { kind?: string; repo?: string } };
       };
       const tracker = cfg.roadmap?.tracker;
       if (!tracker) {
         return Err(
           new Error(
             'file-less tracker config missing: set roadmap.tracker.kind in harness.config.json'
           )
         );
       }
       if (tracker.kind !== 'github') {
         return Err(
           new Error(`file-less tracker only supports kind: "github" today; got "${tracker.kind}"`)
         );
       }
       return Ok({ kind: 'github-issues', repo: tracker.repo ?? '' });
     } catch (e) {
       return Err(e instanceof Error ? e : new Error(String(e)));
     }
   }
   ```

4. Run: `pnpm --filter @harness-engineering/core test load-tracker-client-config` — observe 4 passes.
5. Run: `harness validate && harness check-deps`.
6. Commit: `feat(core): extract loadTrackerClientConfigFromProject helper (D-P5-G)`.

### Task 2: Export the new helper from core's roadmap barrel

**Depends on:** Task 1 | **Files:** `packages/core/src/roadmap/index.ts`

1. Append to `packages/core/src/roadmap/index.ts` (after the `loadProjectRoadmapMode` export, near the file end):

   ```ts
   /** Shared loader: resolves `TrackerClientConfig` from harness.config.json. */
   export { loadTrackerClientConfigFromProject } from './load-tracker-client-config';
   ```

2. Run: `pnpm --filter @harness-engineering/core build` — observe success.
3. Run: `harness validate`.
4. Commit: `chore(core): export loadTrackerClientConfigFromProject from roadmap barrel`.

### Task 3: Replace cli copy with the core import

**Depends on:** Task 2 | **Files:** `packages/cli/src/mcp/tools/roadmap.ts`

1. In `packages/cli/src/mcp/tools/roadmap.ts`:
   - Delete the local `loadTrackerClientConfigFromProject` definition (currently at lines 463–501) and its associated JSDoc.
   - Add to the top-level imports: `import { loadTrackerClientConfigFromProject } from '@harness-engineering/core';`
   - At the call site (line 509), update result shape access from `if (!trackerCfg.ok) { ... trackerCfg.error.message ... }` to match the `Result<TrackerClientConfig, Error>` shape exactly — the existing call site already discriminates on `.ok`, so the change is purely the import location.
2. Run: `pnpm --filter @harness-engineering/cli test mcp/tools/roadmap` — observe existing tests pass.
3. Run: `harness validate && harness check-deps`.
4. Commit: `refactor(cli): use core loadTrackerClientConfigFromProject helper (REV-P4-5)`.

### Task 4: Replace dashboard copy with the core import

**Depends on:** Task 2 | **Files:** `packages/dashboard/src/server/routes/actions.ts`

1. In `packages/dashboard/src/server/routes/actions.ts`:
   - Delete the local `loadTrackerClientConfigFromProject` definition (lines 25–62).
   - Add to the top-level imports: `import { loadTrackerClientConfigFromProject } from '@harness-engineering/core';`
   - Confirm both call sites (lines 191, 451) continue to discriminate on `.ok` — no change needed.
2. Run: `pnpm --filter @harness-engineering/dashboard test server/routes/actions` — observe existing tests pass.
3. Run: `harness validate && harness check-deps`.
4. Commit: `refactor(dashboard): use core loadTrackerClientConfigFromProject helper (REV-P4-5)`.

### Task 5: Replace orchestrator copy with the core import

**Depends on:** Task 2 | **Files:** `packages/orchestrator/src/server/routes/roadmap-actions.ts`

1. In `packages/orchestrator/src/server/routes/roadmap-actions.ts`:
   - Delete the local `loadTrackerClientConfigFromRoot` definition (lines 17–52).
   - Add to the top-level imports: `import { loadTrackerClientConfigFromProject } from '@harness-engineering/core';`
   - At the single call site (line 97), rename `loadTrackerClientConfigFromRoot(projectRoot)` to `loadTrackerClientConfigFromProject(projectRoot)`. The semantic is identical.
2. Run: `pnpm --filter @harness-engineering/orchestrator test server/routes/roadmap-actions` — observe existing tests pass.
3. Run: `harness validate && harness check-deps`.
4. Commit: `refactor(orchestrator): use core loadTrackerClientConfigFromProject helper (REV-P4-5)`.

### Task 6: Audit dedup completeness [checkpoint:human-verify]

**Depends on:** Tasks 3, 4, 5 | **Files:** none (audit only)

1. Run: `rg "function loadTrackerClientConfigFrom(Project|Root)" packages/{cli,dashboard,orchestrator}/src` — must return zero matches.
2. Run: `rg "loadTrackerClientConfigFrom(Project|Root)" packages/{cli,dashboard,orchestrator}/src` — every match must be an import, not a function definition.
3. Run: `pnpm test` from repo root — full suite green.
4. Run: `harness validate && harness check-deps`.
5. **Pause and show the operator:**
   - Audit grep output.
   - List of files changed in the 4 dedup commits.
   - Confirm the helper now lives in `packages/core/src/roadmap/load-tracker-client-config.ts` and is the only definition in the workspace.
6. On approval, proceed to Task 7. No new commit; this task is verification only.

### Task 7: Define migration types + body-diff (TDD)

**Depends on:** Task 6 | **Files:** `packages/core/src/roadmap/migrate/types.ts`, `packages/core/src/roadmap/migrate/body-diff.ts`, `packages/core/tests/roadmap/migrate/body-diff.test.ts`

1. Create `packages/core/tests/roadmap/migrate/body-diff.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { bodyMetaMatches } from '../../../src/roadmap/migrate/body-diff';

   describe('bodyMetaMatches', () => {
     it('returns true for two empty metas', () => {
       expect(bodyMetaMatches({}, {})).toBe(true);
     });

     it('returns true when same fields, same values', () => {
       expect(
         bodyMetaMatches(
           { spec: 'a.md', priority: 'P1', blocked_by: ['x', 'y'] },
           { spec: 'a.md', priority: 'P1', blocked_by: ['x', 'y'] }
         )
       ).toBe(true);
     });

     it('treats blocked_by ordering as significant by sorting before compare', () => {
       expect(bodyMetaMatches({ blocked_by: ['y', 'x'] }, { blocked_by: ['x', 'y'] })).toBe(true);
     });

     it('returns false when spec differs', () => {
       expect(bodyMetaMatches({ spec: 'a.md' }, { spec: 'b.md' })).toBe(false);
     });

     it('returns false when a field is present on one side and missing on the other', () => {
       expect(bodyMetaMatches({ spec: 'a.md' }, {})).toBe(false);
     });

     it('treats null and missing as equivalent', () => {
       expect(bodyMetaMatches({ spec: null }, {})).toBe(true);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/core test migrate/body-diff` — observe 6 failures.
3. Create `packages/core/src/roadmap/migrate/types.ts`:

   ```ts
   import type { TrackedFeature, NewFeatureInput, FeaturePatch, HistoryEvent } from '../tracker';
   import type { Roadmap } from '@harness-engineering/types';

   export interface MigrationPlan {
     /** Features to create via client.create(). */
     toCreate: Array<{ name: string; input: NewFeatureInput }>;
     /** Features whose body-block differs from canonical; will be updated via client.update(). */
     toUpdate: Array<{ externalId: string; name: string; patch: FeaturePatch; diff: string }>;
     /** Features whose body already matches; no-op at step 4. */
     unchanged: Array<{ externalId: string; name: string }>;
     /** History events to append, deduplicated by hash against existing comments. */
     historyToAppend: Array<{ externalId: string; event: HistoryEvent; hash: string }>;
     /** Features in `roadmap.md` with no External-ID AND a same-titled existing issue (D-P5-E). */
     ambiguous: Array<{ name: string; existingIssueRef: string }>;
   }

   export interface MigrationOptions {
     /** Project root containing harness.config.json + docs/. */
     projectRoot: string;
     /** When true, run plan-only (steps 1-4 in-memory; no writes; no archive; no config rewrite). */
     dryRun: boolean;
   }

   export interface MigrationReport {
     created: number;
     updated: number;
     unchanged: number;
     historyAppended: number;
     archivedFrom: string | null;
     archivedTo: string | null;
     configBackup: string | null;
     mode: 'dry-run' | 'applied' | 'already-migrated' | 'aborted';
     abortReason?: string;
   }

   export type { Roadmap };
   ```

4. Create `packages/core/src/roadmap/migrate/body-diff.ts`:

   ```ts
   import type { BodyMeta } from '../tracker/body-metadata';

   /** Field-by-field canonical comparison. Treats null/undefined/missing as equivalent. */
   export function bodyMetaMatches(a: BodyMeta, b: BodyMeta): boolean {
     return (
       eqOpt(a.spec, b.spec) &&
       eqOpt(a.plan, b.plan) &&
       eqOpt(a.priority, b.priority) &&
       eqOpt(a.milestone, b.milestone) &&
       eqList(a.blocked_by, b.blocked_by)
     );
   }

   function eqOpt(x: string | null | undefined, y: string | null | undefined): boolean {
     const xx = x ?? null;
     const yy = y ?? null;
     return xx === yy;
   }

   function eqList(x: string[] | undefined, y: string[] | undefined): boolean {
     const xx = (x ?? []).slice().sort();
     const yy = (y ?? []).slice().sort();
     if (xx.length !== yy.length) return false;
     for (let i = 0; i < xx.length; i++) if (xx[i] !== yy[i]) return false;
     return true;
   }
   ```

5. Run: `pnpm --filter @harness-engineering/core test migrate/body-diff` — observe 6 passes.
6. Run: `harness validate && harness check-deps`.
7. Commit: `feat(core/migrate): add migration types and body-meta diff helper`.

### Task 8: Implement history-event hashing (TDD)

**Depends on:** Task 7 | **Files:** `packages/core/src/roadmap/migrate/history-hash.ts`, `packages/core/tests/roadmap/migrate/history-hash.test.ts`

1. Create `packages/core/tests/roadmap/migrate/history-hash.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import {
     hashHistoryEvent,
     parseHashFromCommentBody,
   } from '../../../src/roadmap/migrate/history-hash';

   describe('hashHistoryEvent', () => {
     it('is deterministic across runs for identical input', () => {
       const e = { type: 'claimed' as const, actor: 'alice', at: '2026-05-09T12:00:00Z' };
       expect(hashHistoryEvent(e)).toBe(hashHistoryEvent(e));
     });

     it('differs when the actor differs', () => {
       const a = { type: 'claimed' as const, actor: 'alice', at: '2026-05-09T12:00:00Z' };
       const b = { type: 'claimed' as const, actor: 'bob', at: '2026-05-09T12:00:00Z' };
       expect(hashHistoryEvent(a)).not.toBe(hashHistoryEvent(b));
     });

     it('treats omitted details and {} as identical', () => {
       const a = { type: 'created' as const, actor: 'x', at: '2026-05-09T12:00:00Z' };
       const b = { type: 'created' as const, actor: 'x', at: '2026-05-09T12:00:00Z', details: {} };
       expect(hashHistoryEvent(a)).toBe(hashHistoryEvent(b));
     });

     it('returns 8 lowercase hex chars', () => {
       const e = { type: 'completed' as const, actor: 'x', at: '2026-05-09T12:00:00Z' };
       expect(hashHistoryEvent(e)).toMatch(/^[0-9a-f]{8}$/);
     });
   });

   describe('parseHashFromCommentBody', () => {
     it('extracts hash:<8hex> from a harness-history comment', () => {
       const body = '<!-- harness-history hash:abcd1234 -->\n{"type":"x","actor":"y","at":"z"}';
       expect(parseHashFromCommentBody(body)).toBe('abcd1234');
     });

     it('returns null when the marker is absent', () => {
       expect(parseHashFromCommentBody('hello')).toBeNull();
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/core test migrate/history-hash` — observe 6 failures.
3. Create `packages/core/src/roadmap/migrate/history-hash.ts`:

   ```ts
   import { createHash } from 'node:crypto';
   import type { HistoryEvent } from '../tracker';

   /** Short, deterministic, content-addressed hash of a history event. */
   export function hashHistoryEvent(event: HistoryEvent): string {
     const detailsStr = JSON.stringify(event.details ?? {});
     const input = `${event.type}|${event.actor}|${event.at}|${detailsStr}`;
     return createHash('sha256').update(input).digest('hex').slice(0, 8);
   }

   const HASH_RE = /<!--\s*harness-history\s+hash:([0-9a-f]{8})\s*-->/i;

   /** Returns the 8-hex hash embedded in a harness-history comment body, or null. */
   export function parseHashFromCommentBody(commentBody: string): string | null {
     const match = commentBody.match(HASH_RE);
     return match ? match[1]! : null;
   }

   /** Build the canonical comment envelope for a history event. */
   export function buildHistoryCommentBody(event: HistoryEvent): string {
     const hash = hashHistoryEvent(event);
     return `<!-- harness-history hash:${hash} -->\n${JSON.stringify(event)}`;
   }
   ```

4. Run: `pnpm --filter @harness-engineering/core test migrate/history-hash` — observe 6 passes.
5. Run: `harness validate && harness check-deps`.
6. Commit: `feat(core/migrate): add deterministic history-event hashing`.

### Task 9: Implement the plan builder (TDD)

**Depends on:** Tasks 7, 8 | **Files:** `packages/core/src/roadmap/migrate/plan-builder.ts`, `packages/core/tests/roadmap/migrate/plan-builder.test.ts`

1. Create `packages/core/tests/roadmap/migrate/plan-builder.test.ts` with these test cases (full code, abbreviated for plan readability — write each as a separate `it()`):
   - **"empty roadmap produces an empty plan"** — `buildMigrationPlan({ frontmatter, milestones: [], assignmentHistory: [] }, [], async () => [])` returns `{ toCreate: [], toUpdate: [], unchanged: [], historyToAppend: [], ambiguous: [] }`.
   - **"feature without External-ID and no title-collision lands in toCreate"** — one feature `"Foo"`, zero existing issues; expect `toCreate.length === 1`, `ambiguous.length === 0`.
   - **"feature with External-ID whose body already matches lands in unchanged"** — feature has `External-ID: github:o/r#1`; existing feature has identical body-meta; expect `unchanged.length === 1`, `toUpdate.length === 0`.
   - **"feature with External-ID whose body differs lands in toUpdate with a diff string"** — existing body-meta priority `P2`; roadmap says `P1`; expect `toUpdate[0].diff` includes `"priority"`.
   - **"feature without External-ID but with a same-titled existing issue lands in ambiguous"** — D-P5-E case.
   - **"assignment-history events not present in fetched comments land in historyToAppend"** — 3 events; one already has a matching `hash:<8>` comment; expect `historyToAppend.length === 2`.
2. Run: `pnpm --filter @harness-engineering/core test migrate/plan-builder` — observe failures.
3. Create `packages/core/src/roadmap/migrate/plan-builder.ts`. Signature:

   ```ts
   import type { Roadmap, RoadmapFeature, AssignmentRecord } from '@harness-engineering/types';
   import type { TrackedFeature, HistoryEvent } from '../tracker';
   import { parseBodyBlock } from '../tracker/body-metadata';
   import { bodyMetaMatches } from './body-diff';
   import { hashHistoryEvent } from './history-hash';
   import type { MigrationPlan } from './types';

   export async function buildMigrationPlan(
     roadmap: Roadmap,
     existingFeatures: TrackedFeature[],
     fetchHistoryHashes: (externalId: string) => Promise<Set<string>>,
     // Optional: provide the raw body string for each existing feature, so we
     // can extract the live BodyMeta. If the tracker client doesn't expose
     // raw bodies, the runner re-fetches via fetchById.
     getRawBodyForExternalId: (externalId: string) => Promise<string | null>
   ): Promise<MigrationPlan>;
   ```

   Implementation outline (write full code in the actual file):
   - Flatten `roadmap.milestones[].features[]` to a single list with milestone context.
   - Index existing features by `externalId` and by lowercased `name` (for title-collision check).
   - For each feature:
     - If `feature.externalId == null`:
       - If `byName.has(name.toLowerCase())` → push to `ambiguous`.
       - Else → push to `toCreate` with a `NewFeatureInput` shaped from the feature.
     - Else:
       - If `byExternalId.has(externalId)`:
         - Fetch live body via `getRawBodyForExternalId(externalId)`, parse with `parseBodyBlock`.
         - Synthesize expected `BodyMeta` from `feature` (spec, plan-singular = `feature.plans[0] ?? null`, blocked_by sorted, priority, milestone = milestone.name unless backlog).
         - If `bodyMetaMatches(actual, expected)` → `unchanged.push(...)`.
         - Else → `toUpdate.push({ externalId, name, patch, diff })` where `diff` is a short, sorted, human-readable string of changed keys.
       - Else: treat as a feature whose recorded External-ID is dangling — push to `ambiguous` with reason `"recorded external id not found"`.
   - For each `record` in `roadmap.assignmentHistory`:
     - Resolve the feature's externalId (look up the feature by name; skip with a warning if unresolved).
     - Build a `HistoryEvent` `{ type: mapAction(record.action), actor: record.assignee, at: record.date, details: undefined }` where `mapAction('assigned') = 'claimed'`, `'completed' = 'completed'`, `'unassigned' = 'released'`.
     - Compute `hash = hashHistoryEvent(event)`.
     - If `(await fetchHistoryHashes(externalId)).has(hash)` → skip.
     - Else → push to `historyToAppend`.

4. Run: `pnpm --filter @harness-engineering/core test migrate/plan-builder` — observe passes.
5. Run: `harness validate && harness check-deps`.
6. Commit: `feat(core/migrate): add plan builder with idempotent diff and history dedup`.

### Task 10: Implement the plan runner with partial-failure semantics (TDD)

**Depends on:** Task 9 | **Files:** `packages/core/src/roadmap/migrate/run.ts`, `packages/core/src/roadmap/migrate/index.ts`, `packages/core/tests/roadmap/migrate/run.test.ts`, `packages/core/tests/roadmap/migrate/run-partial-failure.test.ts`

1. Create `packages/core/tests/roadmap/migrate/run.test.ts` and `run-partial-failure.test.ts`. Test cases:
   - **"happy path: 2 creates + 1 update + 1 history append; archive + config rewrite happen last"** — assert call order via a recording mock client. Assert `archivedFrom` / `archivedTo` populated; assert `configBackup` populated.
   - **"dryRun: zero writes; no archive; no config rewrite"** — wrap the mock client so every write method throws. Migration must NOT call any write method.
   - **"already-migrated: mode === 'file-less' at start short-circuits and returns mode: 'already-migrated'"** — fixture starts with `roadmap.mode: 'file-less'`.
   - **"partial failure at step 3: client.create throws on 3rd feature; archive NOT performed; config NOT rewritten; report.mode === 'aborted'; report.abortReason mentions feature name"** — assert `docs/roadmap.md` still exists; assert no `pre-migration` backup file (we only write the backup just before the actual rewrite).
   - **"partial failure at step 4 (update): same invariants — abort before archive + config"**.
   - **"archive collision: docs/roadmap.md.archived already exists → abort with archive-collision reason"** — D-P5-D.
   - **"config rewrite preserves all other fields and ends with newline"**.
2. Run: failing tests.
3. Create `packages/core/src/roadmap/migrate/run.ts`. Signature:

   ```ts
   import type { Result } from '@harness-engineering/types';
   import type { RoadmapTrackerClient } from '../tracker';
   import type { MigrationPlan, MigrationReport, MigrationOptions } from './types';
   import { buildHistoryCommentBody } from './history-hash';

   export interface RunDeps {
     readonly client: RoadmapTrackerClient;
     readonly readFile: (p: string) => string;
     readonly writeFile: (p: string, b: string) => void;
     readonly renameFile: (from: string, to: string) => void;
     readonly existsFile: (p: string) => boolean;
   }

   export async function runMigrationPlan(
     plan: MigrationPlan,
     deps: RunDeps,
     opts: MigrationOptions
   ): Promise<Result<MigrationReport, Error>>;
   ```

   Execution order (steps 3–7 from the spec):
   1. If `plan.ambiguous.length > 0` → abort. Return Ok with `mode: 'aborted'` and `abortReason` describing the ambiguous list. (This is also the title-only collision exit, observable truth #6.)
   2. **Step 3 (create):** For each `toCreate` entry, call `client.create(input)`. On Err, abort with `mode: 'aborted'`; the report lists which features WERE created (with their new externalIds, so the operator can hand-record them).
   3. **Step 4 (update):** For each `toUpdate` entry, call `client.update(externalId, patch)`. On Err, abort. (Also no-op the entries in `unchanged` — they are NOT iterated here; their presence in the report's `unchanged` count is informational.)
   4. **Step 5 (history):** For each `historyToAppend` entry, call `client.appendHistory(externalId, event)`. The CLI wrapper (Task 12) wires `appendHistory` to post the `buildHistoryCommentBody` envelope; in core we just call the method per the interface. On Err, abort.
   5. If `opts.dryRun` → return Ok with `mode: 'dry-run'` and counts. Skip steps 6+7.
   6. **Step 6 (archive):** If `deps.existsFile(<projectRoot>/docs/roadmap.md.archived)` → abort with `abortReason: 'archive-collision'`. Else call `deps.renameFile`. On Err, abort.
   7. **Step 7 (config):** Read `<projectRoot>/harness.config.json` → write `harness.config.json.pre-migration` (byte-identical copy) → parse, set `roadmap.mode = 'file-less'`, write back with `JSON.stringify(parsed, null, 2) + '\n'`. On Err, abort.

4. Create `packages/core/src/roadmap/migrate/index.ts`:

   ```ts
   export type { MigrationPlan, MigrationOptions, MigrationReport } from './types';
   export { buildMigrationPlan } from './plan-builder';
   export { runMigrationPlan } from './run';
   export type { RunDeps } from './run';
   export {
     hashHistoryEvent,
     buildHistoryCommentBody,
     parseHashFromCommentBody,
   } from './history-hash';
   export { bodyMetaMatches } from './body-diff';
   ```

5. Update `packages/core/src/roadmap/index.ts` to re-export the migrate submodule:

   ```ts
   export * as migrate from './migrate';
   ```

6. Run: `pnpm --filter @harness-engineering/core test migrate/run migrate/run-partial-failure` — observe passes.
7. Run: `harness validate && harness check-deps`.
8. Commit: `feat(core/migrate): add migration runner with idempotent + partial-failure semantics`.

### Task 11: Idempotent re-run integration test in core (TDD)

**Depends on:** Task 10 | **Files:** `packages/core/tests/roadmap/migrate/run-idempotent.test.ts`

1. Create the test:
   - Build a fixture roadmap with 3 features (all already have External-IDs).
   - Stub `RoadmapTrackerClient` with `fetchAll` returning the 3 corresponding `TrackedFeature` records whose body-meta already matches.
   - Call `buildMigrationPlan` → assert `unchanged.length === 3`, `toCreate.length === 0`, `toUpdate.length === 0`.
   - Call `runMigrationPlan(plan, deps, { dryRun: false })` → assert `client.create` was called 0 times, `client.update` 0 times, `client.appendHistory` 0 times (assignmentHistory empty). Archive renames file; config rewrites.
   - Run again with the new state (mode === 'file-less' in config). Expect `mode: 'already-migrated'` early-exit OR (depending on factoring) `plan.toCreate/toUpdate/etc. all empty`. The CLI command (Task 12) is responsible for the early-exit check; in core we just verify the plan is empty.
2. Run the test — observe pass.
3. Run: `harness validate && harness check-deps`.
4. Commit: `test(core/migrate): assert idempotent re-run is a no-op`.

### Task 12: Implement `harness roadmap` group + `migrate` subcommand (TDD) [checkpoint:human-verify]

**Depends on:** Task 11 | **Files:** `packages/cli/src/commands/roadmap/index.ts`, `packages/cli/src/commands/roadmap/migrate.ts`, `packages/cli/tests/commands/roadmap/migrate.test.ts`

1. Create `packages/cli/tests/commands/roadmap/migrate.test.ts`. Test cases (use `vitest` + `tmpdir` + an injected mock `RoadmapTrackerClient` via a `RoadmapMigrateDeps` parameter on `runRoadmapMigrate`):
   - **"--to=file-less --dry-run prints the plan and writes nothing"** — wire a mock client whose write methods all throw; assert exit code 0; assert stdout contains "Would create:", "Would update:", "Would append history:", "DRY RUN"; assert `docs/roadmap.md` still exists; assert no `harness.config.json.pre-migration` file.
   - **"--to=file-less runs full migration on the happy fixture"** — mock client records calls; assert exact call counts; assert `docs/roadmap.md` is renamed to `docs/roadmap.md.archived`; assert config has `roadmap.mode: "file-less"`; assert backup file exists.
   - **"already-migrated short-circuit"** — fixture starts with `roadmap.mode: 'file-less'`; assert stdout `Already migrated; nothing to do.`; exit 0; zero calls on mock.
   - **"no tracker configured → exit non-zero with the loader's message"**.
   - **"missing --to argument → exit non-zero with usage error"**.
   - **"--to=anything-else → exit non-zero with `unsupported target`"** (only `file-less` is a valid target today).
2. Run: failing tests.
3. Create `packages/cli/src/commands/roadmap/migrate.ts`:

   ```ts
   import { Command } from 'commander';
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import chalk from 'chalk';
   import type { Result } from '@harness-engineering/core';
   import {
     parseRoadmap,
     loadProjectRoadmapMode,
     loadTrackerClientConfigFromProject,
     createTrackerClient,
     migrate,
   } from '@harness-engineering/core';
   import { logger } from '../../output/logger';
   import { CLIError, ExitCode } from '../../utils/errors';

   export interface RoadmapMigrateOptions {
     to: string;
     dryRun: boolean;
     cwd?: string;
   }

   export async function runRoadmapMigrate(
     opts: RoadmapMigrateOptions
   ): Promise<Result<migrate.MigrationReport, CLIError>> {
     const cwd = opts.cwd ?? process.cwd();

     if (opts.to !== 'file-less') {
       return /* Err CLIError "unsupported migration target: ..." */;
     }

     // Step 1: short-circuit if already migrated.
     if (loadProjectRoadmapMode(cwd) === 'file-less') {
       logger.success('Already migrated; nothing to do.');
       return /* Ok mode: 'already-migrated' report */;
     }

     // Step 1: tracker config.
     const cfgR = loadTrackerClientConfigFromProject(cwd);
     if (!cfgR.ok) return /* Err CLIError(cfgR.error.message) */;
     const clientR = createTrackerClient(cfgR.value);
     if (!clientR.ok) return /* Err */;

     // Step 2: parse roadmap.md.
     const roadmapPath = path.join(cwd, 'docs', 'roadmap.md');
     if (!fs.existsSync(roadmapPath)) return /* Err 'docs/roadmap.md not found' */;
     const roadmapR = parseRoadmap(fs.readFileSync(roadmapPath, 'utf-8'));
     if (!roadmapR.ok) return /* Err parse error */;

     // Build plan: needs existing features + raw bodies + history hashes.
     // (Helpers: fetchAll on the client yields TrackedFeature[]; raw bodies and
     // history come via fetchById/fetchHistory + a parseHashFromCommentBody pass.)
     const plan = await migrate.buildMigrationPlan(/* ... */);

     // Print plan summary (always — even for dry run).
     printPlanSummary(plan, opts.dryRun);

     // Run.
     const reportR = await migrate.runMigrationPlan(plan, /* deps */, { projectRoot: cwd, dryRun: opts.dryRun });
     if (!reportR.ok) return /* Err */;
     printReport(reportR.value);
     return Ok(reportR.value);
   }

   export function createRoadmapMigrateCommand(): Command {
     return new Command('migrate')
       .description('Migrate the project roadmap to a different storage mode')
       .requiredOption('--to <target>', 'Migration target (only "file-less" supported today)')
       .option('--dry-run', 'Print the migration plan without making any changes', false)
       .action(async (options) => {
         const result = await runRoadmapMigrate({
           to: options.to as string,
           dryRun: Boolean(options.dryRun),
         });
         if (!result.ok) {
           logger.error(result.error.message);
           process.exit(result.error.exitCode);
         }
         process.exit(result.value.mode === 'aborted' ? ExitCode.ERROR : ExitCode.SUCCESS);
       });
   }
   ```

   Write the full file (no `/* ... */` placeholders) and include the `printPlanSummary` + `printReport` helpers.

4. Create `packages/cli/src/commands/roadmap/index.ts`:

   ```ts
   import { Command } from 'commander';
   import { createRoadmapMigrateCommand } from './migrate';

   export function createRoadmapCommand(): Command {
     const roadmap = new Command('roadmap').description('Roadmap management');
     roadmap.addCommand(createRoadmapMigrateCommand());
     return roadmap;
   }
   ```

5. Run: `pnpm run generate-barrel-exports` to regenerate `packages/cli/src/commands/_registry.ts` (adds `createRoadmapCommand` import + entry). Verify the diff includes only the registry additions.
6. Run: `pnpm --filter @harness-engineering/cli test commands/roadmap/migrate` — observe 6 passes.
7. Run: `harness validate && harness check-deps`.
8. **Pause:** show the operator:
   - The command tree: `node packages/cli/dist/index.js roadmap migrate --help` (after `pnpm --filter @harness-engineering/cli build`).
   - The test names + pass/fail summary.
   - Confirm the registry diff is sensible.
9. On approval, commit: `feat(cli): add 'harness roadmap migrate' command (Phase 5)`.

### Task 13: Add focused dry-run test (zero writes assertion)

**Depends on:** Task 12 | **Files:** `packages/cli/tests/commands/roadmap/migrate-dry-run.test.ts`

1. Create a stand-alone dry-run test that wraps every `RoadmapTrackerClient` write method (`create`, `update`, `claim`, `release`, `complete`, `appendHistory`) with a mock that throws `new Error('write attempted in dry run')`. Reads (`fetchAll`, `fetchById`, `fetchByStatus`, `fetchHistory`) return normally.
2. Run `runRoadmapMigrate({ to: 'file-less', dryRun: true, cwd: fixture })`.
3. Assert: result is Ok, none of the throws fire, stdout contains the per-section plan summary lines, and the report has `mode: 'dry-run'`.
4. Run the test — observe pass.
5. Run: `harness validate`.
6. Commit: `test(cli/migrate): assert dry-run performs zero tracker writes`.

### Task 14: Add idempotent re-run + partial-failure CLI tests

**Depends on:** Task 12 | **Files:** `packages/cli/tests/commands/roadmap/migrate-idempotent.test.ts`, `packages/cli/tests/commands/roadmap/migrate-config.test.ts`

1. **`migrate-idempotent.test.ts`** — two scenarios:
   - **Re-run after success:** First call mutates fixture (mode flips to `file-less`, file archived). Second call returns `mode: 'already-migrated'` with zero tracker calls. Stdout: `Already migrated; nothing to do.`
   - **Re-run after partial failure:** Mock client where the 3rd `create` call throws. First run aborts with `mode: 'aborted'`, reporting that features 1 + 2 were created (and their externalIds for hand-recording). Assert `docs/roadmap.md` still present, `harness.config.json` still has `mode: 'file-backed'` (or absent), no `pre-migration` backup file. Hand-edit the fixture's `roadmap.md` to record the two External-IDs (the test simulates the human action), then re-run with a mock that no longer throws on create #3. Assert: only 1 `create` call this time (the prior 2 are now skipped by idempotence), full success.
2. **`migrate-config.test.ts`** — exercises D-P5-F:
   - Pre-condition: fixture `harness.config.json` has `{ "docsDir": "docs", "roadmap": { "tracker": { "kind": "github", "repo": "o/r" } }, "experimental": { "featureA": true } }`.
   - Run a successful migration.
   - Assert `harness.config.json.pre-migration` exists and is byte-identical to the original.
   - Assert `harness.config.json` parses to deep-equal of the original PLUS `roadmap.mode: "file-less"` and nothing else changed.
   - Assert the rewritten file ends with `\n`.
3. Run: `pnpm --filter @harness-engineering/cli test commands/roadmap/migrate-idempotent commands/roadmap/migrate-config` — observe passes.
4. Run: `harness validate && harness check-deps`.
5. Commit: `test(cli/migrate): cover idempotent re-run, partial failure, config preservation`.

### Task 15: Write the migration guide

**Depends on:** Task 14 | **Files:** `docs/changes/roadmap-tracker-only/migration.md`

1. Create `docs/changes/roadmap-tracker-only/migration.md` with these sections (in order, headings exactly):
   - **`# Migrating to File-less Roadmap Mode`** — one-paragraph intro, link to the proposal.
   - **`## Pre-flight checklist`** — bulleted list: (a) `roadmap.tracker.kind: "github"` set in `harness.config.json`, (b) `GITHUB_TOKEN` env var present and scoped for `repo`, (c) repository writable by the token, (d) clean working tree (recommended — make a git checkpoint before running), (e) team coordination: no concurrent dashboard/orchestrator activity during the run.
   - **`## Dry run (always do this first)`** — exact command `harness roadmap migrate --to=file-less --dry-run`; what the output looks like (paste a sample); what to check (Would-create vs. Would-update counts match expectations; no AMBIGUOUS entries).
   - **`## Real run`** — exact command `harness roadmap migrate --to=file-less`; expected stdout; expected duration order-of-magnitude per spec §"Performance" P4 (<60s for 50 features).
   - **`## Verification`** — post-run checks: (a) `harness validate` exits clean (the new `validateRoadmapMode` rules now require the archived file to NOT exist; you may need to confirm — see Note), (b) `docs/roadmap.md.archived` exists, (c) `harness.config.json` contains `"mode": "file-less"`, (d) `harness.config.json.pre-migration` exists, (e) GitHub Issues pane shows N issues with the harness-meta body block.
   - **`## Rollback recipe`** — exact, copy-pasteable shell sequence: `mv docs/roadmap.md.archived docs/roadmap.md && mv harness.config.json.pre-migration harness.config.json && harness validate`. Note: rolling back leaves the GitHub issues in place; they can be left untouched (the file-backed sync engine will re-sync them on the next `harness sync`) or closed manually. Explicit caveat: history comments added during migration remain on the issues and are not removed by rollback.
   - **`## Recovery from partial failure`** — exact text matching observable truth #4: if the run aborts after some issues were created, the command's output lists the created features and their new externalIds. Add those to `docs/roadmap.md` as `External-ID:` fields and re-run; the migration is idempotent and will skip the already-created issues at step 3.
   - **`## Title-only collision`** — describes the D-P5-E case and remediation.
   - **`## Archive collision`** — describes D-P5-D: if `docs/roadmap.md.archived` already exists, move it aside (`mv docs/roadmap.md.archived docs/roadmap.md.archived.$(date +%s)`) and re-run.
   - **`## What changes (semantics)`** — summary of D4 (positional ordering dropped; sort by Priority then issue number); link to proposal Decisions table.
2. Run: `harness validate`.
3. Commit: `docs(roadmap-tracker-only): add Phase 5 migration guide`.

### Task 16: Doc-presence test [checkpoint:human-verify]

**Depends on:** Task 15 | **Files:** `packages/cli/tests/docs/migration-guide.test.ts`

1. Create the test:

   ```ts
   import { describe, it, expect } from 'vitest';
   import * as fs from 'node:fs';
   import * as path from 'node:path';

   const REQUIRED_SECTIONS = [
     'pre-flight checklist',
     'dry run',
     'real run',
     'verification',
     'rollback recipe',
     'recovery from partial failure',
     'title-only collision',
     'archive collision',
   ];

   describe('migration guide', () => {
     it('exists and contains every required section', () => {
       const guidePath = path.resolve(
         __dirname,
         '../../../../docs/changes/roadmap-tracker-only/migration.md'
       );
       expect(fs.existsSync(guidePath)).toBe(true);
       const lower = fs.readFileSync(guidePath, 'utf-8').toLowerCase();
       for (const heading of REQUIRED_SECTIONS) {
         expect(lower, `missing section: ${heading}`).toContain(heading);
       }
     });

     it('mentions the dry-run command verbatim', () => {
       const guidePath = path.resolve(
         __dirname,
         '../../../../docs/changes/roadmap-tracker-only/migration.md'
       );
       const text = fs.readFileSync(guidePath, 'utf-8');
       expect(text).toContain('harness roadmap migrate --to=file-less --dry-run');
       expect(text).toContain('harness roadmap migrate --to=file-less');
     });

     it('mentions the rollback command sequence verbatim', () => {
       const guidePath = path.resolve(
         __dirname,
         '../../../../docs/changes/roadmap-tracker-only/migration.md'
       );
       const text = fs.readFileSync(guidePath, 'utf-8');
       expect(text).toContain('mv docs/roadmap.md.archived docs/roadmap.md');
       expect(text).toContain('mv harness.config.json.pre-migration harness.config.json');
     });
   });
   ```

2. Run the test — observe passes.
3. **Pause:** show the operator the rendered migration guide (or a clean `cat` output). Confirm wording is accurate and complete.
4. On approval, run: `harness validate`.
5. Commit: `test(docs): assert migration guide has required sections + commands`.

### Task 17: Final audit + handoff

**Depends on:** Task 16 | **Files:** none (audit only)

1. Run: `pnpm test` from repo root — full suite must be green.
2. Run: `rg "function loadTrackerClientConfigFrom(Project|Root)" packages/{cli,dashboard,orchestrator}/src` — must be zero matches (REV-P4-5 invariant).
3. Run: `rg "'harness roadmap migrate'" packages/cli/dist 2>/dev/null` — should reflect the new command after `pnpm --filter @harness-engineering/cli build` (informational only; not a fail-gate).
4. Run: `harness validate && harness check-deps` — both must pass.
5. Verify the command tree by running `node packages/cli/dist/index.js roadmap --help` and `node packages/cli/dist/index.js roadmap migrate --help` after a fresh build.
6. No new commit; this task is verification only. Update the session handoff (per the skill steps) with the final pass.

## Out-of-scope (deferred)

Per the prompt's "Phase 5 must NOT include" list:

- Phase 6: business-knowledge entries (`File-less Roadmap Mode`, `Tracker as Source of Truth`, `Roadmap Migration to File-less Mode`), the two ADRs, and the new `docs/knowledge/roadmap/` domain.
- Phase 7: React/SSE conflict UX in the dashboard client.

These are tracked at the proposal's "Implementation Order" section and are not touched by any task in this plan.

## Uncertainties

- **[ASSUMPTION]** The orchestrator's `roadmap-actions.ts` route handler is the right call site for the orchestrator's REV-P4-5 swap. If a separate caller surfaces during execution that also defines its own copy, Task 5 needs amendment (one more file).
- **[ASSUMPTION]** The Phase 2 `RoadmapTrackerClient.fetchById` returns enough data to reconstruct the raw issue body for the body-block diff at Task 9. If it does not (e.g. it returns a `TrackedFeature` projection without the raw body), the plan-builder signature needs an additional dependency (a `fetchRawBody(externalId)` helper, which the GitHub-issues adapter can satisfy via a direct `GET /issues/<n>`). Verify during Task 9 implementation; if so, add a thin adapter method.
- **[ASSUMPTION]** The CLI command tree's `node packages/cli/dist/index.js roadmap …` invocation works without additional plumbing once the registry is regenerated. The barrel-export generator (`pnpm run generate-barrel-exports`) is the documented step; if it does not pick up the new group automatically, Task 12 has a fallback of hand-editing `_registry.ts`.
- **[DEFERRABLE]** Exact wording of human-facing CLI output strings (the "Would create:" lines, the abort messages). Picking working wording during execution is fine; the test cases assert structural presence, not exact prose.

## Risks

- **Body-block round-trip drift.** If the Phase 2 `serializeBodyBlock` ever changes its canonical output (key order, trailing whitespace), the Phase 5 idempotence diff could falsely flag matches as differing. Mitigation: `bodyMetaMatches` compares the parsed `BodyMeta` shape, not the serialized text — drift in the serializer is invisible to the diff.
- **Title-collision false positives.** Two features may legitimately share a name across milestones (rare in practice). The plan's strict refuse-and-exit policy errs on the safe side — operators can resolve by recording the External-ID. The migration guide documents this.
- **`harness.config.json` formatting normalization.** Users who hand-format their config (rare) will see a re-serialized file. Backup file makes this losslessly recoverable; the migration guide explicitly calls it out.
- **Race against concurrent orchestrator/dashboard activity during a live migration.** The migration assumes nobody else is writing to the tracker or the file. The pre-flight checklist tells the operator to coordinate; no in-code locking is added (the cost of correctness theater for a one-shot operation is too high).
- **Test suite size growth.** ~10 new test files; if the workspace test runner is on a slow CI lane, this adds 30–60 seconds. Acceptable for the value delivered.

## Notes for execution

- The Phase 4 handoff explicitly notes that `harness.config.json.pre-migration` does not yet exist anywhere in the codebase — confirmed; this plan introduces it.
- The existing `harness migrate` command (unrelated, for legacy artifact layouts) is in `packages/cli/src/commands/migrate.ts`. The new `harness roadmap migrate` lives under `packages/cli/src/commands/roadmap/migrate.ts`. They are unrelated and must not be confused; the new command is a SUBcommand under a NEW `roadmap` group.
- `harness validate` already includes the `validateRoadmapMode` cross-cutting check from Phase 3. After a successful migration, that check enforces "mode === 'file-less' implies `docs/roadmap.md` is absent" — exactly what the archive step achieves.
