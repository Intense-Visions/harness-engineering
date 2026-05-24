---
'@harness-engineering/cli': minor
---

Add **design-pipeline orchestrator** — the last unshipped sub-project of the design-pipeline initiative (#5). Closes the initiative end-to-end.

A new `harness-design-pipeline` skill + `harness design-pipeline` CLI command + `run_design_pipeline` MCP tool that composes detect-design-drift, align-design-system, audit-component-anatomy, audit-brand-compliance, and design-craft-elevator into a sequential pipeline with convergence-based remediation.

**Three decisions locked in the spec:**

1. **New `harness-design-pipeline` skill** (mirrors `harness-docs-pipeline`). Keeps `harness check-design` focused on single-pass verification; orchestrator owns the multi-pass loop. Pattern parity with docs-pipeline.
2. **FILL phase does BOTH bootstrap AND craft polish.** (a) Stubs missing DESIGN.md / tokens.json / Component Registry / Brand Rules sections with TODO placeholders (mirrors docs-pipeline's AGENTS.md bootstrap). (b) Invokes design-craft-elevator POLISH for ceiling-layer suggestions.
3. **Generic `VerifierRegistry<F>` consumer.** AUDIT phase iterates a registry of verifiers conforming to the just-extracted `Verifier<F>` interface (PR #399). Adding a 5th rule-based verifier in the future requires only a `register()` call — zero orchestrator changes.

**Six phases:**

| Phase   | Role                                                                                |
| ------- | ----------------------------------------------------------------------------------- |
| FRESHEN | Read-only check: DESIGN.md / tokens.json / Component Registry / Brand Rules / graph |
| DETECT  | Invoke detect-design-drift; populate `context.driftFindings`                        |
| FIX     | Convergence loop (max 5 iterations) with align-design-system — only when `--fix`    |
| AUDIT   | Generic Verifier<F> registry loop (audit-anatomy + audit-brand)                     |
| FILL    | Bootstrap missing inputs + invoke design-craft-elevator POLISH                      |
| REPORT  | Compute `pass`/`warn`/`fail` verdict; aggregate summary                             |

**Iron Law (per harness-docs-pipeline):** the orchestrator DELEGATES, never reimplements. If you find yourself writing drift detection, fix application, or audit logic inside the orchestrator, STOP — delegate to the dedicated sub-skill. Tests enforce this: orchestrator imports only sub-skill entry points (no rule logic).

**Surface area:**

- `harness design-pipeline` CLI command (`--fix`, `--no-freshen`, `--no-fill`, `--ci`, `--mode`, `--files`, `--design-strictness`, `--json`)
- `run_design_pipeline` MCP tool (count 73 → 74)
- 4-platform skill markdown (claude-code / codex / cursor / gemini-cli)
- `DesignPipelineContext` carried across phases via `.harness/handoff.json` `pipeline` field (align-design-system v1 already supports this protocol)
- `VerifierRegistry` class generalizing Verifier<F> consumption

**Verdict computation:**

- `pass` — zero findings, zero suggestions, zero bootstrapped
- `warn` — any warn-severity finding OR craft suggestion OR bootstrapped any input
- `fail` — any error-severity finding remains after FIX

Exit codes: 0 (pass/warn), 1 (fail), 2 (pipeline crashed with all verifiers down).

**Convergence loop:** bounded at 5 iterations (matches docs-pipeline). Stops when align applies 0 fixes (converged) or when total drift count fails to decrease (no progress).

**Tests:** 28 new tests across registry, phase implementations (freshen, fill, report), and end-to-end integration (empty project bootstrap, clean project pass, drift project fail, `--no-freshen` / `--no-fill` flag behavior, verifiersRun list). 818 tests pass across the cli suite. Smoke-tested end-to-end: detect+anatomy+brand+craft all fire correctly on a fixture project; verdict and per-phase counts surface as expected.

**Long-term trajectory** (documented in spec):

- v1.x — `--interactive` mode (terminal sessions with diff preview + per-fix approval); `--phase` flag to run a specific phase in isolation; `--persist` flag to write findings to `.harness/graph/`; `--watch` for development; per-phase telemetry via Hermes.
- v2 — `align-brand-compliance` + `align-anatomy` FIX skills compose into the FIX phase loop alongside align-design-system; cross-orchestrator composition with craft-pipeline.
- v3 — graph-as-source-of-truth: orchestrator becomes a graph-query facade.

**Design-pipeline initiative state after merge: COMPLETE.** All 6 sub-projects shipped (#0 brand-guidelines ADR, #1 detect+align, #2 anatomy, #3 brand, #4 check-design verifier, #5 this orchestrator, #6 design-craft). Floor + ceiling + orchestrator end-to-end.
