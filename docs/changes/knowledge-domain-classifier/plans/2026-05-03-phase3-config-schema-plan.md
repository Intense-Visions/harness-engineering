# Plan: Phase 3 — Config schema additions for `knowledge.domainPatterns` and `knowledge.domainBlocklist`

**Date:** 2026-05-03 | **Spec:** `docs/changes/knowledge-domain-classifier/proposal.md` | **Phase 1 plan:** `docs/changes/knowledge-domain-classifier/plans/2026-05-03-phase1-shared-helper-plan.md` | **Phase 2 plan:** `docs/changes/knowledge-domain-classifier/plans/2026-05-03-phase2-wire-call-sites-plan.md` | **Tasks:** 4 | **Time:** ~14 min | **Integration Tier:** small

## Goal

Add a new `KnowledgeConfigSchema` to `packages/cli/src/config/schema.ts` exposing two optional array fields — `domainPatterns` (validated by the literal `prefix/<dir>` regex) and `domainBlocklist` (non-empty strings) — wire it onto `HarnessConfigSchema.knowledge`, and prove with tests that `harness.config.json` accepts both populated and absent slices, rejecting only malformed patterns and empty blocklist entries.

## Observable Truths (Acceptance Criteria)

Derived from `proposal.md` Success Criteria → "Configuration" (#18-22) and "Validation" (#27).

1. **[Ubiquitous]** The system shall export a new Zod schema `KnowledgeConfigSchema` from `packages/cli/src/config/schema.ts` whose shape is `{ domainPatterns: string[], domainBlocklist: string[] }`, both optional with `default([])`.
2. **[Ubiquitous]** The system shall expose `knowledge: KnowledgeConfigSchema.optional()` on `HarnessConfigSchema`, located after the existing `roadmap` slot and before the `adoption` slot to follow lexical-grouping convention with other classifier-adjacent fields (graph, knowledge, adoption).
3. **[Ubiquitous]** The system shall export a TypeScript type alias `KnowledgeConfig = z.infer<typeof KnowledgeConfigSchema>` alongside the other type exports at the bottom of `schema.ts`.
4. **[Event-driven]** When a config object provides `knowledge.domainPatterns: ["agents/<dir>"]`, the system shall accept it (Success Criterion #18).
5. **[Event-driven]** When a config object provides `knowledge.domainBlocklist: ["scratch", "fixtures"]`, the system shall accept it (Success Criterion #19).
6. **[Event-driven]** When a config object provides `knowledge.domainPatterns: ["agents"]` (missing the literal `<dir>` suffix), the system shall reject it via `safeParse` with a Zod `invalid_string` (regex) issue keyed at `knowledge.domainPatterns.0` (Success Criterion #20).
7. **[Event-driven]** When a config object provides `knowledge.domainBlocklist: [""]` (empty string), the system shall reject it via `safeParse` with a `too_small` issue keyed at `knowledge.domainBlocklist.0`.
8. **[Optional]** Where `knowledge` is omitted entirely from `harness.config.json`, the system shall successfully parse the config (Success Criterion #21 — back-compat).
9. **[Optional]** Where `knowledge: {}` is provided (empty object), the system shall apply defaults so `parsed.knowledge.domainPatterns === []` and `parsed.knowledge.domainBlocklist === []`.
10. **[Ubiquitous]** Running `harness validate` shall pass after the change (Success Criterion #27).
11. **[Ubiquitous]** Running `pnpm --filter @harness-engineering/cli test` shall produce 0 regressions versus the pre-change baseline; the new test file shall add at least 12 cases covering valid/invalid/optional/default scenarios.

## Skill Annotations

From `docs/changes/knowledge-domain-classifier/SKILLS.md` (Reference tier only — no Apply tier matches). Most skills are weakly relevant; annotations omitted for tasks where no skill is a better-than-coincidental match.

## File Map

```
MODIFY  packages/cli/src/config/schema.ts                            (add KnowledgeConfigSchema, wire onto HarnessConfigSchema, export KnowledgeConfig type)
CREATE  packages/cli/tests/config/knowledge-schema.test.ts           (new test file — mirrors design-schema.test.ts / integrations-schema.test.ts patterns)
```

No other files modified. No barrel updates needed: `KnowledgeConfigSchema`, `KnowledgeConfig` are reachable from `@harness-engineering/cli`'s existing `schema.ts` exports — no `packages/cli/src/index.ts` change required for Phase 3 (Phase 4 will consume them via `KnowledgePipelineRunner`).

## Skeleton

_Skeleton not produced — task count (4) is below the standard-rigor threshold (8). Going straight to full task expansion._

## Uncertainties

- **[ASSUMPTION]** No existing `KnowledgeConfigSchema` lives in `packages/cli/src/config/schema.ts`. Verified via `grep -n "KnowledgeConfigSchema"` (no matches) and visual inspection of the full file. The only existing `knowledge` reference is line 296 — a doc-comment about `agentsMapPath` pointing at `AGENTS.md`. Conclusion: greenfield schema addition.
- **[ASSUMPTION]** The `knowledge` field on `HarnessConfigSchema` does not already exist. Verified: line 389-394 has `graph: z.object({...}).optional()` and line 372-378 has `adoption: z.object({...}).optional()`, but no `knowledge` slot.
- **[ASSUMPTION]** The pattern regex from the spec — `^[\w.-]+\/<dir>$` — matches the literal `<dir>` suffix only after a single-segment prefix. Examples that pass: `agents/<dir>`, `examples/<dir>`, `services-v2/<dir>`, `my.service/<dir>`. Examples that fail: `agents` (no `<dir>`), `agents/foo` (literal `foo` not `<dir>`), `agents/<dir>/sub` (multi-segment). Confirmed via mental regex trace; tests explicitly cover the boundary.
- **[ASSUMPTION]** Field ordering in `HarnessConfigSchema` follows historical convention (group similar concerns together). The spec does not pin a position; placing `knowledge` immediately after `roadmap` and before `adoption` keeps "telemetry-and-data" fields grouped. Trivial detail; reviewers may relocate.
- **[ASSUMPTION]** The existing test pattern (see `design-schema.test.ts`, `integrations-schema.test.ts`) imports both the slice schema (`DesignConfigSchema`/`IntegrationsConfigSchema`) and `HarnessConfigSchema`, with two `describe` blocks: one for the slice, one for `HarnessConfigSchema` integration. The new `knowledge-schema.test.ts` mirrors that structure.
- **[ASSUMPTION]** `harness validate` validates the schema-shape integrity of the project's own `harness.config.json` and runs the cli test suite indirectly only via `pnpm test` runs. The Phase 3 verification step ("verify `harness validate` accepts both populated and absent `knowledge.*`") is satisfied by (a) running `harness validate` post-change against this repo's existing config (which has no `knowledge` slot — covers the "absent" case) and (b) the unit test that `safeParse` accepts a populated `knowledge: {...}` object (covers the "populated" case via the schema layer that `loadConfig` invokes). Confirmed via `loader.test.ts` — `loadConfig` runs `HarnessConfigSchema.safeParse`.
- **[DEFERRABLE]** Phase 4 wires `KnowledgePipelineRunner` to read these fields and pass them through to `KnowledgeStagingAggregator`, `CoverageScorer`, and `KnowledgeDocMaterializer`. **Out of scope for Phase 3.**
- **[DEFERRABLE]** Phase 5 documents the new fields in `docs/reference/configuration.md`. **Out of scope for Phase 3.**
- **[DEFERRABLE]** Phase 2 review carry-forwards: `inferenceOptions` constructor-param test coverage on the three classes; aggregator-level path-bucketing regression test. Both belong in Phase 4 or Phase 6 — not Phase 3 (config-schema-only).
- **[DEFERRABLE]** Phase 1/2 carry-forwards (pre-existing DTS typecheck failures, 72% docs coverage baseline, pre-commit arch hook warnings on unrelated files) — explicitly NOT addressed in Phase 3 per session header.

## Schema Design

Verbatim Zod definition to insert in `packages/cli/src/config/schema.ts`. Place after the `RoadmapConfigSchema` definition (line 282) and before `HarnessConfigSchema` (line 283), so the section reads in dependency order:

```ts
/**
 * Schema for knowledge-pipeline domain inference configuration.
 *
 * Both fields *extend* the built-in defaults shipped by
 * `packages/graph/src/ingest/domain-inference.ts`:
 *   - `domainPatterns` adds caller-supplied `<prefix>/<dir>` patterns
 *     beyond `DEFAULT_PATTERNS` (packages, apps, services, src, lib).
 *   - `domainBlocklist` adds caller-supplied segment names beyond
 *     `DEFAULT_BLOCKLIST` (node_modules, .harness, dist, build, etc.).
 *
 * Pattern syntax: `prefix/<dir>` where `prefix` is a single path segment
 * (word chars, dots, hyphens). `<dir>` is the literal placeholder string;
 * the inferrer captures the path segment that lands at that position
 * as the resolved domain. See proposal Decision D8.
 */
export const KnowledgeConfigSchema = z.object({
  /** Caller-supplied domain patterns (e.g. `["agents/<dir>"]`). Extends defaults. */
  domainPatterns: z
    .array(z.string().regex(/^[\w.-]+\/<dir>$/))
    .optional()
    .default([]),
  /** Caller-supplied blocklisted path segments (e.g. `["scratch", "fixtures"]`). Extends defaults. */
  domainBlocklist: z.array(z.string().min(1)).optional().default([]),
});
```

Wire it into `HarnessConfigSchema` (insert after the `roadmap` field at line 371, before `adoption` at line 372):

```ts
/** Knowledge-pipeline domain-inference settings */
knowledge: KnowledgeConfigSchema.optional(),
```

Add the type export at the bottom of `schema.ts` (alongside the existing `IntegrationsConfig` export at line 435):

```ts
/**
 * Type for knowledge-pipeline-specific configuration.
 */
export type KnowledgeConfig = z.infer<typeof KnowledgeConfigSchema>;
```

## Tasks

### Task 1: Add `KnowledgeConfigSchema` to schema.ts and wire it onto `HarnessConfigSchema`

**Depends on:** none | **Files:** `packages/cli/src/config/schema.ts`

1. Open `packages/cli/src/config/schema.ts`.
2. Locate the closing brace of `RoadmapConfigSchema` (line 281). Immediately after it, insert a blank line and the new schema block (verbatim from "Schema Design" above):

   ```ts
   /**
    * Schema for knowledge-pipeline domain inference configuration.
    *
    * Both fields *extend* the built-in defaults shipped by
    * `packages/graph/src/ingest/domain-inference.ts`:
    *   - `domainPatterns` adds caller-supplied `<prefix>/<dir>` patterns
    *     beyond `DEFAULT_PATTERNS` (packages, apps, services, src, lib).
    *   - `domainBlocklist` adds caller-supplied segment names beyond
    *     `DEFAULT_BLOCKLIST` (node_modules, .harness, dist, build, etc.).
    *
    * Pattern syntax: `prefix/<dir>` where `prefix` is a single path segment
    * (word chars, dots, hyphens). `<dir>` is the literal placeholder string;
    * the inferrer captures the path segment that lands at that position
    * as the resolved domain. See proposal Decision D8.
    */
   export const KnowledgeConfigSchema = z.object({
     /** Caller-supplied domain patterns (e.g. `["agents/<dir>"]`). Extends defaults. */
     domainPatterns: z
       .array(z.string().regex(/^[\w.-]+\/<dir>$/))
       .optional()
       .default([]),
     /** Caller-supplied blocklisted path segments (e.g. `["scratch", "fixtures"]`). Extends defaults. */
     domainBlocklist: z.array(z.string().min(1)).optional().default([]),
   });
   ```

3. Locate `HarnessConfigSchema.roadmap` (line 371: `roadmap: RoadmapConfigSchema.optional(),`). Immediately after that line, insert:

   ```ts
     /** Knowledge-pipeline domain-inference settings */
     knowledge: KnowledgeConfigSchema.optional(),
   ```

4. Locate the type export block at the bottom of the file (after `export type IntegrationsConfig = z.infer<typeof IntegrationsConfigSchema>;` — line 435). Immediately after it, append:

   ```ts
   /**
    * Type for knowledge-pipeline-specific configuration.
    */
   export type KnowledgeConfig = z.infer<typeof KnowledgeConfigSchema>;
   ```

5. Save the file. Run `pnpm --filter @harness-engineering/cli build` (or `pnpm --filter @harness-engineering/cli typecheck` if available) and confirm no new TypeScript errors are introduced. Pre-existing DTS failures listed in the carry-forward are acceptable.
6. Run: `harness validate`. Must pass. (Validates this repo's own `harness.config.json`, which has no `knowledge` slot — confirms the field is correctly optional.)
7. Commit: `feat(cli/config): add knowledge.domainPatterns and knowledge.domainBlocklist schema`

   Body:

   ```
   [autopilot][phase 3] task 1: add KnowledgeConfigSchema

   Adds knowledge.domainPatterns (string[] validated by /^[\w.-]+\/<dir>$/)
   and knowledge.domainBlocklist (string[], non-empty strings) under a new
   KnowledgeConfigSchema. Both fields are optional with .default([]) so the
   slice can be omitted entirely or populated partially.

   Wires the schema onto HarnessConfigSchema.knowledge (optional) and
   exports a KnowledgeConfig type alias for downstream consumers.

   This is the schema layer only; Phase 4 plumbs the values from
   harness.config.json through KnowledgePipelineRunner into the three
   inferenceOptions consumers (KnowledgeStagingAggregator, CoverageScorer,
   KnowledgeDocMaterializer).
   ```

### Task 2 (TDD): Add `knowledge-schema.test.ts` covering valid populated, valid empty, valid absent, invalid pattern, and invalid blocklist cases

**Depends on:** Task 1 | **Files:** `packages/cli/tests/config/knowledge-schema.test.ts`

1. Create `packages/cli/tests/config/knowledge-schema.test.ts` with the following verbatim content:

   ```ts
   // packages/cli/tests/config/knowledge-schema.test.ts
   import { describe, it, expect } from 'vitest';
   import { KnowledgeConfigSchema, HarnessConfigSchema } from '../../src/config/schema';

   describe('KnowledgeConfigSchema', () => {
     it('accepts a fully populated knowledge config', () => {
       const result = KnowledgeConfigSchema.safeParse({
         domainPatterns: ['agents/<dir>', 'examples/<dir>'],
         domainBlocklist: ['scratch', 'fixtures'],
       });
       expect(result.success).toBe(true);
     });

     it('accepts an empty object (all fields optional)', () => {
       const result = KnowledgeConfigSchema.safeParse({});
       expect(result.success).toBe(true);
     });

     it('defaults domainPatterns to empty array when absent', () => {
       const result = KnowledgeConfigSchema.parse({});
       expect(result.domainPatterns).toEqual([]);
     });

     it('defaults domainBlocklist to empty array when absent', () => {
       const result = KnowledgeConfigSchema.parse({});
       expect(result.domainBlocklist).toEqual([]);
     });

     it('accepts explicitly empty arrays', () => {
       const result = KnowledgeConfigSchema.safeParse({
         domainPatterns: [],
         domainBlocklist: [],
       });
       expect(result.success).toBe(true);
     });

     it('accepts pattern with hyphenated single-segment prefix', () => {
       const result = KnowledgeConfigSchema.safeParse({
         domainPatterns: ['services-v2/<dir>'],
       });
       expect(result.success).toBe(true);
     });

     it('accepts pattern with dotted single-segment prefix', () => {
       const result = KnowledgeConfigSchema.safeParse({
         domainPatterns: ['my.service/<dir>'],
       });
       expect(result.success).toBe(true);
     });

     it('rejects pattern missing the <dir> suffix', () => {
       const result = KnowledgeConfigSchema.safeParse({
         domainPatterns: ['agents'],
       });
       expect(result.success).toBe(false);
       if (!result.success) {
         const path = result.error.issues[0]?.path.join('.');
         expect(path).toBe('domainPatterns.0');
       }
     });

     it('rejects pattern with literal name instead of <dir>', () => {
       const result = KnowledgeConfigSchema.safeParse({
         domainPatterns: ['agents/foo'],
       });
       expect(result.success).toBe(false);
     });

     it('rejects pattern with multi-segment suffix after <dir>', () => {
       const result = KnowledgeConfigSchema.safeParse({
         domainPatterns: ['agents/<dir>/sub'],
       });
       expect(result.success).toBe(false);
     });

     it('rejects pattern with multi-segment prefix before <dir>', () => {
       const result = KnowledgeConfigSchema.safeParse({
         domainPatterns: ['agents/skills/<dir>'],
       });
       expect(result.success).toBe(false);
     });

     it('rejects empty string in domainBlocklist', () => {
       const result = KnowledgeConfigSchema.safeParse({
         domainBlocklist: [''],
       });
       expect(result.success).toBe(false);
       if (!result.success) {
         const path = result.error.issues[0]?.path.join('.');
         expect(path).toBe('domainBlocklist.0');
       }
     });

     it('rejects non-array domainPatterns', () => {
       const result = KnowledgeConfigSchema.safeParse({
         domainPatterns: 'agents/<dir>',
       });
       expect(result.success).toBe(false);
     });

     it('rejects non-array domainBlocklist', () => {
       const result = KnowledgeConfigSchema.safeParse({
         domainBlocklist: 'scratch',
       });
       expect(result.success).toBe(false);
     });

     it('rejects non-string element in domainPatterns', () => {
       const result = KnowledgeConfigSchema.safeParse({
         domainPatterns: [123],
       });
       expect(result.success).toBe(false);
     });

     it('rejects non-string element in domainBlocklist', () => {
       const result = KnowledgeConfigSchema.safeParse({
         domainBlocklist: [123],
       });
       expect(result.success).toBe(false);
     });
   });

   describe('HarnessConfigSchema with knowledge block', () => {
     const baseConfig = {
       version: 1 as const,
       name: 'test-project',
     };

     it('accepts config with populated knowledge block', () => {
       const result = HarnessConfigSchema.safeParse({
         ...baseConfig,
         knowledge: {
           domainPatterns: ['agents/<dir>'],
           domainBlocklist: ['scratch'],
         },
       });
       expect(result.success).toBe(true);
     });

     it('accepts config with empty knowledge block', () => {
       const result = HarnessConfigSchema.safeParse({
         ...baseConfig,
         knowledge: {},
       });
       expect(result.success).toBe(true);
     });

     it('accepts config without knowledge block (back-compat)', () => {
       const result = HarnessConfigSchema.safeParse(baseConfig);
       expect(result.success).toBe(true);
     });

     it('rejects config with malformed knowledge.domainPatterns entry', () => {
       const result = HarnessConfigSchema.safeParse({
         ...baseConfig,
         knowledge: { domainPatterns: ['agents'] },
       });
       expect(result.success).toBe(false);
       if (!result.success) {
         const path = result.error.issues[0]?.path.join('.');
         expect(path).toBe('knowledge.domainPatterns.0');
       }
     });

     it('rejects config with empty string in knowledge.domainBlocklist', () => {
       const result = HarnessConfigSchema.safeParse({
         ...baseConfig,
         knowledge: { domainBlocklist: [''] },
       });
       expect(result.success).toBe(false);
     });

     it('applies defaults when knowledge block is empty object', () => {
       const result = HarnessConfigSchema.parse({
         ...baseConfig,
         knowledge: {},
       });
       expect(result.knowledge).toEqual({
         domainPatterns: [],
         domainBlocklist: [],
       });
     });
   });
   ```

2. Run the new test file in isolation and observe all cases pass:

   ```
   pnpm --filter @harness-engineering/cli test -- knowledge-schema
   ```

   Expected: all 22 tests in the file pass (16 in the slice describe block, 6 in the HarnessConfigSchema describe block). Two of the slice cases assert specific Zod issue paths (`domainPatterns.0`, `domainBlocklist.0`) — if any path-equality assertion fails, the regex or the `.min(1)` constraint is misconfigured.

3. If a test fails: re-read Task 1's schema block and confirm the regex is exactly `/^[\w.-]+\/<dir>$/` (with the literal `<dir>` and the `\/` escape — note that JS regex literals do not strictly require escaping `/` inside the pattern, but the spec writes it that way and we follow verbatim). Confirm `z.string().min(1)` is on the blocklist element. Re-run.

4. Commit: `test(cli/config): add knowledge-schema validation tests`

   Body:

   ```
   [autopilot][phase 3] task 2: knowledge-schema tests

   Adds 22 cases under knowledge-schema.test.ts covering:
     - Valid: fully populated, empty object, empty arrays, defaults applied,
       hyphenated/dotted prefix patterns.
     - Invalid: missing <dir> suffix, literal name in <dir> slot,
       multi-segment prefix or suffix, empty blocklist string, non-array
       inputs, non-string array elements.
     - HarnessConfigSchema integration: populated/empty/absent knowledge
       block; malformed entries; default propagation.
   ```

### Task 3: Run full cli test suite to confirm no regressions

**Depends on:** Task 2 | **Files:** _none — verification only_

1. Run the full cli test suite:

   ```
   pnpm --filter @harness-engineering/cli test
   ```

2. Expected: all pre-existing tests (loader, design-schema, i18n-schema, integrations-schema, review-schema, plus any others) continue to pass; the 22 new cases from Task 2 add cleanly.
3. If any pre-existing test regresses: investigate before proceeding. The most likely cause would be an accidental edit to `HarnessConfigSchema` ordering or a typo in the new field that conflicts with an existing fixture in `tests/fixtures/valid-project/harness.config.json` or `tests/fixtures/invalid-project/harness.config.json`. Inspect those fixtures.
4. Run: `harness validate`. Must pass.
5. Run: `harness check-deps`. Must pass.
6. _No commit_ — this task is verification only. If the previous two commits already cover the changes, no further commit is needed.

### Task 4: \[checkpoint:human-verify\] Confirm Phase 3 deliverables and ready Phase 4

**Depends on:** Task 3 | **Files:** _none — checkpoint only_

1. Surface the following artefacts in the Phase 3 exit handoff:
   - Commit hashes for Tasks 1 and 2.
   - Test counts: pre-change cli baseline → post-change cli total. Expect a +22 delta.
   - Confirmation that `harness validate` and `harness check-deps` both pass.
   - Reminder of carry-forward concerns for Phase 4: (a) `inferenceOptions` constructor-param test coverage on the three classes; (b) aggregator-level path-bucketing regression test.
   - Reminder of out-of-scope items: Phase 4 (config plumbing — `KnowledgePipelineRunner` reads the new fields), Phase 5 (docs).
2. \[checkpoint:human-verify\] — Pause and present results. Operator confirms Phase 3 complete and authorises Phase 4 (config plumbing).
3. Note in handoff: `nextStep: "Phase 4: harness-planning against docs/changes/knowledge-domain-classifier/proposal.md scoped to KnowledgePipelineRunner config plumbing — read knowledge.domainPatterns and knowledge.domainBlocklist from harness.config.json and pass through to the three inferenceOptions consumers (KnowledgeStagingAggregator, CoverageScorer, KnowledgeDocMaterializer)."`

## Sequencing

- **Task 1 → Task 2 → Task 3 → Task 4** are hard order.
- No tasks parallelise — the test file in Task 2 imports from the schema modified in Task 1.
- Total estimated time: ~14 minutes (2 commits + 1 verification + 1 checkpoint).

## Carry-Forward (Phase 3 explicitly does NOT address)

- Pre-existing DTS typecheck failures (graph/ingest.ts, knowledge-pipeline.ts, mcp/tools/graph/ingest-source.ts) — not introduced or affected by Phase 3.
- 72% docs coverage baseline / api index pages — Phase 5 owns documentation.
- Pre-commit arch hook complexity/module-size warnings on unrelated files — carry-forward unchanged.
- Phase 1 / Phase 2 review carry-forwards (5 suggestions) — none in Phase 3 scope.
- Phase 2 review-important #1 (`inferenceOptions` constructor-param test coverage on the 3 classes) — address in Phase 4 when the param starts carrying real values.
- Phase 2 review-important #2 (aggregator-level path-based bucketing regression test) — address in Phase 4 or Phase 6.

## Integration Points (per spec)

- **Entry Points:** None new — schema-only change.
- **Registrations Required:** None — `KnowledgeConfigSchema` and `KnowledgeConfig` reach downstream callers via `schema.ts`'s existing exports. The barrel at `packages/cli/src/index.ts` already re-exports through `schema.ts` if it does so for other slices; verify but do not modify in this phase.
- **Documentation Updates:** Deferred to Phase 5.
- **Architectural Decisions:** None — refinement of an existing classifier (per spec § Integration Points → Architectural Decisions).
- **Knowledge Impact:** None at this phase — schema-only. Phase 4 unlocks the runtime impact (smaller `unknown` bucket, real per-domain coverage grades).

## Validation Checklist

- [ ] `KnowledgeConfigSchema` exported from `packages/cli/src/config/schema.ts` with verbatim Zod definition.
- [ ] `HarnessConfigSchema.knowledge` slot added (optional).
- [ ] `KnowledgeConfig` type alias exported.
- [ ] `packages/cli/tests/config/knowledge-schema.test.ts` exists with 22 cases (16 slice-level + 6 HarnessConfigSchema-level).
- [ ] All 22 new cases pass via `pnpm --filter @harness-engineering/cli test -- knowledge-schema`.
- [ ] Full cli suite passes via `pnpm --filter @harness-engineering/cli test`.
- [ ] `harness validate` passes.
- [ ] `harness check-deps` passes.
- [ ] Two commits land: schema (Task 1), tests (Task 2). Commit envelope: `[autopilot][phase 3] task <N>: <description>`.
- [ ] Phase 3 handoff written with commit hashes, test deltas, carry-forwards, and next-step pointer at Phase 4.
