# Design-Pipeline Spec Amendments

> Findings discovered during execution that don't match what the specs assumed. Listed for human decision: fold into the specs proper, or leave as standalone amendments.

## Amendment A1: Skill source location

**Specs say:** TypeScript implementation lives at `packages/cli/src/skills/<skill-name>/src/`.

**Reality:** That directory does not exist. Existing skills (harness-accessibility, harness-design, harness-design-system, etc.) live at `agents/skills/<platform>/<skill-name>/` and are **markdown-only** — just `SKILL.md` + `skill.yaml`. Any TypeScript code that a skill invokes lives elsewhere:

- MCP tools → `packages/cli/src/mcp/tools/<name>.ts`
- Graph adapters → `packages/graph/src/constraints/<Name>.ts`
- Skill subsystem (dispatcher, schema, recommender) → `packages/cli/src/skill/`
- Knowledge ingestors → `packages/graph/src/ingest/`

**What this means for both specs:**

- The skill markdown files for both new skills have been authored in the correct location (`agents/skills/claude-code/audit-component-anatomy/` and `agents/skills/claude-code/harness-design-craft/`). These are scaffolded with status:`draft` and pass `harness validate`.
- The "Technical Design — File layout" sections in both proposals need a path correction OR a note that the file layout is illustrative-only. The intent (parser stack, finding schema, catalog, MCP tool, etc.) is unchanged, only the physical home.
- The MCP tool stubs (`mcp__harness__audit_anatomy`, `mcp__harness__design_craft`) should be authored at `packages/cli/src/mcp/tools/audit-anatomy.ts` and `.../design-craft.ts` following existing conventions.
- Catalog data (convention rules, polish patterns, exemplars, rubrics) probably belongs in `agents/skills/shared/design-knowledge/` alongside the existing palettes/typography/anti-patterns catalogs — there's already precedent for shared, skill-consumed data living there.

**Recommended action:** before Phase 1 implementation work begins, amend both specs' Technical Design sections with the corrected paths. Should be a 30-minute edit per spec.

---

## Amendment A2: Visual pipeline non-availability (sub-project #6)

**Spec says:** Q3 chose hybrid code+visual mode. Deep mode requires `playwright` + vision-capable LLM.

**Reality:** This repo does **not** have playwright installed (`which playwright` → not found; no playwright packages in `node_modules`). Vision-capable LLM via `@anthropic-ai/sdk` is available, but the render step is blocking.

**Two paths from the spec:**
- Spec's documented fallback: downgrade Q3 to A (code-only), drop deep mode from v1. Documented in the spec's Phase 4 stop condition.
- Alternative: add `playwright` as a dev dependency under the skill (or peer-dep with install detection). ~1 day of work to set up render pipeline.

**Recommended action:** make the Q3 downgrade-to-code-only decision before Phase 1 of #6 begins (Task 12 in the plan is the explicit go/no-go gate). If you want visual mode, schedule the playwright integration as a precursor.

---

## Amendment A3: ADR numbering

**Spec says:** ADRs 0004-0007 for the four new patterns.

**Reality:** `docs/knowledge/decisions/0004-*.md` already exists (in fact, there are duplicate ADR numbers in the 0003-0007 range — pre-existing repo state). The next free numbers are 0018-0021, which is what the just-filed ADRs use.

**Done:** ADRs filed as 0018-0021. Spec text still references 0004-0007 — should be updated to the actual numbers in a future spec revision.

---

## Amendment A4: `tabs` trigger/panel pairing constraint (sub-project #2)

**Phase 0 spike found:** `ConventionRule` schema cannot express the count/id-matching invariant "every Tabs.Trigger has a matching Tabs.Panel and vice versa" — that's a graph constraint, not a slot-by-slot check.

**Recommended action:** during Phase 1, treat this as the runner's responsibility (not encoded in any single rule). If more compound components need this kind of pairing constraint, revisit and add a `ConventionRule.invariants` field.

---

## Amendment A5: `BenchmarkScore.overall.score` and `.confidence` aggregation (sub-project #6)

**Phase 0 spike found:** spec says "weighted aggregate" without naming the weights, and `overall.confidence` aggregation is unspecified.

**Recommended action:** Phase 1 must pick concrete rules. Spike review proposed:
- `overall.score`: equal-weight mean of the 5 radar dimensions, with config override (`design.craft.benchmark.weights: { philosophicalCoherence: 1, hierarchy: 1, ... }`).
- `overall.confidence`: `min` of the 5 per-dimension confidences (conservative).

These rules are required for success criterion #34 (fixpoint detection across runs).

---

## Amendment A6: Catalog data physical home

**Both specs:** describe catalogs (rubrics, patterns, exemplars, conventions) living inside the skill directory.

**Reality:** Existing shared catalogs (industry profiles, palettes, typography pairings, anti-patterns) live at `agents/skills/shared/design-knowledge/`. New catalogs should plausibly follow that convention so other skills can consume them.

**Recommended action:** locate the new catalogs at:
- `agents/skills/shared/design-knowledge/anatomy-conventions/` (sub-project #2)
- `agents/skills/shared/design-knowledge/craft-rubrics/`, `craft-patterns/`, `craft-exemplars/` (sub-project #6)

This is a path-correction layered on top of A1.
