# Plan: Roadmap Shard Store — Phase 2 (Migration CLI)

**Date:** 2026-06-27 | **Spec:** docs/changes/roadmap-shard-store/proposal.md | **Tasks:** 13 | **Time:** ~58 min | **Integration Tier:** medium

## Goal

Ship the `harness roadmap shard` / `unshard` / `regen` CLI commands that reversibly migrate a monolith `docs/roadmap.md` to per-row shards under `docs/roadmap.d/` plus a `_meta.md`, guarded by a semantic round-trip assertion that runs **before** any destructive write — reusing the Phase 1 store primitives (`parseShard`/`serializeShard`, `assembleRoadmap`, `regenerate`, `slugifyFeatureName`, `readShardDir`, `ShardStore`) without re-implementing them.

## Observable Truths (Acceptance Criteria)

1. **When** `harness roadmap shard` runs against a project with `docs/roadmap.md` and no `docs/roadmap.d/`, the system shall write one `docs/roadmap.d/<slug>.md` per feature plus `docs/roadmap.d/_meta.md`, then regenerate `docs/roadmap.md` from those shards. Slugs come from `slugifyFeatureName`; the milestone moves to shard frontmatter; milestone order and roadmap frontmatter are preserved in `_meta.md`.
2. **Before** deleting or replacing the monolith, the system shall assert the semantic round-trip `isDeepStrictEqual(parse(oldRoadmap), parse(regenerate(shards)))`. **If** the assertion fails, the system shall abort, leave `docs/roadmap.md` byte-unchanged, write no shard files, and exit non-zero.
3. **If** two features slugify to the same string, the system shall disambiguate deterministically (`<slug>`, `<slug>-2`, `<slug>-3`, … in parsed document order) so every shard filename equals its frontmatter `slug` and `readShardDir`'s duplicate-slug / filename-mismatch guards never trip. A feature whose name has no alphanumerics shall fall back to `row-<n>`.
4. **When** `harness roadmap regen` runs in a sharded project, the system shall regenerate `docs/roadmap.md` deterministically; a second consecutive run shall produce a byte-identical file (no diff).
5. **When** `harness roadmap unshard` runs in a sharded project, the system shall reassemble `docs/roadmap.md` from the shards and remove `docs/roadmap.d/`, losslessly reversing a prior `shard` (the resulting monolith is byte-identical to a fresh `regen`).
6. **Where** `--dry-run` is passed to `shard`, the system shall report the plan (shard count, milestone count, disambiguated slugs, round-trip pass/fail) and write nothing.
7. The new commands shall be registered under `createRoadmapCommand()` consistent with the existing `migrate` subcommand (own file, `runRoadmapX(opts): Promise<Result<…, CLIError>>` + thin commander wrapper, `--cwd`, `--format human|json`), and shall write `docs/roadmap.md` **only** via `serializeRoadmap`/`regenerate` (never hand-edited) — preserving read-source invariant R for Phase 3.
8. `harness validate` and `harness check-deps` shall report no NEW findings versus baseline (baseline cycles in `cli/drift` + `cli/shared/craft/llm` are pre-existing).

## Design Findings & Uncertainties

- **[BLOCKING → resolved-by-decision] Assignment history must be preserved.** The live `docs/roadmap.md` carries a populated `## Assignment History` table (~18 records). `parseRoadmap`/`serializeRoadmap` round-trip `assignmentHistory`, but the Phase 1 `assembleRoadmap` hardcodes `assignmentHistory: []` and `RoadmapMeta`/`_meta.md` do not carry it. A strict `isDeepStrictEqual(parse(old), parse(regen))` therefore fails on this field today, so the migration would always abort on the real repo. **Resolution (recommended, gated by a [checkpoint:decision] on Task 1):** extend `_meta.md` from "frontmatter-only" to "frontmatter + an optional `## Assignment History` body" — the only roadmap-level file is the right home for roadmap-level audit data. This deviates from the spec's literal `_meta.md` description (Technical Design § `_meta.md`); the alternative is to scope the round-trip equality to rows-only and drop assignment history (lossy — rejected unless the team opts in). Tasks 1–3 implement the recommended path.
- **[ASSUMPTION] `order` is assigned as the feature's index within its milestone, iterating the _parsed_ `Roadmap` order (not raw file order).** The assembler sorts features by `order` asc, then status-rank desc, then slug asc. Assigning `order = parsed index` yields unique orders, so `order` asc alone reproduces the parsed order and ties never engage — guaranteeing the round-trip preserves ordering.
- **[ASSUMPTION] `_meta.frontmatter` and timestamps are copied verbatim** from the parsed roadmap; the migration must not bump `updated`/`last_synced`/`last_manual_edit`, or the round-trip fails.
- **[ASSUMPTION] Prose/comments and the empty-milestone set:** `serializeRoadmap` is already lossy for prose/comments, and `parseRoadmap` drops them, so `parse(old) == parse(regen)` is unaffected. Empty milestones survive because `_meta.milestones` lists every milestone (incl. empty) and the assembler keeps listed-but-empty milestones.
- **[DEFERRABLE] The read-source invariant R grep/validate check is Phase 3.** Phase 2 only designs the commands so they never violate R (writes to `roadmap.md` go exclusively through `regenerate`/`serializeRoadmap`). `reconcile` and the auto-done path are Phases 4–5.
- **[DEFERRABLE] Mode auto-detection (`sharded`) is Phase 6.** Phase 2 detects the shard dir directly (presence of `docs/roadmap.d/`) for refuse/already-done guards only.

