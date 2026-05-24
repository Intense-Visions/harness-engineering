# Harness Design Pipeline

> Orchestrator composing all 6 design-pipeline sub-projects into a single sequential pipeline with convergence-based remediation: FRESHEN → DETECT → FIX → AUDIT → FILL → REPORT. Produces a unified `pass` / `warn` / `fail` verdict and a per-phase report. Mirrors harness-docs-pipeline in shape; consumes the formal verifier interface generically so a 5th rule-based verifier composes for free.

## When to Use

- When you want a single-command design health check across drift, anatomy, brand, and craft
- After major UI refactoring that may have caused widespread drift
- As a periodic hygiene check (per-PR or per-sprint)
- When onboarding a new project that has no DESIGN.md (bootstrap mode via FILL phase)
- When `on_pr` triggers fire on a UI-touching change
- NOT for fixing a single known drift issue (use align-design-system directly)
- NOT for single-pass verification (use `harness check-design` directly)
- NOT for authoring DESIGN.md or tokens.json (use `harness-design` skill — orchestrator only stubs absent inputs)

## Relationship to Sub-Skills

| Skill                   | Pipeline Phase | Role                                                        |
| ----------------------- | -------------- | ----------------------------------------------------------- |
| detect-design-drift     | DETECT         | Find token bypass + primitive-adoption drift                |
| align-design-system     | FIX            | Apply codemods + emit suggestions for drift findings        |
| audit-component-anatomy | AUDIT          | Find missing required anatomy parts in components           |
| audit-brand-compliance  | AUDIT          | Find token misuse + forbidden phrases (brand semantics)     |
| harness-design-craft    | FILL           | Critique copy/hierarchy/polish (LLM-judgment ceiling skill) |

This orchestrator delegates to sub-skills — it never reimplements their logic. Each sub-skill retains full standalone functionality.

## Iron Law

**The pipeline delegates, never reimplements.** If you find yourself writing drift detection logic, fix application logic, or audit logic inside the orchestrator, STOP. Delegate to the dedicated sub-skill.

**Safe fixes are silent, unsafe fixes surface.** v1 follows align-design-system's pre-flight classifier verdict: `applied` outcomes are silent successes; `suggestion` / `skipped-unsafe` / `failed` outcomes surface in the report. Never override the classifier from inside the orchestrator.

## Flags

| Flag                      | Effect                                                            |
| ------------------------- | ----------------------------------------------------------------- |
| `--fix`                   | Enable convergence-based auto-fix (default: detect + report only) |
| `--no-freshen`            | Skip the FRESHEN phase                                            |
| `--no-fill`               | Skip the FILL phase (input bootstrap + craft polish)              |
| `--ci`                    | Non-interactive: safe fixes only, no prompts                      |
| `--mode <m>`              | Verifier mode (`fast` or `full`); default `fast`                  |
| `--files <...>`           | Optional file/glob scope passed to each verifier                  |
| `--design-strictness <s>` | Override `design.strictness`                                      |
| `--json`                  | Machine-readable output                                           |

## Shared Context Object

All phases read from and write to a shared `DesignPipelineContext`:

```typescript
interface DesignPipelineContext {
  graphAvailable: boolean;
  inputs: {
    designMdExists: boolean;
    tokensJsonExists: boolean;
    componentRegistryExists: boolean;
    brandRulesExist: boolean;
  };
  bootstrapped: { designMd; tokensJson; componentRegistry; brandRules: boolean };
  driftFindings: DriftFinding[];
  fixesApplied: FixOutcome[];
  auditFindings: { anatomy: AnatomyFinding[]; brand: BrandFinding[] };
  craftFindings: CraftFinding[];
  craftSuggestions: number;
  exclusions: Set<string>;
  verifiersRun: string[];
  verifiersFailed: Array<{ name: string; error: string }>;
  verdict: 'pass' | 'warn' | 'fail';
  summary: { totalFindings; bySeverity; byCode; fixesApplied; iterationsRun; durationMs };
}
```

The context is passed to sub-skills via `.harness/handoff.json` with a `pipeline` field. align-design-system v1 already supports reading `pipeline.driftFindings` and writing `pipeline.fixesApplied`; other sub-skills run in standalone mode when invoked from the orchestrator.

## Process

### Phase 1: FRESHEN — Input Freshness Check

**Skip this phase if `--no-freshen` flag is set.**

1. **Check graph existence.** Look for `.harness/graph/` directory; set `context.graphAvailable`.
2. **Check input file presence:**
   - `design-system/DESIGN.md` exists?
   - `design-system/tokens.json` exists?
   - `## Component Registry` section present in DESIGN.md?
   - `## Brand Rules` section present in DESIGN.md?
