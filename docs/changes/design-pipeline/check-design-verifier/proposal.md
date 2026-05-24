# check-design verifier

> Single-pass deep design check that composes the design audits (audit-component-anatomy + design-craft critique) into one command. Mirrors `harness check-docs` exactly. The (future) design-pipeline orchestrator (#5) composes this in its convergence fix loop.

## Overview

**Project:** check-design verifier
**Initiative:** design-pipeline (sub-project #4 of 6)
**Date:** 2026-05-24
**Estimated effort:** ~3 days, single PR

### Goals

1. **Single-pass deep design check.** New `harness check-design` CLI command composing the design audits shipped in #372 + #390 (audit-anatomy + design-craft critique). Exit code 0 on no error-severity findings; 1 otherwise.
2. **Mirror `harness check-docs` exactly.** Peer command pattern; same `--json`/`--verbose`/`--quiet` flag set; same exit-code semantics. New users learn one pattern, not two.
3. **Compose by direct programmatic invocation** — `runAudit` (anatomy) and `handleDesignCraft` (critique) imported directly from `packages/cli/src/mcp/tools/`. No skill shellouts; no MCP indirection.
4. **Persist findings to graph** via the `DesignConstraintAdapter.recordFindings()` entry point shipped in #390. Idempotent — re-running the command produces no duplicate edges.
5. **Composable by the (future) #5 orchestrator.** check-design becomes the single-pass primitive that #5's convergence-loop SKILL invokes between fix batches (matches harness-docs-pipeline → check-docs pattern).
6. **Establish the "Verifier-shape" convention without formalizing the interface yet.** Both invoked audits already return `{ findings, summary, ... }`. check-design.ts notes this convention in a comment; the interface itself is extracted on the **3rd check-\* command** (when the shape has three data points, not two).

### Non-Goals

- **Convergence loop.** Lives in #5 design-pipeline orchestrator (mirrors harness-docs-pipeline which owns the loop, not check-docs).
- **Fix application.** Lives in align-\* skills (none exist yet for design; future #1 align-design-system is the first).
- **DesignConstraintAdapter.checkAll integration** (legacy `DESIGN-*` codes for hardcoded colors/fonts). That belongs to #1 detect-design-drift's domain. When #1 ships, it brings those checks under its Verifier and adds itself to check-design's compose list.
- **Skill shellouts to `harness-design` REVIEW or `harness-design-system` validation.** Existing markdown skills aren't designed for programmatic output. Defer to its own brainstorm.
- **Watch mode / live verification.** Belongs to the v3 terminal architecture (graph-as-source-of-truth, commands as facades).
- **`--fix` or `--converge` flag.** Mixes check and fix responsibilities; matches check-docs precedent (which has no --fix).
- **Verifier interface extraction.** Defer to the 3rd check-\* command per the "data points reveal shape" principle. v1 just uses the shape conventionally; v1.5 (~3rd command) formalizes.

### Keywords

`check-design`, `verifier`, `single-pass`, `convergence-loop-primitive`, `verifier-shape`, `design-pipeline`, `audit-composition`, `graph-persistence`, `check-docs-mirror`

---

## Decisions

| #   | Decision              | Choice                                                                                                                  | Rationale                                                                                                                                                                                                                                                                                     |
| --- | --------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Surface               | **A** — new `harness check-design` CLI command (peer to `check-docs`); Verifier-shape convention noted in code comments | Mirrors check-docs precedent exactly; preserves the just-shipped validate fast-mode hook (PR #390) without rework; clean composition story for #5 orchestrator. **Long-term trajectory:** v2 = validate wraps check-design internally; v3 = all check-\* commands become graph-query facades. |
| 2   | Audits composed in v1 | **A** — minimum: audit-anatomy + design-craft critique only                                                             | Both already Verifier-shaped from PR #390. When #1 detect-design-drift and #3 audit-brand-compliance ship, they're 5-line additions to check-design.ts. Avoids premature inclusion of #1's domain (DesignConstraintAdapter.checkAll legacy DESIGN-\* codes).                                  |
| 3   | Convergence loop      | **A** — single-pass only (loop lives in #5 orchestrator)                                                                | Matches check-docs precedent exactly; clean separation of concerns (check ≠ fix); users wanting fix loops invoke the orchestrator skill or align skills directly. `--converge` is a confused responsibility that would need to know about align skills (none exist for design yet).           |

### Rationalizations rejected

| Rationalization                                                                  | Why rejected                                                                                                                                                    |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Extend `harness validate` with `--design-deep` instead of a new command"        | Validate becomes the kitchen sink; convergence-loop composition by #5 means passing validate flags around (awkward); conflates project-health with deep-verify. |
| "Move fast-mode anatomy out of validate into check-design --fast (undo PR #390)" | Wastes coordination work just shipped; existing validate workflows lose auto-anatomy; CI gates would need migration.                                            |
| "Include skill-shellouts to harness-design + harness-design-system in v1"        | Introduces skill-shellout pattern (non-trivial); existing skills aren't designed for programmatic output; deserves its own brainstorm.                          |
| "Build the Verifier interface formally in v1"                                    | Premature abstraction with only 2 data points (anatomy, craft). Extract on the 3rd check-\* command; v1.5 refactor is small.                                    |
| "Ship `--converge` flag in check-design that wraps fix loops"                    | Verifier responsibility creep (check ≠ fix); would need to know about align skills that don't exist yet; #5 orchestrator is the right home.                     |

---

## Technical Design

### File layout

```
packages/cli/src/commands/check-design.ts          # new (~300 LOC)
packages/cli/tests/commands/check-design.test.ts   # new (mocked verifiers)
packages/cli/src/index.ts                          # MODIFIED — register command
```

### Public interface

```ts
// packages/cli/src/commands/check-design.ts

interface CheckDesignOptions {
  cwd?: string;
  configPath?: string;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  files?: string[]; // optional file/glob scoping
  mode?: 'fast' | 'full'; // default 'full' (deep)
}

interface CheckDesignResult {
  valid: boolean; // false if any error-severity finding
  findingsByVerifier: {
    anatomy: AnatomyFinding[];
    craft: CraftFinding[];
  };
  summary: {
    totalFindings: number;
    bySeverity: Record<'error' | 'warn' | 'info', number>;
    byCode: Record<string, number>;
    verifiersRun: string[]; // ['audit-anatomy', 'design-craft-critique']
    durationMs: number;
  };
  graphPersisted: {
    constraintsAdded: number;
    edgesAdded: number;
  };
}

export async function runCheckDesign(
  options: CheckDesignOptions
): Promise<Result<CheckDesignResult, CLIError>>;

export function createCheckDesignCommand(): Command;
```

### Verifier composition

Direct programmatic invocation — no skill runner, no MCP indirection:

```ts
import { runAudit as runAnatomyAudit } from '../mcp/tools/audit-anatomy';
import { handleDesignCraft } from '../mcp/tools/design-craft';
import { DesignConstraintAdapter, type CraftFindingRecord } from '@harness-engineering/graph';

// inside runCheckDesign():
const anatomyOut = await runAnatomyAudit({ path: cwd, mode, files });
const craftOut = await handleDesignCraft({ path: cwd, mode, phases: ['critique'], files });

const allFindings: CraftFindingRecord[] = [
  ...anatomyOut.findings.map(toRecord),
  ...craftOut.findings.map(toRecord),
];

const adapter = new DesignConstraintAdapter(graphStore);
const graphPersisted = adapter.recordFindings(allFindings);
```

Anatomy first, craft second — deterministic order matters for stable diffs in convergence loops.

### Output formats

**Text (default):**

```
check-design — design-pipeline verifier

audit-anatomy (1 finding)
  src/Button.tsx
    ANAT-D001 [error]    line 14: Button missing required slot: content
                         fix: Add a `children` prop or rename existing prop

design-craft critique (0 findings)

────────────────────────────────────────
1 finding (1 error, 0 warn, 0 info)
Graph: +1 constraint, +1 edge
```

**JSON (`--json`):** full `CheckDesignResult` dumped to stdout.

### Exit codes

| Condition                              | Exit code                         |
| -------------------------------------- | --------------------------------- |
| No findings                            | 0                                 |
| Findings but no `severity: error`      | 0                                 |
| One or more `severity: error` findings | 1                                 |
| Verifier throws an exception           | 2 (operational failure; degraded) |
| Config load failure                    | 2                                 |

### Graceful degradation

If either verifier throws, log a warning and continue with the other verifier's findings. Set `summary.verifiersRun` to only the successful ones. Exit code 2 (degraded). Mirrors the pattern shipped in `runValidate` for the anatomy hook.

### Long-term Verifier-shape convention (not extracted in v1)

A comment at the top of `check-design.ts` documents the shape both invoked verifiers happen to return:

```ts
// CONVENTION (informal, extract to interface on the 3rd check-* command):
//
//   Verifier output:
//     { findings: F[],
//       summary: { ..., bySeverity, byCode, durationMs },
//       ... }
//
// Both runAnatomyAudit and handleDesignCraft already return this shape.
// When check-craft or check-arch lands as the 3rd composer command,
// extract a Verifier<F> interface and have all three implement it.
```

This is the only "interface" investment in v1. No premature abstraction.

---

## Integration Points

### Entry Points

| Kind                 | Path                                                                | New / Modified |
| -------------------- | ------------------------------------------------------------------- | -------------- |
| CLI command          | `harness check-design`                                              | NEW            |
| Exported function    | `runCheckDesign()` from `packages/cli/src/commands/check-design.ts` | NEW            |
| Command registration | `packages/cli/src/index.ts` (commander root)                        | MODIFIED       |

### Registrations Required

1. **Commander registration** in `index.ts` — single line: `program.addCommand(createCheckDesignCommand())`.
2. **Update test fixtures** that count commands (if any — `tests/commands/cli-list.test.ts` or similar).
3. **No MCP tool wrapping** in v1 — check-design is a CLI command. If #5 orchestrator or other agents need programmatic access, they invoke `runCheckDesign()` directly via import OR shell out (`exec('harness check-design --json')`).

### Documentation Updates

| Doc                                          | Update                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| `AGENTS.md`                                  | Add `check-design` to the check-\* commands list                          |
| `docs/reference/cli-commands.md`             | Auto-regenerated by `pnpm generate-docs`                                  |
| `docs/changes/design-pipeline/REFERENCES.md` | Mark sub-project #4 status (in-progress → done) when implementation lands |

### Architectural Decisions

**None warranted.** Per ADR 0001 (tiered integration rigor), small tier-changes don't need new ADRs. The relevant architectural patterns are already codified:

- ADR 0018 (LLM-judgment skill pattern) — design-craft side
- ADR 0019 (3-axis output model) — design-craft findings
- ADR 0020 (living catalog H pattern) — both audits' catalogs

The Verifier-shape convention is documented inline in `check-design.ts` (not as an ADR — it's a code convention, not an architectural decision until extraction).

### Knowledge Impact

**Graph state:** no new node/edge types. check-design composes verifiers that already persist `VIOLATES_design` edges via `recordFindings()`. check-design only AGGREGATES; the persistence layer is unchanged.

**Knowledge entries (optional):** `docs/knowledge/design/check-design-pattern.md` could document the check-\* composition pattern for future check-craft / check-arch authors. Defer to the 3rd check-\* command when the pattern has three instances to reference.

---

## Success Criteria

### Functional

1. `harness check-design` runs to completion on a fixture project with zero design issues → exit 0; output reports "0 findings".
2. `harness check-design` on a fixture with an error-severity finding → exit 1; output shows the finding under its verifier's section with code/line/severity/message/fix-hint.
3. `harness check-design --json` emits the documented `CheckDesignResult` shape.
4. Anatomy findings appear before craft findings (deterministic order for diff stability).
5. Mixed severities (error + warn + info) all surface in output; exit code reflects only error severities.
6. Findings persist to graph: after a run, `store.getEdges({ from: <file>, to: design_constraint:<CODE>, type: 'violates_design' })` returns the recorded edge.
7. Re-running on the same fixture produces no duplicate graph edges (idempotency via `recordFindings()`'s built-in dedup).
8. If `runAnatomyAudit` throws, `handleDesignCraft` still runs; warning logged; exit code 2; `summary.verifiersRun` excludes the failed one.
9. If `handleDesignCraft` throws, anatomy findings still surface; same graceful-degradation pattern.

### CLI integration

10. `harness check-design --help` documents `--json`, `--verbose`, `--quiet`, `--files`, `--mode`.
11. `harness --help` lists `check-design` under available commands.
12. `pnpm generate-docs` produces an entry for `check-design` in `docs/reference/cli-commands.md`.

### Test coverage

13. Vitest spec with mocked verifiers covers SC 1-9.
14. Test runs in < 1 second (verifier mocks are synchronous).
15. CLI suite (`pnpm --filter @harness-engineering/cli test:coverage`) passes.

### Build + validate

16. `pnpm typecheck` clean.
17. `harness validate` clean (no new broken links or coverage regressions).
18. `pnpm --filter @harness-engineering/graph test:coverage` clean (no regressions from check-design's recordFindings calls).

### Negative criteria

19. **No `--fix` or `--converge` flag.** Verifier responsibility creep prevented.
20. **No new MCP tool.** check-design is CLI-only in v1. (`runCheckDesign` is exportable for programmatic use; MCP-wrapping is a separate decision when an agent needs it.)
21. **No Verifier interface extraction.** Defer to 3rd check-\* command.
22. **No skill shellouts.** No invocation of harness-design REVIEW or harness-design-system via skill runner. Direct imports only.

---

## Implementation Order

Single PR end-to-end (~3 days). All phases low complexity — none require sub-spike or human-verify checkpoints.

### Phase 1: Command shell <!-- complexity: low -->

(~0.5 day)

**Deliverables:**

- `packages/cli/src/commands/check-design.ts` skeleton with `CheckDesignOptions`, `CheckDesignResult`, `createCheckDesignCommand()` factory, and `runCheckDesign()` stub returning `Ok({ valid: true, ... empty result })`.
- Wire into `packages/cli/src/index.ts` via `program.addCommand(createCheckDesignCommand())`.
- `resolveConfig` loader call (mirrors check-docs.ts).

**Exit criteria:**

- `harness check-design` runs and reports "0 findings" (stub).
- Help text shows the command.
- typecheck clean.

### Phase 2: Verifier composition + graph persist <!-- complexity: low -->

(~1 day)

**Deliverables:**

- Import + invoke `runAnatomyAudit` and `handleDesignCraft`.
- Aggregate findings into `CheckDesignResult.findingsByVerifier`.
- Compute `summary` (totalFindings, bySeverity, byCode, verifiersRun, durationMs).
- Map findings to `CraftFindingRecord[]` and call `adapter.recordFindings()`.
- Populate `result.graphPersisted` from the return value.
- Set exit code based on `summary.bySeverity.error`.

**Exit criteria:**

- Running against a fixture with anatomy/craft issues produces correct counts.
- Graph state populated (verify via getEdges in test).

### Phase 3: Output formatting <!-- complexity: low -->

(~0.5 day)

**Deliverables:**

- Text formatter: grouped by verifier, then by file; colored severity using existing `OutputFormatter`.
- JSON formatter: dump full `CheckDesignResult`.
- `--verbose` adds fix-hint and evidence to text output.
- `--quiet` suppresses everything except errors + final exit code.

**Exit criteria:**

- All three modes (default, --json, --verbose, --quiet) produce expected output for fixture inputs.

### Phase 4: Tests + docs <!-- complexity: low -->

(~1 day)

**Deliverables:**

- `packages/cli/tests/commands/check-design.test.ts` covering SC 1-9 with mocked verifiers.
- `pnpm generate-docs` to refresh `cli-commands.md`.
- AGENTS.md mention.
- Changeset entry (`@harness-engineering/cli`: minor — new command).

**Exit criteria:**

- All success criteria 1-22 pass.
- CLI suite green (3260+ tests including new ones).
- `harness validate` clean.
- PR ready for merge.

---

## Migration path (post-v1)

Documented for future reference; not in scope for this spec:

- **v1.5** — Third check-\* command lands (likely `check-craft` once craft-pipeline naming-craft or docs-craft ships its first verifier). At that point, extract a `Verifier<F>` interface; have anatomy, craft, and the new third command implement it. Pure refactor; no behavior change.
- **v2** — Migrate `harness validate` to call `runCheckDesign({ mode: 'fast' })` instead of calling `runAudit` directly. validate's fast-mode hook becomes a thin wrapper. Removes one level of duplication.
- **v3** — Convert check-\* commands to graph-query facades. Findings persist to graph (already the case); commands query active VIOLATES\_\* edges rather than re-running audits. `harness verify [scope]` invokes the audits; `harness check-design` becomes an alias for `harness findings --domain design`. Aligns with the terminal architecture documented in the Q1 long-term lens.