## Reused Phase 1 surface (do NOT re-implement)

From `@harness-engineering/core` (barrel `packages/core/src/roadmap/index.ts`): `parseShard`, `serializeShard`, `parseMeta`, `serializeMeta`, `assembleRoadmap`, `regenerate`, `writeRegeneratedRoadmap`, `readShardDir`, `ShardStore`, `MonolithStore`, `slugifyFeatureName`, types `Shard`, `RoadmapMeta`, `FileIO`, `ShardIO`, `RoadmapStore`. `parseRoadmap`/`serializeRoadmap` already exported. `readShardDir` already enforces: `_meta.md` excluded from the shard glob, duplicate-slug rejection, and filename-must-equal-frontmatter-slug. The Phase 2 migration must produce shards that satisfy those guards.

## File Map

Core:

- MODIFY `packages/core/src/roadmap/parse.ts` (export `parseAssignmentHistory`)
- MODIFY `packages/core/src/roadmap/serialize.ts` (export `serializeAssignmentHistory`)
- MODIFY `packages/core/src/roadmap/store/roadmap-store.ts` (add `assignmentHistory?` to `RoadmapMeta`)
- MODIFY `packages/core/src/roadmap/store/meta.ts` (parse/serialize the `## Assignment History` body)
- MODIFY `packages/core/src/roadmap/store/assembler.ts` (thread `meta.assignmentHistory`)
- CREATE `packages/core/src/roadmap/store/migration.ts` (`roadmapToShards`, `assertSemanticRoundTrip`)
- MODIFY `packages/core/src/roadmap/store/index.ts` (export migration)
- MODIFY `packages/core/tests/roadmap/store/fixtures.ts` (add assignment-history fixtures)
- CREATE `packages/core/tests/roadmap/store/migration.test.ts`
- MODIFY/EXTEND `packages/core/tests/roadmap/store/meta.test.ts`, `assembler.test.ts`, `parse-block.test.ts` (or new `assignment-history-export.test.ts`)

CLI:

- CREATE `packages/cli/src/commands/roadmap/shard-io.ts` (node:fs `ShardIO` + mkdirp/rmrf/exists)
- CREATE `packages/cli/src/commands/roadmap/regen.ts` (`runRoadmapRegen`, `createRoadmapRegenCommand`)
- CREATE `packages/cli/src/commands/roadmap/shard.ts` (`runRoadmapShard`, `createRoadmapShardCommand`)
- CREATE `packages/cli/src/commands/roadmap/unshard.ts` (`runRoadmapUnshard`, `createRoadmapUnshardCommand`)
- MODIFY `packages/cli/src/commands/roadmap/index.ts` (register 3 subcommands)
- MODIFY `docs/reference/cli-commands.md` (document the 3 commands)
- CREATE `packages/cli/tests/commands/roadmap/shard-io.test.ts`
- CREATE `packages/cli/tests/commands/roadmap/regen.test.ts`
- CREATE `packages/cli/tests/commands/roadmap/shard.test.ts`
- CREATE `packages/cli/tests/commands/roadmap/unshard.test.ts`
- CREATE `packages/cli/tests/commands/roadmap/shard-roundtrip.e2e.test.ts`

> Conventions confirmed from the repo: core tests under `packages/core/tests/roadmap/store/**`; CLI tests under `packages/cli/tests/commands/roadmap/**`; CLI temp dirs via `fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-shard-'))`. Run a single core file: `pnpm --filter @harness-engineering/core exec vitest run <path>`. Run a single CLI file: `pnpm --filter @harness-engineering/cli exec vitest run <path>`. **All test fixtures use 1–2 digit issue refs** (e.g. `github:o/r#7`, `#42`) — never 3–8 digit `#NNN` (trips the design-token hex-color false positive `/#[0-9a-fA-F]{3,8}\b/` in `harness validate`).

