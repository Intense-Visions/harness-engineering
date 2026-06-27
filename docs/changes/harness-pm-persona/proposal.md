---
title: Build harness-pm persona for eval suite and acceptance criteria ownership
status: draft
keywords:
  - persona
  - acceptance-criteria
  - eval-suite
  - outcome-eval
  - measurability-gate
  - spec-quality
  - test-coverage
  - llm-judgment
external-id: github:Intense-Visions/harness-engineering#566
---

# Build harness-pm persona for eval suite and acceptance criteria ownership

## Overview

The project ships 15 personas, all engineering-shaped (code-reviewer,
architecture-enforcer, security-reviewer, performance-guardian, planner,
task-executor, …). **Zero PM-shaped personas exist.** The companion article
"AI Ate My Role" defines three surviving Project Manager lanes: Taste PM
(product thesis), **Harness PM (eval-suite design + acceptance criteria)**, and
Boundary PM (compliance). This spec introduces the **Harness PM** lane.

The gap is concrete, not just organizational. `outcome-eval`
(`agents/skills/claude-code/outcome-eval/SKILL.md:24`) is the harness's first
blocking post-execution ship gate, but it **silently degrades to a
non-blocking `INCONCLUSIVE` verdict whenever a spec has no judgable acceptance
section**. Nothing today guards the _upstream_ end — ensuring specs carry
measurable, testable acceptance criteria _before_ execution. That degradation
path quietly defeats the gate.

`harness-pm` is the upstream twin of `outcome-eval`: it keeps the downstream
gate fed with judgable specs, backed by a new `acceptance-eval` skill.

## Goals

In scope:

1. A new `acceptance-eval` skill that, given a spec:
   - (a) critiques acceptance-criteria observability / testability / completeness (advisory),
   - (b) flags user-visible behaviors with no covering test (advisory),
   - (c) **blocks** when the spec has no measurable success criteria at all.
2. A `harness-pm` persona that runs the skill, triggered `on_pr` for
   `docs/changes/**` plus `manual`.
3. Persona artifacts generated for all four clients (claude-code, cursor,
   codex, gemini-cli).

Non-goals (YAGNI):

- **Authoring** acceptance criteria. Humans own the thinking layer
  (`STRATEGY.md#our-approach`: "Humans own the thinking layer (specs,
  decisions, strategy); the harness mechanically polices everything below it").
  `harness-pm` _reviews_, it does not write.
- Graph-backed coverage mapping (considered and deferred — see Decisions D4).
- The Taste-PM and Boundary-PM lanes (separate future work).
- Any change to `outcome-eval` itself.

## Decisions made

| #   | Decision                                                                                                                        | Rationale                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Build a persona **plus** a new `acceptance-eval` skill (not a thin composition persona).                                        | Responsibility (b) has no existing backing; a bare role prompt would be theatre. A real skill is also reusable in planning and code-review.                                  |
| D2  | Trigger `on_pr` filtered to `docs/changes/**`, plus `manual`.                                                                   | Places the gate exactly where specs enter the repo; mirrors the established reviewer-persona convention (`code-reviewer.yaml`, `security-reviewer.yaml`).                    |
| D3  | **Hybrid authority.** TypeScript derives a _blocking_ verdict only for "no measurable criteria"; (a)/(b) findings are advisory. | Mirrors `outcome-eval`'s "authority is never read from the LLM" discipline. Teeth where it is objective; no taste-blocks-merges false positives.                             |
| D4  | Responsibility (b) via LLM-judgment over the spec's behavior section + located test files, reusing the cli `AnalysisProvider`.  | Honest backing for (b) without overbuilding. Graph-backed mapping risks a stale graph and busts the single-feature scope. (b) is advisory, so heuristic misses are low-harm. |
| D5  | Name the skill `acceptance-eval` (slash `harness:acceptance-eval`); persona slug `harness-pm`, display "Harness PM".            | `acceptance-eval` ↔ `outcome-eval` reads as the upstream/downstream pair. Dropping the `harness-` prefix matches the newer eval/craft skill family.                          |

## Technical design

### Intelligence module — `packages/intelligence/src/acceptance-eval/`

Parallel to `packages/intelligence/src/outcome-eval/`.