3. **Set `context.inputs.*` flags.** Bootstrap action is DEFERRED to FILL phase (clean phase responsibilities).

### Phase 2: DETECT — Find Design Drift

1. Invoke `runDetectDrift({ path, mode, files? })`.
2. Populate `context.driftFindings` with all `DRIFT-T*` and `DRIFT-P*` findings.
3. Record `'detect-drift'` in `context.verifiersRun`.
4. On failure: push to `context.verifiersFailed` and continue (graceful degradation).
5. If `design.audit.driftDetection.enabled === false` in config: SKIP this phase entirely.

### Phase 3: FIX — Convergence-Based Drift Remediation

**This phase runs only when `--fix` flag is set.**

#### Convergence Loop

```
previousCount = context.driftFindings.length
maxIterations = 5

while iteration < maxIterations:
  1. Write pipeline.driftFindings to handoff.json
  2. Invoke align-design-system in pipeline mode
  3. Append outcomes to context.fixesApplied
  4. If applied === 0: STOP (converged)
  5. Re-run detect-design-drift
  6. newCount = remaining findings
  7. if newCount >= previousCount: STOP (no progress)
  8. previousCount = newCount
  9. iteration++
```

Each align run mutates source files via its safe codemods (T001/T002/T003 only). Probably-safe / unsafe / failed outcomes are recorded but never auto-applied (align's pre-flight classifier is the gate).

### Phase 4: AUDIT — Rule-Based Verifier Loop

1. Iterate the orchestrator's `VerifierRegistry` generically:
   - `audit-anatomy` runner → populate `context.auditFindings.anatomy`
   - `audit-brand` runner → populate `context.auditFindings.brand`
2. Each verifier's failure is captured in `context.verifiersFailed` without aborting the loop.
3. **Iron Law:** the orchestrator does NOT branch on verifier name inside the audit logic. Adding a 5th verifier means registering it; the loop body stays unchanged.

### Phase 5: FILL — Bootstrap + Ceiling Polish

**Skip this phase if `--no-fill` flag is set.**

**5a. Bootstrap missing inputs.** For each absent input declared in Phase 1:

- DESIGN.md missing → write a minimal stub with `## Aesthetic Direction`, `## Component Registry`, `## Anti-Patterns`, `## Brand Rules` sections, each containing `<!-- TODO: ... -->` placeholders.
- tokens.json missing → write a minimal `{ "$description": "TODO: declare design tokens" }` stub.
- `## Component Registry` missing (DESIGN.md exists but section absent) → append a stub table.
- `## Brand Rules` missing → append a stub voice subsection.

Set `context.bootstrapped.{designMd,tokensJson,componentRegistry,brandRules}` per-input.

**5b. Invoke design-craft-elevator POLISH (critique phase).**

1. Call `runDesignCraft({ phases: ['critique'] })`.
2. Populate `context.craftFindings` and `context.craftSuggestions`.
3. Record `'design-craft-critique'` in `context.verifiersRun`.

design-craft suggestions are surfaced in REPORT but do NOT contribute to the `error`/`warn` severity counts — they're ceiling-layer suggestions, not violations.

### Phase 6: REPORT — Verdict + Summary

Compute verdict:

| Condition                                                               | Verdict |
| ----------------------------------------------------------------------- | ------- |
| Any error-severity finding remains after FIX                            | `fail`  |
| Any warn-severity finding OR craft suggestion OR bootstrapped any input | `warn`  |
| Zero findings, zero suggestions, zero bootstrapped                      | `pass`  |

Aggregate `summary.bySeverity` and `summary.byCode` across drift + anatomy + brand findings. (Craft findings use tier, not severity — they're tracked separately.)

Render human-readable or JSON output.

## Harness Integration

- **`harness design-pipeline`** — CLI entry point. Recommended for CI usage with `--ci --fix`.
- **`mcp__harness__run_design_pipeline`** — MCP tool. Same input/output. Consumed by agents needing the full design health check.
- **`harness check-design`** — Single-pass verifier. The orchestrator INVOKES check-design's underlying verifiers (anatomy, drift, brand) but expands them into a convergence-loop pipeline. Choose check-design for one-shot verification; choose this orchestrator for the full pipeline with fixes.
- **`harness validate`** — Stays single-pass (and fast). The orchestrator is opt-in and heavier — different contract.
- **`.harness/handoff.json`** — Carries the `pipeline` field between orchestrator and align-design-system. Other sub-skills run standalone-mode from the orchestrator's perspective.

## Success Criteria

See `docs/changes/design-pipeline/orchestrator/proposal.md` for the full 34 success criteria. Highlights:

- Generic Verifier registry: adding a 5th verifier requires only a `register()` call
- Iron Law compliance: orchestrator imports NO drift/fix/audit logic, only sub-skill entry points
- Convergence loop bounded at 5 iterations + plateau detection
- Verdict: `pass`/`warn`/`fail` per documented rules
- 4-platform skill markdown shipped
- MCP tool `run_design_pipeline` registered (count 73 → 74)

## Examples

### Example: Clean project, default flags

```
$ harness design-pipeline

Verdict: ✓ pass

Phases:
  FRESHEN  inputs: DESIGN.md=yes tokens.json=yes registry=yes brand=yes
  DETECT   drift findings: 0
  FIX      iterations: 0, fixes applied: 0
  AUDIT    anatomy: 0, brand: 0
  FILL     bootstrapped: none, craft suggestions: 0

Summary: 0 total findings (0 error, 0 warn, 0 info) in 142ms
Verifiers run: detect-drift, audit-anatomy, audit-brand, design-craft-critique
```

### Example: Project with drift, `--fix` enabled

```
$ harness design-pipeline --fix

Verdict: ⚠ warn

Phases:
  FRESHEN  inputs: DESIGN.md=yes tokens.json=yes registry=yes brand=yes
  DETECT   drift findings: 14
  FIX      iterations: 3, fixes applied: 9
  AUDIT    anatomy: 1, brand: 0
  FILL     bootstrapped: none, craft suggestions: 4

Summary: 5 total findings (0 error, 5 warn, 0 info) in 1842ms
Verifiers run: detect-drift, align-design-system, audit-anatomy, audit-brand, design-craft-critique
```

(9 drift fixes auto-applied in convergence loop; 5 remaining warnings + 4 craft suggestions for human review)

### Example: Empty project, FILL bootstraps inputs

```
$ harness design-pipeline

Verdict: ⚠ warn

Phases:
  FRESHEN  inputs: DESIGN.md=no tokens.json=no registry=no brand=no
  DETECT   drift findings: 0
  FIX      iterations: 0, fixes applied: 0
  AUDIT    anatomy: 0, brand: 0
  FILL     bootstrapped: designMd, tokensJson, componentRegistry, brandRules, craft suggestions: 0

Summary: 0 total findings (0 error, 0 warn, 0 info) in 89ms
```

(All inputs absent; FILL wrote minimal stubs; verdict `warn` because bootstrap occurred — author the TODO sections to clear it.)

## Gates

- **No new verifier logic.** Iron Law. Delegate to sub-skills exclusively.
- **No graph schema changes.** Findings persist through the existing `DesignConstraintAdapter.recordFindings()` path.
- **No interactive prompts in v1.** `--fix` applies safe codemods silently; probably-safe / unsafe surface as suggestions only. `--ci` is the default behavior in v1; v1.x adds `--interactive` for terminal sessions.
- **No standalone `harness validate` invocation.** validate stays single-pass; the orchestrator is opt-in.
- **No DESIGN.md content generation.** Bootstrap writes stubs with TODO comments — sample content rots faster than skeletons.

## Escalation

- **When the convergence loop hits maxIterations without converging:** check `context.summary.iterationsRun === 5`. Real fix oscillation almost always indicates a conflict between drift findings (e.g., two tokens with the same value). Inspect `fixesApplied` outcomes; the failing pattern is usually visible.
- **When a verifier consistently fails:** `context.verifiersFailed[].error` carries the message. Run the verifier standalone (e.g. `harness skill run audit-brand-compliance`) to reproduce — orchestrator just propagates the failure.
- **When FILL bootstraps a file you didn't want bootstrapped:** delete the stub; the orchestrator only writes when the file is absent. Or run with `--no-fill` to suppress the entire phase.
- **When verdict is `fail` but you want to merge anyway:** the orchestrator exits with code 1; bypass via CI config (treating design-pipeline as advisory not blocking). Not recommended — error-severity findings represent declared violations.
- **When `--ci` mode is too conservative:** v1's `--ci` only applies align's `safe-codemod`-classified fixes. Use v1.x's `--interactive` (or the standalone `harness align-design-system --dry-run`) to review and apply probably-safe fixes manually.

## Status

**v1 — in implementation.** See:

- Spec: `docs/changes/design-pipeline/orchestrator/proposal.md`
- Roadmap entry: `design-pipeline sub-project #5` (the orchestrator)
- Sibling: `harness-docs-pipeline` (the pattern this mirrors)
- Floor + ceiling sub-skills: `detect-design-drift` (#1), `align-design-system` (#1), `audit-component-anatomy` (#2), `audit-brand-compliance` (#3), `check-design` (#4), `harness-design-craft` (#6)