## Skeleton

1. Preserve assignment history through `_meta` (export helpers, extend `RoadmapMeta` + `meta.ts`, thread through assembler) (~3 tasks, ~16 min)
2. Core migration logic: decompose + round-trip assertion + barrel (~3 tasks, ~16 min)
3. CLI IO adapter + `regen` (simplest command) (~2 tasks, ~8 min)
4. `shard` command: happy path then safety/abort/dry-run (~2 tasks, ~12 min)
5. `unshard` + registration + e2e (~3 tasks, ~14 min)

**Estimated total:** 13 tasks, ~58 minutes.

_Skeleton approval: this plan-generation pass has no interactive channel (emit_interaction asks do not surface to the user); the skeleton is presented inline for human review at the Phase 4 sign-off gate. Skeleton approved: pending human sign-off._

## Tasks

### Task 1: Export assignment-history parse/serialize primitives

**Depends on:** none | **Files:** `packages/core/src/roadmap/parse.ts`, `packages/core/src/roadmap/serialize.ts`, `packages/core/tests/roadmap/store/assignment-history-export.test.ts`

`[checkpoint:decision]` — Before touching Phase 1 modules, confirm the resolution of the assignment-history finding: **preserve it in `_meta.md` (recommended)** vs. scope round-trip equality to rows-only (lossy). The recommended path (Tasks 1–3) extends `_meta.md` to carry a `## Assignment History` body. Present the trade-off (spec says `_meta.md` is "frontmatter-only"; the live repo has 18 history records that a strict round-trip must preserve) and wait for the choice before proceeding.

Reuse, do not reimplement. `parse.ts` has private `parseAssignmentHistory(body): Result<AssignmentRecord[]>` (line ~238) and `serialize.ts` has private `serializeAssignmentHistory(records): string[]` (line ~102). Export both (mirrors the Phase 1 `parseFeatureBlock`/`serializeFeature` export pattern).

1. Create `assignment-history-export.test.ts`:
   - Import `parseAssignmentHistory` from `../../../src/roadmap/parse` and `serializeAssignmentHistory` from `../../../src/roadmap/serialize`.
   - Given a small `## Assignment History` markdown table (one `assigned` + one `unassigned` row, ASCII dates), assert `parseAssignmentHistory(body).value` has 2 records, and `serializeAssignmentHistory(records).join('\n')` re-parses to the same records (round-trip).
2. Run: `pnpm --filter @harness-engineering/core exec vitest run tests/roadmap/store/assignment-history-export.test.ts` — observe failure (not exported).
3. Add `export` to `parseAssignmentHistory` in `parse.ts` and `serializeAssignmentHistory` in `serialize.ts`. No behavior change.
4. Run the test — observe pass.
5. Run `pnpm --filter @harness-engineering/core exec vitest run tests/roadmap` — confirm existing core roadmap suites still pass.
6. Run: `harness validate`
7. Commit: `refactor(core): export assignment-history parse/serialize for shard meta reuse`

### Task 2: Carry assignment history in `RoadmapMeta` + `_meta.md`

**Depends on:** Task 1 | **Files:** `packages/core/src/roadmap/store/roadmap-store.ts`, `packages/core/src/roadmap/store/meta.ts`, `packages/core/tests/roadmap/store/fixtures.ts`, `packages/core/tests/roadmap/store/meta.test.ts`

`_meta.md` becomes: frontmatter fence (unchanged) + an optional trailing `## Assignment History` section (verbatim from `serializeAssignmentHistory`). Empty history ⇒ no section emitted (byte-stable with Phase 1 fixtures that have no history).

1. In `roadmap-store.ts`, extend `RoadmapMeta`: add `assignmentHistory?: AssignmentRecord[];` (import the `AssignmentRecord` type from `@harness-engineering/types`). Document that empty/absent means no history section.
2. Add `META_MD_WITH_HISTORY` + expected `RoadmapMeta` (with 2 records) to `fixtures.ts`. Use ASCII dates; no issue refs needed here.
3. Extend `meta.test.ts`:
   - `parseMeta(META_MD_WITH_HISTORY).value.assignmentHistory` deep-equals the expected 2 records; frontmatter + milestones unchanged.
   - **Byte-stability:** `serializeMeta(parseMeta(META_MD_WITH_HISTORY).value) === META_MD_WITH_HISTORY`.
   - **No-history parity:** existing `META_MD` (no history) still round-trips byte-identically and yields `assignmentHistory` `[]`/`undefined`.