- **`types.ts`** — `AcceptanceVerdict`:

  ```ts
  interface AcceptanceVerdict {
    measurability: 'MEASURABLE' | 'NOT_MEASURABLE' | 'INCONCLUSIVE'; // (c)
    confidence: 'high' | 'medium' | 'low';
    authority: 'blocking' | 'advisory'; // TS-derived, never from the LLM
    judgedAgainst: string; // which spec section resolved
    criteriaFindings: Finding[]; // (a) advisory
    coverageFindings: Finding[]; // (b) advisory
    rationale: string;
  }
  ```

- **`authority.ts`** — `deriveAcceptanceAuthority(measurability, confidence)`:
  returns `blocking` **iff** `measurability === 'NOT_MEASURABLE' && confidence === 'high'`;
  every other combination is `advisory`. Exact structural mirror of
  `outcome-eval/authority.ts`.
- **`section-resolver.ts`** — **imports and reuses** `outcome-eval`'s resolver
  (the `## Success Criteria → ## User-Visible Behavior → ## Overview` fallback
  chain). Not forked: spec-craft flags duplicated logic as SPEC-R004, and a
  forked resolver would drift from the gate it is meant to mirror.
- **`evaluator.ts`** — `AcceptanceEvaluator`, built on the cli `AnalysisProvider`
  (the same provider behind `outcome-eval` and the craft skills). Inputs: spec
  text + located test snippets. The LLM returns only
  `measurability / confidence / criteriaFindings / coverageFindings / rationale`;
  `authority` is computed in TypeScript via `deriveAcceptanceAuthority`.
- **`prompts.ts`, `index.ts`** — prompt templates and barrel exports
  (`AcceptanceEvaluator`, `deriveAcceptanceAuthority`, `acceptanceVerdictSchema`,
  `AcceptanceVerdict`).

### MCP tool — `packages/cli/src/mcp/tools/acceptance-eval.ts`

Tool name `mcp__harness__acceptance_eval`, registered in
`packages/cli/src/mcp/server.ts`. Inputs: `specPath` (required),
`testGlobs` / `testContent` (optional — the (b) evidence; omitting them degrades
(b) coverage findings to advisory-empty but never affects the (c) gate),
`model?`. Returns the `AcceptanceVerdict` with `authority` exactly as
derived. The handler builds the cli `AnalysisProvider`, constructs the
`AcceptanceEvaluator`, and returns the verdict — never overriding `authority`.

### Skill — `agents/skills/claude-code/acceptance-eval/`

`SKILL.md` + `skill.yaml` (`tier: 2`, `type: rigid`, platforms: all four
clients). Flow: resolve the spec section → run the evaluator → render the
verdict (`measurability`, `confidence`, `judgedAgainst`, `rationale`,
`criteriaFindings`, `coverageFindings`) → **HALT before merge on a blocking
verdict** (`NOT_MEASURABLE` + high confidence), reporting the missing measurable
criteria; otherwise report advisory findings and proceed. Authority rule must
match `deriveAcceptanceAuthority` and is never asserted by the model. Cursor /
codex / gemini-cli variants are generated, not hand-written.

### Persona — `agents/personas/harness-pm.yaml`

```yaml
version: 2
name: Harness PM
description: Owns acceptance-criteria and eval-coverage quality for specs
role: >
  Owns acceptance-criteria and eval-coverage quality. Reviews every spec for
  measurable, testable, complete success criteria; flags user-visible behaviors
  with no covering test; blocks specs that ship with no measurable criteria.
  The upstream twin of the outcome-eval ship gate.
skills:
  - acceptance-eval
steps:
  - command: validate
    when: always
  - skill: acceptance-eval
    when: on_pr
    output: auto
  - skill: acceptance-eval
    when: manual
    output: auto
triggers:
  - event: on_pr
    conditions:
      paths:
        - 'docs/changes/**'
  - event: manual
config:
  severity: error
  autoFix: false
  timeout: 600000
outputs:
  agents-md: true
  ci-workflow: true
  runtime-config: true
```

## Integration points

### Entry Points

- New skill `acceptance-eval` (slash command `harness:acceptance-eval`).
- New MCP tool `mcp__harness__acceptance_eval`.
- New persona `harness-pm` (generates a `harness-pm` agent type across all four
  clients).
- New barrel exports from `@harness-engineering/intelligence`.

### Registrations Required

- Register the MCP tool in `packages/cli/src/mcp/server.ts`.
- Export the evaluator surface from `packages/intelligence/src/index.ts`.
- Regenerate persona artifacts (`harness generate-agent-definitions` /
  `generate_persona_artifacts`) and slash commands (`generate-slash-commands`).
