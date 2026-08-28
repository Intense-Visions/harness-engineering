---
schemaVersion: 1
module: 'packages/cli/src/mcp/middleware'
sourceHash: '97c42675e3e98bbce894e77a193318815d04de497e2dc7af8764c6db978bfb15'
compiledAt: '2026-08-28T01:22:09.241Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['compaction.ts', 'context-budget.ts', 'injection-guard.ts']
---

## Summary

**packages/cli/src/mcp/middleware** provides three layers of middleware wrapping for MCP tool handlers: Compaction (lossless + lossy token reduction with disk spill for large outputs), Context Budget (per-response token enforcement for manual sessions using the same budget primitive as the orchestrator), and Injection Guard (taint detection/prevention). All three are fail-open and driven by tool-specific routing: certain tools (run_skill, emit_interaction, manage_state, manage_roadmap, etc.) use structural-only compaction to preserve behavioral completeness, while others accept lossy truncation. Escape hatches (compact: false, zero budget) disable enforcement; when unconfigured, context-budget is byte-identical no-op.

## Invariants

- Lossless-only tool set is fixed: run_skill, emit_interaction, manage_state, code_unfold, init_project, generate_linter, manage_roadmap, run_persona, and generated-artifact tools are never lossy-truncated because they carry instructions or structured state that must arrive complete
- Spill recovery is opt-in per-result: only large truncated outputs spill to disk; small results within budget return as-is, with recovery locators appended for later grep
- Header tokens are self-accounted: compaction headers include their own token cost in the budget to avoid surprise overruns from the header itself
- Shared budget primitive prevents divergence: manual and orchestrator sessions both use evaluateSessionContextBudget, so token-over-budget decisions never diverge between paths
- Fail-open on all errors: try-catch in every layer means middleware failures never corrupt the response; original handler result is returned
- Escape hatches are respected: compact: false bypasses compaction; undefined/zero maxTokens makes context-budget a no-op (byte-identical)
- Tool names drive pipeline routing: compact tool skips double-wrapping; lossless-only tools skip truncation strategy; different tools get structural-only or structural+truncation pipelines
- Context budget is WARN authority, not reject: over-budget responses append a steer notice toward graph-scoped retrieval (code_outline, code_unfold, find_context_for) but never hard-fail the tool

## Interface Contract

```ts
export applyCompaction
export applyContextBudget
export applyInjectionGuard
export wrapWithCompaction
export wrapWithContextBudget
export wrapWithInjectionGuard
```

## Dependency Slice

```
import { CompactionPipeline, DEFAULT_TOKEN_BUDGET, DESTRUCTIVE_BASH, InjectionFinding, StructuralStrategy, TruncationStrategy, checkTaint, estimateTokens, evaluateSessionContextBudget, scanForInjection, spillIfNeeded, writeTaint } from '@harness-engineering/core'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
```
