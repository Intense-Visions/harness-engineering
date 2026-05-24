# align-design-system v1

> The FIX half of design-pipeline sub-project #1. Consumes `DRIFT-*` findings from detect-design-drift, applies safe codemods for clear 1:1 token replacements (DRIFT-T001/T002/T003), and emits precise suggestions for findings that require human or LLM judgment (DRIFT-T004 + all DRIFT-P\*). Runs standalone OR as the FIX step in the (future) #5 design-pipeline orchestrator's convergence loop. Mirrors the align-documentation pattern proven in docs-pipeline.

## Overview

**Project:** align-design-system (v1)
**Initiative:** design-pipeline (sub-project #1 of 6 — align half; detect half shipped in PR #396)
**Date:** 2026-05-24
**Estimated effort:** ~1 week, single PR

### What this ships

A new skill + CLI + MCP tool that takes drift findings as input and produces actual code changes as output. v1 is intentionally narrow on what gets auto-applied — the bar is "no false positives," not "highest fix volume." The pattern matches align-documentation: a single skill that operates in two modes (standalone or pipeline-step), with safety classification done locally to the fix logic.

### What this does NOT ship

- **No primitive-adoption codemods.** Raw `<button>` → `<Button>` requires per-component prop-translation tables, import resolution, and revert-on-test-fail. That's its own brainstorm (deferred to v1.x).
- **No variant-proliferation fixes.** Drift detection for variants isn't shipped yet (DRIFT-V\* are v1.x on the detect side).
- **No fix-safety annotations on DriftFinding.** Safety classification lives in align, not in detect — keeps the detect schema stable and lets safety logic evolve independently.
- **No autofix for files that don't already import the token system.** v1's first rule: if `import { tokens } from '...'` (or the project's equivalent token entry point) isn't already in the file, the codemod skips and emits a suggestion instead. Adding imports is its own ambiguity surface.
- **No internal convergence loop.** align applies ONE fix batch and returns. The convergence loop belongs to #5 orchestrator (which doesn't exist yet — align ships callable from one side only in v1).

### What problem this solves

After detect-design-drift lands, a typical project sees dozens of DRIFT-T001 findings (hex colors that map directly to brand tokens). Today the fix is manual: read each finding, find the token, edit the file. align-design-system is the first programmatic step that turns those findings into actual edits — closing the loop from "we found drift" to "drift is fixed" without manual transcription for the cases where the fix is unambiguous.

## Decisions

| #   | Decision         | Lock                                                                  | Rationale                                                                                                                                                                                                                             |
| --- | ---------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | v1 fix scope     | **T001+T002+T003 codemods; T004 + all P\* as precise suggestions**    | Hex/font-family/px-spacing have unambiguous 1:1 token mappings when a token exists. T004 (deprecated) needs migration target that may be absent from `$description`. P\* needs prop-translation tables — substantial design surface.  |
| 2   | Loop integration | **Standalone + pipeline-handoff field** (mirrors align-documentation) | One implementation, two callers. Ships now without waiting for #5 orchestrator. The pipeline field is purely additive — same shape as `align-documentation`'s `pipeline.driftFindings` → `pipeline.fixesApplied` round-trip.          |
| 3   | Safety model     | **Pre-flight classifier in align**                                    | DriftFinding schema stays stable. Safety logic lives next to fix logic (where it can evolve fastest). Detect doesn't need to reason about fix-safety concerns it doesn't have access to (e.g., is the token import already present?). |

## Scope

### In-scope

- **DRIFT-T001 codemod** — Replace hex literal with token reference. Pre-flight requires: token import already present in file AND single string-literal context (not a template literal, not concatenation).
- **DRIFT-T002 codemod** — Replace font-family string with typography token. Same pre-flight as T001.
- **DRIFT-T003 codemod** — Replace pixel value with spacing token. Pre-flight additionally requires: the px value matches a token's `$value` exactly (no "round to nearest" — that's a separate ambiguity).
- **DRIFT-T004 suggestion** — Emit fix-suggestion text including the deprecated path AND, if `$description` provides one, the suggested replacement. Never auto-applied.
- **DRIFT-P\* suggestions** — Emit precise per-primitive suggestion text including the import line, the JSX replacement, and a note about prop translation. Never auto-applied.
- **Pre-flight classifier** — For each finding, inspect file context and decide `safe-codemod | suggestion`. Per-code classifier rules documented in this spec; lives at `packages/cli/src/align/classifier/`.
- **Standalone CLI** — `harness align-design-system` runs full detect→classify→apply→verify in one shot. `--dry-run` produces the diff without writing. `--write` is the default (matches user expectation of "align" verb).
- **MCP tool** — `align_design_system` for agent consumption.
- **Pipeline-handoff field** — Read `pipeline.driftFindings` from `.harness/handoff.json` when present; write `pipeline.fixesApplied` back. Standalone mode ignores the field.
- **Diff emission** — Every applied fix produces a structured diff (old/new lines + filepath) included in the tool output for review.
- **Revert support** — `--revert` re-applies the inverse of the last `fixesApplied` batch (idempotent if no other edits intervened). Pipeline-mode revert is triggered by orchestrator on test failure.

### Out-of-scope (v1)

- **No primitive-adoption codemods.** Suggestions only. See "What this does NOT ship."
- **No T001 codemod when token import is missing.** Adding the import line is a separate ambiguity surface (which import path? alias? barrel?).
- **No T003 "round to nearest" snap.** Only exact-match codemod.
- **No variant proliferation fixes.** Detect-side doesn't ship them either.
- **No prettier/eslint normalization after fixes.** Applied diffs may not match project formatting — relies on existing format-on-commit hooks.
- **No fix application across files in a single batch.** Each fix is scoped to one file; cross-file consistency is the orchestrator's loop concern.
- **No LLM-mediated fixes.** v1 is rule-based only. LLM-judgment alignment is its own ceiling-layer skill (would belong in craft-pipeline).

## Inputs

- **Drift findings.** Either freshly generated (standalone mode invokes detect-design-drift internally) OR pre-classified by an orchestrator (pipeline mode reads `pipeline.driftFindings`).
- **`design-system/tokens.json`** — W3C DTCG token set. Same loader as detect-design-drift (`packages/cli/src/drift/resolvers/tokens.ts`). align needs the token VALUES (to write the replacement) plus token PATHS (to write the reference).
- **Token import discovery.** Pre-flight classifier scans each finding's source file for an existing token import line. v1 recognizes three forms:
  1. `import { tokens } from '<any path>'` (named import)
  2. `import tokens from '<any path>'` (default import)
  3. `const tokens = require('<any path>')` (CJS — for `.css.ts`-style files)
     If none match, the finding is downgraded to suggestion.
- **harness.config.json** — `design.audit.align.{enabled,dryRunByDefault,maxFixesPerRun}`. New config sub-block under `design.audit` (sibling to `componentAnatomy` and `driftDetection`).

## Outputs

### Per-fix outcome

```ts
type FixOutcome =
  | {
      kind: 'applied';
      finding: DriftFinding;
      diff: { file: string; before: string; after: string; line: number };
    }
  | {
      kind: 'suggestion';
      finding: DriftFinding;
      suggestion: { description: string; preview: string };
    }
  | { kind: 'skipped-unsafe'; finding: DriftFinding; reason: string }
  | { kind: 'failed'; finding: DriftFinding; error: string };
```

### Run output

```ts
interface AlignDesignSystemOutput {
  outcomes: FixOutcome[];
  summary: {
    totalFindings: number;
    applied: number;
    suggestions: number;
    skipped: number;
    failed: number;
    filesModified: number;
    durationMs: number;
  };
  catalog: { codemodApplied: string[]; suggestionsEmitted: string[] };
  meta: {
    mode: 'standalone' | 'pipeline';
    dryRun: boolean;
    tokensLoaded: boolean;
  };
}
```

### CLI output (human-readable)

Grouped by file, with each fix line showing: outcome icon + code + line + before → after (for applied) or suggestion text (for suggestion). Summary footer with the counts above.

### Pipeline handoff (when `pipeline.driftFindings` was the input)

Writes `pipeline.fixesApplied: FixOutcome[]` to `.harness/handoff.json` so the orchestrator can know which findings to re-check after verification.

## Technical Design

### Module layout

```
packages/cli/src/align/
  findings/
    outcome.ts             # FixOutcome type + helpers
  classifier/
    pre-flight.ts          # Per-finding safe/unsafe classification
    token-import.ts        # Scans file for existing token import lines
  codemods/
    t001-hex.ts            # Hex → token reference codemod
    t002-font-family.ts    # Font-family → token reference
    t003-px-spacing.ts     # Px value → spacing token reference
  suggestions/
    t004-deprecated.ts     # Deprecated token migration suggestion
    p-primitives.ts        # Raw primitive → registered component suggestion
  index.ts                 # runAlignDesignSystem orchestrator
packages/cli/src/mcp/tools/
  align-design-system.ts   # MCP tool wrapper
```

Co-located under `packages/cli/src/` (same convention as audit-anatomy, design-craft, drift). No new package.

### Pre-flight classifier rules (v1)

| Finding code | Codemod-safe iff…                                                                                                                                       | Otherwise               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| DRIFT-T001   | Token import present in file AND hex appears as a single string literal (not concatenation/template) AND exactly one matching token in palette by value | Downgrade to suggestion |
| DRIFT-T002   | Token import present AND font-family appears as a single string literal AND exactly one matching token                                                  | Downgrade to suggestion |
| DRIFT-T003   | Token import present AND px value matches a spacing token EXACTLY (no rounding) AND appears in a simple key:value position (not arithmetic expression)  | Downgrade to suggestion |
| DRIFT-T004   | Always emit suggestion. v1 never auto-applies deprecated migration (target may not be in `$description`).                                               | (suggestion always)     |
| DRIFT-P\*    | Always emit suggestion. v1 never auto-applies primitive adoption.                                                                                       | (suggestion always)     |

### Codemod implementation

Codemods are regex-based for v1 (mirrors detect-side's T\* rules). For each finding:

1. Read the source file.
2. Locate the exact match position from finding's `line` + `evidence.snippet`.
3. Compute the replacement (`tokens.color.brand.primary` or equivalent based on token import shape).
4. Replace in-place. Emit `FixOutcome.applied` with the diff.

If the file changes between detect-time and apply-time (rare, but possible in pipeline mode), the codemod skips with `kind: 'skipped-unsafe', reason: 'file changed since finding'`.

### Suggestion implementation

For each suggestion-only finding, produce a human-readable description plus a preview of the suggested change. The preview is illustrative — it shows what the fix WOULD look like if applied manually. No file mutation.

### Standalone vs pipeline mode

```ts
async function runAlignDesignSystem(input: AlignInput): Promise<AlignOutput> {
  const findings = await loadFindings(input); // either runDetectDrift OR pipeline.driftFindings
  const tokens = loadTokenSet(input.path);
  const outcomes: FixOutcome[] = [];
  for (const finding of findings) {
    const classification = classifyFinding(finding /* file context */);
    if (classification === 'safe-codemod' && !input.dryRun) {
      outcomes.push(await applyCodemod(finding, tokens));
    } else if (classification === 'safe-codemod' && input.dryRun) {
      outcomes.push({ kind: 'applied', diff: computeDiff(finding, tokens) /* not written */ });
    } else {
      outcomes.push(emitSuggestion(finding, tokens));
    }
  }
  if (input.mode === 'pipeline') {
    writePipelineHandoff(outcomes);
  }
  return aggregateOutput(outcomes);
}
```

### Graph state

No new node/edge types. align does not write to the graph — it modifies source files. Re-running detect-design-drift after align produces a smaller finding set; that's the visible loop signal.

### Knowledge entries

None required for v1. v2 may add `docs/knowledge/design/codemod-safety.md` if the classifier rules become a reusable pattern across align-\* skills.

## Surface area

### CLI

- `harness align-design-system` — full detect→fix→report
- `harness align-design-system --dry-run` — fix preview without write
- `harness align-design-system --files <glob>...` — scope to files
- `harness align-design-system --revert` — undo last batch
- `harness align-design-system --json` / `--verbose` / `--quiet` — standard

Exit codes:

- `0` — ran successfully; some or all findings were fixed or suggested
- `1` — at least one codemod application FAILED
- `2` — degraded (detect throw, tokens missing, etc.)

### MCP tool

`align_design_system` — same input/output shape as the function call. Input includes `dryRun`, `files`, `path`. Output includes the structured `FixOutcome[]` + summary.

### Pipeline handoff

```ts
interface DesignPipelineContext {
  driftFindings: DriftFinding[]; // written by orchestrator
  fixBatch?: string[]; // optional: only fix these finding IDs
  fixesApplied?: FixOutcome[]; // written by align-design-system
}
```

When `pipeline.driftFindings` is present in `.harness/handoff.json`, align reads from it instead of running detect. When `pipeline.fixBatch` is set, only those findings are processed. align always writes `pipeline.fixesApplied` back.

## Verifier-shape note

align-design-system is the **first FIX skill** (not a verifier). The Verifier-shape convention (`{ findings, summary, catalog, meta }`) doesn't apply directly — `FixOutcome` is union-typed, not a flat finding list. The `summary` shape (totals + duration) DOES still mirror the verifier convention so check-design-style aggregation works downstream if a future #5 orchestrator wants to surface fix counts in the same view.

## Rationalizations to reject

| Rationalization                                                        | Why it's wrong                                                                                                                                      |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Auto-apply primitive-adoption codemods — the registry says it's safe" | Prop translation across `<button>` ⇄ `<Button>` is genuinely ambiguous (event handlers, ref forwarding, class merging). v1.x with prop-schema work. |
| "Add the token import automatically when missing"                      | Multiple import-path conventions per project (alias, barrel, relative). Picking wrong silently churns files.                                        |
| "T003 should round to the nearest scale value"                         | Rounding 11px → 8px or 16px is a design call. Tool shouldn't decide.                                                                                |
| "Annotate DriftFinding with fixSafety to avoid the classifier"         | Couples detect-side to fix-side concerns. Schema bloat; safety logic still has to live somewhere — classifier scales better.                        |
| "Skip the dry-run flag — agents always want to write"                  | The MCP tool is consumed by agents AND humans. Dry-run is the verification step before applying; pipeline mode uses it for plan/apply split.        |
| "align should run its own convergence loop"                            | Two implementations of the loop (#5 orchestrator + align) means two places to fix bugs. align does one pass; loops are orchestrator-owned.          |
| "Apply codemods using AST instead of regex for v1"                     | T\* findings live in string-literal contexts that regex handles cleanly. AST is appropriate for P\* (primitive adoption) — deferred to v1.x.        |
| "Track applied fixes in the graph"                                     | Graph already tracks `VIOLATES_design` edges (the findings). Re-running detect after align shows the delta — no separate fix-edge needed.           |

## Success criteria

**Apply correctness (10)**

1. T001 codemod replaces exactly the hex literal at the finding's `line:column`, not adjacent hexes
2. T001 codemod uses the token path matching the palette token whose `$value` equals the hex (case-insensitive)
3. T002 codemod replaces font-family string, preserving surrounding quotes (single vs double)
4. T002 codemod handles tokens whose `$value` is an array (picks the first family for primary replacement)
5. T003 codemod replaces only when token `$value` equals the px value exactly (no rounding)
6. T003 codemod preserves the `px` suffix removal — replacement is a token reference, not a string with `px` appended
7. Codemod skips silently when the file changes between detect-time and apply-time
8. Codemod failures produce `FixOutcome.failed` (never throw to caller)
9. Re-running detect-design-drift after align produces strictly fewer T001/T002/T003 findings
10. align is idempotent — running it twice on the same input produces zero additional changes on the second run

**Classifier correctness (8)**

11. Classifier downgrades T001 to suggestion when token import is absent
12. Classifier downgrades T001 to suggestion when hex appears in a template literal (`` `color: ${'#ff0000'}` ``)
13. Classifier downgrades T001 to suggestion when multiple tokens share the same hex value (ambiguity)
14. Classifier downgrades T003 to suggestion when px appears in arithmetic (`16px + 4px`)
15. Classifier always returns suggestion for T004 findings
16. Classifier always returns suggestion for P\* findings (without inspecting source)
17. Classifier recognizes named, default, and CJS token import forms
18. Classifier rules are unit-tested per code with positive AND negative cases

**Pipeline integration (6)**

19. Standalone mode runs `runDetectDrift` internally with the same project root + strictness
20. Pipeline mode reads `pipeline.driftFindings` from `.harness/handoff.json` when present
21. Pipeline mode honors `pipeline.fixBatch` to filter findings to a specific subset
22. Pipeline mode writes `pipeline.fixesApplied` back to handoff.json after the run
23. Standalone mode ignores the pipeline field if it exists (no accidental coupling)
24. Pipeline mode never invokes detect (assumes findings come from orchestrator)

**Convergence loop semantics (4)**

25. `--dry-run` produces identical `FixOutcome` shapes but never writes files
26. `--revert` re-applies the inverse of the most-recent `fixesApplied` batch
27. revert is no-op when the file has been edited externally since the apply
28. Each `applied` outcome includes a structured diff (before/after/line/file) for review

**Composition (3)**

29. `harness align-design-system` exits 0 when at least one suggestion or fix was produced
30. `harness align-design-system` exits 0 even when ALL findings were classified as suggestion (no codemods applied)
31. `--write` is the default for `harness align-design-system`; `--dry-run` is the opt-in safety

**Surface area (3)**

32. New MCP tool `align_design_system` registered in `getToolDefinitions()` (count bumps 71 → 72)
33. CLI commands.md auto-doc lists the new command
34. 4-platform skill markdown (claude-code, codex, cursor, gemini-cli) ships with the PR

## Long-term trajectory

- **v1.x** — Primitive-adoption codemods (DRIFT-P\*). Requires: per-component prop-translation tables in DESIGN.md `## Component Anatomy Overrides` (already partially specified by audit-anatomy), import resolution (alias/barrel/relative), revert-on-test-fail.
- **v1.x** — T001/T002 codemods that add the token import line when missing (driven by config: `design.audit.align.autoImport: true` + per-project import-path declaration).
- **v1.x** — Variant-proliferation fixes (paired with DRIFT-V\* on detect side).
- **v2** — `align-*` family pattern formalized. align-design-system, align-documentation, and future align-code-style share a `Fixer<Finding, Outcome>` interface (parallel to the Verifier interface that gets extracted in v1.5 after detect-design-drift).
- **v2** — `harness check-design --fix` shorthand: composes check-design with align-design-system + align-anatomy + align-craft as the FIX side of the convergence loop, all inside one command.
- **v3** — LLM-mediated suggestions become fixes. The pre-flight classifier hands off "unsafe" findings to an LLM that produces a candidate diff; align verifies the diff and applies. Pairs with craft-pipeline's quality bar.

## Risks + mitigations

| Risk                                                                              | Mitigation                                                                                                                                             |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Codemod corrupts file when token import shape differs from classifier expectation | Pre-flight classifier exits to suggestion if import shape isn't one of three known forms. Conservative bias — false-suggestion >> false-codemod.       |
| Pipeline-mode race: orchestrator writes `pipeline.driftFindings`, align mid-read  | align reads handoff.json atomically (read-once-then-process). Orchestrator's contract is to write the field BEFORE invoking align (mirrors align-doc). |
| revert applies stale inverse when file edited externally                          | Inverse diff includes a content-hash check. Mismatch → skip-with-warning, not silent corruption.                                                       |
| User runs `harness align-design-system --write` without dry-running first         | `--write` IS the default (matches verb expectation), but every applied diff is in the output. Combined with version control, blast radius is bounded.  |
| T003 false-fix when project intentionally uses one-off pixel value                | Exact-match-only rule means non-token px values produce suggestions, not codemods. v1 will under-fix before it over-fixes.                             |
| New token added after a run becomes a "lost fix" opportunity                      | re-running align is idempotent + cheap; orchestrator's loop catches the new token on the next iteration. Standalone users re-run after token edits.    |

## Open questions deferred to implementation

- **Token reference syntax.** Codemods need to write `tokens.color.brand.primary` OR `var(--color-brand-primary)` depending on file context. v1 inspects the file: `.ts`/`.tsx` → `tokens.X.Y`, `.css`/`.scss` → `var(--x-y)`. Implementation chooses based on file extension; spec'd here but not gated on user input.
- **Diff format.** v1 emits inline before/after strings + line number. v2 may emit unified-diff format for CI integration.
- **Revert state location.** v1 writes the last applied batch to `.harness/align/last-batch.json` (gitignored). The revert command reads from there. Single-shot history; multi-step history is v1.x.
  EOF
