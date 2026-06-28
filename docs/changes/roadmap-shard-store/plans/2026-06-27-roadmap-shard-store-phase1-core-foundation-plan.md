# Plan: Roadmap Shard Store — Phase 1 (Core Foundation)

**Date:** 2026-06-27 | **Spec:** docs/changes/roadmap-shard-store/proposal.md | **Tasks:** 10 | **Time:** ~40 min | **Integration Tier:** medium

## Goal

Provide self-contained core modules — shard/`_meta` parse+serialize, a `RoadmapStore` interface with `MonolithStore` + `ShardStore` backends, an assembler, and a deterministic regenerator — such that `RoadmapStore.load()` returns the same in-memory `Roadmap` in both modes and `regenerate(shards)` produces byte-identical, prettier-clean `roadmap.md`. No existing call site changes in this phase.

## Observable Truths (Acceptance Criteria)

1. **The system shall** parse a shard markdown string (frontmatter `slug`/`milestone`/`order` + existing row bullet block) via `parseShard()` into `{ slug, milestone, order, feature: RoadmapFeature }`, and `serializeShard()` shall round-trip it: `serializeShard(parseShard(s).value) === s` for a canonical fixture.
2. **The system shall** parse a frontmatter-only `_meta.md` via `parseMeta()` into `{ frontmatter: RoadmapFrontmatter, milestones: string[] }` (ordered milestone names), and `serializeMeta()` shall round-trip it byte-stably.
3. **The system shall** reuse the existing per-row bullet-block parser: `parseShard` calls the exported `parseFeatureBlock` from `parse.ts`, and all existing `parse.test.ts` / `parse-extended.test.ts` cases continue to pass unchanged.
4. **When** given shards + meta, `assembleRoadmap(shards, meta)` **shall** return a valid `@harness-engineering/types` `Roadmap` whose milestones are ordered per `_meta.milestones` and whose features within a milestone are ordered by `order`, then status-rank, then `slug`.
5. **The system shall** expose a `RoadmapStore` interface (`load`, `patchFeature`, `addFeature`) implemented by both `MonolithStore` and `ShardStore`.
6. **The system shall** make `MonolithStore.load()` return a `Roadmap` deep-equal to `parseRoadmap(<roadmap.md>).value` (behavior unchanged).
7. **The system shall** make `ShardStore.load()` return a `Roadmap` deep-equal to `MonolithStore.load()` for equivalent fixture data (store parity → downstream call sites unchanged).
8. **The system shall** make `regenerate(shardDir)` deterministic: two consecutive calls return byte-identical output, and the output is prettier-clean (no trailing whitespace, single trailing newline, no consecutive blank lines beyond the serializer's contract).
9. **The system shall** satisfy the semantic round-trip: `parseRoadmap(regenerate(shardDir)).value` deep-equals `assembleRoadmap(shards, meta)`, and for the migration fixture `parse(old roadmap.md)` deep-equals `parse(regen(shards))`.
10. **The system shall** export all new modules from `packages/core/src/roadmap/index.ts`; `harness validate` and `harness check-deps` report no NEW findings versus baseline.

## Assumptions & Uncertainties

- [ASSUMPTION] `gray-matter` (already a `packages/core` dependency, used in `src/strategy/parser.ts` and `src/roadmap/tracker/body-metadata.ts`) is the frontmatter engine for shard/`_meta` files. If rejected, Task 3/Task 4 fall back to the lightweight `key: value` splitter pattern already present in `parse.ts` (`parseFrontmatter`).
- [ASSUMPTION] `RoadmapFeature` (types package) is NOT extended with a `slug` field. `slug`/`milestone`/`order` live only in shard frontmatter (the `Shard` wrapper), keeping the `Roadmap` in-memory type unchanged (spec non-goal: do not redesign the type). The assembler discards shard metadata after grouping/ordering.
- [ASSUMPTION] Backlog detection in the assembler keys off milestone name `=== 'Backlog'` (matching `parse.ts` / `serialize.ts`), setting `isBacklog: true`. The `_meta.milestones` list carries `'Backlog'` as an ordinary ordered entry.
- [ASSUMPTION] A milestone present in a shard but absent from `_meta.milestones` is appended after the ordered milestones, in first-seen order (defensive; the migration in Phase 2 guarantees completeness). Documented so a later regression is traceable.
- [DEFERRABLE] `sharded` mode auto-detection in `load-mode.ts`/`mode.ts` is Phase 6; `patchFeature`/`addFeature` real callers are Phase 4. This phase implements + unit-tests those store methods but wires no caller.
- [DEFERRABLE] ADRs for invariant R and D2 are Phase 6 documentation; the read-source invariant grep check is Phase 3.

## File Map

- MODIFY `packages/core/src/roadmap/parse.ts` (export `parseFeatureBlock`)
- MODIFY `packages/core/src/roadmap/serialize.ts` (export `serializeFeature`)
- CREATE `packages/core/src/roadmap/store/roadmap-store.ts` (interface + `Shard`, `RoadmapMeta`, `FeatureMutation`, `AddFeatureInput` types)
- CREATE `packages/core/src/roadmap/store/shard.ts` (`parseShard` / `serializeShard`)
- CREATE `packages/core/src/roadmap/store/meta.ts` (`parseMeta` / `serializeMeta`)
- CREATE `packages/core/src/roadmap/store/assembler.ts` (`assembleRoadmap`)
- CREATE `packages/core/src/roadmap/store/monolith-store.ts` (`MonolithStore`)
- CREATE `packages/core/src/roadmap/store/shard-store.ts` (`ShardStore`)
- CREATE `packages/core/src/roadmap/store/regenerator.ts` (`regenerate`, `writeRegeneratedRoadmap`)
- CREATE `packages/core/src/roadmap/store/index.ts` (store barrel)
- MODIFY `packages/core/src/roadmap/index.ts` (re-export store barrel)
- CREATE `packages/core/tests/roadmap/store/fixtures.ts` (shared shard/meta/roadmap fixtures)
- CREATE `packages/core/tests/roadmap/store/shard.test.ts`
- CREATE `packages/core/tests/roadmap/store/meta.test.ts`
- CREATE `packages/core/tests/roadmap/store/assembler.test.ts`
- CREATE `packages/core/tests/roadmap/store/monolith-store.test.ts`
- CREATE `packages/core/tests/roadmap/store/shard-store.test.ts`
- CREATE `packages/core/tests/roadmap/store/regenerator.test.ts`
- CREATE `packages/core/tests/roadmap/store/round-trip.test.ts`
- MODIFY `packages/core/tests/roadmap/parse.test.ts` (add `parseFeatureBlock` cases) — or new `parse-block.test.ts`

> Conventions confirmed from the repo: tests live under `packages/core/tests/roadmap/**` (NOT co-located); vitest include is `['src/**/*.test.ts', 'tests/**/*.test.ts']`; run a single file with `pnpm --filter @harness-engineering/core exec vitest run <path>`. Import source via relative `../../../src/roadmap/...` from the new `tests/roadmap/store/` dir.

## Skeleton

1. Expose reuse primitives (export `parseFeatureBlock`, `serializeFeature`) (~1 task, ~4 min)
2. Store contract: interface + shard/meta types (~1 task, ~3 min)
3. Shard + `_meta` file format parse/serialize (~2 tasks, ~10 min)
4. Assembler + two store backends (~3 tasks, ~14 min)
5. Deterministic regenerator + round-trip/parity proof (~2 tasks, ~9 min)
6. Barrel exports + validate (~1 task, ~3 min)

**Estimated total:** 10 tasks, ~43 minutes.

_Skeleton approval: this plan-generation pass has no interactive channel (emit_interaction asks do not surface to the user); the skeleton is presented inline for human review at the Phase 4 sign-off gate. Skeleton approved: pending human sign-off._

## Tasks

### Task 1: Export the per-row block parse/serialize primitives

**Depends on:** none | **Files:** `packages/core/src/roadmap/parse.ts`, `packages/core/src/roadmap/serialize.ts`, `packages/core/tests/roadmap/parse-block.test.ts`

Reuse, do not reimplement. `parse.ts` already has `parseFeatureFields(name, body): Result<RoadmapFeature>` (private) and `serialize.ts` has `serializeFeature(feature): string[]` (private). Export both so the shard format can reuse them verbatim.

1. Create `packages/core/tests/roadmap/parse-block.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { parseFeatureBlock } from '../../src/roadmap/parse';
   import { serializeFeature } from '../../src/roadmap/serialize';

   const BLOCK = [
     '- **Status:** planned',
     '- **Spec:** docs/changes/x/proposal.md',
     '- **Summary:** A summary',
     '- **Blockers:** —',
     '- **Plan:** —',
     '- **Assignee:** —',
     '- **Priority:** P1',
     '- **External-ID:** github:o/r#7',
     '- **Updated-At:** 2026-06-27T12:00:00.000Z',
   ].join('\n');

   describe('parseFeatureBlock()', () => {
     it('parses a single row bullet block by name + body', () => {
       const r = parseFeatureBlock('Do the thing', BLOCK);
       expect(r.ok).toBe(true);
       if (r.ok) {
         expect(r.value.name).toBe('Do the thing');
         expect(r.value.status).toBe('planned');
         expect(r.value.priority).toBe('P1');
         expect(r.value.externalId).toBe('github:o/r#7');
       }
     });

     it('round-trips through serializeFeature', () => {
       const r = parseFeatureBlock('Do the thing', BLOCK);
       if (!r.ok) throw r.error;
       const md = serializeFeature(r.value).join('\n');
       const r2 = parseFeatureBlock('Do the thing', md);
       expect(r2).toEqual(r);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/core exec vitest run tests/roadmap/parse-block.test.ts` — observe failure (`parseFeatureBlock` / `serializeFeature` not exported).
3. In `parse.ts`, rename `parseFeatureFields` to `parseFeatureBlock` and add `export` (update the internal call site in `parseFeatures`). Do not change behavior.
4. In `serialize.ts`, add `export` to `serializeFeature`. No behavior change.
5. Run the new test — observe pass.
6. Run `pnpm --filter @harness-engineering/core exec vitest run tests/roadmap/parse.test.ts tests/roadmap/serialize.test.ts tests/roadmap/parse-extended.test.ts` — confirm existing suites still pass (truth 3).
7. Run: `harness validate`
8. Commit: `refactor(core): export parseFeatureBlock and serializeFeature for shard reuse`

### Task 2: Define the RoadmapStore contract and shard/meta types

**Depends on:** none | **Files:** `packages/core/src/roadmap/store/roadmap-store.ts`

Type/interface definitions; verified by `tsc` (no runtime test). Keep `RoadmapFeature` unchanged — shard metadata lives in the `Shard` wrapper only.

1. Create `packages/core/src/roadmap/store/roadmap-store.ts`:

   ```ts
   import type {
     Roadmap,
     RoadmapFeature,
     RoadmapFrontmatter,
     Result,
   } from '@harness-engineering/types';

   /** A single per-row shard: frontmatter metadata + the parsed row body. */
   export interface Shard {
     slug: string;
     milestone: string;
     order: number;
     feature: RoadmapFeature;
   }

   /** Parsed `_meta.md`: roadmap-level frontmatter + the ordered milestone list. */
   export interface RoadmapMeta {
     frontmatter: RoadmapFrontmatter;
     /** Milestone names in canonical document order (includes 'Backlog'). */
     milestones: string[];
   }

   /** A pure mutation applied to one feature during patchFeature. */
   export type FeatureMutation = (feature: RoadmapFeature) => RoadmapFeature;

   /** Input for addFeature — slug + placement + the feature body. */
   export interface AddFeatureInput {
     slug: string;
     milestone: string;
     order: number;
     feature: RoadmapFeature;
   }

   /**
    * Backend-agnostic roadmap store. `load()` MUST return the same in-memory
    * Roadmap regardless of backend (monolith vs shards), so downstream call
    * sites are unchanged (spec D3 / invariant: store parity).
    */
   export interface RoadmapStore {
     load(): Promise<Result<Roadmap>>;
     /** Patch exactly one feature/shard. Phase 4 wires real callers. */
     patchFeature(slug: string, mutate: FeatureMutation): Promise<Result<void>>;
     /** Add a new feature/shard. Phase 4 wires real callers. */
     addFeature(input: AddFeatureInput): Promise<Result<void>>;
   }
   ```

2. Run: `pnpm --filter @harness-engineering/core exec tsc --noEmit` (or `harness validate`) — observe clean compile.
3. Run: `harness validate`
4. Commit: `feat(core): add RoadmapStore interface and shard/meta types`

### Task 3: Shard file parse/serialize (`shard.ts`)

**Depends on:** Task 1, Task 2 | **Files:** `packages/core/src/roadmap/store/shard.ts`, `packages/core/tests/roadmap/store/fixtures.ts`, `packages/core/tests/roadmap/store/shard.test.ts`

`parseShard` uses `gray-matter` for the `slug`/`milestone`/`order` frontmatter, then `parseFeatureBlock(name, body)` for the row block (name = the `### ` H3 line). `serializeShard` emits deterministic frontmatter (fixed key order `slug`, `milestone`, `order`) + `serializeFeature`.

1. Create `packages/core/tests/roadmap/store/fixtures.ts` with `SHARD_MD` (a canonical shard string matching the spec example: frontmatter `slug`/`milestone`/`order`, blank line, `### <name>`, blank line, full bullet block) and the expected `Shard` object.
2. Create `packages/core/tests/roadmap/store/shard.test.ts`:
   - `parseShard(SHARD_MD)` returns `Ok` with `{ slug, milestone, order, feature }` equal to the fixture.
   - **Byte-stability:** `serializeShard(parseShard(SHARD_MD).value) === SHARD_MD`.
   - `order` is coerced to a number; non-numeric `order` → `Err`.
   - Missing `slug` or `milestone` → `Err` with a descriptive message.
3. Run the test — observe failure (module missing).
4. Create `packages/core/src/roadmap/store/shard.ts`:
   - `import matter from 'gray-matter';`
   - `parseShard(md: string): Result<Shard>` — `matter(md)` → read `data.slug`/`data.milestone`/`data.order`; validate presence + numeric order; extract the H3 name from `content` via `/^###\s+(.+)$/m`; call `parseFeatureBlock(name, content)`; return `Ok({ slug, milestone, order, feature })`.
   - `serializeShard(shard: Shard): string` — build frontmatter lines in fixed order (`---`, `slug: ...`, `milestone: ...`, `order: ...`, `---`, ``), then `### ${feature.name}`, ``, then `serializeFeature(feature).join('\n')`, end with single trailing newline matching the fixture. Do NOT use `matter.stringify` (its key order / quoting is not guaranteed stable); hand-emit for byte-determinism.
5. Run the test — observe pass (round-trip + byte-stability).
6. Run: `harness validate`
7. Commit: `feat(core): add shard file parse/serialize`

### Task 4: `_meta.md` parse/serialize (`meta.ts`)

**Depends on:** Task 2 | **Files:** `packages/core/src/roadmap/store/meta.ts`, `packages/core/tests/roadmap/store/meta.test.ts`

`_meta.md` is frontmatter-only: the roadmap frontmatter fields (`project`, `version`, `created?`, `updated?`, `last_synced`, `last_manual_edit`) plus an ordered `milestones:` YAML list — the single source of milestone ordering.

1. Add `META_MD` + expected `RoadmapMeta` to `fixtures.ts` (frontmatter only; `milestones:` as a YAML block sequence).
2. Create `packages/core/tests/roadmap/store/meta.test.ts`:
   - `parseMeta(META_MD)` returns `Ok` with frontmatter mapped to `RoadmapFrontmatter` (same field mapping as `parse.ts` `parseFrontmatter`: `version` → number, optional `created`/`updated`) and `milestones` as an ordered `string[]`.
   - **Byte-stability:** `serializeMeta(parseMeta(META_MD).value) === META_MD`.
   - Missing required frontmatter (`project`/`version`/`last_synced`/`last_manual_edit`) → `Err`.
3. Run — observe failure.
4. Create `packages/core/src/roadmap/store/meta.ts`:
   - `parseMeta(md: string): Result<RoadmapMeta>` — `matter(md)`; validate + map required fields (mirror `parse.ts` validation, including `version = parseInt`); read `data.milestones` as `string[]` (error if not an array).
   - `serializeMeta(meta: RoadmapMeta): string` — hand-emit frontmatter in fixed key order (`project`, `version`, `created?`, `updated?`, `last_synced`, `last_manual_edit`, then `milestones:` followed by `  - <name>` lines), wrapped in `---` fences, single trailing newline. Deterministic, no `matter.stringify`.
5. Run — observe pass.
6. Run: `harness validate`
7. Commit: `feat(core): add _meta.md parse/serialize`

### Task 5: Assembler — shards + meta → Roadmap (`assembler.ts`)

**Depends on:** Task 2, Task 3, Task 4 | **Files:** `packages/core/src/roadmap/store/assembler.ts`, `packages/core/tests/roadmap/store/assembler.test.ts`

Pure function shared by `ShardStore.load()` and the regenerator. Groups shards by `milestone`, orders milestones via `meta.milestones`, orders features within a milestone by `order` asc, then `STATUS_RANK` desc, then `slug` asc.

1. Add `ASSEMBLER_SHARDS` (a few shards across 2 milestones + Backlog, intentionally out of order) and `EXPECTED_ROADMAP` to `fixtures.ts`.
2. Create `packages/core/tests/roadmap/store/assembler.test.ts`:
   - Milestones appear in `meta.milestones` order; `Backlog` milestone carries `isBacklog: true`.
   - Features within a milestone ordered by `order`, ties broken by status-rank then slug.
   - `frontmatter` on the result equals `meta.frontmatter`; `assignmentHistory` is `[]`.
   - A shard whose `milestone` is absent from `meta.milestones` is appended after ordered milestones (first-seen order) — assert the documented fallback.
   - Result is a structurally valid `Roadmap` and `serializeRoadmap(result)` then `parseRoadmap(...)` deep-equals `result` (local semantic round-trip).
3. Run — observe failure.
4. Create `packages/core/src/roadmap/store/assembler.ts`:
   - `import { STATUS_RANK } from '../status-rank';`
   - `assembleRoadmap(shards: Shard[], meta: RoadmapMeta): Roadmap`:
     - Group shards into `Map<string /*milestone*/, Shard[]>`.
     - Build milestone order = `meta.milestones` followed by any milestone keys not in the list (first-seen).
     - For each milestone name in order: sort its shards by `(a.order - b.order) || (STATUS_RANK[b.feature.status] - STATUS_RANK[a.feature.status]) || a.slug.localeCompare(b.slug)`; map to `feature`; push `{ name, isBacklog: name === 'Backlog', features }`.
     - Return `{ frontmatter: meta.frontmatter, milestones, assignmentHistory: [] }`.
5. Run — observe pass.
6. Run: `harness validate`
7. Commit: `feat(core): add roadmap assembler (shards + meta -> Roadmap)`

### Task 6: `MonolithStore` backend (`monolith-store.ts`)

**Depends on:** Task 2 | **Files:** `packages/core/src/roadmap/store/monolith-store.ts`, `packages/core/tests/roadmap/store/monolith-store.test.ts`

Wraps today's behavior. Inject an `fs`-like reader/writer (`{ readFile, writeFile }`) for testability — do not hard-bind `node:fs`.

1. Create `packages/core/tests/roadmap/store/monolith-store.test.ts`:
   - Given an in-memory file map seeded with a valid `roadmap.md` fixture, `load()` returns a `Roadmap` deep-equal to `parseRoadmap(md).value` (truth 6).
   - `patchFeature(slug, mutate)` — for the monolith, `slug` maps to a feature; mutate it, re-serialize, write back; assert the written file re-parses with the mutation applied. (Monolith resolves `slug` by matching against the feature whose `External-ID`/name maps to `slug`; for Phase 1 use a slug→name resolver injected via fixture, documented as Phase 4-refined.)
   - `addFeature` appends to the target milestone and writes.
2. Run — observe failure.
3. Create `packages/core/src/roadmap/store/monolith-store.ts`:
   - `class MonolithStore implements RoadmapStore` constructed with `{ roadmapPath, io }` where `io` is `{ readFile(path): Promise<string>; writeFile(path, data): Promise<void> }`.
   - `load()` → read file → `parseRoadmap`.
   - `patchFeature` / `addFeature` → load → mutate the in-memory `Roadmap` → `serializeRoadmap` → write. Whole-file rewrite is acceptable here (this is the legacy backend; conflict-freedom is the shard backend's job).
4. Run — observe pass.
5. Run: `harness validate`
6. Commit: `feat(core): add MonolithStore backend`

### Task 7: `ShardStore` backend (`shard-store.ts`)

**Depends on:** Task 2, Task 3, Task 4, Task 5 | **Files:** `packages/core/src/roadmap/store/shard-store.ts`, `packages/core/tests/roadmap/store/shard-store.test.ts`

Globs `docs/roadmap.d/*.md` (excluding `_meta.md`), parses each shard + `_meta`, assembles. `patchFeature` rewrites exactly one shard; `addFeature` writes one new shard. Inject the directory-listing + file IO for testability.

1. Create `packages/core/tests/roadmap/store/shard-store.test.ts`:
   - Seed an in-memory shard dir (the `ASSEMBLER_SHARDS` fixtures serialized via `serializeShard` + a `_meta.md`). `load()` returns the assembled `Roadmap` (deep-equal to `assembleRoadmap(shards, meta)`).
   - **Store parity (truth 7):** build an equivalent `roadmap.md` fixture; assert `ShardStore.load()` deep-equals `MonolithStore.load()` for the same logical data.
   - `patchFeature('<slug>', mutate)` writes ONLY `<slug>.md` (assert exactly one file in the IO write log, and its path is `<slug>.md`) — the conflict-free single-shard guarantee.
   - `addFeature` creates `<newSlug>.md` and does not touch existing shards or `_meta.md`.
   - `_meta.md` is excluded from the shard glob (a `_meta.md` in the dir is never parsed as a row).
2. Run — observe failure.
3. Create `packages/core/src/roadmap/store/shard-store.ts`:
   - `class ShardStore implements RoadmapStore` constructed with `{ shardDir, io }` where `io` is `{ listDir(dir): Promise<string[]>; readFile; writeFile }`.
   - `load()` → list `*.md` minus `_meta.md` → `parseShard` each (short-circuit on `Err`) → `parseMeta(_meta.md)` → `assembleRoadmap`.
   - `patchFeature(slug, mutate)` → read `<slug>.md` → `parseShard` → apply `mutate` to `.feature` → `serializeShard` → write `<slug>.md` (single file).
   - `addFeature(input)` → `serializeShard({ ...input })` → write `<input.slug>.md`.
4. Run — observe pass.
5. Run: `harness validate`
6. Commit: `feat(core): add ShardStore backend with single-shard writes`

### Task 8: Deterministic regenerator (`regenerator.ts`)

**Depends on:** Task 3, Task 4, Task 5 | **Files:** `packages/core/src/roadmap/store/regenerator.ts`, `packages/core/tests/roadmap/store/regenerator.test.ts`

`regenerate(shardDir, io)` = read `_meta` + shards → `assembleRoadmap` → `serializeRoadmap` → string. `writeRegeneratedRoadmap` writes it to the aggregate path. Determinism is inherited from deterministic assembly + the deterministic `serializeRoadmap`.

1. Create `packages/core/tests/roadmap/store/regenerator.test.ts`:
   - **Byte-stability (truth 8):** `const a = await regenerate(dir, io); const b = await regenerate(dir, io); expect(b).toBe(a);`
   - **Prettier-clean:** assert no trailing whitespace per line (`/[ \t]+$/m` does not match), exactly one trailing `\n`, and no run of 3+ consecutive `\n`.
   - **Semantic round-trip (truth 9):** `parseRoadmap(a).value` deep-equals `assembleRoadmap(shards, meta)`.
2. Run — observe failure.
3. Create `packages/core/src/roadmap/store/regenerator.ts`:
   - `regenerate(shardDir, io): Promise<Result<string>>` — list+parse shards, parse `_meta`, `assembleRoadmap`, `serializeRoadmap`, return `Ok(md)`. (Reuse `ShardStore.load()` internals or call `assembleRoadmap` directly to avoid duplicate globbing — extract a shared `readShardDir(shardDir, io)` helper used by both `ShardStore` and the regenerator.)
   - `writeRegeneratedRoadmap(shardDir, roadmapPath, io)` — `regenerate` then `io.writeFile(roadmapPath, md)`.
4. Run — observe pass.
5. Run: `harness validate`
6. Commit: `feat(core): add deterministic roadmap regenerator`

### Task 9: Migration round-trip + store-parity proof

**Depends on:** Task 6, Task 7, Task 8 | **Files:** `packages/core/tests/roadmap/store/round-trip.test.ts`, `packages/core/tests/roadmap/store/fixtures.ts`

`[checkpoint:human-verify]` — This is the load-bearing correctness proof for the whole approach (spec Success Criteria: semantic round-trip + byte-stability). Pause after the suite passes and show results before continuing.

1. Add to `fixtures.ts`: `OLD_ROADMAP_MD` — a small but representative multi-milestone `roadmap.md` (2–3 milestones + Backlog, mixed statuses/priorities/external-ids, at least one `done`) — and the hand-authored equivalent shard set + `_meta.md` (`MIGRATION_SHARDS`, `MIGRATION_META`). These are authored by hand here because deriving shards from the monolith is the Phase 2 migration CLI; Phase 1 proves the format/assembler/regenerator are correct against a known-good pair.
2. Create `packages/core/tests/roadmap/store/round-trip.test.ts`:
   - **Semantic round-trip:** `const regen = (await regenerate(dir, io)).value; expect(parseRoadmap(regen).value).toEqual(parseRoadmap(OLD_ROADMAP_MD).value);` — i.e. `parse(old)` deep-equals `parse(regen(shards))` (NOT byte-equal vs the old file; serialize is lossy by design).
   - **Byte-stability on rerun:** regen twice → identical.
   - **Store parity end-to-end:** `MonolithStore(OLD_ROADMAP_MD).load()` deep-equals `ShardStore(shardDir).load()`.
3. Run: `pnpm --filter @harness-engineering/core exec vitest run tests/roadmap/store/round-trip.test.ts` — observe pass.
4. **[checkpoint:human-verify]** Present: the three assertions passing + the regenerated aggregate snapshot. Confirm the semantic-equality claim and that the regenerated file is prettier-clean before proceeding.
5. Run: `harness validate`
6. Commit: `test(core): prove semantic round-trip and store parity for shard store`

### Task 10: Barrel exports + validate

**Depends on:** Task 1–9 | **Files:** `packages/core/src/roadmap/store/index.ts`, `packages/core/src/roadmap/index.ts` | **Category:** integration

`[checkpoint:human-verify]` — Final gate: confirm clean `validate` + `check-deps` (no NEW findings vs baseline) before handing to Phase 2.

1. Create `packages/core/src/roadmap/store/index.ts` re-exporting: `RoadmapStore`, `Shard`, `RoadmapMeta`, `FeatureMutation`, `AddFeatureInput` (types); `parseShard`, `serializeShard`, `parseMeta`, `serializeMeta`, `assembleRoadmap`, `MonolithStore`, `ShardStore`, `regenerate`, `writeRegeneratedRoadmap`.
2. In `packages/core/src/roadmap/index.ts`, add a documented re-export block: `export * from './store';` (or named re-exports matching the file's existing style).
3. Add a tiny export-surface test (extend `round-trip.test.ts` or a `store/index.test.ts`) that imports `assembleRoadmap`, `ShardStore`, `regenerate` from `@harness-engineering/core` (package entry) and asserts they are functions — proves the barrel wiring.
4. Run: `pnpm --filter @harness-engineering/core exec vitest run tests/roadmap/store` — full store suite green.
5. Run: `harness check-deps` — confirm NO new circular dependency was introduced by the new `store/` modules (baseline has pre-existing cycles in `cli/drift` and `cli/shared/craft/llm` only).
6. Run: `harness validate`
7. **[checkpoint:human-verify]** Present clean `validate` + `check-deps` diff vs baseline.
8. Commit: `feat(core): export roadmap store barrel`

## Sequencing

- **Parallelizable:** Task 1 ∥ Task 2 (independent). After Task 2: Task 3 ∥ Task 4. Task 6 (MonolithStore) ∥ Task 3/4/5.
- **Critical path:** Task 2 → Task 3/4 → Task 5 → Task 7 → Task 8 → Task 9 → Task 10.
- **Integration tasks last:** Task 10 (barrel) after all implementation.

## Traceability (Observable Truth → Task)

| Truth                   | Task(s) |
| ----------------------- | ------- |
| 1 (shard round-trip)    | 3       |
| 2 (meta round-trip)     | 4       |
| 3 (parser reuse)        | 1, 3    |
| 4 (assembler ordering)  | 5       |
| 5 (store interface)     | 2, 6, 7 |
| 6 (monolith parity)     | 6       |
| 7 (store parity)        | 7, 9    |
| 8 (byte-stability)      | 8, 9    |
| 9 (semantic round-trip) | 8, 9    |
| 10 (exports + validate) | 10      |

## Change Specifications

This phase is additive (new `store/` subtree) plus two narrow exports:

- [ADDED] `packages/core/src/roadmap/store/**` — shard format, store interface, two backends, assembler, regenerator.
- [MODIFIED] `parse.ts` — `parseFeatureFields` renamed to exported `parseFeatureBlock` (behavior identical).
- [MODIFIED] `serialize.ts` — `serializeFeature` now exported (behavior identical).
- [MODIFIED] `roadmap/index.ts` — re-exports the store barrel.

No existing call site changes (writers are Phase 4; mode detection is Phase 6).
