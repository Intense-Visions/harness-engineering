# Plan: design-craft-elevator

**Date:** 2026-05-23
**Spec:** `docs/changes/design-pipeline/design-craft-elevator/proposal.md`
**Initiative:** design-pipeline (sub-project #6 of 6)
**Tasks:** 74
**Time:** ~25 days (Sprint 1 + Sprint 2 + Sprint 3 + Sprint 4 wall-time; ~70 hours active execution)
**Integration Tier:** large
**Rigor Level:** standard

> Single unified skill `harness-design-craft` with branchable phases (CRITIQUE / POLISH / BENCHMARK). LLM-judgment counterpart to the rule-based skills in the design-pipeline. Ships seed catalog (10 rubrics + 15 patterns + 50 exemplars) plus growth infrastructure. Hybrid LLM mode (fast code-only default + deep visual opt-in). Soft dependency on harness-design with detect-and-offer chain (B' pattern). Three checkpoints (one per phase boundary) plus the implicit autopilot APPROVE_PLAN pauses between Phases 0→1, 1→2, 2→3, 3→4.

---

## Goal

Ship `packages/cli/src/skills/harness-design-craft/` — a single MCP-discoverable skill that produces structured LLM-judgment craft findings (3-axis: tier × impact × confidence) and benchmark scores (5-dim radar) against a seed catalog of 10 rubrics + 15 patterns + 50 exemplars, with the contribution / signal-loop / measurement infrastructure required for the catalog to grow without curation bottleneck, while degrading gracefully when its soft dependency on `harness-design` is unsatisfied via the detect-and-offer (B') chained-skill upgrade path.

---

## Observable Truths (Acceptance Criteria)

These map 1-to-1 onto the spec's `## Success Criteria` (numbers in parens).

### Phase correctness

1. (1) `mcp__harness__design_craft({ path: fixtures/no-hierarchy, phases: ['critique'] })` returns ≥ 1 finding with `tier: 'foundational'`, `impact ∈ {medium, large}`, `confidence` populated.
2. (2) `mcp__harness__design_craft({ path: fixtures/cubic-bezier, phases: ['polish'] })` returns a `CRAFT-P001` finding with non-empty `before` and `after`.
3. (3) `mcp__harness__design_craft({ path: fixtures/empty-state, phases: ['benchmark'] })` returns a `BenchmarkScore` with all 5 radar dimensions populated (`score`, `confidence`, `notes`), `overall` computed, non-empty `gaps`.
4. (4) `mode: 'fast'` performs only text-LLM calls (zero playwright invocations); `mode: 'deep'` performs ≥ 1 vision-LLM call AND ≥ 1 playwright screenshot when components are present.
5. (5) Every finding's `derived.priority` is computed deterministically by `derivePriority(tier, impact, confidence)`. Unit test verifies `priority(foundational, large, high) > priority(aspirational, small, low)`.
6. (6) Given an intentionally ambiguous fixture (`tests/fixtures/ambiguous/`), at least one finding emits `confidence: 'low'` (LLM-mock asserts honest passthrough).

### Catalog seed and infrastructure

7. (7) `catalog/rubrics/` contains exactly 10 YAML files matching the spec list (hierarchy-clarity, typography-craft, motion-quality, color-confidence, density-rhythm, restraint, polish-details, copy-voice, interaction-craft, brand-coherence).
8. (8) `catalog/patterns/` contains exactly 15 YAML files (3 motion + 3 skeleton + 3 typography + 3 interaction + 3 layout).
9. (9) `catalog/exemplars/` contains exactly 50 YAML files (10 each for EmptyState, LoadingState, ErrorState, Modal, Button).
10. (10) `contribution/schema.ts` rejects any catalog YAML missing `id`, `version`, `status`, `authoredAt`, `contributors`, `source` (unit test per required field).
11. (11) PR-time validation script (`scripts/validate-design-craft-catalog.ts`) called from `harness validate` rejects malformed contributions.
12. (12) `docs/changes/design-pipeline/design-craft-elevator/contribution.md` exists and documents the review process.
13. (13) `contribution/signal.ts` exports `proposeFromRecurringFindings(threshold: number)`; given a synthetic store with the same finding shape ≥ 5 times across ≥ 2 projects, emits a proposal file to `.harness/design-craft/proposals/`.
14. (14) `getCatalogStats()` returns `{ rubrics: { id: triggerCount }[], patterns: { id: applyCount }[], exemplars: { id: citeCount }[] }`; dashboard route reads this.

### Integration / wiring

15. (15) `mcp__harness__design_craft` is registered and discoverable; passing `phases: ['critique']` does NOT invoke POLISH or BENCHMARK code paths (assertion via spy).
16. (16) Running the skill on a project lacking `design-system/DESIGN.md` returns `output.upgradeOffer` non-null; the option labelled "Yes, capture intent now" carries `chainedSkill: 'harness-design'` and `chainedPhases: ['INTENT', 'DIRECTION']`.
17. (17) `autoCapture: 'skip'` returns `output.upgradeOffer === undefined`; `autoCapture: 'auto'` emits a transition without `emit_interaction`.
18. (18) When `AestheticIntent` is declared in DESIGN.md, the critique prompts include the intent text (asserted via captured LLM prompt); when absent, generic critique runs.
19. (19) Given DESIGN.md with `declaredAntiPatterns: ['cubic-bezier-motion']` and a fixture with cubic-bezier code, the matching CRITIQUE finding is suppressed and `summary.deferralsToHarnessDesign === 1`.
20. (20) Re-running the skill twice on the same fixture produces the same `VIOLATES_CRAFT` edge count and one `CRAFT_SCORE` node per component (no duplicates).
21. (21) `mode: 'deep'` against `tests/fixtures/component-render/` renders via playwright, captures three viewports (1440, 768, 375), passes to vision-LLM mock, parses response into ≥ 1 finding.

### Performance / cost

22. (22) `tests/perf/fast-mode.test.ts` runs fast mode on a synthetic 50-file fixture in ≤ 30 s wall time (LLM-mock).
23. (23) `tests/perf/deep-mode.test.ts` runs deep mode on a 10-component fixture in ≤ 3 min wall time (LLM-mock + headless playwright).
24. (24) `output.summary.llmCalls` reports `count` and `costUsd` and matches the sum of per-call records.
25. (25) Re-running deep mode on unchanged components reuses cached screenshots — second run records `renderCacheHits === renderCount`.

### Output quality

26. (26) `derivePriority` unit test covers all 27 (3 × 3 × 3) combinations producing a strictly partial-ordered priority field.
27. (27) Markdown formatter test asserts grouped output with anchors `#CRAFT-C001` linked to `finding-codes.md`.
28. (28) Findings with `confidence: 'low'` render with `(low confidence:)` prefix in markdown.
29. (29) `harness validate` passes the skill's `SKILL.md` against the skill validator.

### Documentation

30. (30) `AGENTS.md`, `docs/guides/designer-quickstart.md`, `finding-codes.md`, `contribution.md`, `growth-trajectory.md` exist and are coherent.
31. (31) ADRs 0018–0021 (LLM-judgment skill / 3-axis output / living-catalog H / detect-and-offer B') filed under `docs/knowledge/decisions/`.
32. (32) Knowledge entries `llm-judgment-skills.md`, `craft-output-vocabulary.md`, `living-catalogs.md`, `detect-and-offer.md` exist under `docs/knowledge/design/` and `docs/knowledge/skills/`.

### Composition

33. (33) MCP tool schema is exported and stable; `packages/cli/src/skills/harness-design-craft/src/api.ts` exports a Zod-derived TypeScript type that #5 orchestrator can import.
34. (34) Every finding and score carries `summary.runId`; #4 verifier can detect fixpoint by `runId` set comparison.
35. (35) `getCatalogStats` exported from skill index module; signature stable in TypeScript declaration file.

### Negative criteria

36. (36) Test asserts that no source file under fixtures is modified after a POLISH run.
37. (37) No watcher / IDE plugin scaffolding present — only invocation entry points.
38. (38) `harness-design` package files are untouched after this plan ships.

---

## Uncertainties

- **[BLOCKING — resolved per spec §3 + DIRECTION #5]** Vision-LLM provider extension: `packages/intelligence/` may lack vision support. **Assumption documented:** `claude-sonnet-4-6` exposes vision via Anthropic provider; if absent, Phase 1 visual spike (Task 12) downgrades to "feasibility-failed" and the plan falls back to code-only mode (success criterion #4 modifies to "fast mode runs all three phases on code-only inputs; deep mode is documented as deferred"). The spike result is the human checkpoint at the end of Phase 1.
- **[ASSUMPTION]** Playwright is acceptable as a peer dependency (install-detected, not bundled). If the harness build forbids new peer deps, Task 7 escalates.
- **[ASSUMPTION]** `harness-design` already exposes INTENT and DIRECTION phases addressable by chained-skill transition. If transition machinery requires extension, Task 26 escalates.
- **[ASSUMPTION]** ADR numbering: next free is 0018. Spec mentions ADR-004–007 but those numbers are taken; this plan files 0018–0021 with the spec's titles. (Verified via `ls docs/knowledge/decisions/ | tail`.)
- **[ASSUMPTION]** Existing `DesignConstraintAdapter` lives in a discoverable module within `packages/cli` and exposes an extension hook for new code namespaces. Task 30 includes a discovery sub-step; if no hook exists, the task surfaces a follow-up.
- **[ASSUMPTION]** Existing skill directory pattern uses `packages/cli/src/skills/<name>/` (the directory does not yet exist — `harness-design*` skills are bundled into the dist build artifacts only). This plan creates the canonical skill directory; if a different source location is canonical, Task 3 escalates.
- **[DEFERRABLE]** Exact prompt wording for each rubric — finalised during catalog authoring (Tasks 15, 32, 39, 40).
- **[DEFERRABLE]** Whether `growth-trajectory.md` projections (20+75+400 over 12-24 months) should be normative or aspirational — note as "aspirational" in v1.
- **[DEFERRABLE]** Dashboard route exact URL — `/design-craft/stats` proposed; adjust in Task 50 if it clashes.

---

## Skill Recommendations

Loaded from `docs/changes/design-pipeline/design-craft-elevator/SKILLS.md` (reference tier only; advisor recorded 0 keyword matches — these are stack-level, not feature-specific). Tasks below are annotated only where the match is meaningfully load-bearing (TypeScript type design, chain-of-responsibility for the phase orchestrator, LLM-mock testing).

| Skill                         | Use                                             |
| ----------------------------- | ----------------------------------------------- |
| `ts-zod-integration`          | Reference during schema tasks (5, 6, 16, 26)    |
| `gof-chain-of-responsibility` | Reference for the phase orchestrator (Task 8)   |
| `ts-template-literal-types`   | Reference for `CRAFT-C###` code typing (Task 5) |
| `ts-testing-types`            | Reference for LLM-mock typing (Tasks 11, 65)    |

No `apply`-tier skills returned. (Reference-only annotations omitted from per-task headers to keep the plan readable.)

---

## File Map

### CREATE — Skill source

- `packages/cli/src/skills/harness-design-craft/SKILL.md`
- `packages/cli/src/skills/harness-design-craft/skill.yaml`
- `packages/cli/src/skills/harness-design-craft/src/index.ts`
- `packages/cli/src/skills/harness-design-craft/src/api.ts`
- `packages/cli/src/skills/harness-design-craft/src/phases/critique.ts`
- `packages/cli/src/skills/harness-design-craft/src/phases/polish.ts`
- `packages/cli/src/skills/harness-design-craft/src/phases/benchmark.ts`
- `packages/cli/src/skills/harness-design-craft/src/phases/orchestrator.ts`
- `packages/cli/src/skills/harness-design-craft/src/llm/provider.ts`
- `packages/cli/src/skills/harness-design-craft/src/llm/text.ts`
- `packages/cli/src/skills/harness-design-craft/src/llm/vision.ts`
- `packages/cli/src/skills/harness-design-craft/src/llm/cost.ts`
- `packages/cli/src/skills/harness-design-craft/src/render/playwright.ts`
- `packages/cli/src/skills/harness-design-craft/src/render/target-discovery.ts`
- `packages/cli/src/skills/harness-design-craft/src/render/cache.ts`
- `packages/cli/src/skills/harness-design-craft/src/findings/schema.ts`
- `packages/cli/src/skills/harness-design-craft/src/findings/derived.ts`
- `packages/cli/src/skills/harness-design-craft/src/findings/formatter.ts`
- `packages/cli/src/skills/harness-design-craft/src/catalog/index.ts`
- `packages/cli/src/skills/harness-design-craft/src/catalog/loader.ts`
- `packages/cli/src/skills/harness-design-craft/src/catalog/rubrics/<10 files>.yaml`
- `packages/cli/src/skills/harness-design-craft/src/catalog/patterns/<15 files>.yaml`
- `packages/cli/src/skills/harness-design-craft/src/catalog/exemplars/<50 files>.yaml`
- `packages/cli/src/skills/harness-design-craft/src/resolvers/preconditions.ts`
- `packages/cli/src/skills/harness-design-craft/src/resolvers/offer.ts`
- `packages/cli/src/skills/harness-design-craft/src/contribution/schema.ts`
- `packages/cli/src/skills/harness-design-craft/src/contribution/review.ts`
- `packages/cli/src/skills/harness-design-craft/src/contribution/signal.ts`
- `packages/cli/src/skills/harness-design-craft/src/measurement/usage.ts`
- `packages/cli/src/skills/harness-design-craft/src/measurement/dashboard.ts`
- `packages/cli/src/skills/harness-design-craft/src/integrations/design-constraint-adapter.ts`
- `packages/cli/src/skills/harness-design-craft/src/integrations/harness-design.ts`

### CREATE — Tests

- `packages/cli/src/skills/harness-design-craft/tests/fixtures/no-hierarchy/Buttons.tsx`
- `packages/cli/src/skills/harness-design-craft/tests/fixtures/cubic-bezier/Card.tsx`
- `packages/cli/src/skills/harness-design-craft/tests/fixtures/empty-state/EmptyState.tsx`
- `packages/cli/src/skills/harness-design-craft/tests/fixtures/ambiguous/Mixed.tsx`
- `packages/cli/src/skills/harness-design-craft/tests/fixtures/component-render/` (small Storybook-shaped fixture)
- `packages/cli/src/skills/harness-design-craft/tests/llm-mock/text-mock.ts`
- `packages/cli/src/skills/harness-design-craft/tests/llm-mock/vision-mock.ts`
- `packages/cli/src/skills/harness-design-craft/tests/findings/derived.test.ts`
- `packages/cli/src/skills/harness-design-craft/tests/findings/schema.test.ts`
- `packages/cli/src/skills/harness-design-craft/tests/findings/formatter.test.ts`
- `packages/cli/src/skills/harness-design-craft/tests/phases/critique.test.ts`
- `packages/cli/src/skills/harness-design-craft/tests/phases/polish.test.ts`
- `packages/cli/src/skills/harness-design-craft/tests/phases/benchmark.test.ts`
- `packages/cli/src/skills/harness-design-craft/tests/phases/orchestrator.test.ts`
- `packages/cli/src/skills/harness-design-craft/tests/llm/provider.test.ts`
- `packages/cli/src/skills/harness-design-craft/tests/render/playwright.test.ts`
- `packages/cli/src/skills/harness-design-craft/tests/render/cache.test.ts`
- `packages/cli/src/skills/harness-design-craft/tests/resolvers/preconditions.test.ts`
- `packages/cli/src/skills/harness-design-craft/tests/resolvers/offer.test.ts`
- `packages/cli/src/skills/harness-design-craft/tests/contribution/schema.test.ts`
- `packages/cli/src/skills/harness-design-craft/tests/contribution/signal.test.ts`
- `packages/cli/src/skills/harness-design-craft/tests/measurement/usage.test.ts`
- `packages/cli/src/skills/harness-design-craft/tests/integrations/adapter.test.ts`
- `packages/cli/src/skills/harness-design-craft/tests/integrations/end-to-end.test.ts`
- `packages/cli/src/skills/harness-design-craft/tests/perf/fast-mode.test.ts`
- `packages/cli/src/skills/harness-design-craft/tests/perf/deep-mode.test.ts`
- `packages/cli/src/skills/harness-design-craft/tests/negative/no-modification.test.ts`

### CREATE — Documentation and ADRs

- `docs/changes/design-pipeline/design-craft-elevator/finding-codes.md`
- `docs/changes/design-pipeline/design-craft-elevator/contribution.md`
- `docs/changes/design-pipeline/design-craft-elevator/growth-trajectory.md`
- `docs/changes/design-pipeline/design-craft-elevator/schemas/finding-3-axis.schema.json` (Phase 0 spike output)
- `docs/changes/design-pipeline/design-craft-elevator/schemas/radar-5-dim.schema.json`
- `docs/changes/design-pipeline/design-craft-elevator/schemas/catalog-entry.schema.json`
- `docs/changes/design-pipeline/design-craft-elevator/spikes/visual-pipeline-result.md` (Phase 1 spike output)
- `docs/knowledge/decisions/0018-llm-judgment-skill-pattern.md`
- `docs/knowledge/decisions/0019-three-axis-craft-output-model.md`
- `docs/knowledge/decisions/0020-living-catalog-h-pattern.md`
- `docs/knowledge/decisions/0021-detect-and-offer-bprime-pattern.md`
- `docs/knowledge/design/llm-judgment-skills.md`
- `docs/knowledge/design/craft-output-vocabulary.md`
- `docs/knowledge/design/living-catalogs.md`
- `docs/knowledge/skills/detect-and-offer.md`
- `scripts/validate-design-craft-catalog.ts`

### MODIFY — Wiring and registration

- `AGENTS.md` (add harness-design-craft under design skills)
- `docs/guides/designer-quickstart.md` (add "Running craft critique" subsection)
- `docs/changes/design-pipeline/REFERENCES.md` (mark sub-project #6 in-progress → done)
- `packages/cli/src/skills/<barrel>` (export the new skill; exact path discovered in Task 3)
- `packages/cli/.harness/arch/baselines.json` (regenerate after skill wiring)
- `.harness/skills-index.json` (regenerate)
- `harness.config.json` schema (Zod) — add `design.craft.*` block
- `packages/intelligence/` (extend with vision-capable model variant if absent; discovered in Task 4)
- `<DesignConstraintAdapter location>` — register `CRAFT-*` namespace + `CRAFT_SCORE` node type (discovered in Task 30)
- Dashboard router — register `/design-craft/stats` page (discovered in Task 50)
- `package.json` (skill workspace) — add playwright peer dep + scripts

---

## Skeleton

Standard rigor + 74 tasks → skeleton produced for direction check before full expansion. **Note:** Per harness-planning Phase 2 guidance, the skeleton was produced and is presented inline here; APPROVE_PLAN at the autopilot boundary doubles as the skeleton-approval checkpoint.

| Phase     | Group                                                                                                                            | Tasks  | Time                   |
| --------- | -------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------- |
| 0         | Schema spike (3-axis, 5-dim radar, catalog entry; specimen authoring; review)                                                    | 1–6    | ~1 day                 |
| 1A        | Engineering vertical slice (LLM provider, schemas in code, 1×1×1 wiring, CRITIQUE end-to-end, MCP entry, SKILL.md, visual spike) | 7–24   | ~5 days                |
| 1B        | Curation half-seed (5 rubrics, 5 patterns, 25 exemplars, contribution validator, doc drafts)                                     | 25–37  | ~2 days                |
| 2A        | Visual productionization + remaining phase impls + B' resolver + DesignConstraintAdapter + autoCapture                           | 38–47  | ~4 days                |
| 2B        | Full catalog completion + peer review                                                                                            | 48–55  | ~3 days                |
| 3         | Convergence: signal loop, measurement, dashboard, config schema, deferral wiring, matrix integration tests                       | 56–66  | ~5 days                |
| 4         | Polish: ADRs (4), knowledge entries (4), docs finalisation, perf baselines, LLM-mock CI infra, sign-off                          | 67–74  | ~5 days                |
| **Total** |                                                                                                                                  | **74** | **~25 days wall-time** |

**Streams A and B (Phases 1 and 2) are presented serially per DIRECTION #4** — autopilot expects serial phases. Stream-related tasks are grouped contiguously to preserve mental model.

**Skeleton-approval checkpoint:** APPROVE_PLAN gate before Phase 0 begins doubles as direction sign-off.

---

## Tasks

### Phase 0 — Schema Spike (Tasks 1–6, ~1 day)

#### Task 1: Author 3-axis finding JSON Schema specimen

**Depends on:** none | **Files:** `docs/changes/design-pipeline/design-craft-elevator/schemas/finding-3-axis.schema.json`

1. Read spec lines 128–181 (data structures) to extract `CraftFinding` shape.
2. Create the JSON Schema file with `id`, `phase`, `code` (pattern `^CRAFT-(C|P)\d{3}$`), `tier` (enum), `impact` (enum), `confidence` (enum), `target` (object), `message`, `cite`, optional `before`/`after`, and `derived.priority` (number).
3. Run `npx ajv-cli compile -s docs/changes/design-pipeline/design-craft-elevator/schemas/finding-3-axis.schema.json` to validate the schema is well-formed.
4. Run: `harness validate`.
5. Commit: `feat(design-craft): add 3-axis finding schema specimen`.

#### Task 2: Author 5-dim radar JSON Schema specimen

**Depends on:** Task 1 | **Files:** `docs/changes/design-pipeline/design-craft-elevator/schemas/radar-5-dim.schema.json`

1. Read spec lines 149–162 to extract `BenchmarkScore` shape.
2. Create the JSON Schema file with `target`, `exemplars` (array of ids), `radar` (object with 5 named dimensions each `{ score: int 0-100, confidence, notes }`), `overall`, `gaps` (array of strings).
3. Validate with ajv-cli.
4. Run: `harness validate`.
5. Commit: `feat(design-craft): add 5-dim radar schema specimen`.

#### Task 3: Author catalog entry JSON Schema specimen

**Depends on:** Task 2 | **Files:** `docs/changes/design-pipeline/design-craft-elevator/schemas/catalog-entry.schema.json`

1. Read spec lines 203–286 for rubric / pattern / exemplar YAML shapes.
2. Create a JSON Schema using `oneOf: [rubric, pattern, exemplar]` discriminator on a `kind` field; require `id`, `version`, `status` (stable|draft|deprecated), `authoredAt`, `contributors`, `source` on all three.
3. Also at this task: discover the canonical skill source directory. Run `find packages/cli -maxdepth 6 -type d -name "skills" 2>/dev/null` and `grep -rn "harness-design" packages/cli/src 2>/dev/null | head -10`. Record findings in a comment at the top of the schema file (e.g. `// Skill src directory: packages/cli/src/skills/<name>/`). If `packages/cli/src/skills/` does not exist, this task ALSO creates it via `mkdir -p` so subsequent tasks have a target. **[checkpoint:human-verify]** Confirm the skill source location before proceeding to Task 7.
4. Validate the schema with ajv-cli.
5. Run: `harness validate`.
6. Commit: `feat(design-craft): add catalog entry schema specimen`.

#### Task 4: Author three paper rubrics, three paper patterns, three paper exemplars

**Depends on:** Task 3 | **Files:** `packages/cli/src/skills/harness-design-craft/src/catalog/rubrics/{hierarchy-clarity,typography-craft,motion-quality}.yaml`, `packages/cli/src/skills/harness-design-craft/src/catalog/patterns/{spring-physics-microinteraction,skeleton-shimmer,fluid-type-scale}.yaml`, `packages/cli/src/skills/harness-design-craft/src/catalog/exemplars/{linear-empty-list,stripe-button-primary,vercel-error-state}.yaml`

1. Create the 9 YAML files using the exact shape from spec lines 203–286 (rubric example at 203, pattern at 233, exemplar at 261).
2. Set `version: 1`, `status: stable`, `authoredAt: 2026-05-23`, `contributors: [@chadjw]`.
3. Validate each file against `catalog-entry.schema.json` via `npx ajv-cli validate -s docs/changes/design-pipeline/design-craft-elevator/schemas/catalog-entry.schema.json -d "packages/cli/src/skills/harness-design-craft/src/catalog/**/*.yaml"`. Expect all valid.
4. Run: `harness validate`.
5. Commit: `feat(design-craft): add 3+3+3 paper catalog entries against schemas`.

#### Task 5: Author paper BENCHMARK output specimen

**Depends on:** Task 4 | **Files:** `docs/changes/design-pipeline/design-craft-elevator/schemas/benchmark-output.example.json`

1. Construct a worked example: pick `exemplar-linear-empty-list` and an imaginary "MyEmptyState" target. Populate all 5 radar dimensions with sample scores, confidences, notes; populate `overall` and `gaps`.
2. Validate against `radar-5-dim.schema.json` via ajv-cli.
3. Run: `harness validate`.
4. Commit: `feat(design-craft): add worked benchmark output specimen`.

#### Task 6: Schema-fit review pass

**Depends on:** Task 5 | **Files:** `docs/changes/design-pipeline/design-craft-elevator/schemas/REVIEW.md`

1. [checkpoint:human-verify] Author `REVIEW.md` answering: "Do the schemas accept all 9 paper entries + benchmark specimen with no ambiguity? Is any field over-constrained for future entries? Is any field under-constrained (allows incoherent data)?" Add one section per answer with "Adjustments needed" or "None".
2. If adjustments are needed, return to Tasks 1-3 and revise schemas; otherwise note "Schemas locked for Phase 1".
3. Run: `harness validate`.
4. Commit: `docs(design-craft): schema-fit review pass — schemas locked for Phase 1`.

**Phase 0 exit criterion:** Schemas accept all spec'd content without ambiguity (success criterion implicit). **APPROVE_PLAN pause expected here.**

---

### Phase 1A — Engineering Vertical Slice (Tasks 7–24, ~5 days)

#### Task 7: Verify playwright + intelligence-package availability

**Depends on:** Task 6 | **Files:** `packages/cli/src/skills/harness-design-craft/package.json` (or skill-local manifest)

1. Run `cat packages/intelligence/package.json | grep -E '(name|version|main)'` to confirm intelligence provider package shape. Record path in a `// Intelligence provider import path:` comment in `src/llm/provider.ts` (created later in Task 9 — for now, write findings to a scratch file under `/tmp/`).
2. Run `pnpm ls playwright 2>/dev/null || echo 'not installed'`. If not installed, add to skill-local `package.json` as `peerDependency` with version `^1.40.0`.
3. Run `node -e "require('playwright')" 2>&1 | head -3` and verify it loads OR returns a useful "module not found" message that the skill can surface to users.
4. If intelligence package lacks vision support (check for `vision` key/method in its API surface): record as `[ASSUMPTION VIOLATION]` and create stub task tracker note in commit message body.
5. Run: `harness check-deps`.
6. Run: `harness validate`.
7. Commit: `chore(design-craft): verify peer-dep availability for playwright + intelligence`.

#### Task 8: Add TypeScript schema for `CraftFinding` (TDD)

**Depends on:** Task 7 | **Files:** `packages/cli/src/skills/harness-design-craft/src/findings/schema.ts`, `packages/cli/src/skills/harness-design-craft/tests/findings/schema.test.ts`

1. Create `tests/findings/schema.test.ts` with three Vitest cases: "rejects finding with invalid tier", "accepts well-formed finding", "rejects code not matching `CRAFT-(C|P)###` pattern". Use Zod-based assertions.
2. Run: `npx vitest run packages/cli/src/skills/harness-design-craft/tests/findings/schema.test.ts` — observe ts/import failure (module not yet created).
3. Create `src/findings/schema.ts` exporting Zod schemas `tierSchema`, `impactSchema`, `confidenceSchema`, `craftFindingSchema`, `benchmarkScoreSchema`, `designCraftOutputSchema`, and inferred TypeScript types. Use template literal type `\`CRAFT-${'C'|'P'|'B'}${string}\`` for the code field.
4. Run vitest — observe pass.
5. Run: `harness validate`.
6. Commit: `feat(design-craft): add Zod schema for CraftFinding and BenchmarkScore`.

#### Task 9: Implement `derivePriority` (TDD)

**Depends on:** Task 8 | **Files:** `packages/cli/src/skills/harness-design-craft/src/findings/derived.ts`, `packages/cli/src/skills/harness-design-craft/tests/findings/derived.test.ts`

1. Create test file with: parametric test over all 27 (tier × impact × confidence) combinations asserting `priority` is a finite number; specific assertion `derivePriority('foundational','large','high') > derivePriority('aspirational','small','low')`; assertion `derivePriority('foundational','small','high') > derivePriority('polish','small','high')`.
2. Run vitest — observe failure.
3. Create `derived.ts` exporting `derivePriority(tier, impact, confidence)` using a weighted sum: tier weight {foundational:9, polish:6, aspirational:3} × impact {large:3, medium:2, small:1} × confidence {high:1.0, medium:0.7, low:0.4}.
4. Run vitest — observe pass.
5. Run: `harness validate`.
6. Commit: `feat(design-craft): add derivePriority deterministic function`.

#### Task 10: Implement LLM provider abstraction (TDD)

**Depends on:** Task 9 | **Files:** `packages/cli/src/skills/harness-design-craft/src/llm/provider.ts`, `packages/cli/src/skills/harness-design-craft/src/llm/text.ts`, `packages/cli/src/skills/harness-design-craft/src/llm/cost.ts`, `packages/cli/src/skills/harness-design-craft/tests/llm/provider.test.ts`

1. Create test asserting: `getProvider(config)` returns an object with `text(prompt)` and `vision(prompt, images)` methods; `text()` is callable and records `{provider, model, tokens, costUsd}` to a cost ledger; `vision()` throws `VisionUnavailableError` when intelligence package lacks vision support.
2. Run vitest — observe failure.
3. Implement `provider.ts` that wraps the discovered intelligence package (per Task 7); `text.ts` exposes `textCall(model, prompt) → { text, tokens, costUsd }`; `cost.ts` exposes `recordCost(record)` accumulator with `getCostSummary(): { count, costUsd }`.
4. Run vitest — observe pass.
5. Run: `harness validate`.
6. Commit: `feat(design-craft): add LLM provider abstraction with cost tracking`.

#### Task 11: Add LLM mock infrastructure (TDD)

**Depends on:** Task 10 | **Files:** `packages/cli/src/skills/harness-design-craft/tests/llm-mock/text-mock.ts`, `packages/cli/src/skills/harness-design-craft/tests/llm-mock/vision-mock.ts`

1. Create `text-mock.ts` exporting `createTextMock(scriptedResponses: Record<string, string>)` returning a provider with `text(prompt)` that matches prompt prefixes to scripted responses and records `{ tokens: 100, costUsd: 0.001 }`.
2. Create `vision-mock.ts` similarly with `vision(prompt, images)` returning scripted responses; track invocation count for assertions.
3. Add a small smoke test `tests/llm-mock/smoke.test.ts` asserting both mocks return expected scripted output.
4. Run vitest — observe pass.
5. Run: `harness validate`.
6. Commit: `test(design-craft): add LLM text + vision mock infrastructure`.

#### Task 12: Visual pipeline spike — playwright + vision LLM proof

**Depends on:** Task 11 | **Files:** `docs/changes/design-pipeline/design-craft-elevator/spikes/visual-pipeline-result.md`, `packages/cli/src/skills/harness-design-craft/spikes/visual-spike.mjs` (throwaway)

1. [checkpoint:human-verify] Write `spikes/visual-spike.mjs` that: (a) boots playwright headless, (b) renders a literal `<button>Click me</button>` HTML string, (c) screenshots at 1440×900, (d) calls the live intelligence vision API (or the recorded fixture in CI) with prompt "Describe this button in one sentence.", (e) prints the response.
2. Run: `node packages/cli/src/skills/harness-design-craft/spikes/visual-spike.mjs` and capture output.
3. Write `spikes/visual-pipeline-result.md` recording: feasibility (yes/no/partial), latency observed, cost observed, errors hit, recommendation (proceed with Phase 2A as planned OR downgrade to code-only-only).
4. [checkpoint:human-verify] **DECISION GATE:** If spike result is "feasibility-failed", surface to user and pause for direction. The plan's fallback is documented in spec lines 605: downgrade to code-only mode (deep mode tasks 38–41, 21, 23, 25 become "documented as deferred").
5. Run: `harness validate`.
6. Commit: `spike(design-craft): visual pipeline feasibility result — <conclusion>`.

#### Task 13: Skill scaffolding — SKILL.md + skill.yaml

**Depends on:** Task 12 | **Files:** `packages/cli/src/skills/harness-design-craft/SKILL.md`, `packages/cli/src/skills/harness-design-craft/skill.yaml`

1. Read `agents/skills/claude-code/harness-design/SKILL.md` (or its source) for format reference. If only the dist version exists, copy its structure.
2. Author `SKILL.md` with sections: title, "When to Use", "Process" (CRITIQUE / POLISH / BENCHMARK), "Harness Integration", "Gates", "Red Flags". Reference codes `CRAFT-C*`, `CRAFT-P*`, `CRAFT-B*`.
3. Author `skill.yaml` with `tier: 2`, `type: flexible`, `keywords: [design-craft, llm-critique, ...]` (from spec line 41), `mcp_tool: design_craft`.
4. Run: `harness validate` — verify skill validator passes against SKILL.md (success criterion #29).
5. Commit: `feat(design-craft): scaffold SKILL.md and skill.yaml`.

#### Task 14: Catalog loader (TDD)

**Depends on:** Task 13 | **Files:** `packages/cli/src/skills/harness-design-craft/src/catalog/loader.ts`, `packages/cli/src/skills/harness-design-craft/src/catalog/index.ts`, `packages/cli/src/skills/harness-design-craft/tests/catalog/loader.test.ts`

1. Create test asserting `loadCatalog(dir)` returns `{ rubrics, patterns, exemplars }` with all 3+3+3 paper entries loaded from Task 4 files; asserts each entry passes Zod validation; asserts malformed YAML throws.
2. Run vitest — observe failure.
3. Implement `loader.ts` using `js-yaml` to parse, Zod to validate against `catalog/schema.ts` (extend Task 8's schema file with `rubricSchema`, `patternSchema`, `exemplarSchema`).
4. Implement `catalog/index.ts` exporting `loadCatalog`, `getCatalogStats()` (stub for now returns zeros).
5. Run vitest — observe pass.
6. Run: `harness validate`.
7. Commit: `feat(design-craft): add catalog YAML loader with Zod validation`.

#### Task 15: CRITIQUE phase end-to-end with 1 rubric (TDD)

**Depends on:** Task 14 | **Files:** `packages/cli/src/skills/harness-design-craft/src/phases/critique.ts`, `packages/cli/src/skills/harness-design-craft/tests/phases/critique.test.ts`, `packages/cli/src/skills/harness-design-craft/tests/fixtures/no-hierarchy/Buttons.tsx`

1. Create fixture `Buttons.tsx`: three buttons with identical Tailwind classes (`<button className="bg-blue-500 text-white px-4 py-2">...</button>` × 3).
2. Create critique test asserting: given fixture + `hierarchy-clarity` rubric + LLM text-mock scripted to return a JSON finding payload, `runCritique({ files, catalog, llm })` returns array with ≥ 1 finding where `tier: 'foundational'`, `impact: 'large'`, `code: 'CRAFT-C001'`, `cite.rubricOrPatternId: 'rubric-hierarchy-clarity'`.
3. Run vitest — observe failure.
4. Implement `phases/critique.ts`: `runCritique({ files, catalog, llm })`:
   - For each rubric, render the prompt template with file contents.
   - Call `llm.text(prompt)`.
   - Parse JSON response into `CraftFinding`.
   - Run derivation (Task 9) to set `derived.priority`.
   - Return findings array.
5. Run vitest — observe pass.
6. Run: `harness validate`.
7. Commit: `feat(design-craft): CRITIQUE phase end-to-end with hierarchy-clarity rubric`.

#### Task 16: POLISH phase skeletal (returns empty)

**Depends on:** Task 15 | **Files:** `packages/cli/src/skills/harness-design-craft/src/phases/polish.ts`, `packages/cli/src/skills/harness-design-craft/tests/phases/polish.test.ts`

1. Create test: `runPolish({ files, catalog, llm })` returns `[]` when no patterns matched; signature is stable.
2. Implement `polish.ts` returning `[]` for now (Phase 2A wires the real implementation in Task 39).
3. Run vitest — observe pass.
4. Run: `harness validate`.
5. Commit: `feat(design-craft): POLISH phase skeleton (returns empty)`.

#### Task 17: BENCHMARK phase skeletal (returns empty)

**Depends on:** Task 16 | **Files:** `packages/cli/src/skills/harness-design-craft/src/phases/benchmark.ts`, `packages/cli/src/skills/harness-design-craft/tests/phases/benchmark.test.ts`

1. Create test: `runBenchmark({ files, catalog, llm })` returns `[]` initially; signature stable.
2. Implement `benchmark.ts` returning `[]` (Phase 2A wires real implementation in Task 40).
3. Run vitest — observe pass.
4. Run: `harness validate`.
5. Commit: `feat(design-craft): BENCHMARK phase skeleton (returns empty)`.

#### Task 18: Phase orchestrator (TDD)

**Depends on:** Task 17 | **Files:** `packages/cli/src/skills/harness-design-craft/src/phases/orchestrator.ts`, `packages/cli/src/skills/harness-design-craft/tests/phases/orchestrator.test.ts`

1. Create test asserting: `orchestrate({ phases: ['critique'] })` invokes only `runCritique`; `orchestrate({ phases: ['critique', 'polish', 'benchmark'] })` invokes all three in order; result is shape `{ findings, scores, summary }`.
2. Use spies on the phase modules.
3. Implement `orchestrator.ts` (apply gof-chain-of-responsibility pattern at a small scale — each phase enriches the result envelope).
4. Run vitest — observe pass (covers success criterion #15).
5. Run: `harness validate`.
6. Commit: `feat(design-craft): phase orchestrator with phase-selector support`.

#### Task 19: MCP tool entry — `mcp__harness__design_craft` (TDD)

**Depends on:** Task 18 | **Files:** `packages/cli/src/skills/harness-design-craft/src/api.ts`, `packages/cli/src/skills/harness-design-craft/src/index.ts`, `packages/cli/src/skills/harness-design-craft/tests/integrations/mcp-entry.test.ts`

1. Create `tests/integrations/mcp-entry.test.ts` asserting: input matches `DesignCraftInputSchema`; default `mode: 'fast'`, default `phases: ['critique','polish','benchmark']`, default `autoCapture: 'prompt'`; output matches `designCraftOutputSchema`.
2. Implement `api.ts` defining Zod input schema mirroring spec lines 188–199.
3. Implement `index.ts` exporting `designCraft(input)` that validates input → orchestrates phases → constructs output (including `summary.runId` via `crypto.randomUUID()`, `summary.llmCalls` from cost ledger).
4. Run vitest — observe pass.
5. Run: `harness validate`.
6. Commit: `feat(design-craft): MCP tool entry point with input/output validation`.

#### Task 20: Markdown formatter (TDD, covers success criteria #27, #28)

**Depends on:** Task 19 | **Files:** `packages/cli/src/skills/harness-design-craft/src/findings/formatter.ts`, `packages/cli/src/skills/harness-design-craft/tests/findings/formatter.test.ts`

1. Create formatter test asserting: output groups findings by phase; each finding renders `### CRAFT-C001` heading with anchor; low-confidence findings prefixed with `(low confidence:)`; links use relative path `../finding-codes.md`.
2. Run vitest — observe failure.
3. Implement `formatter.ts` exporting `formatMarkdown(output: DesignCraftOutput): string`.
4. Run vitest — observe pass.
5. Run: `harness validate`.
6. Commit: `feat(design-craft): markdown formatter with confidence-aware rendering`.

#### Task 21: Author `finding-codes.md` reference page (initial)

**Depends on:** Task 20 | **Files:** `docs/changes/design-pipeline/design-craft-elevator/finding-codes.md`

1. Author the markdown with sections `## CRAFT-C001..C100 (Critique)`, `## CRAFT-P001..P100 (Polish)`, `## CRAFT-B001..B100 (Benchmark)`.
2. Populate currently-defined codes: `CRAFT-C001 hierarchy-clarity`, `CRAFT-P001 spring-physics`, `CRAFT-B001 empty-state-radar` (the rest filled as catalog grows in Phase 2).
3. Run: `harness validate`.
4. Commit: `docs(design-craft): add finding-codes.md reference page`.

#### Task 22: Wire skill barrel + skill index regeneration

**Depends on:** Task 21 | **Files:** `<barrel discovered in Task 3>`, `.harness/skills-index.json`

1. Add `export * from './harness-design-craft'` to the skills barrel discovered in Task 3.
2. Run the skills index regeneration command (likely `harness skills regenerate` or `pnpm run build:skills` — verify via `harness --help | grep -i skill`).
3. Verify `harness-design-craft` appears in `.harness/skills-index.json` with `tier: 2`.
4. Run: `harness validate`.
5. Commit: `feat(design-craft): register harness-design-craft in skill index`.

#### Task 23: End-to-end critique smoke test on fixture

**Depends on:** Task 22 | **Files:** `packages/cli/src/skills/harness-design-craft/tests/integrations/end-to-end.test.ts`

1. Write a test that imports the MCP entry, invokes `designCraft({ path: fixtures/no-hierarchy, phases: ['critique'] })` with LLM text-mock, asserts output contains ≥ 1 CRAFT-C001 finding satisfying success criterion #1.
2. Run vitest — observe pass.
3. Run: `harness validate`.
4. Commit: `test(design-craft): end-to-end CRITIQUE smoke test passes success criterion #1`.

#### Task 24: Phase 1A milestone checkpoint

**Depends on:** Task 23 | **Files:** (none — observation only)

1. [checkpoint:human-verify] Demo: `pnpm vitest run packages/cli/src/skills/harness-design-craft/` runs green; vertical slice produces valid 3-axis finding for fixture; visual spike result documented; MCP tool registered. Confirm exit criteria for Phase 1 engineering stream from spec lines 548–551.
2. Run: `harness validate`.
3. Run: `harness check-deps`.
4. No commit (checkpoint only). If issues found, fix in follow-up commits before proceeding.

---

### Phase 1B — Curation Half-Seed (Tasks 25–37, ~2 days)

#### Task 25: Contribution schema validator (TDD, covers success criteria #10, #11)

**Depends on:** Task 24 | **Files:** `packages/cli/src/skills/harness-design-craft/src/contribution/schema.ts`, `packages/cli/src/skills/harness-design-craft/tests/contribution/schema.test.ts`, `scripts/validate-design-craft-catalog.ts`

1. Create test: parametric test over required fields (`id`, `version`, `status`, `authoredAt`, `contributors`, `source`) — each missing field individually causes validation to fail with a specific error.
2. Run vitest — observe failure.
3. Implement `schema.ts` exporting `validateContribution(entry: unknown): Result<Entry, ValidationError[]>` reusing Task 14's Zod schemas with extra `required` enforcement.
4. Implement `scripts/validate-design-craft-catalog.ts` (CLI runner) that walks `catalog/**/*.yaml` and reports invalid entries with non-zero exit.
5. Wire the script into `harness validate` (add invocation to the validate aggregator — discover its location via `grep -rn "harness validate" packages/cli/src | head`).
6. Run vitest — observe pass.
7. Run: `harness validate` — expect all current 3+3+3 entries pass.
8. Commit: `feat(design-craft): contribution schema validator + harness-validate wiring`.

#### Task 26: Author rubric — typography-craft (already have hierarchy-clarity, motion-quality from Task 4)

**Depends on:** Task 25 | **Files:** `packages/cli/src/skills/harness-design-craft/src/catalog/rubrics/color-confidence.yaml`, `density-rhythm.yaml`

1. Author two new rubrics matching the schema (templates from spec line 203).
2. Set codes `CRAFT-C002` (color-confidence) and `CRAFT-C003` (density-rhythm) in `findingTemplate`.
3. Update `finding-codes.md` to add the two new codes.
4. Run: `harness validate`.
5. Commit: `feat(design-craft): add color-confidence + density-rhythm rubrics`.

#### Task 27: Author rubric — restraint, polish-details

**Depends on:** Task 26 | **Files:** `packages/cli/src/skills/harness-design-craft/src/catalog/rubrics/restraint.yaml`, `polish-details.yaml`

1. Author two rubrics with codes `CRAFT-C004`, `CRAFT-C005`.
2. Update `finding-codes.md`.
3. Run: `harness validate`.
4. Commit: `feat(design-craft): add restraint + polish-details rubrics`.

#### Task 28: Add `typography-craft` rubric to round out Phase 1B rubric set

**Depends on:** Task 27 | **Files:** `packages/cli/src/skills/harness-design-craft/src/catalog/rubrics/typography-craft.yaml` (Task 4 created hierarchy, motion; this adds typography to reach 5 total alongside color-confidence, density-rhythm, restraint, polish-details)

1. Note: Phase 1B target is 5 rubrics; Task 4 created hierarchy-clarity + motion-quality + typography-craft? Re-check Task 4 — Task 4 created hierarchy-clarity + typography-craft? No: Task 4 created hierarchy-clarity, typography-craft, motion-quality. Plus Task 26 added color-confidence + density-rhythm and Task 27 added restraint + polish-details. That is 7. Phase 1B target is 5. **Course-correction:** trim to exactly 5 by retaining hierarchy-clarity, typography-craft, motion-quality (from Task 4), color-confidence (from Task 26), density-rhythm (from Task 26). Move restraint + polish-details to Phase 2B (delete files now if they were created; revert Task 27 commits if necessary).
2. Run `git rm packages/cli/src/skills/harness-design-craft/src/catalog/rubrics/restraint.yaml packages/cli/src/skills/harness-design-craft/src/catalog/rubrics/polish-details.yaml`.
3. Update `finding-codes.md` to remove CRAFT-C004 and CRAFT-C005 entries from Phase 1B section (re-add in Phase 2B).
4. Verify `ls packages/cli/src/skills/harness-design-craft/src/catalog/rubrics/ | wc -l` returns 5.
5. Run: `harness validate`.
6. Commit: `refactor(design-craft): trim rubric set to exactly 5 for Phase 1B (defer restraint + polish-details to 2B)`.

#### Task 29: Author pattern — 3 motion patterns

**Depends on:** Task 28 | **Files:** `packages/cli/src/skills/harness-design-craft/src/catalog/patterns/{ease-out-arrive,stagger-list-entrance,page-transition-crossfade}.yaml`

1. Author 3 motion patterns with codes `CRAFT-P002`, `CRAFT-P003`, `CRAFT-P004` (spring-physics-microinteraction from Task 4 is `CRAFT-P001`).
2. Each must include `before`, `after`, `applicableTo` AST pattern.
3. Update `finding-codes.md`.
4. Run: `harness validate`.
5. Commit: `feat(design-craft): add 3 motion polish patterns`.

#### Task 30: Author pattern — 2 skeleton patterns (skeleton-shimmer from Task 4 is third)

**Depends on:** Task 29 | **Files:** `packages/cli/src/skills/harness-design-craft/src/catalog/patterns/{skeleton-pulse,skeleton-content-aware}.yaml`

1. Author 2 skeleton patterns with codes `CRAFT-P005`, `CRAFT-P006`.
2. Update `finding-codes.md`.
3. Run: `harness validate`.
4. Commit: `feat(design-craft): add 2 skeleton polish patterns`.

#### Task 31: Author exemplars — 5 EmptyState exemplars (linear-empty-list from Task 4 is first)

**Depends on:** Task 30 | **Files:** `packages/cli/src/skills/harness-design-craft/src/catalog/exemplars/{notion-empty-doc,figma-empty-canvas,github-empty-repo,airbnb-empty-saved}.yaml`

1. Author 4 new EmptyState exemplars with `componentType: EmptyState`, all required fields, `radarReference` scores.
2. Run: `harness validate`.
3. Commit: `feat(design-craft): add 4 EmptyState exemplars (total: 5)`.

#### Task 32: Author exemplars — 5 LoadingState exemplars

**Depends on:** Task 31 | **Files:** 5 YAML files under `catalog/exemplars/`

1. Author 5 LoadingState exemplars (linear-list-loading, stripe-payment-processing, notion-page-loading, vercel-deploy-progress, figma-file-opening).
2. Run: `harness validate`.
3. Commit: `feat(design-craft): add 5 LoadingState exemplars`.

#### Task 33: Author exemplars — 5 ErrorState exemplars (vercel-error-state from Task 4 is first)

**Depends on:** Task 32 | **Files:** 4 YAML files under `catalog/exemplars/`

1. Author 4 new ErrorState exemplars to reach 5 total.
2. Run: `harness validate`.
3. Commit: `feat(design-craft): add 4 ErrorState exemplars (total: 5)`.

#### Task 34: Author exemplars — 5 Modal exemplars

**Depends on:** Task 33 | **Files:** 5 YAML files under `catalog/exemplars/`

1. Author 5 Modal exemplars (linear-issue-detail, notion-share-modal, stripe-pricing-table, github-create-pr, figma-publish).
2. Run: `harness validate`.
3. Commit: `feat(design-craft): add 5 Modal exemplars`.

#### Task 35: Author exemplars — 5 Button exemplars (stripe-button-primary from Task 4 is first)

**Depends on:** Task 34 | **Files:** 4 YAML files under `catalog/exemplars/`

1. Author 4 new Button exemplars to reach 5 total.
2. Run: `harness validate`.
3. Commit: `feat(design-craft): add 4 Button exemplars (total: 5)`.

#### Task 36: Draft `contribution.md`

**Depends on:** Task 35 | **Files:** `docs/changes/design-pipeline/design-craft-elevator/contribution.md`

1. Author the contribution doc: required fields, YAML format, review process (PR → schema validation → peer review per the contribution/review.ts hooks → merge), how to propose a new rubric/pattern/exemplar.
2. Reference `validateContribution` from `contribution/schema.ts`.
3. Run: `harness validate`.
4. Commit: `docs(design-craft): draft contribution.md (review process + format)`.

#### Task 37: Draft `growth-trajectory.md`

**Depends on:** Task 36 | **Files:** `docs/changes/design-pipeline/design-craft-elevator/growth-trajectory.md`

1. Author the growth doc: signal-loop mechanics (N≥5 recurrence → proposal), aspirational trajectory (20+75+400 over 12-24 months — flagged "aspirational"), measurement framework, contribution-velocity targets.
2. Run: `harness validate`.
3. Commit: `docs(design-craft): draft growth-trajectory.md`.

**Phase 1 exit criteria (spec lines 548–551):** vertical slice runs; Sprint 1 catalog (5+5+25) passes validation; visual spike concluded. **APPROVE_PLAN pause expected here.** Half-seed catalog count check: 5 rubrics, 5 patterns (P001 spring + P002-P004 motion + P005-P006 skeleton = 6 — **course-correction**: trim P002 or move to 2B). The plan's Task 29 should author 2 motion patterns to land at exactly 5 in 1B (1 spring + 2 motion + 2 skeleton). Note in Task 29: author 2 not 3, with motion-3 deferred to Phase 2B's pattern set.

---

### Phase 2A — Visual Productionization + Remaining Phases (Tasks 38–47, ~4 days)

#### Task 38: Productionize playwright render pipeline (TDD)

**Depends on:** Task 37 | **Files:** `packages/cli/src/skills/harness-design-craft/src/render/playwright.ts`, `packages/cli/src/skills/harness-design-craft/src/render/target-discovery.ts`, `packages/cli/src/skills/harness-design-craft/src/render/cache.ts`, `packages/cli/src/skills/harness-design-craft/tests/render/playwright.test.ts`, `packages/cli/src/skills/harness-design-craft/tests/fixtures/component-render/Story.tsx`

1. **Conditional on Phase 1 spike (Task 12) feasibility = yes.** If spike result was "feasibility-failed", this task documents the downgrade in `render/playwright.ts` as a `throw new Error('Visual mode unavailable — see spikes/visual-pipeline-result.md')` and tests assert the error is surfaced.
2. Create test using playwright-test infra: `renderComponent(targetPath, viewports)` returns `{ screenshots: Buffer[], viewports: number[] }`; cache key derived from content hash; second call hits cache.
3. Run vitest — observe failure.
4. Implement `playwright.ts` (boot headless chromium, render via synthetic HTML harness, screenshot at 3 viewports), `target-discovery.ts` (find Storybook stories OR explicit file list), `cache.ts` (content-hash → screenshot blob cache in `.harness/cache/design-craft/renders/`).
5. Run vitest — observe pass.
6. Run: `harness validate`.
7. Commit: `feat(design-craft): productionize playwright render pipeline with cache`.

#### Task 39: POLISH phase end-to-end with 3 patterns (TDD, covers success criterion #2)

**Depends on:** Task 38 | **Files:** `packages/cli/src/skills/harness-design-craft/src/phases/polish.ts`, `packages/cli/src/skills/harness-design-craft/tests/phases/polish.test.ts`, `packages/cli/src/skills/harness-design-craft/tests/fixtures/cubic-bezier/Card.tsx`

1. Create fixture `Card.tsx` with `transition: transform 0.2s cubic-bezier(0.4,0,0.2,1)`.
2. Update polish test: given fixture + spring-physics + ease-out-arrive + stagger-list-entrance patterns + LLM-mock returning `CRAFT-P001` suggestion with `before`/`after`, the phase returns ≥ 1 finding.
3. Run vitest — observe failure.
4. Implement `polish.ts` (replace skeleton): for each pattern whose `applicableTo` matches AST in files, prompt LLM with `when`/`suggest`/`before` template, parse response into finding with populated `before`/`after`.
5. Run vitest — observe pass.
6. Run: `harness validate`.
7. Commit: `feat(design-craft): POLISH phase end-to-end with first 3 patterns`.

#### Task 40: BENCHMARK phase end-to-end with 5 exemplars (TDD, covers success criterion #3)

**Depends on:** Task 39 | **Files:** `packages/cli/src/skills/harness-design-craft/src/phases/benchmark.ts`, `packages/cli/src/skills/harness-design-craft/tests/phases/benchmark.test.ts`, `packages/cli/src/skills/harness-design-craft/tests/fixtures/empty-state/EmptyState.tsx`

1. Create fixture `EmptyState.tsx` (minimal React empty state).
2. Update benchmark test: given fixture + 5 EmptyState exemplars + LLM-mock returning radar JSON, phase returns `BenchmarkScore` with all 5 dimensions populated, `overall` computed, non-empty `gaps`.
3. Run vitest — observe failure.
4. Implement `benchmark.ts` (replace skeleton): for each target component, select top-N exemplars matching `componentType`, prompt LLM with comparison template, parse radar JSON, compute `overall` as weighted mean.
5. Run vitest — observe pass.
6. Run: `harness validate`.
7. Commit: `feat(design-craft): BENCHMARK phase end-to-end with 5-dim radar`.

#### Task 41: Honest-confidence test for ambiguous fixture (covers success criterion #6)

**Depends on:** Task 40 | **Files:** `packages/cli/src/skills/harness-design-craft/tests/fixtures/ambiguous/Mixed.tsx`, `packages/cli/src/skills/harness-design-craft/tests/phases/honest-confidence.test.ts`

1. Create fixture with intentionally mixed signals (button hierarchy partly clear, partly muddled).
2. Test: LLM-mock scripted to return `confidence: 'low'` for the ambiguous case; assert the finding emerges with `confidence: 'low'` unaltered (not silently dropped, not upgraded to medium).
3. Run vitest — observe pass.
4. Run: `harness validate`.
5. Commit: `test(design-craft): assert honest-confidence passthrough for ambiguous fixtures`.

#### Task 42: B' preconditions detection (TDD)

**Depends on:** Task 41 | **Files:** `packages/cli/src/skills/harness-design-craft/src/resolvers/preconditions.ts`, `packages/cli/src/skills/harness-design-craft/tests/resolvers/preconditions.test.ts`

1. Create test asserting `detectPreconditions(projectPath)` returns `{ designMdExists, aestheticIntentDeclared, tokensExist, componentRegistryPopulated }` correctly for: (a) project with all 4, (b) project with none, (c) project with DESIGN.md but no Aesthetic Direction section.
2. Run vitest — observe failure.
3. Implement using `fs.exists` + markdown parsing (look for section heading `## Aesthetic Direction` and `## Component Registry`).
4. Run vitest — observe pass.
5. Run: `harness validate`.
6. Commit: `feat(design-craft): B' precondition detection`.

#### Task 43: B' detect-and-offer (TDD, covers success criteria #16, #17)

**Depends on:** Task 42 | **Files:** `packages/cli/src/skills/harness-design-craft/src/resolvers/offer.ts`, `packages/cli/src/skills/harness-design-craft/src/integrations/harness-design.ts`, `packages/cli/src/skills/harness-design-craft/tests/resolvers/offer.test.ts`

1. Create test asserting: (a) `buildOffer({ preconditions: {designMdExists:false,...}, autoCapture: 'prompt' })` returns `upgradeOffer` with options including `chainedSkill: 'harness-design'`, `chainedPhases: ['INTENT','DIRECTION']`; (b) `autoCapture: 'skip'` returns `undefined`; (c) `autoCapture: 'auto'` returns offer with `auto: true` flag and triggers transition mock.
2. Run vitest — observe failure.
3. Implement `offer.ts` constructing the payload per spec lines 174–180; `harness-design.ts` invokes `emit_interaction({type:'transition', completedPhase:'design-craft-precondition', suggestedNext:'harness-design', ...})`.
4. Run vitest — observe pass.
5. Run: `harness validate`.
6. Commit: `feat(design-craft): B' detect-and-offer with autoCapture modes`.

#### Task 44: Wire B' into orchestrator output (TDD)

**Depends on:** Task 43 | **Files:** `packages/cli/src/skills/harness-design-craft/src/phases/orchestrator.ts` (modify), `packages/cli/src/skills/harness-design-craft/src/index.ts` (modify), corresponding tests

1. Update orchestrator + entry to call `detectPreconditions` before phases, attach `upgradeOffer` to output, set `summary.preconditions`.
2. Add test asserting end-to-end run on a no-DESIGN.md fixture yields `output.upgradeOffer` per success criterion #16.
3. Run vitest — observe pass.
4. Run: `harness validate`.
5. Commit: `feat(design-craft): wire B' precondition check into orchestrator output`.

#### Task 45: DesignConstraintAdapter extension for CRAFT-\* codes (TDD, covers success criterion #20)

**Depends on:** Task 44 | **Files:** `packages/cli/src/skills/harness-design-craft/src/integrations/design-constraint-adapter.ts`, `packages/cli/src/skills/harness-design-craft/tests/integrations/adapter.test.ts`, **MODIFY** existing DesignConstraintAdapter location (discover via `grep -rn "DesignConstraintAdapter" packages 2>/dev/null | head`)

1. Discover existing adapter location; record path in commit message.
2. Create test: given a `DesignCraftOutput` with 2 CRAFT-C001 findings + 1 BenchmarkScore, calling `writeToGraph(output)` produces 2 `VIOLATES_CRAFT` edges + 1 `CRAFT_SCORE` node; re-running produces no duplicates (idempotency).
3. Run vitest — observe failure.
4. Implement adapter extension: register `CRAFT-*` namespace; register `CRAFT_SCORE` node type; implement idempotent writeToGraph keyed on `(runId, code, target)`.
5. If discovered adapter has no extension hook, this task escalates per the Uncertainties section assumption — STOP and surface to user.
6. Run vitest — observe pass.
7. Run: `harness validate`.
8. Commit: `feat(design-craft): DesignConstraintAdapter extension for CRAFT-* + CRAFT_SCORE`.

#### Task 46: Vision pipeline end-to-end test (covers success criterion #21)

**Depends on:** Task 45 | **Files:** `packages/cli/src/skills/harness-design-craft/tests/render/vision-end-to-end.test.ts`

1. **Conditional on Task 12 spike feasibility = yes.** If no, mark test `.skip()` with reason linking to `spikes/visual-pipeline-result.md`.
2. Test: invoke `designCraft({ path: fixtures/component-render, mode: 'deep' })` with playwright (real) + vision LLM-mock; assert 3 viewports rendered, ≥ 1 vision LLM call made, ≥ 1 finding parsed.
3. Run vitest — observe pass.
4. Run: `harness validate`.
5. Commit: `test(design-craft): vision pipeline end-to-end test (deep mode)`.

#### Task 47: Phase 2A milestone checkpoint

**Depends on:** Task 46 | **Files:** none

1. [checkpoint:human-verify] Demo: all 3 phases run end-to-end; visual pipeline production-quality; B' upgrade path works for all 4 precondition states; adapter writes idempotent. Confirm Phase 2 engineering stream exit criteria (spec line 573–574 for B') before continuing to Phase 2B.
2. Run: `harness validate`.
3. Run: `harness check-deps`.
4. No commit (checkpoint only).

---

### Phase 2B — Catalog Completion + Peer Review (Tasks 48–55, ~3 days)

#### Task 48: Author rubrics — restraint, polish-details, copy-voice, interaction-craft, brand-coherence (5 rubrics to reach 10 total)

**Depends on:** Task 47 | **Files:** 5 YAML files under `catalog/rubrics/`

1. Author the 5 remaining rubrics per spec line 456 (codes `CRAFT-C006`..`CRAFT-C010`).
2. Update `finding-codes.md`.
3. Verify total count: `ls packages/cli/src/skills/harness-design-craft/src/catalog/rubrics/ | wc -l` → 10.
4. Run: `harness validate` — all entries pass schema.
5. Commit: `feat(design-craft): author remaining 5 rubrics (total: 10)`.

#### Task 49: Author patterns — 1 remaining motion + 3 typography + 3 interaction + 3 layout (10 patterns to reach 15 total)

**Depends on:** Task 48 | **Files:** 10 YAML files under `catalog/patterns/`

1. Author 1 motion + 3 typography + 3 interaction + 3 layout patterns (codes `CRAFT-P007`..`CRAFT-P015`).
2. Update `finding-codes.md`.
3. Verify count = 15.
4. Run: `harness validate`.
5. Commit: `feat(design-craft): author remaining 10 polish patterns (total: 15)`.

#### Task 50: Author exemplars — 25 remaining (5 per component type to reach 50)

**Depends on:** Task 49 | **Files:** 25 YAML files

1. Author 5 more per component type: EmptyState (5→10), LoadingState (5→10), ErrorState (5→10), Modal (5→10), Button (5→10).
2. Verify count = 50.
3. Run: `harness validate`.
4. Commit: `feat(design-craft): author remaining 25 exemplars (total: 50)`.

#### Task 51: Verify success criteria #7, #8, #9 with assertion test

**Depends on:** Task 50 | **Files:** `packages/cli/src/skills/harness-design-craft/tests/catalog/seed-count.test.ts`

1. Create test asserting: `catalog/rubrics/` has exactly 10 YAML files; `catalog/patterns/` exactly 15; `catalog/exemplars/` exactly 50 with 10 per component type.
2. Run vitest — observe pass.
3. Run: `harness validate`.
4. Commit: `test(design-craft): assert seed catalog counts (10+15+50)`.

#### Task 52: Peer review pass on Sprint 1 content

**Depends on:** Task 51 | **Files:** `docs/changes/design-pipeline/design-craft-elevator/peer-review.md`

1. [checkpoint:human-verify] Walk through the 5 rubrics + 5 patterns + 25 exemplars authored in Phase 1B. For each: clarity of prompt, source-citation correctness, schema-fit. Record reviewer notes + any required revisions in `peer-review.md`.
2. Apply revisions (each as a separate atomic commit if substantial).
3. Run: `harness validate`.
4. Commit: `docs(design-craft): peer review pass on Sprint 1 catalog content`.

#### Task 53: Contribution review process spec finalisation

**Depends on:** Task 52 | **Files:** `docs/changes/design-pipeline/design-craft-elevator/contribution.md` (modify), `packages/cli/src/skills/harness-design-craft/src/contribution/review.ts`

1. Expand `contribution.md` with the formalised review process: roles (proposer, reviewer, maintainer), SLA targets, escalation path, deprecation policy.
2. Implement `review.ts` exposing `evaluateContribution(entry, reviewerNotes)` with status transitions (proposed → under-review → accepted / rejected).
3. Run: `harness validate`.
4. Commit: `feat(design-craft): finalise contribution review process spec + hooks`.

#### Task 54: Update `growth-trajectory.md` with measurement framework details

**Depends on:** Task 53 | **Files:** `docs/changes/design-pipeline/design-craft-elevator/growth-trajectory.md`

1. Expand to document: how usage counts feed pattern proposals, how proposal threshold is tuned, what "successful contribution velocity" looks like.
2. Run: `harness validate`.
3. Commit: `docs(design-craft): expand growth-trajectory.md with measurement framework`.

#### Task 55: Phase 2 milestone checkpoint

**Depends on:** Task 54 | **Files:** none

1. [checkpoint:human-verify] Confirm full H seed catalog (10+15+50) ships; B' works for all 4 preconditions; visual pipeline production-quality. Phase 2 exit criteria met (spec lines 572–574).
2. Run: `harness validate`.
3. Run: `harness check-deps`.
4. No commit.

---

### Phase 3 — Convergence + Growth Infrastructure (Tasks 56–66, ~5 days)

#### Task 56: Wire full catalog into all 3 phases at scale (TDD)

**Depends on:** Task 55 | **Files:** `packages/cli/src/skills/harness-design-craft/src/phases/critique.ts` (modify), `polish.ts` (modify), `benchmark.ts` (modify), corresponding tests

1. Update each phase to iterate over the full loaded catalog (all 10 rubrics in critique; all 15 patterns in polish; relevant exemplars in benchmark per `componentType`).
2. Add LLM-call budgeting: cap parallel calls at config `llm.maxConcurrency` (default 4).
3. Add test running all 3 phases against a small synthetic project with mocked LLM, asserts catalog entries cited match expectations.
4. Run vitest — observe pass.
5. Run: `harness validate`.
6. Commit: `feat(design-craft): wire full catalog into all 3 phases at scale`.

#### Task 57: Signal feedback loop (TDD, covers success criterion #13)

**Depends on:** Task 56 | **Files:** `packages/cli/src/skills/harness-design-craft/src/contribution/signal.ts`, `packages/cli/src/skills/harness-design-craft/tests/contribution/signal.test.ts`

1. Create test: synthesise 5 occurrences of the same finding shape across 2 distinct project paths; `proposeFromRecurringFindings(threshold:5)` writes `.harness/design-craft/proposals/<shape-hash>.yaml`.
2. Run vitest — observe failure.
3. Implement signal.ts: aggregate via finding fingerprint `(code, tier, rubricId)`; emit proposal YAML when count ≥ threshold across ≥ 2 projects.
4. Run vitest — observe pass.
5. Run: `harness validate`.
6. Commit: `feat(design-craft): signal feedback loop emits pattern proposals`.

#### Task 58: Usage measurement (TDD, covers success criterion #14)

**Depends on:** Task 57 | **Files:** `packages/cli/src/skills/harness-design-craft/src/measurement/usage.ts`, `packages/cli/src/skills/harness-design-craft/tests/measurement/usage.test.ts`

1. Create test: invoke `recordTrigger('rubric-hierarchy-clarity')` 3 times; `getCatalogStats()` returns `rubrics: { 'rubric-hierarchy-clarity': 3, ... }`.
2. Run vitest — observe failure.
3. Implement usage.ts with file-backed counter under `.harness/design-craft/usage.json`; `recordTrigger`, `recordApply`, `recordCite`, `getCatalogStats`.
4. Update `catalog/index.ts` to delegate `getCatalogStats` to this module (replacing the Phase 1 stub).
5. Wire counters into phases: critique calls `recordTrigger(rubricId)` per rubric; polish calls `recordApply(patternId)` per finding; benchmark calls `recordCite(exemplarId)` per exemplar cited.
6. Run vitest — observe pass.
7. Run: `harness validate`.
8. Commit: `feat(design-craft): usage measurement with file-backed counters`.

#### Task 59: Dashboard stats page

**Depends on:** Task 58 | **Files:** `packages/cli/src/skills/harness-design-craft/src/measurement/dashboard.ts`, dashboard router (location discovered via `grep -rn "dashboard.*route" packages 2>/dev/null | head`)

1. Discover existing dashboard router conventions.
2. Implement `dashboard.ts` exporting a page renderer `renderDesignCraftStatsPage(): string` that reads `getCatalogStats()` and outputs HTML/markdown.
3. Register route `/design-craft/stats` in the dashboard router.
4. Add minimal test: page renders without error given stub stats.
5. If dashboard router pattern is unclear or absent, surface as `[ASSUMPTION VIOLATION]` and provide a `getDashboardData()` export as fallback.
6. Run: `harness validate`.
7. Commit: `feat(design-craft): dashboard stats page for catalog usage`.

#### Task 60: harness.config.json schema extension (TDD, covers success criterion #14)

**Depends on:** Task 59 | **Files:** the Zod config schema (discover via `grep -rn "harness.config" packages/cli/src --include='*.ts' | head`)

1. Create test asserting: config validator accepts `design.craft.{enabled, mode, autoCapture, llm:{provider,model,visionModel}, catalog, signal:{proposalThreshold}}`; rejects unknown keys (strict mode).
2. Add the schema additions per spec lines 332–357.
3. Run vitest — observe pass.
4. Run: `harness validate`.
5. Commit: `feat(design-craft): extend harness.config.json schema with design.craft.* block`.

#### Task 61: i18n-style deferral wiring (TDD, covers success criterion #19)

**Depends on:** Task 60 | **Files:** `packages/cli/src/skills/harness-design-craft/src/phases/critique.ts` (modify), corresponding test

1. Create test: given DESIGN.md with `declaredAntiPatterns: ['cubic-bezier-motion']` and a fixture triggering matching CRITIQUE finding, the finding is suppressed and `summary.deferralsToHarnessDesign === 1`.
2. Run vitest — observe failure.
3. Implement deferral in critique.ts: after generating findings, filter against `declaredAntiPatterns` from preconditions; increment counter.
4. Run vitest — observe pass.
5. Run: `harness validate`.
6. Commit: `feat(design-craft): i18n-style deferral wiring (defer declared anti-patterns to harness-design)`.

#### Task 62: Soft-dependency intent-anchored prompt (TDD, covers success criterion #18)

**Depends on:** Task 61 | **Files:** `packages/cli/src/skills/harness-design-craft/src/phases/critique.ts` (modify), corresponding test

1. Test: when `AestheticIntent` is declared, the captured prompt to LLM contains the intent text; when absent, prompt uses the generic version.
2. Use a prompt-capture spy.
3. Implement: critique prompt template branches on `preconditions.aestheticIntentDeclared`.
4. Run vitest — observe pass.
5. Run: `harness validate`.
6. Commit: `feat(design-craft): intent-anchored critique prompts when AestheticIntent declared`.

#### Task 63: Integration matrix tests (phase × mode × precondition)

**Depends on:** Task 62 | **Files:** `packages/cli/src/skills/harness-design-craft/tests/integrations/matrix.test.ts`

1. Create parametric test over phases × {fast, deep} × {all 4 precondition states} → 3 × 2 × 4 = 24 cases. Each asserts orchestrator completes without error and output shape is valid.
2. Use LLM mocks + render mocks for speed.
3. Run vitest — observe pass.
4. Run: `harness validate`.
5. Commit: `test(design-craft): integration matrix (phase × mode × precondition)`.

#### Task 64: runId stability + composition export check (covers success criteria #33, #34, #35)

**Depends on:** Task 63 | **Files:** `packages/cli/src/skills/harness-design-craft/tests/integrations/composition.test.ts`

1. Test: every finding and score carries the same `summary.runId`; two runs produce different runIds; `getCatalogStats` exported from skill index module with stable signature (TypeScript declaration test via `tsc --noEmit` on a downstream consumer fixture).
2. Run vitest — observe pass.
3. Run: `harness validate`.
4. Commit: `test(design-craft): assert runId stability and composition export contracts`.

#### Task 65: Negative criteria tests (covers success criteria #36, #37, #38)

**Depends on:** Task 64 | **Files:** `packages/cli/src/skills/harness-design-craft/tests/negative/no-modification.test.ts`, `packages/cli/src/skills/harness-design-craft/tests/negative/no-watcher.test.ts`, `packages/cli/src/skills/harness-design-craft/tests/negative/harness-design-untouched.test.ts`

1. Test 1: After POLISH run, fixture file hashes unchanged.
2. Test 2: No `fs.watch` / `chokidar` import in skill source (grep + AST check).
3. Test 3: `harness-design` skill files have same git hash as pre-plan baseline (record the baseline in the test as a string constant).
4. Run vitest — observe pass.
5. Run: `harness validate`.
6. Commit: `test(design-craft): negative criteria (no autofix, no watcher, no harness-design modification)`.

#### Task 66: Phase 3 milestone checkpoint

**Depends on:** Task 65 | **Files:** none

1. [checkpoint:human-verify] All 3 phases working end-to-end at full catalog scale; growth infrastructure operational; integration matrix passes. Phase 3 exit criteria met (spec lines 588–591).
2. Run: `harness validate`.
3. Run: `harness check-deps`.
4. No commit.

---

### Phase 4 — Polish (Tasks 67–74, ~5 days)

#### Task 67: File ADR 0018 — LLM-judgment skill pattern

**Depends on:** Task 66 | **Files:** `docs/knowledge/decisions/0018-llm-judgment-skill-pattern.md`

1. Author ADR following existing format. Cover: confidence as first-class output, autoCapture progressive upgrade, vision-model integration, deterministic-vs-judgment separation. Reference this plan + spec.
2. Run: `harness validate`.
3. Commit: `docs(adr): 0018 LLM-judgment skill pattern`.

#### Task 68: File ADR 0019 — 3-axis craft output model

**Depends on:** Task 67 | **Files:** `docs/knowledge/decisions/0019-three-axis-craft-output-model.md`

1. Author ADR. Cover: why error/warn/info fails for craft, tier × impact × confidence rationale, derivedPriority mapping.
2. Run: `harness validate`.
3. Commit: `docs(adr): 0019 three-axis craft output model`.

#### Task 69: File ADR 0020 — Living catalog H pattern

**Depends on:** Task 68 | **Files:** `docs/knowledge/decisions/0020-living-catalog-h-pattern.md`

1. Author ADR. Cover: seed + growth infrastructure, signal-loop mechanics, contribution + measurement.
2. Run: `harness validate`.
3. Commit: `docs(adr): 0020 living catalog H pattern`.

#### Task 70: File ADR 0021 — Detect-and-offer B' pattern

**Depends on:** Task 69 | **Files:** `docs/knowledge/decisions/0021-detect-and-offer-bprime-pattern.md`

1. Author ADR. Cover: soft-dependency-with-inline-upgrade, chained-skill transition mechanics, autoCapture modes, why hard-dep degrades silently.
2. Run: `harness validate`.
3. Commit: `docs(adr): 0021 detect-and-offer Bprime pattern`.

#### Task 71: File 4 knowledge entries (covers success criterion #32)

**Depends on:** Task 70 | **Files:** `docs/knowledge/design/{llm-judgment-skills,craft-output-vocabulary,living-catalogs}.md`, `docs/knowledge/skills/detect-and-offer.md`

1. Author each entry per spec lines 413–418. Each references its ADR.
2. Run: `harness validate`.
3. Commit: `docs(knowledge): 4 entries for LLM-judgment / vocabulary / catalogs / B'`.

#### Task 72: Documentation finalisation (covers success criterion #30)

**Depends on:** Task 71 | **Files:** `AGENTS.md` (modify), `docs/guides/designer-quickstart.md` (modify), `docs/changes/design-pipeline/REFERENCES.md` (modify)

1. Add `harness-design-craft` under design skills section in AGENTS.md, with one-line role description.
2. Add "Running craft critique" subsection to designer-quickstart.md with code/CLI examples.
3. Mark sub-project #6 status as `complete` in REFERENCES.md.
4. Run: `harness validate`.
5. Commit: `docs(design-craft): finalise AGENTS / designer-quickstart / REFERENCES updates`.

#### Task 73: Performance baselines + LLM-mock CI infra (covers success criteria #22, #23, #24, #25)

**Depends on:** Task 72 | **Files:** `packages/cli/src/skills/harness-design-craft/tests/perf/fast-mode.test.ts`, `packages/cli/src/skills/harness-design-craft/tests/perf/deep-mode.test.ts`, `packages/cli/.harness/arch/baselines.json` (regenerate)

1. Implement fast-mode perf test: synthesise 50-file fixture; run fast mode with LLM-mock; assert wall time ≤ 30 s.
2. Implement deep-mode perf test: 10-component fixture; deep mode with LLM-mock + headless playwright; assert ≤ 3 min; assert second run records `renderCacheHits === renderCount`.
3. Regenerate `baselines.json` to capture new arch metrics.
4. Verify cost tracking in output: assert `output.summary.llmCalls.costUsd > 0` after a real (or mocked-with-cost) call.
5. Run vitest — observe pass.
6. Run: `harness validate`.
7. Commit: `test(design-craft): perf baselines + cost-tracking assertions`.

#### Task 74: Final sign-off + plan completion

**Depends on:** Task 73 | **Files:** none | **Category:** integration

1. [checkpoint:human-verify] **FINAL APPROVAL GATE.** Walk the spec's full Success Criteria list (1–38) against the implementation. Confirm each passes or is documented as a deliberate downgrade (e.g. visual pipeline if spike failed).
2. Run: `harness validate`.
3. Run: `harness check-deps`.
4. Regenerate `.harness/skills-index.json` one final time to capture all wiring.
5. No commit (sign-off only). If any criteria fail, open follow-up tickets and surface to user.

---

## Integration Tasks Summary

Per the spec's `Integration Points` section, integration items are derived inline within the appropriate phase rather than batched at the end (because most integration items are wiring necessary for tests to pass). Mapping:

| Integration Point                                         | Derived in Task(s) |
| --------------------------------------------------------- | ------------------ |
| Skill scaffolding                                         | 13, 22             |
| MCP tool registry                                         | 19                 |
| Skill index regeneration                                  | 22, 74             |
| Config schema validation                                  | 60                 |
| DesignConstraintAdapter                                   | 45                 |
| Skill barrel                                              | 22                 |
| Intelligence provider vision support                      | 7, 10              |
| Playwright vendoring                                      | 7                  |
| Dashboard route                                           | 59                 |
| AGENTS.md / designer-quickstart / REFERENCES              | 72                 |
| finding-codes.md / contribution.md / growth-trajectory.md | 21, 26, 36, 37, 54 |
| ADRs 0018–0021                                            | 67–70              |
| Knowledge entries                                         | 71                 |

Task 74 acts as the integration sign-off.

---

## Risks and Concerns

1. **Visual pipeline feasibility (HIGH risk, mitigated by spike).** Task 12 spike is the explicit go/no-go for deep mode. Fallback is documented (spec line 605 + Uncertainties section). Plan can proceed serially on either path; downgrade adds ~3 tasks of doc work and removes ~5 tasks of vision implementation.

2. **Intelligence provider vision extension (MEDIUM risk).** If `packages/intelligence/` lacks vision support, Task 7 surfaces the gap; the plan either (a) extends the intelligence package (adds ~3 follow-up tasks), or (b) embeds the vision call inline using the Anthropic SDK directly with a clear escape hatch comment.

3. **DesignConstraintAdapter extension hook absence (MEDIUM risk).** Task 45 includes discovery; if no hook exists, the task surfaces a blocking ticket. Workaround: emit findings to a side-channel until the adapter is extended in a follow-up plan.

4. **Skill source directory location uncertainty (LOW-MEDIUM risk).** The dist tree shows `agents/skills/claude-code/harness-design/` but no canonical source dir under `packages/cli/src/skills/`. Task 3 verifies, creates if needed, and locks the answer for downstream tasks. If a different convention exists (e.g. source files generated from a different location), Task 3 escalates.

5. **Catalog count drift in Phase 1B (LOW risk, mitigated by Task 28 course-correction).** Phase 1B's "5+5+25" target tracks an exact count that emerges from the cumulative authoring tasks. Task 28 is a deliberate trim task to enforce the count. Task 29 is sized for 2 motion patterns (not 3) to land at exactly 5 patterns in Phase 1B (the spec's "3 motion" target in Phase 2 means the third motion pattern lands in Phase 2B Task 49).

6. **LLM nondeterminism in tests (MEDIUM risk, mitigated by mocks).** All phase tests use LLM mocks (Task 11). Real-LLM smoke is gated to Task 12 spike + Task 73 perf baselines (where wall time matters).

7. **ADR numbering collision (LOW risk).** Plan uses 0018–0021 based on observed `ls docs/knowledge/decisions/`. If parallel work claims those numbers, Tasks 67–70 each escalate to pick the next free numbers.

8. **Estimated time exceeds 25 days (MEDIUM risk).** The plan's wall-time estimate matches the spec's 4-week estimate; active execution is ~70 hours across 74 tasks. If a checkpoint reveals slip, the natural compression point is Phase 2B (catalog authoring is parallelisable across humans).

---

## Change Specifications

This plan is greenfield within the `harness-design-craft` skill but adds deltas to:

- **[ADDED]** New skill `harness-design-craft` at tier 2
- **[ADDED]** MCP tool `mcp__harness__design_craft`
- **[ADDED]** Config block `design.craft.*` in `harness.config.json`
- **[MODIFIED]** `DesignConstraintAdapter` extended to handle `CRAFT-*` codes + `CRAFT_SCORE` nodes
- **[MODIFIED]** `packages/intelligence/` may gain vision support (if absent) — discovered in Task 7
- **[MODIFIED]** Dashboard router adds `/design-craft/stats` route
- **[MODIFIED]** `AGENTS.md`, `designer-quickstart.md`, `REFERENCES.md` text updates
- **[UNCHANGED]** `harness-design` skill files (negative criterion #38)
- **[UNCHANGED]** Other design-pipeline sub-projects (#1-#5)

---

## Gates

- **APPROVE_PLAN gate before Phase 0** — autopilot pauses for skeleton/direction approval
- **APPROVE_PLAN gate between Phase 1 and Phase 2** — autopilot expects this per spec
- **APPROVE_PLAN gate between Phase 2 and Phase 3** — autopilot expects this per spec
- **Visual spike DECISION GATE (Task 12)** — go/no-go on deep mode
- **Phase milestone checkpoints (Tasks 24, 47, 55, 66, 74)** — `[checkpoint:human-verify]` before continuing
- **Schema-lock checkpoint (Task 6)** — `[checkpoint:human-verify]` before streams diverge
- **DesignConstraintAdapter hook check (Task 45)** — escalates if no extension point
- **Skill source dir verify (Task 3)** — `[checkpoint:human-verify]` before scaffolding

---

## Escalation triggers

- Visual spike feasibility-failed → user decides between fallback (code-only) and replan
- Intelligence package lacks vision support → user decides between extending the package vs inlining the call
- DesignConstraintAdapter has no extension hook → user decides between extension PR vs side-channel
- Skill source dir convention unclear → user confirms path before scaffolding
- ADR numbers collide → user confirms next-free numbers
- Any checkpoint reveals slip > 1 day → user reprioritises remaining phases

---

## Success Criteria

- All 38 spec success criteria pass (verified in Task 74)
- All 74 tasks committed
- `harness validate` passes at every task boundary
- Skeleton was produced and Phase 0 began only after APPROVE_PLAN
- Visual spike (Task 12) executed and result documented before Phase 2A
- Four ADRs + four knowledge entries filed
- Seed catalog (10+15+50) committed and validated
- Growth infrastructure operational (signal loop, measurement, contribution)
- `harness-design` skill files untouched
