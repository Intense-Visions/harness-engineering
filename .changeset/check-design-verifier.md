---
'@harness-engineering/cli': minor
'@harness-engineering/graph': minor
---

Add `harness check-design` — single-pass design verifier (design-pipeline sub-project #4).

Mirrors `harness check-docs` exactly. Composes the two design audits shipped in PRs #372 + #390 (audit-component-anatomy + design-craft critique) into one command. Designed to be invoked by the (future) #5 design-pipeline orchestrator inside its convergence fix loop — same pattern harness-docs-pipeline uses to compose check-docs.

**CLI:**

- `harness check-design` — runs both verifiers, aggregates findings, persists to graph
- `--mode fast|full` (default `full`)
- `--files <glob>...` for scoping
- Standard `--json`/`--verbose`/`--quiet`
- Exit codes: 0 = no error-severity findings; 1 = error-severity findings present; 2 = at least one verifier failed (degraded)

**New exports:**

- `runDesignCraft` from `packages/cli/src/mcp/tools/design-craft.ts` — programmatic entry point that returns `Result<DesignCraftOutput, ...>` (unwrapped from the MCP response wrapper). Same contract as `handleDesignCraft`.
- `CraftFindingRecord` type from `@harness-engineering/graph` (was internal to `DesignConstraintAdapter.ts`; needed by check-design to format findings for `recordFindings()`).

**Verifier-shape convention** (NOT extracted as a formal interface in this PR per the spec's "data points reveal shape" principle):

Both invoked audits return `{ findings: F[], summary: { bySeverity, byCode, durationMs, ... }, ... }`. `check-design.ts` notes this convention in a top-of-file comment so the next check-\* author follows the pattern. The `Verifier<F>` interface gets extracted when the **third** check-\* command lands.

**Graceful degradation:** if either verifier throws, the other still runs; failed verifiers surface in `summary.verifiersFailed`; exit code 2 (degraded) instead of crashing.

**Long-term trajectory** (documented in proposal — not in this PR):

- v2 = `harness validate` wraps `check-design --fast` internally (one impl, two surfaces)
- v3 = check-\* commands become facades over graph queries (`harness findings`)