4. Run `meta.test.ts` — observe failure.
5. Update `meta.ts`:
   - `parseMeta`: after the existing frontmatter parse, take `matter(md).content`; if it contains a `## Assignment History` heading, call the now-exported `parseAssignmentHistory(content)` and set `assignmentHistory`; else `[]`.
   - `serializeMeta`: after the frontmatter fence, if `meta.assignmentHistory?.length`, append a blank line + `serializeAssignmentHistory(...)` lines; else emit nothing (preserve the existing single-trailing-newline contract). Deterministic, no `matter.stringify`.
6. Run `meta.test.ts` — observe pass.
7. Run: `harness validate`
8. Commit: `feat(core): carry assignment history in roadmap _meta`

### Task 3: Thread assignment history through the assembler

**Depends on:** Task 2 | **Files:** `packages/core/src/roadmap/store/assembler.ts`, `packages/core/tests/roadmap/store/assembler.test.ts`

1. Extend `assembler.test.ts`: given shards + a `meta` carrying 2 assignment records, `assembleRoadmap(shards, meta).assignmentHistory` deep-equals those records (in order). Existing case (no history) still yields `[]`.
2. Run — observe failure.
3. In `assembler.ts`, change the return to `assignmentHistory: meta.assignmentHistory ?? []` (currently hardcoded `[]`). No other change.
4. Run — observe pass; run the full `tests/roadmap/store` suite to confirm no regression (round-trip/store-parity still green).
5. Run: `harness validate`
6. Commit: `feat(core): thread assignment history through roadmap assembler`

### Task 4: Decompose a Roadmap into shards (`migration.ts` — `roadmapToShards`)

**Depends on:** Task 3 | **Files:** `packages/core/src/roadmap/store/migration.ts`, `packages/core/tests/roadmap/store/fixtures.ts`, `packages/core/tests/roadmap/store/migration.test.ts`

Pure decomposition with deterministic slug disambiguation. No IO.

1. Add `MIGRATION_ROADMAP` to `fixtures.ts`: a `Roadmap` (built in-memory, not parsed) with 2 milestones + Backlog, ≥1 `done`, mixed priorities, **two features that slugify to the same base** (e.g. names `"Fix login"` and `"Fix: login!"` → both `fix-login`), one feature whose name is all-symbols (→ empty slug), and a populated `assignmentHistory` (2 records). All `External-ID`s use 1–2 digit refs (`github:o/r#7`, `#42`).
2. Create `migration.test.ts`:
   - `roadmapToShards(MIGRATION_ROADMAP)` returns `{ shards, meta }`.
   - **Slug disambiguation:** the two colliding features get slugs `fix-login` and `fix-login-2` (in parsed document order); the all-symbols feature gets `row-<n>`.
   - **Order:** within each milestone, `shards` `order` equals the feature's index in document order (0,1,2,…), and each shard's `milestone` matches its source milestone.
   - **Meta:** `meta.frontmatter` is identical (same reference values) to `MIGRATION_ROADMAP.frontmatter`; `meta.milestones` equals `MIGRATION_ROADMAP.milestones.map(m => m.name)` (incl. empty milestones, in order); `meta.assignmentHistory` deep-equals the source.
   - **Guard compatibility:** every shard's filename-to-be (`<slug>.md`) is unique and equals its frontmatter slug (so `readShardDir` will accept them) — assert all slugs are distinct.
3. Run — observe failure.
4. Create `migration.ts`:

   ```ts
   import type { Roadmap } from '@harness-engineering/types';
   import { slugifyFeatureName } from './monolith-store';
   import type { Shard, RoadmapMeta } from './roadmap-store';

   /** Decompose a Roadmap into per-row shards + roadmap-level meta.
    *  Slugs are disambiguated deterministically in document order. */
   export function roadmapToShards(roadmap: Roadmap): { shards: Shard[]; meta: RoadmapMeta } {
     const shards: Shard[] = [];
     const used = new Set<string>();
     let rowCounter = 0;
     for (const milestone of roadmap.milestones) {
       milestone.features.forEach((feature, index) => {
         rowCounter += 1;
         let base = slugifyFeatureName(feature.name) || `row-${rowCounter}`;
         let slug = base;
         let n = 2;
         while (used.has(slug)) slug = `${base}-${n++}`;
         used.add(slug);
         shards.push({ slug, milestone: milestone.name, order: index, feature });
       });
     }
     const meta: RoadmapMeta = {
       frontmatter: roadmap.frontmatter,
       milestones: roadmap.milestones.map((m) => m.name),
       assignmentHistory: roadmap.assignmentHistory ?? [],
     };
     return { shards, meta };
   }
   ```

5. Run — observe pass.
6. Run: `harness validate`
7. Commit: `feat(core): decompose roadmap into shards with deterministic slug disambiguation`

### Task 5: Semantic round-trip assertion (`migration.ts` — `assertSemanticRoundTrip`)

