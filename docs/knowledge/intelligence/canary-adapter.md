---
type: business_concept
domain: intelligence
tags:
  [intelligence, adapter, canary, test-automation, graceful-degradation, optional-dependency, mcp]
---

# Canary Adapter

The canary adapter (`packages/intelligence/src/adapters/canary.ts`) is a total, gracefully-degrading boundary around the deterministic [canary](https://github.com/bop-clocktower/canary) test CLI (`canary-test-cli`, an `optionalDependency`). It is the reference implementation of the pattern in ADR-0039: external tools from a foreign ecosystem are integrated as an optional adapter that never throws on absence.

## Surface

`createCanaryAdapter(exec?, reader?)` returns an adapter with five total methods:

- `probe()` → `{ status: 'available' | 'degraded', version?, reason? }`. Classifies absence as `not-installed` (ENOENT), `binary-missing` (launcher present but the native binary was never downloaded — postinstall skipped, offline, or unsupported platform), `exec-failed`, or `bad-output`.
- `recommendFramework(prompt)` → zod-validated `FrameworkRecommendation` (`canary recommend --json`); a `degraded` sentinel when unavailable.
- `reviewTest(path, framework?)` → zod-validated `CanaryFinding[]` (`canary review-test --json`); `[]` when unavailable.
- `listFrameworks()` → zod-validated `CanaryFrameworkInfo[]` (`canary frameworks --json`); `[]` when unavailable or malformed. The live CLI returns the detail objects directly under the top-level `frameworks` key (there is no separate `details[]` key), so the adapter parses `frameworks` and tolerates extra keys (`category`, `capabilities`, …). The pure `resolveTestCommand(fw, file, { ci? })` helper fills `{file}`, appends `ci_flags` under CI, and returns `null` for null or non-`{file}` commands (catalog-tier and `{target}`-only scanners are not per-file test commands).
- `readRunHistory(opts?)` → zod-validated `CanaryRunRecord[]` read from canary's documented NDJSON store (`test-results/reports/history-v2.jsonl`) under `opts.cwd`; `[]` when the file is missing, unreadable, or every line is malformed (a single bad line is dropped, valid records kept). Optional `opts.limit` caps the most-recent records returned.

The adapter has **two injectable acquisition seams**: the process-spawning `CanaryExec` (for the `--json` CLI subcommands above) and a file-reading `CanaryReader` (for `readRunHistory`). Both keep the degradation taxonomy unit-testable without a real canary install. `execFile` is called with an args array (no shell interpolation) and bounded by a timeout so a hung CLI degrades rather than blocking. Reading the documented on-disk artifact — rather than execing a (non-existent) history CLI verb — is the acquisition choice recorded in ADR-0086, which extends the ADR-0039 boundary from "exec-only" to "exec or documented-artifact read".

Run history is consumed downstream by the knowledge graph (`CanaryResultsIngestor` writes `test_result` nodes + `tested_by`/`failed_in` edges) and by outcome-eval (a canary run's gate exit code + pass/fail/flaky counts fold into the verdict rationale and the `execution_outcome` node metadata). The graph package never imports canary — the CLI layer reads via this adapter and passes plain records in.

## Two surfaces, deliberately separated

canary exposes a **deterministic CLI** (`recommend`, `review-test`, no API key) and a set of **generative Claude Code plugin skills** (`canary:canary-write-test`, `canary:canary-review-test`, `canary:canary-pick-framework`). The adapter wraps only the deterministic CLI. Test generation and generative critique stay on the plugin-dispatch path. canary's static `review-test` overlaps harness's own linters, so it is intentionally **not** wired into the Coverage Audit (D8).

## How skills reach it

Markdown skills cannot import the adapter, so it is exposed via two MCP tools in the CLI — `canary_probe` and `canary_recommend_framework`. The `harness-test-advisor` Coverage Audit calls `canary_probe` first (Audit Phase 0) and degrades with an install nudge when canary is absent, then uses `canary_recommend_framework` for deterministic framework selection on uncovered files.

`harness-verify` DETECT reaches the registry through a third MCP tool, `canary_discover_test_command` (`{ files?, ci? }`): it probes, matches each file against a framework by longest file-extension suffix (preferring preferred-status / full-tier, then registry order on ties), resolves the per-file test command, and returns `{ status, frameworks: [{ name, command, matchedFiles }] }`. DETECT uses it as registry truth for the **test** command and falls back to `package.json`/`Makefile` heuristics when it degrades. `harness-tdd` RED reuses the existing `canary_probe` and `canary_recommend_framework` tools plus the generative `/canary-write-test` plugin skill (detect-and-offer / B'); it adds no new adapter method.

## One capability = one method + one tool

Every new canary capability is added as exactly **one total adapter method plus one thin MCP tool** — never a new integration pattern. `listFrameworks()` + `canary_discover_test_command` and `readRunHistory()` + `canary_run_history` both follow the same shape as `probe`/`recommendFramework` and their tools. `readRunHistory` additionally proves the boundary generalizes beyond `execFile`: it acquires canary's output by reading the documented NDJSON artifact through an injectable `CanaryReader` seam (ADR-0086), while keeping the one-method-one-tool invariant. The boundary stays read-only: tools return resolved data; any resolved command is executed only by the calling skill's own EXECUTE phase, never inside the adapter or tool.

## Related

- ADR-0039 — the cross-ecosystem optional-adapter pattern this implements.
- [[failure-modes]] — the broader intelligence-layer graceful-degradation philosophy.
