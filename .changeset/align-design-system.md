---
'@harness-engineering/cli': minor
---

Add `align-design-system` — the FIX half of design-pipeline sub-project #1, paired with `detect-design-drift` (shipped PR #396).

Consumes `DRIFT-*` findings and produces actual code changes:

- **Auto-applies** safe codemods for **DRIFT-T001 / T002 / T003** — replaces hex / font-family / px-spacing literals with token references where the pre-flight classifier deems the change safe.
- **Emits precise suggestions** for **DRIFT-T004** (deprecated tokens, migration target ambiguous) and all **DRIFT-P\*** (primitive adoption, requires prop-translation work deferred to v1.x).

**Three decisions locked in the spec:**

1. **v1 fix scope** — T001/T002/T003 codemods only. Hex/font/px have unambiguous 1:1 token mappings when a matching token exists. Primitive adoption needs prop-translation tables (`<button>` ⇄ `<Button>` event handlers, ref forwarding, class merging) — substantial design surface deferred to v1.x.
2. **Standalone + pipeline-handoff field** (mirrors `align-documentation`). One implementation, two callers. Standalone mode runs detect-design-drift internally. Pipeline mode reads `pipeline.driftFindings` from `.harness/handoff.json` and writes `pipeline.fixesApplied` back so the (future) #5 orchestrator can re-verify only affected findings.
3. **Pre-flight classifier in align** (not on DriftFinding). Safety logic lives next to fix logic; detect's schema stays stable. Per-finding context inspection — token import present? single string-literal context (vs template/concatenation)? exact-match token value? — decides safe-codemod vs suggestion.

**Surface area:**

- `harness align-design-system` — CLI command. `--dry-run` for preview; `--mode pipeline` for orchestrator integration; standard `--json` / `--verbose` / `--quiet`. Exit code 0 when ≥0 outcomes produced (fix or suggestion); 1 on at least one codemod failure.
- `mcp__harness__align_design_system` — MCP tool. Tool count bumps 71 → 72.
- 4-platform skill markdown shipped (claude-code / codex / cursor / gemini-cli).

**Co-shipped detect-side improvement (DRIFT-T001 widened):**

The original DRIFT-T001 rule only flagged hexes NOT in the palette. align's codemod scope required the opposite — hexes IN the palette but used as raw literals (the most common kind of real-world drift). This PR extends DRIFT-T001 to flag BOTH cases with distinct messages:

- "Hex color X **should use a token reference** instead of a raw literal" (in-palette literal — align can codemod)
- "Hardcoded color X is not in the design token palette" (off-palette literal — suggestion only)

This keeps detect's behavior coherent with align's purpose. Updated detect-side test reflects the new expectation.

**Configuration** (additive, all optional):

The `align-design-system` skill reads the same `design.strictness` + `design.audit.driftDetection.*` blocks as detect. No new config sub-block in v1 — the pre-flight classifier is the only safety knob and it lives in code, not config.

**Long-term trajectory** (documented in the spec):

- v1.x — Primitive-adoption codemods (DRIFT-P\*) with prop-translation tables.
- v1.x — T001/T002 codemods that add the token import line when missing (driven by config).
- v1.5 — `Fixer<Finding, Outcome>` interface extraction (parallel to `Verifier<F>` extraction triggered by detect-design-drift).
- v2 — `harness check-design --fix` shorthand composing check-design with the align family.
- v3 — LLM-mediated suggestions become fixes (pairs with craft-pipeline).

**Test plan:**

- 38 new unit + integration tests across classifier, codemods (T001/T002/T003), and end-to-end (standalone + pipeline + dry-run + idempotency)
- 90 tests pass across all affected suites (detect tests updated for widened T001; check-design 3-verifier tests unchanged)