**Depends on:** Task 4 | **Files:** `packages/core/src/roadmap/store/migration.ts`, `packages/core/tests/roadmap/store/migration.test.ts`

The load-bearing safety check. Reuses `assembleRoadmap` + `serializeRoadmap` + `parseRoadmap`; compares with `node:util.isDeepStrictEqual` to honor the spec's "deep-equals".

1. Extend `migration.test.ts`:
   - **Pass:** `const { shards, meta } = roadmapToShards(MIGRATION_ROADMAP); const r = assertSemanticRoundTrip(MIGRATION_ROADMAP, shards, meta); expect(r.ok).toBe(true);` (proves round-trip incl. assignment history + ordering + collisions).
   - **Fail (guards):** corrupt one shard (mutate a feature's `status`), call `assertSemanticRoundTrip` — expect `Err` whose message names the mismatch. (Proves it refuses to greenlight a lossy migration.)
2. Run — observe failure.
3. Add to `migration.ts`:

   ```ts
   import { isDeepStrictEqual } from 'node:util';
   import { Ok, Err } from '@harness-engineering/types';
   import type { Result } from '@harness-engineering/types';
   import { assembleRoadmap } from './assembler';
   import { serializeRoadmap } from '../serialize';
   import { parseRoadmap } from '../parse';

   /** Assert parse(original-serialized) deep-equals parse(regen(shards)).
    *  Compares canonical parsed forms so it matches the lossy-but-stable
    *  serialize contract. Returns Err (never throws) so callers abort cleanly. */
   export function assertSemanticRoundTrip(
     original: Roadmap,
     shards: Shard[],
     meta: RoadmapMeta
   ): Result<void> {
     const regenMd = serializeRoadmap(assembleRoadmap(shards, meta));
     const regenParsed = parseRoadmap(regenMd);
     if (!regenParsed.ok)
       return Err(
         new Error(`round-trip: regenerated roadmap failed to parse: ${regenParsed.error.message}`)
       );
     const originalCanonical = parseRoadmap(serializeRoadmap(original));
     if (!originalCanonical.ok)
       return Err(
         new Error(
           `round-trip: original roadmap failed to canonicalize: ${originalCanonical.error.message}`
         )
       );
     if (!isDeepStrictEqual(originalCanonical.value, regenParsed.value)) {
       return Err(
         new Error(
           'round-trip: parse(original) does not deep-equal parse(regenerate(shards)); aborting to protect the monolith'
         )
       );
     }
     return Ok(undefined);
   }
   ```

   (Canonicalizing the original via `parse(serialize(original))` neutralizes prose/comment loss so the comparison reflects exactly what the shard store can represent.)

4. Run — observe pass.
5. Run: `harness validate`
6. Commit: `feat(core): add semantic round-trip assertion for roadmap sharding`

### Task 6: Export migration from store barrel

**Depends on:** Task 5 | **Files:** `packages/core/src/roadmap/store/index.ts` | **Category:** integration

1. In `store/index.ts`, add `export { roadmapToShards, assertSemanticRoundTrip } from './migration';` (the roadmap barrel `index.ts` already does `export * from './store'`, so no change there).
2. Add a one-line export-surface assertion to `migration.test.ts` (or extend it): import `roadmapToShards`, `assertSemanticRoundTrip` from `@harness-engineering/core` and assert they are functions.
3. Run: `pnpm --filter @harness-engineering/core exec vitest run tests/roadmap/store` — full store suite green.
4. Run: `harness validate`
5. Commit: `feat(core): export roadmap migration helpers`

### Task 7: Node-fs `ShardIO` adapter for the CLI (`shard-io.ts`)

**Depends on:** none (parallel with core tasks) | **Files:** `packages/cli/src/commands/roadmap/shard-io.ts`, `packages/cli/tests/commands/roadmap/shard-io.test.ts`

`ShardStore`/`regenerate` need a `ShardIO` (`readFile`, `writeFile`, `listDir`). The migration/unshard commands additionally need `mkdirp`, `rmrf`, `exists`. Keep node:fs bindings in this thin CLI adapter (core stays IO-injected).

1. Create `shard-io.test.ts` (temp dir via `fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-shard-io-'))`):
   - `writeFile` then `readFile` round-trips a string; `mkdirp` creates nested dirs idempotently; `listDir` returns basenames; `exists` true/false; `rmrf` removes a populated dir.
2. Run — observe failure.
3. Create `shard-io.ts` exporting `interface NodeShardIO extends ShardIO { mkdirp(dir): Promise<void>; rmrf(dir): Promise<void>; exists(p): Promise<boolean>; }` and `createNodeShardIO(): NodeShardIO` backed by `node:fs/promises` (`readFile(p,'utf-8')`, `writeFile`, `readdir`, `mkdir({recursive:true})`, `rm({recursive,force})`, `access`→bool). Import `ShardIO` type from `@harness-engineering/core`.
4. Run — observe pass.
5. Run: `harness validate`
6. Commit: `feat(cli): add node-fs ShardIO adapter for roadmap commands`

### Task 8: `harness roadmap regen` command (`regen.ts`)

**Depends on:** Task 7 | **Files:** `packages/cli/src/commands/roadmap/regen.ts`, `packages/cli/tests/commands/roadmap/regen.test.ts`

Simplest command — a thin wrapper over `writeRegeneratedRoadmap`. Establishes the command shape reused by `shard`/`unshard`.

1. Create `regen.test.ts` (temp dir): seed `docs/roadmap.d/` with 2 shards (serialized via `serializeShard`, 1–2 digit refs) + `_meta.md` (via `serializeMeta`). `runRoadmapRegen({ cwd })` writes `docs/roadmap.md`; assert it parses, and a **second** `runRoadmapRegen` produces a byte-identical file (truth 4). Missing `docs/roadmap.d/` → `Err(CLIError)`.
2. Run — observe failure.
3. Create `regen.ts`:
   - `runRoadmapRegen(opts: { cwd?: string; io?: NodeShardIO }): Promise<Result<void, CLIError>>` — resolve `cwd`, `shardDir = <cwd>/docs/roadmap.d`, `roadmapPath = <cwd>/docs/roadmap.md`; if `!io.exists(shardDir)` → `Err(CLIError('docs/roadmap.d not found; project is not sharded'))`; else `writeRegeneratedRoadmap(shardDir, roadmapPath, io)` mapping core `Err` → `CLIError`; `logger.success` on done.
   - `createRoadmapRegenCommand()` — `new Command('regen').description('Regenerate docs/roadmap.md from the shard directory').option('--cwd <dir>', …).action(...)`, `process.exit` on error (mirror `migrate.ts`).
4. Run — observe pass.
5. Run: `harness validate`
6. Commit: `feat(cli): add harness roadmap regen command`

### Task 9: `harness roadmap shard` — happy path (`shard.ts`)

**Depends on:** Task 6, Task 7 | **Files:** `packages/cli/src/commands/roadmap/shard.ts`, `packages/cli/tests/commands/roadmap/shard.test.ts`

Core flow: read old `roadmap.md` → `parseRoadmap` → `roadmapToShards` → `assertSemanticRoundTrip` → (only if Ok) write shards + `_meta.md` + regenerate the monolith.

1. Create `shard.test.ts` (temp dir): write a representative `docs/roadmap.md` (2 milestones + Backlog, mixed statuses, a populated `## Assignment History`, a slug collision, 1–2 digit refs). Run `runRoadmapShard({ cwd })`:
   - `docs/roadmap.d/` now has one `<slug>.md` per feature + `_meta.md`; the collision produced `<slug>.md` and `<slug>-2.md`.
   - `ShardStore({ shardDir, io }).load()` deep-equals `parseRoadmap(<original roadmap.md text>)` (store parity end-to-end).
   - `docs/roadmap.md` re-parses equal to the original parse (it was regenerated from shards) and is byte-stable on a follow-up `regen`.
2. Run — observe failure.
3. Create `shard.ts`:
   - `interface RoadmapShardOptions { cwd?: string; dryRun?: boolean; format?: 'human'|'json'; force?: boolean; io?: NodeShardIO; }`
   - `runRoadmapShard(opts): Promise<Result<ShardReport, CLIError>>`:
     1. Resolve `cwd`, `roadmapPath`, `shardDir`, `io`.
     2. `if (!io.exists(roadmapPath))` → `Err(CLIError('docs/roadmap.md not found'))`.
     3. `parseRoadmap(read)` → on `Err`, `Err(CLIError)`.
     4. `const { shards, meta } = roadmapToShards(roadmap);`
     5. `const rt = assertSemanticRoundTrip(roadmap, shards, meta); if (!rt.ok) return Err(CLIError(rt.error.message, /* non-zero */));` (Task 10 adds the abort guarantees + tests.)
     6. Build a `ShardReport` (shardCount, milestoneCount, disambiguated slugs list).
     7. Write phase (happy path here; Task 10 gates it on `!dryRun` and the already-sharded check): `io.mkdirp(shardDir)`; for each shard `io.writeFile(<shardDir>/<slug>.md, serializeShard(shard))`; `io.writeFile(<shardDir>/_meta.md, serializeMeta(meta))`; then `writeRegeneratedRoadmap(shardDir, roadmapPath, io)`.
     8. `logger.success`; return `Ok(report)`.
   - `createRoadmapShardCommand()` wrapper (flags added/finalized in Task 10).
4. Run — observe pass.
5. Run: `harness validate`
6. Commit: `feat(cli): add harness roadmap shard happy-path migration`

### Task 10: `harness roadmap shard` — abort safety, refusal, dry-run, json

**Depends on:** Task 9 | **Files:** `packages/cli/src/commands/roadmap/shard.ts`, `packages/cli/tests/commands/roadmap/shard.test.ts`

`[checkpoint:human-verify]` — Load-bearing safety proof (spec success criterion: assert round-trip **before** destroying the monolith). Pause after the suite passes and show: the abort test leaves `roadmap.md` byte-identical, the dry-run writes nothing, the already-sharded refusal.

1. Extend `shard.test.ts`:
   - **Abort:** force the round-trip to fail (inject a `roadmapToShards`/round-trip that mismatches — e.g. seed a roadmap whose serialize→parse is non-identity by construction, OR temporarily monkeypatch via an injected `assertRoundTrip` hook). Assert `runRoadmapShard` returns `Err`, `docs/roadmap.d/` was **not created**, and `docs/roadmap.md` is **byte-identical** to before.
   - **Already sharded:** with `docs/roadmap.d/` present, `runRoadmapShard` returns `Err('already sharded; remove docs/roadmap.d or pass --force')`; `--force` proceeds.
   - **Dry-run:** `runRoadmapShard({ cwd, dryRun: true })` returns `Ok` with a populated report, writes **no** files (no `roadmap.d/`, `roadmap.md` unchanged).
   - **JSON:** `format: 'json'` emits a single stable JSON object (`ok`, `shardCount`, `milestoneCount`, `disambiguated`, `roundTrip`).
2. Run — observe failures.
3. Update `shard.ts`: add the `exists(shardDir) && !force` refusal **before** any write; move all writes behind `if (!dryRun)`; ensure the round-trip `Err` path returns **before** `mkdirp`/any write (it already does in Task 9 — add an explicit test-only injection seam `opts.assertRoundTrip ?? assertSemanticRoundTrip` so the abort is testable without corrupting fixtures); add JSON output + `--dry-run`/`--format`/`--force`/`--cwd` flags to `createRoadmapShardCommand()` (mirror `migrate.ts` exit-code/`process.exit` handling).
4. Run — observe pass.
5. **[checkpoint:human-verify]** Present: abort leaves monolith byte-identical; dry-run no-writes; refusal message. Confirm the write-ordering (assert-before-write) is correct.
6. Run: `harness validate`
7. Commit: `feat(cli): roadmap shard aborts before destroying the monolith on round-trip failure`

### Task 11: `harness roadmap unshard` command (`unshard.ts`)

**Depends on:** Task 7 | **Files:** `packages/cli/src/commands/roadmap/unshard.ts`, `packages/cli/tests/commands/roadmap/unshard.test.ts`

Losslessly reverse: regenerate the monolith from shards, then remove `docs/roadmap.d/`.

1. Create `unshard.test.ts` (temp dir): seed `docs/roadmap.d/` (shards + `_meta.md`). `runRoadmapUnshard({ cwd })`:
   - `docs/roadmap.md` written and byte-identical to `regenerate(shardDir)` (truth 5).
   - `docs/roadmap.d/` removed (`exists` false).
   - Refuses (`Err`) when `docs/roadmap.d/` is absent.
   - **Reversibility:** in a combined test, `runRoadmapShard` then `runRoadmapUnshard` yields a `roadmap.md` byte-identical to a fresh `regen` of the intermediate shards.
2. Run — observe failure.
3. Create `unshard.ts`:
   - `runRoadmapUnshard(opts: { cwd?; io?; force? }): Promise<Result<void, CLIError>>` — resolve paths; `if (!io.exists(shardDir))` → `Err(CLIError('docs/roadmap.d not found; nothing to unshard'))`; `writeRegeneratedRoadmap(shardDir, roadmapPath, io)` (Err→CLIError); then `io.rmrf(shardDir)`; `logger.success`.
   - `createRoadmapUnshardCommand()` wrapper (`--cwd`, `process.exit` on error).
4. Run — observe pass.
5. Run: `harness validate`
6. Commit: `feat(cli): add harness roadmap unshard command`

### Task 12: Register subcommands + document

**Depends on:** Task 8, Task 10, Task 11 | **Files:** `packages/cli/src/commands/roadmap/index.ts`, `docs/reference/cli-commands.md` | **Category:** integration

1. In `roadmap/index.ts`, import and `roadmap.addCommand(createRoadmapShardCommand()); roadmap.addCommand(createRoadmapUnshardCommand()); roadmap.addCommand(createRoadmapRegenCommand());` alongside the existing `createRoadmapMigrateCommand()`.
2. Add a `shard`/`unshard`/`regen` section to `docs/reference/cli-commands.md` (flags, the assert-before-write safety, read-source-invariant note that these are the only writers of `roadmap.md`). Use 1–2 digit refs in any examples.
3. Run: `pnpm --filter @harness-engineering/cli exec vitest run tests/commands/roadmap` — full roadmap CLI suite green.
4. Run: `harness validate`
5. Commit: `feat(cli): register roadmap shard/unshard/regen subcommands`

### Task 13: End-to-end round-trip + final gate

**Depends on:** Task 12 | **Files:** `packages/cli/tests/commands/roadmap/shard-roundtrip.e2e.test.ts` | **Category:** integration

`[checkpoint:human-verify]` — Final gate: confirm clean `validate` + `check-deps` (no NEW findings vs baseline) before handing to Phase 3.

1. Create `shard-roundtrip.e2e.test.ts` (temp dir, realistic multi-milestone `roadmap.md` with assignment history, slug collision, empty milestone, mixed statuses, 1–2 digit refs):
   - `runRoadmapShard({ cwd })` → `parse(docs/roadmap.md)` deep-equals the original parse (semantic round-trip, truth 1+2).
   - `runRoadmapRegen({ cwd })` twice → byte-identical `roadmap.md` (truth 4).
   - `runRoadmapUnshard({ cwd })` → `roadmap.md` restored byte-identical to the post-shard regenerated file; `docs/roadmap.d/` gone (truth 5).
2. Run: `pnpm --filter @harness-engineering/cli exec vitest run tests/commands/roadmap/shard-roundtrip.e2e.test.ts` — observe pass.
3. Run: `harness check-deps` — confirm NO new circular dependency introduced (baseline cycles in `cli/drift` + `cli/shared/craft/llm` only).
4. Run: `harness validate`
5. **[checkpoint:human-verify]** Present the e2e pass + clean `validate`/`check-deps` diff vs baseline.
6. Commit: `test(cli): end-to-end roadmap shard/regen/unshard round-trip`

## Sequencing

- **Parallelizable:** Task 7 (CLI ShardIO) is independent of the core chain (Tasks 1–6) and can proceed in parallel. Tasks 1→2→3 are strictly serial (each modifies the prior's surface). Task 4→5→6 serial.
- **Critical path:** Task 1 → 2 → 3 → 4 → 5 → 6 → 9 → 10 → 12 → 13. (Task 7 → 8/11 feed in; Task 9 needs both Task 6 and Task 7.)
- **Integration tasks last:** Task 6 (core barrel), Task 12 (registration + docs), Task 13 (e2e) after their implementation deps.

## Traceability (Observable Truth → Task)

| Truth                                   | Task(s)          |
| --------------------------------------- | ---------------- |
| 1 (shard writes shards + \_meta)        | 4, 9, 13         |
| 2 (assert round-trip before write)      | 5, 9, 10         |
| 3 (deterministic slug disambiguation)   | 4                |
| 4 (deterministic/byte-stable regen)     | 8, 13            |
| 5 (lossless unshard)                    | 11, 13           |
| 6 (--dry-run writes nothing)            | 10               |
| 7 (command conventions + invariant R)   | 8, 9, 10, 11, 12 |
| 8 (validate + check-deps clean)         | 6, 12, 13        |
| (round-trip enabler) assignment history | 1, 2, 3          |

## Change Specifications

- [ADDED] `packages/core/src/roadmap/store/migration.ts` — `roadmapToShards`, `assertSemanticRoundTrip`.
- [ADDED] CLI `roadmap/shard.ts`, `unshard.ts`, `regen.ts`, `shard-io.ts` + three registered subcommands.
- [MODIFIED] `parse.ts` / `serialize.ts` — `parseAssignmentHistory` / `serializeAssignmentHistory` now exported (behavior identical).
- [MODIFIED] `RoadmapMeta` + `meta.ts` — `_meta.md` extended from frontmatter-only to frontmatter + optional `## Assignment History` body (deviation from the spec's `_meta.md` shape; see Design Findings).
- [MODIFIED] `assembler.ts` — `assignmentHistory` now sourced from `meta` instead of hardcoded `[]`.
- [MODIFIED] `roadmap/index.ts` (CLI) — registers `shard`/`unshard`/`regen`.
- [MODIFIED] `docs/reference/cli-commands.md` — documents the new commands.

No writer call sites move onto `RoadmapStore` in this phase (that is Phase 4); mode auto-detection is Phase 6; the invariant-R enforcement check is Phase 3.
