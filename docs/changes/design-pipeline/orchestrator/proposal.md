# design-pipeline orchestrator v1

> The last unshipped sub-project of the design-pipeline initiative. A new `harness-design-pipeline` skill that composes detect-design-drift (#1), align-design-system (#1), audit-component-anatomy (#2), audit-brand-compliance (#3), check-design (#4), and design-craft-elevator (#6) into a single sequential pipeline with convergence-based remediation. Mirrors `harness-docs-pipeline` exactly in shape; consumes the just-extracted `Verifier<F>` interface generically so a 5th verifier composes for free.

## Overview

**Project:** design-pipeline orchestrator (v1)
**Initiative:** design-pipeline (sub-project #5 of 6 — the integrating piece)
**Date:** 2026-05-24
**Estimated effort:** ~1 week, single PR
**Closes:** the design-pipeline initiative end-to-end. After this lands, all six sub-projects are done; only follow-on v1.x/v2 work remains.

### What this ships

A new skill + CLI command that runs the design-pipeline as a coordinated, multi-phase, convergence-loop-aware orchestrator:

1. **FRESHEN** — check input freshness (DESIGN.md, tokens.json, knowledge graph staleness); offer to bootstrap missing inputs.
2. **DETECT** — invoke detect-design-drift; collect DRIFT-\* findings.
3. **FIX** — convergence loop: align-design-system applies safe codemods + emits suggestions; re-run detect until no new safe fixes are produced.
4. **AUDIT** — invoke the rule-based verifiers (audit-component-anatomy, audit-brand-compliance) via a generic Verifier<F> registry.
5. **FILL** — two action sub-phases: (a) bootstrap missing inputs (DESIGN.md / tokens.json / Component Registry / Brand Rules) when absent, mirroring docs-pipeline's AGENTS.md bootstrap; (b) invoke design-craft-elevator POLISH for ceiling-layer polish suggestions.
6. **REPORT** — aggregate findings across phases; produce unified verdict (`pass`/`warn`/`fail`) + summary; surface unfixed findings + ceiling-layer suggestions for human review.

### What this does NOT ship

- **No new verifier logic.** The orchestrator DELEGATES to existing skills. Iron Law (per docs-pipeline): if you find yourself writing drift detection, fix application, or audit logic inside the orchestrator, STOP — delegate to the dedicated sub-skill.
- **No graph schema changes.** The orchestrator reads findings from each verifier and persists them through the same `DesignConstraintAdapter.recordFindings()` path used by check-design today.
- **No new ADRs.** ADRs 0018-0021 already codify the LLM-judgment patterns this consumes via design-craft-elevator.
- **No `craft-pipeline` orchestrator.** That's a separate initiative (`craft-pipeline` parent). This orchestrator only includes design-craft-elevator (which is a design-pipeline member) in the FILL phase.
- **No automatic invocation in `harness validate`.** validate stays single-pass; the orchestrator is opt-in via the skill or CLI command. Pipeline composition is heavier than validate's contract.
- **No interactive UI for fix approval.** v1's `--fix` flag applies safe codemods silently and surfaces probably-safe and unsafe ones for human review (mirrors docs-pipeline). Interactive prompts are v1.x.
- **No tone-by-context or asset-rule invocation.** Those rules aren't shipped in audit-brand-compliance v1; the orchestrator only invokes what exists.
- **No bootstrap of DESIGN.md ## Brand Rules from scratch.** v1 can stub the section header + a TODO comment but doesn't generate brand voice/tone content (that's a human task, possibly via `harness-design` skill).

### What problem this solves

Today a project running the full design pipeline does:

```
harness skill run detect-design-drift
harness skill run align-design-system
harness skill run audit-component-anatomy
harness skill run audit-brand-compliance
harness skill run harness-design-craft critique
harness check-design
```

Six commands; no convergence between them; no shared verdict; no awareness that align's fixes might enable additional drift detection on re-run. The orchestrator collapses that into `harness design-pipeline` with a unified report, convergence loops where they make sense, and one verdict the human (or CI) can act on.

## Decisions

| #   | Decision             | Lock                                                                             | Rationale                                                                                                                                                                                                                                                                   |
| --- | -------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | CLI surface          | **New `harness-design-pipeline` skill + `harness design-pipeline` command**      | Mirrors `harness-docs-pipeline` exactly. Slash command `/harness:design-pipeline` for agents. Keeps `harness check-design` focused on single-pass verification. Pattern parity is load-bearing for skill discoverability + cognitive overhead.                              |
| 2   | FILL phase scope     | **Bootstrap missing inputs AND invoke design-craft-elevator POLISH suggestions** | Matches docs-pipeline's FILL (which bootstraps AGENTS.md). Without input bootstrap, projects without DESIGN.md / tokens.json get silent-skip across all rules and a useless report. Without craft POLISH, the ceiling layer composes but never actually runs in the loop.   |
| 3   | Verifier composition | **Generic `Verifier<F>` registry**                                               | Interface was just extracted in PR #399 for this exact use case. Iterating generically is the demonstration of its value. Adding a 5th verifier in the future requires only registering it — zero orchestrator changes. design-craft is hardcoded (different output shape). |

## Scope

### In-scope

- **New skill** at `agents/skills/{claude-code,codex,cursor,gemini-cli}/harness-design-pipeline/{SKILL.md,skill.yaml}` (4-platform parity per established convention).
- **CLI command** `harness design-pipeline` (with `--fix` / `--no-freshen` / `--no-fill` / `--ci` / `--json` flags mirroring docs-pipeline).
- **Module** at `packages/cli/src/design-pipeline/` with the orchestrator engine, phase implementations, Verifier<F> registry, DesignPipelineContext type, and convergence loop.
- **MCP tool** `run_design_pipeline` for agent consumption (count 73 → 74).
- **DesignPipelineContext** type: shared across phases via `.harness/handoff.json` `pipeline` field (mirrors docs-pipeline's `DocPipelineContext`). Sub-skills already read `pipeline.driftFindings` per align-design-system v1 spec; orchestrator writes it.
- **Generic Verifier registry** — `VerifierRegistry` with `register<F>(name, runner)` API; loop iterates `for (const v of registry)` and aggregates findings into the context.
- **Convergence loop** — bounded at 5 iterations (matches docs-pipeline); stops when fix count plateaus.
- **Verdict computation** — `pass`/`warn`/`fail` based on error-severity finding counts across all verifiers, mirroring check-design's `valid` logic but reported as a tristate.
- **Skill markdown** documents Iron Law, fix-safety classification table, phase-by-phase process, escalation paths.

### Out-of-scope (v1)

- **No new node/edge types in the graph.** Findings persist through existing `recordFindings()` path.
- **No interactive UI for fix approval.** `--fix` applies safe codemods silently; probably-safe / unsafe surface as suggestions only.
- **No partial-pipeline invocation.** v1 runs all phases in order. `--no-freshen` / `--no-fill` skip those phases entirely; v1.x may add `--phase` to run a specific phase.
- **No telemetry across pipeline runs.** v1.x with Hermes integration.
- **No retry-on-failure for verifier failures.** A verifier that throws is recorded in `verifiersFailed` and the pipeline continues (matches check-design's graceful degradation).
- **No DESIGN.md content generation in FILL bootstrap.** v1 generates only the section headers + TODO comments. Authoring real content stays with `harness-design` skill or human edit.
- **No nested orchestration with craft-pipeline.** craft-pipeline (the cross-cutting LLM-judgment ceiling parent) is its own initiative; this orchestrator is design-only.
- **No `--watch` mode.** v1 is one-shot. v1.x may add filesystem-watch for development.

## Inputs + outputs

### Inputs

- **Project root path** (from CLI / MCP).
- **Flags:** `--fix` (enable convergence loops), `--no-freshen` (skip Phase 1), `--no-fill` (skip Phase 5), `--ci` (non-interactive: safe fixes only, no prompts), `--json` (machine-readable output).
- **harness.config.json** — `design.strictness`, `design.audit.{componentAnatomy,driftDetection,brandCompliance}.*` per-verifier toggles. Pipeline honors per-verifier gates: if `design.audit.driftDetection.enabled === false`, the orchestrator skips DETECT entirely.
- **Existing inputs** for each sub-skill: `design-system/tokens.json`, `design-system/DESIGN.md`, knowledge graph at `.harness/graph/` (optional).

### Outputs

```ts
interface DesignPipelineContext {
  // Pipeline state
  graphAvailable: boolean;
  inputs: {
    designMdExists: boolean;
    tokensJsonExists: boolean;
    componentRegistryExists: boolean;
    brandRulesExist: boolean;
  };
  bootstrapped: {
    designMd: boolean;
    tokensJson: boolean;
    componentRegistry: boolean;
    brandRules: boolean;
  };

  // Per-phase outputs (filled as phases run)
  driftFindings: DriftFinding[];
  fixesApplied: FixOutcome[];
  auditFindings: {
    anatomy: AnatomyFinding[];
    brand: BrandFinding[];
  };
  craftFindings: CraftFinding[];
  craftSuggestions: number; // count of POLISH-tier suggestions
  exclusions: Set<string>;

  // Verifier failures (graceful degradation)
  verifiersRun: string[];
  verifiersFailed: Array<{ name: string; error: string }>;

  // Verdict
  verdict: 'pass' | 'warn' | 'fail';
  summary: {
    totalFindings: number;
    bySeverity: Record<'error' | 'warn' | 'info', number>;
    byCode: Record<string, number>;
    fixesApplied: number;
    iterationsRun: number;
    durationMs: number;
  };
}
```

Output is rendered in two forms:

- **Human-readable** grouped by phase, then by file: `pass`/`warn`/`fail` verdict, counts per verifier, unfixed findings + craft suggestions for review.
- **JSON** (with `--json` flag): the full context as above.

### Pipeline handoff (sub-skills consume)

The orchestrator writes the context to `.harness/handoff.json` under a `pipeline` field. Each sub-skill reads (when invoked in pipeline mode) and writes back (per the contracts already established by align-design-system v1 and docs-pipeline):

```ts
{
  "pipeline": {
    "driftFindings": [...],
    "fixBatch": ["DRIFT-T001@src/Card.tsx:12", ...],
    "fixesApplied": [...]
  }
}
```

align-design-system v1 already supports this protocol; detect-design-drift, audit-component-anatomy, and audit-brand-compliance need minor additions to read `pipeline.fixBatch`/scoped-file restrictions if present (extending each sub-skill is part of this spec — additive, no contract changes).

## Technical Design

### Module layout

```
packages/cli/src/design-pipeline/
  context.ts            # DesignPipelineContext type + helpers
  registry.ts           # Verifier<F> registry (generic)
  phases/
    freshen.ts          # Phase 1: input freshness check + bootstrap offer
    detect.ts           # Phase 2: invoke detect-design-drift, populate driftFindings
    fix.ts              # Phase 3: convergence loop with align-design-system
    audit.ts            # Phase 4: invoke registered rule-based verifiers generically
    fill.ts             # Phase 5: input bootstrap + design-craft POLISH
    report.ts           # Phase 6: verdict + summary
  index.ts              # runDesignPipeline orchestrator
packages/cli/src/commands/
  design-pipeline.ts    # CLI: harness design-pipeline
packages/cli/src/mcp/tools/
  design-pipeline.ts    # MCP tool wrapper
agents/skills/{4 platforms}/harness-design-pipeline/
  SKILL.md
  skill.yaml
```

### Verifier registry (generic)

```ts
// packages/cli/src/design-pipeline/registry.ts
import type { Verifier } from '../shared/verifier.js';

export interface RegisteredVerifier<F> {
  name: string;
  runner: (input: {
    path: string;
    mode: 'fast' | 'full';
    files?: string[];
  }) => Promise<Verifier<F>>;
}

export class VerifierRegistry {
  private verifiers: RegisteredVerifier<unknown>[] = [];

  register<F>(name: string, runner: RegisteredVerifier<F>['runner']): void {
    this.verifiers.push({ name, runner } as RegisteredVerifier<unknown>);
  }

  list(): readonly RegisteredVerifier<unknown>[] {
    return this.verifiers;
  }
}
```

The orchestrator populates the registry at startup:

```ts
// packages/cli/src/design-pipeline/index.ts
import { VerifierRegistry } from './registry.js';
import { runAudit as runAnatomyAudit } from '../mcp/tools/audit-anatomy.js';
import { runAuditBrand } from '../mcp/tools/audit-brand.js';

const registry = new VerifierRegistry();
registry.register('audit-anatomy', runAnatomyAudit);
registry.register('audit-brand', runAuditBrand);
// detect-design-drift is invoked from DETECT phase (not AUDIT) because it
// feeds the FIX loop; conceptually drift is a "violation surface" the
// orchestrator wants to drive to zero, where audit-anatomy + audit-brand
// are passive observers run once per pipeline.
```

AUDIT phase loops:

```ts
for (const v of registry.list()) {
  try {
    const result = await v.runner({ path, mode, files });
    auditFindings[v.name] = result.findings;
    context.verifiersRun.push(v.name);
  } catch (err) {
    context.verifiersFailed.push({ name: v.name, error: errorMessage(err) });
  }
}
```

### Phase implementations

**Phase 1: FRESHEN** — check existence of each input, set `context.inputs` flags. If graph at `.harness/graph/` is stale (>10 commits behind, per docs-pipeline convention), log notice. Bootstrap is OFFERED here but DEFERRED to FILL phase to keep phase responsibilities clean (FRESHEN = read-only check).

**Phase 2: DETECT** — write context to handoff.json, invoke `runDetectDrift`, populate `context.driftFindings`. Skip if `design.audit.driftDetection.enabled === false`.

**Phase 3: FIX** — convergence loop:

```
previousCount = driftFindings.length
maxIterations = 5
while iteration < maxIterations:
  outcomes = await runAlignDesignSystem({ mode: 'pipeline', path })
  if outcomes.summary.applied === 0: break  // converged
  re-run detect-design-drift
  newCount = driftFindings.length
  if newCount >= previousCount: break  // no progress
  previousCount = newCount
  iteration++
```

Each align run pushes `fixesApplied` onto the context. Probably-safe / unsafe align outcomes surface in the report (no auto-apply in v1; matches docs-pipeline contract).

**Phase 4: AUDIT** — loop over registry, collect findings per verifier name. design-craft is NOT in this phase — its critique-phase findings overlap conceptually but it has different output semantics (tier/impact/confidence vs severity) and is dispatched in FILL.

**Phase 5: FILL** — two sub-phases:

- **5a: Bootstrap missing inputs.** For each absent input, generate a stub:
  - `design-system/DESIGN.md` absent → write a header with `## Aesthetic Direction`, `## Component Registry`, `## Anti-Patterns`, `## Brand Rules` sections all containing `<!-- TODO: author this section. See harness-design skill -->` placeholders.
  - `design-system/tokens.json` absent → write `{ "$description": "TODO: declare design tokens. See https://www.designtokens.org/" }`.
  - `## Component Registry` absent (DESIGN.md exists but section missing) → append the section with a stub table.
  - `## Brand Rules` absent → append with stub voice subsection.
  - Set `context.bootstrapped.{designMd,tokensJson,componentRegistry,brandRules}` per-input.
- **5b: design-craft-elevator POLISH.** Invoke `runDesignCraft({ phases: ['critique'] })` (Phase 1 MVP — full POLISH phase is its own v1.x). Populate `context.craftFindings` and increment `context.craftSuggestions`.

**Phase 6: REPORT** — compute verdict:

- `fail`: any error-severity findings remain across all verifiers
- `warn`: warn-severity findings present OR craft suggestions present OR bootstrapped any input this run
- `pass`: zero findings, zero suggestions, zero bootstrapped
  Render human-readable or JSON output.

### Fix safety classification

Already implemented inside align-design-system (pre-flight classifier). The orchestrator does NOT re-classify — it consumes align's `FixOutcome[]` and treats:

- `applied` → silent success, record in `context.fixesApplied`
- `suggestion` → surface in report
- `skipped-unsafe` → surface in report
- `failed` → surface in report

This is the Iron Law in action: the orchestrator delegates safety logic to align.

### Convergence loop bounds

- `maxIterations = 5` (matches docs-pipeline; empirical sweet spot — beyond 5, fix oscillation almost always indicates a real conflict that needs human attention).
- Loop stops when (a) align applies 0 fixes, or (b) total drift count fails to decrease.

### Graph state

No new schema. Pipeline persists findings through the same `DesignConstraintAdapter.recordFindings()` path used by check-design today. The orchestrator MAY add a `--persist` flag in v1.x to write all-phase findings to a persistent graph (today check-design uses in-memory; for orchestrator output to survive across runs we'll want disk persistence — deferred).

### Knowledge entries

None required for v1. v1.x may add `docs/knowledge/design/pipeline-loop-pattern.md` to formalize the shared docs-pipeline / design-pipeline convergence-loop pattern as Hermes ingest material.

## Surface area

### CLI

```
harness design-pipeline [options]
  --fix              Enable convergence-based remediation (default: detect + report only)
  --no-freshen       Skip the FRESHEN phase
  --no-fill          Skip the FILL phase (bootstrap + craft polish)
  --ci               Non-interactive: apply safe fixes only, report everything else
  --json             Machine-readable output
  --verbose / --quiet  Standard output modes
```

Exit codes:

- `0` — verdict is `pass` or `warn`
- `1` — verdict is `fail` (error-severity findings remain after FIX phase)
- `2` — pipeline crashed (verifier(s) failed AND no findings could be produced)

### MCP tool

`run_design_pipeline` — input `{ path, fix, noFreshen, noFill, ci }`. Output the full `DesignPipelineContext` as the Verifier-shape-adjacent envelope. Tool count bumps 73 → 74.

### Skill (4 platforms)

`agents/skills/{claude-code,codex,cursor,gemini-cli}/harness-design-pipeline/{SKILL.md,skill.yaml}`. Markdown mirrors `harness-docs-pipeline` structure: When to Use, Iron Law, Flags, Shared Context Object, Process (phase-by-phase), Fix Safety Classification, Escalation.

## Rationalizations to reject

| Rationalization                                                    | Why it's wrong                                                                                                                                                                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Merge the orchestrator into check-design as a `--fix` flag"       | Mixes single-pass verifier responsibility with multi-pass loop orchestration. The docs-pipeline split (check-docs vs harness-docs-pipeline) is the proven shape; mirror it.                                   |
| "Skip the generic Verifier registry — just hardcode each verifier" | Discards the entire payoff of the Verifier<F> interface extraction. Future verifiers (post-v2) would each require an orchestrator edit; that's the maintenance tax this interface was extracted to eliminate. |
| "Run design-craft in AUDIT phase alongside anatomy + brand"        | design-craft has a different output shape (tier/impact/confidence vs severity) and ceiling-layer semantics (POLISH suggestions, not violations). Conflating them in the same phase obscures the verdict.      |
| "Bootstrap DESIGN.md with full sample content"                     | Sample content rots faster than skeletons. Stubs with TODO comments invite the human (or `harness-design` skill) to author real content. Sample content would actively mislead in real projects.              |
| "Run align in --write mode even when CI flag is set"               | Matches docs-pipeline contract: CI applies only the safest fixes, reports everything else. Auto-apply of probably-safe fixes in CI would mutate code without review.                                          |
| "Cap iterations at a configurable value (not 5)"                   | Iteration count being uniform with docs-pipeline is a feature, not a bug — operators learn one number. Configurable in v1.x if real-world signal calls for it.                                                |
| "Skip the pipeline handoff field; pass findings via function args" | The handoff.json `pipeline` field is the established contract for sub-skill invocation. Skipping breaks the standalone/pipeline-mode duality each sub-skill spec preserves.                                   |
| "Generate DESIGN.md ## Brand Rules with sample voice constraints"  | Brand voice IS the team's voice — generating sample content would either be (a) generic enough to be useless, or (b) opinionated enough to be wrong for the project. Stub + TODO is correct.                  |

## Success criteria

**Phase implementation (12)**

1. FRESHEN sets `context.inputs.{designMdExists,tokensJsonExists,componentRegistryExists,brandRulesExist}` correctly per filesystem state
2. FRESHEN skipped entirely when `--no-freshen` is set
3. DETECT invokes `runDetectDrift` and populates `context.driftFindings` with all findings
4. DETECT skipped when `design.audit.driftDetection.enabled === false`
5. FIX runs only when `--fix` is set
6. FIX convergence loop bounded at 5 iterations
7. FIX records each align fix in `context.fixesApplied`
8. AUDIT invokes all registered verifiers via the generic registry
9. AUDIT records per-verifier findings under `context.auditFindings.{anatomy,brand}`
10. FILL skipped entirely when `--no-fill` is set
11. FILL bootstrap writes stubs for absent inputs (DESIGN.md, tokens.json, sections)
12. FILL invokes `runDesignCraft({ phases: ['critique'] })` and populates `context.craftFindings`

**Generic registry correctness (5)**

13. `VerifierRegistry.register()` accepts a runner whose return type satisfies `Verifier<F>`
14. `VerifierRegistry.list()` returns verifiers in registration order
15. AUDIT phase iterates the registry generically (no hardcoded `if (name === 'anatomy')` branches)
16. A 5th verifier registered in a unit test is invoked exactly like the built-ins (no orchestrator change required to add)
17. Verifier failure in one registry entry does not abort iteration over remaining entries

**Convergence + verdict (5)**

18. Verdict is `pass` when zero error-severity findings remain and zero suggestions present and nothing bootstrapped
19. Verdict is `warn` when any warn-severity finding OR craft suggestion OR bootstrapped input is present
20. Verdict is `fail` when any error-severity finding remains after FIX
21. Convergence loop stops when align applies 0 fixes in an iteration
22. Convergence loop stops when total drift count fails to decrease

**Iron Law compliance (3)**

23. Orchestrator imports NO drift / fix / audit logic — only sub-skill entry points
24. Adding a rule to a sub-skill changes ZERO lines in the orchestrator
25. Removing a sub-skill registration changes only the registry init code (single-line removal)

**Surface area + integration (5)**

26. New MCP tool `run_design_pipeline` registered (count 73 → 74)
27. New CLI command `harness design-pipeline` registered
28. 4-platform skill markdown shipped (claude-code / codex / cursor / gemini-cli)
29. `pipeline.driftFindings` written to handoff.json before invoking align in pipeline mode
30. `pipeline.fixesApplied` read back from handoff.json after align returns

**Config + docs (4)**

31. Per-verifier gates (`design.audit.{componentAnatomy,driftDetection,brandCompliance}.enabled === false`) honored — disabled verifiers are skipped
32. Auto-doc regenerates with `run_design_pipeline` MCP entry + `harness-design-pipeline` skill entry
33. Changeset describes the orchestrator + Verifier<F> registry consumption
34. Roadmap updated: design-pipeline initiative + sub-project #5 marked done

## Long-term trajectory

- **v1.x — interactive fix-approval prompts.** v1 ships CI-safe non-interactive only. v1.x adds `--interactive` for terminal sessions with diff preview + per-fix approval.
- **v1.x — `--phase` flag** for running a specific phase (DETECT / FIX / AUDIT / FILL / REPORT) in isolation. Useful for debugging.
- **v1.x — `--persist` flag** to write findings to `.harness/graph/` after each run. Enables historical trends + cross-run dedup.
- **v1.x — `--watch` mode** for development. Re-runs the pipeline on filesystem changes.
- **v1.x — orchestrator-level telemetry via Hermes.** Track per-phase durations, fix application rates, and convergence-iteration counts across runs.
- **v2 — pipeline composition with craft-pipeline.** When craft-pipeline ships its own orchestrator, design-pipeline becomes a member by composition. Cross-orchestrator handoff (design's craft phase → cross-cutting craft phases) shares the same pattern.
- **v2 — `align-brand-compliance`** and **`align-anatomy`** FIX skills land. Orchestrator's FIX phase loop expands to invoke each align-_ skill against its matching audit-_ findings (currently only drift has a paired align skill).
- **v3 — graph-as-source-of-truth.** All findings live in the graph. The orchestrator becomes a graph-query facade: report = querying findings + persisting fixes. Pipeline phases become graph mutations.

## Risks + mitigations

| Risk                                                                 | Mitigation                                                                                                                                                                                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Convergence loop runs forever on a pathological project              | Hard bound at 5 iterations + plateau detection (no-progress stop). Identical to docs-pipeline.                                                                                                                                        |
| Generic registry hides verifier-specific edge cases                  | Registry stores typed runners; per-verifier behavior diffs (e.g. design-craft's output shape) are addressed by NOT registering design-craft (it stays hardcoded in FILL).                                                             |
| FILL phase generates DESIGN.md stubs that look like real content     | Stubs include `<!-- TODO: ... -->` comments inline. Sample sections are explicitly minimal (3-5 lines).                                                                                                                               |
| Sub-skill change breaks pipeline                                     | Pipeline depends only on each sub-skill's exported run\* function and Verifier<F> output shape. Iron Law enforcement + tests catching shape divergence.                                                                               |
| `--fix` mutates user's source files unexpectedly                     | `--fix` is opt-in; default is detect + report only. Each applied fix produces a structured diff in the output. Combined with version control, blast radius is bounded.                                                                |
| design-craft cost telemetry leaks into pipeline summary              | FILL records craft findings + suggestion count but does not roll up the cost. Cost stays in the design-craft output for the human-readable report only (not in the verdict).                                                          |
| Pipeline runtime exceeds reasonable CI budget                        | v1 has no time bound; relies on individual sub-skill performance. v1.x adds `--max-duration` flag. For now, projects can use `--no-fill` to skip the LLM-bound craft phase.                                                           |
| Configuration sprawl: `design.audit.*` blocks now total 4 sub-blocks | Each block represents an independent verifier with distinct enable-gate semantics. Sprawl IS the contract. v2 may introduce `design.audit.all.{enabled,strictness}` rollup if real-world usage shows the trio is always set together. |

## Open questions deferred to implementation

- **DESIGN.md stub format.** Spec says minimal section headers + TODO comments. Exact wording finalized in implementation; tested via integration test that runs FILL on empty repo and asserts file content.
- **Per-phase timing instrumentation.** v1 records `summary.durationMs` total; per-phase split deferred until telemetry integration in v1.x.
- **Pipeline handoff cleanup.** After REPORT, should the orchestrator clear `pipeline` field from handoff.json? v1 leaves it for debugging; v1.x may add `--cleanup` flag.
  EOF
