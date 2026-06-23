# Plan: canary Skill Wiring (Phase 2)

**Date:** 2026-06-23 | **Spec:** `docs/changes/canary-test-integration/proposal.md` | **Tasks:** 7 | **Integration Tier:** medium

> **Scope:** Phase 2 ("Skill wiring") of the spec, resolved to **1a + 2a**: expose the adapter via a new **MCP tool** (not CLI), and wire **`probe` + `recommendFramework` only** into the test-advisor audit (no `reviewTest` — avoids the D8 static-lint overlap). Phases 3–4 are separate.

## Context (post-#501)

PR #501 (merged, `ca13f034`) added Coverage Audit mode to `harness-test-advisor`, which dispatches canary **plugin** skills (`canary:canary-review-test`, `canary:canary-write-test`, `canary:canary-pick-framework`) generatively, with **no presence check**. Phase 1 (merged, `9bbf0a36`) shipped the `CanaryAdapter` in `@harness-engineering/intelligence`. Phase 2 connects the two: a thin MCP surface so the markdown skill can reach the adapter's deterministic, gracefully-degrading path.

## Observable Truths

1. A new MCP tool `canary_probe` returns the adapter's `CanaryProbe` JSON; total (never errors on absent canary).
2. A new MCP tool `canary_recommend_framework` takes `{ prompt }` and returns the adapter's `FrameworkRecommendation` JSON.
3. Both tools are registered in `server.ts` and assigned a tier in `tool-tiers.ts`; they appear in the tools list.
4. Handlers accept an optional injected adapter (`CanaryAdapter`) so the available-path is unit-testable without a real canary.
5. The test-advisor audit (all 4 platform copies) probes canary first; on `degraded`, it prints an install nudge and continues with reduced output (no hard fail).
6. The audit's GAP REPORT uses `canary_recommend_framework` for framework selection on uncovered/multi-domain files. #501's generative review/write dispatch is unchanged (2a).
7. `agents/skills/tests/harness-test-advisor.test.ts` updated for the new steps; `tests/platform-parity.test.ts` stays green.
8. typecheck + lint + cli/intelligence/skills tests pass; `harness validate` adds no new canary-attributable findings.

## File Map

```
CREATE  packages/cli/src/mcp/tools/canary.ts          (canary_probe + canary_recommend_framework defs + handlers)
CREATE  packages/cli/src/mcp/tools/canary.test.ts      (degraded path + injected-adapter available path)
MODIFY  packages/cli/src/mcp/server.ts                 (import defs/handlers; register in handler map + definitions list)
MODIFY  packages/cli/src/mcp/tool-tiers.ts             (assign tier for the two tools)
MODIFY  agents/skills/{claude-code,cursor,codex,gemini-cli}/harness-test-advisor/SKILL.md  (audit probe + recommend wiring)
MODIFY  agents/skills/tests/harness-test-advisor.test.ts  (contract assertions for the new steps)
```

## Tasks

### Task 1 — MCP tool module (`canary.ts`)

Two definitions (`canary_probe`, `canary_recommend_framework`) + handlers, mirroring `assess-project.ts` shape. Import `createCanaryAdapter` from `@harness-engineering/intelligence`. Handlers: `handleCanaryProbe(input, adapter = createCanaryAdapter())`, `handleCanaryRecommendFramework(input: { prompt }, adapter = ...)`. Return `{ content: [{ type:'text', text: JSON.stringify(result) }] }`. The adapter is total, so handlers don't need try/catch around the call (still sanitize/validate `prompt`). Verify: typecheck.

### Task 2 — Register tools

`server.ts`: import the two defs + handlers; add to the definitions array and the handler map (`canary_probe`, `canary_recommend_framework`). `tool-tiers.ts`: add both to the appropriate tier list (tier 2/advisory, alongside other advisory tools). Verify: typecheck + tools list includes them.

### Task 3 — MCP tool tests (TDD) — `[checkpoint:human-verify]`

`canary.test.ts`: (a) degraded path — default adapter, canary absent → `canary_probe` returns `status: degraded`; `canary_recommend_framework` returns the degraded sentinel; (b) available path — inject a fake `CanaryAdapter` → assert pass-through JSON. **Checkpoint:** after tools pass, confirm tool names/shapes/tier before editing the skill (the skill instructions hard-reference these names).

### Task 4 — Skill wiring (4 platform copies)

In each `harness-test-advisor/SKILL.md` audit section: add a probe step at audit start (degraded → install nudge + reduced audit, no hard fail); in GAP REPORT, use `canary_recommend_framework` for uncovered/multi-domain framework selection. Keep all #501 generative dispatch. Apply identically to claude-code/cursor/codex/gemini-cli. Verify: diff parity across the 4 files.

### Task 5 — Contract tests

Update `agents/skills/tests/harness-test-advisor.test.ts` to assert the probe step and the `canary_recommend_framework` reference; keep existing #501 assertions. Verify: `pnpm vitest run agents/skills/tests/harness-test-advisor.test.ts` + `tests/platform-parity.test.ts`.

### Task 6 — Regenerate artifacts

`pnpm generate:plugin:all` (+ `:check`), barrels/registry if the new tools require it (`generate:barrels:check`). Verify: checks clean.

### Task 7 — Full validation

`pnpm --filter @harness-engineering/cli test`, typecheck, lint; `harness validate`; `tests/platform-parity.test.ts`. Confirm no new canary-attributable findings vs. the documented baseline.

## Uncertainties

- [ASSUMPTION] The 4 platform SKILL.md copies are hand-maintained (no generator writes them). Task 4 edits all four; Task 6's plugin regen + parity test catches drift.
- [ASSUMPTION] `canary_recommend_framework` takes a free-text `prompt` (matches the CLI's `recommend PROMPT`); the skill builds the prompt from the uncovered file's path/domain.
