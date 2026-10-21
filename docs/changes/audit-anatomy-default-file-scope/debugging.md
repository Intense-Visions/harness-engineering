# Debug Session: audit_anatomy audits zero files by default

Status: resolved
Started: 2026-09-24
Resolved: 2026-09-24
Issue: #2070
Base SHA: b62f51d71863bbb5f45a5b666cd23d16925924f7

Error: No exception — a SILENT wrong-answer defect. `audit_anatomy` /
`harness check-design` reported `audit-anatomy (0 findings)` with
`summary.totalFiles === 0` whenever the caller omitted `files`, while the
published CLI contract for `-f, --files` says "Defaults to all project source
files." A clean report was emitted for an audit that never read a byte.

## Investigation Log

### Phase 1 — INVESTIGATE

- Entropy analysis (`harness cleanup`, exit 1): doc-drift and dead-code findings
  only, none within `packages/cli/src/mcp/tools/` or `packages/cli/src/audit/`.
  Nothing near the failure site; consistent with this check's known false-positive
  rate. No contribution to the diagnosis.
- Read the defect precisely: there is no stack trace to read, so "read the error"
  became "read the contract". `check-design.ts:446-447` documents the default as
  all project source files; `audit-anatomy.ts:102` implements it as `[]`.
- Reproduced consistently (3/3 runs, identical output), directly against source:
  DEFAULT runAudit({ path: <repo>, mode: 'full' }) -> totalFiles=0 findings=0
  CONTROL runAudit({ path: <repo>, mode: 'full', files: [192 .tsx] }) -> totalFiles=192 findings=88
  The issue reported 103 files / 32 findings against an older tree; the control
  set has simply grown. The DEFAULT half reproduces exactly.
- Recent changes: not a regression. `git log -L 102,102` dates the line to
  458454f50 (2026-05-23), the commit that first added the file. The verifier has
  never audited anything by default.
- Data flow traced backward from the empty summary:
  `check-design.ts:96-101` spreads `files` only when defined -> `runAudit` receives
  `files: undefined` -> `input.files ?? []` -> the `for (const candidatePath of
candidateFiles)` loop body never executes -> `totalFiles` stays 0, `findings`
  stays empty -> `buildSummary` renders a clean audit.
- Blast radius: three other call sites omit `files` too —
  `commands/validate.ts:538` (fast mode), `design-pipeline/phases/audit.ts`, and
  the MCP handler. All four have been reporting clean anatomy audits.

### Phase 2 — ANALYZE

- Working example #1: `drift/index.ts:206` `collectFiles(projectRoot,
explicitFiles, excludePatterns)` — honours an explicit list (bypassing excludes,
  deliberately) and otherwise walks the project root, filtered by
  `design.exclude` union `analysis.exclude`.
- Working example #2: `brand/index.ts:165` `collectFiles(projectRoot,
explicitFiles)` — the same walk, byte for byte, minus the exclude filter.
- Difference: audit-anatomy is the only one of the three mechanical check-design
  verifiers with no file-collection step at all. It is not a wrong walk; it is a
  missing one.
- The duplication is itself the pattern: `DEFAULT_GLOB_EXTENSIONS` and `walk` are
  copy-pasted between drift and brand (and a third, divergent copy lives in
  naming-craft with a shorter extension list). `packages/core/src/security/
scan-targets.ts` exists in this repo for exactly this reason — three copy-pasted
  security globs that had already drifted apart — and its header states the rule:
  a missing extension is a silent hole, never a conservative default.

## Hypotheses

**H1 (confirmed).** The failure is caused solely by `input.files ?? []` at
`audit-anatomy.ts:102`. If correct, substituting the drift-style project walk for
that one expression — changing nothing else — makes the default run report a
non-zero `totalFiles` and non-zero findings.

Test: one variable. Replaced the defaulting expression, re-ran the same repro
script. Result: `totalFiles=0 findings=0` -> `totalFiles=4121 findings=3083`.
Confirmed.

No rejected hypotheses; the defect was a single-expression cause.

## Resolution

Root cause: `runAudit` had no file-collection step. It treated "no scope given"
as "audit nothing" and rendered that empty run through the normal summary path,
which cannot distinguish "found nothing" from "looked at nothing".

Fix:

1. Extracted `packages/cli/src/shared/design-scan-targets.ts` —
   `DESIGN_SCAN_EXTENSIONS`, `collectDesignScanFiles`, and
   `resolveDesignExcludePatterns` — following the `scan-targets.ts` precedent.
2. Wired audit-anatomy, detect-drift and audit-brand to it, deleting the two
   duplicated walks. All three verifiers in a `check-design` run now resolve the
   same file set (pinned by a test).
3. Added a zero-file abstention: a resolved scope of zero files throws rather
   than returning a clean result. check-design records it under `verifiersFailed`
   and exits 2 (degraded).

Regression test:
`packages/cli/tests/audit/component-anatomy/integration/default-file-scope.test.ts`
Supporting: `packages/cli/tests/shared/design-scan-targets.test.ts`

Revert-and-fail protocol: with the fix reverted, 3 of the 5 regression assertions
fail (default scope, exclude honouring, abstention). With it restored, 5 of 5
pass. The 2 that pass either way are the omitted-vs-empty consistency assertions,
which are trivially true at zero.

Learnings:

- A summary that reports `totalFiles: 0` alongside `findings: []` cannot tell a
  clean audit from an audit that never ran. Any scanner whose denominator can be
  zero needs an explicit abstention, not a shared success path — the same lesson
  already written down in output/formatter.ts and roadmap/sync-verdict.ts.
- `harness cleanup` contributed nothing here, and would not: entropy analysis
  finds code that looks wrong. This code looked entirely reasonable. The defect
  was only visible by reading the published contract next to the implementation.
- A comment in commands/validate.ts already described this verifier as "a no-op
  in validate today" and routed around it. The defect was observed, written down,
  and not filed. Worth treating a parenthetical like that as a bug report.