- Assign the skill a tier (Tier-2).
- Plugin-artifact regeneration (`.claude-plugin` / `.cursor-plugin`) — handled
  by the pre-commit hook; re-add and re-commit if it reformats files.

### Documentation Updates

- `AGENTS.md` persona list (add Harness PM).
- Persona-count references ("15 personas" → "16") wherever they appear.
- `outcome-eval` documentation: a cross-link noting `acceptance-eval` is its
  upstream twin.

### Architectural Decisions

- **D3 (hybrid TS-derived authority)** warrants a standalone ADR: it extends the
  "authority is never read from the LLM" principle (established by
  `outcome-eval`) to a _pre-execution_ gate, so the same discipline now spans
  both ends of the lifecycle. (See the **Decisions made** section — not restated
  here, per SPEC-R004.)

### Knowledge Impact

- New concepts for the graph: the **Harness PM lane**, the
  **acceptance-eval ↔ outcome-eval upstream/downstream pairing**, and the
  **measurability gate**. These enter as the PM-persona's relationship to the
  eval pair.

## Success criteria

1. `acceptance-eval` skill exists (`SKILL.md` + `skill.yaml`, `tier: 2`,
   `type: rigid`); artifacts generate for all four clients without error.
2. `deriveAcceptanceAuthority(measurability, confidence)` returns `blocking`
   **iff** `measurability === 'NOT_MEASURABLE' && confidence === 'high'`;
   unit-tested across all nine (measurability × confidence) combinations.
3. `acceptanceVerdictSchema`, `AcceptanceEvaluator`, and `AcceptanceVerdict` are
   exported from `@harness-engineering/intelligence`; `section-resolver` is
   imported from `outcome-eval`, not duplicated (a grep finds one definition).
4. MCP tool `mcp__harness__acceptance_eval` is registered in `mcp/server.ts` and
   returns an `AcceptanceVerdict` whose `authority` equals
   `deriveAcceptanceAuthority(...)` (integration-tested).
5. The `harness-pm` persona loads and validates against `PersonaSchema`;
   `harness generate-agent-definitions` emits a `harness-pm` agent type for all
   four clients.
6. Given a spec with no measurable criteria, a high-confidence verdict yields
   `authority: 'blocking'` and the skill HALTs before merge; a spec with
   measurable criteria yields advisory-only output and proceeds.
7. Responsibility (a) emits `criteriaFindings[]` and (b) emits
   `coverageFindings[]`, both advisory, when applicable.
8. `harness validate` passes; persona-count references are updated (15 → 16);
   `outcome-eval` docs cross-link the upstream twin.
9. An ADR records D3 (TS-derived authority extended to a pre-execution gate).

## Implementation order

Phases are listed in dependency order. Per-phase verification (`harness validate`,
unit/integration tests) and final cross-phase review (full validate, test suite,
plugin-artifact regeneration) are handled by the execution loop's built-in VERIFY
and FINAL_REVIEW stages, so they are not separate phases here.

### Phase 1: Intelligence core

<!-- complexity: medium -->

`packages/intelligence/src/acceptance-eval/`: `types.ts`, `authority.ts`
(+ exhaustive unit tests across all nine measurability × confidence
combinations), reuse `section-resolver` from `outcome-eval`, `evaluator.ts`,
`prompts.ts`, and barrel exports from `packages/intelligence/src/index.ts`.

### Phase 2: MCP tool

<!-- complexity: low -->

`packages/cli/src/mcp/tools/acceptance-eval.ts` handler + registration in
`packages/cli/src/mcp/server.ts` (+ an integration test asserting the returned
`authority` equals `deriveAcceptanceAuthority(...)`).

### Phase 3: Skill

<!-- complexity: low -->

`agents/skills/claude-code/acceptance-eval/` (`SKILL.md` + `skill.yaml`); generate
the cursor / codex / gemini-cli variants.

### Phase 4: Persona

<!-- complexity: low -->

`agents/personas/harness-pm.yaml`; run `harness generate-agent-definitions` to
emit the `harness-pm` agent type across all four clients.

### Phase 5: Docs & ADR

<!-- complexity: low -->

`AGENTS.md` persona list, persona-count references (15 → 16), an `outcome-eval`
cross-reference to its upstream twin, and an ADR recording D3 (TS-derived
authority extended to a pre-execution gate).
