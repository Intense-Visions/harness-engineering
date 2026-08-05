# Maintenance checks: a standard machine-parseable findings contract

**Date**: 2026-08-05
**Status**: Implemented
**Issue**: #691
**Packages**: `@harness-engineering/types`, `@harness-engineering/orchestrator`, `@harness-engineering/cli`

## Problem

`harness maintenance run` (and the cron orchestrator that shares its
`TaskRunner`) derives each task's findings COUNT by regex-recovering it from the
free-text output a check subcommand prints:

- `runHarnessCheck` (the shared spawn/parse core) scans stdout for
  `(\d+)\s+(finding|issue|violation|error)`.
- When that misses, `classifyCheckExecutionFailure` applies a second keyword
  heuristic (`explicitFindingsCount`) and, failing that, assumes `1`.

This is fragile:

- Checks like `check-docs` (doc-drift) and `cleanup` (entropy) emit **no clean
  count** in the shape the regex matches. `check-docs` reported a uniform
  "1 finding" via the assume-1 fallback, regardless of how many files were
  actually undocumented.
- Any change to a check's human wording can silently break the count — the same
  class of bug that once made every maintenance row show "1 finding".

## Decision

Introduce **one** shared, machine-readable findings envelope and have the runner
consume it in place of the regex, keeping the regex only as a labeled fallback
for checks not yet migrated.

### The contract (`@harness-engineering/types`)

`packages/types/src/maintenance-findings.ts`:

```ts
interface MaintenanceFindingsContract {
  findings: number; // authoritative, non-negative
  check?: string;   // provenance (e.g. "check-docs")
  v?: number;       // contract version
}
formatFindingsContract(findings, check?): string   // producer (CLI)
parseFindingsContract(output): contract | null      // consumer (runner)
```

It lives in `types` — the one package both the CLI (producer) and the
orchestrator (consumer) already depend on — so the shape cannot drift between
the two. Wire form is a **single JSON line** printed to stdout, e.g.
`{"findings":12,"check":"check-docs","v":1}`. `parseFindingsContract` scans lines
from the last backward, so a trailing envelope is found ahead of human output
and a multi-line pretty-printed `--json` blob (whose lines are fragments, never a
complete `{...}` object) is correctly ignored.

### Runner integration (`@harness-engineering/orchestrator`)

`runHarnessCheck` now tries `parseFindingsContract` first on **both** the
clean-exit and non-zero-exit branches. When an envelope is present it is
authoritative — the count is trusted verbatim and `executionFailed` is false,
regardless of the exit code or surrounding prose. When absent, the legacy
`FINDINGS_RE` regex runs exactly as before. `CheckCommandResult` gains an
optional `findingsSource: 'contract' | 'regex'` so the source is observable and
testable. Because cron and CLI share this core, both benefit identically.

### Producer migration (`@harness-engineering/cli`)

Each migrated check subcommand gains an additive `--findings-json` flag that
appends the standard envelope as a trailing stdout line (human output
unchanged). The built-in maintenance registry passes `--findings-json` in the
`checkCommand` for the migrated tasks — mirroring the established pattern used by
`pulse run --non-interactive`, `compound scan-candidates --non-interactive`, and
`sync-main --json`.

**Migrated (mechanical-ai checks):** `check-arch`, `check-deps`, `check-docs`,
`cleanup`, `check-security`, `cross-check`.

**Left on regex/status fallback (documented):** `traceability` (always exits 0,
coverage-based, no natural fixable-findings integer); the report-only checks
`check-perf`, `predict`, `insights`, `stale-constraints`, `graph scan`; and
`pulse` / `compound`, which already emit the sibling JSON status-line contract
(`candidatesFound`). These can be migrated incrementally later.

## Backward compatibility

Fully additive. `--findings-json` defaults off, so interactive CLI use is
unchanged; unmigrated checks keep the regex path; the envelope parser returns
`null` (→ regex fallback) for any output that does not carry it.

## Tests

- `packages/types/tests/maintenance-findings.test.ts` — format/parse round-trip,
  trailing-line recovery, multi-line-blob rejection, non-numeric `findings`
  rejection, coercion.
- `packages/orchestrator/tests/maintenance/check-runner.test.ts` — the runner
  reads the count from the contract (`findingsSource: 'contract'`) on clean and
  non-zero exits; a wording change ("clean" prose but `findings: 5`) does not
  break the count; regex remains the labeled fallback for an unmigrated check.
- `task-registry.test.ts` / `integration-full-cycle.test.ts` — registry
  `checkCommand`s carry `--findings-json`.
