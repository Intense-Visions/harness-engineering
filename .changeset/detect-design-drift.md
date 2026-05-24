---
'@harness-engineering/cli': minor
---

Add `detect-design-drift` — design-system drift verifier (design-pipeline sub-project #1, detect half).

Floor-layer rule-based skill. Scans the project for two families of drift, reports findings, never modifies source. The matching fixer (align-design-system) is intentionally a separate sub-project so detect can ship first and stay testable in isolation.

**Two rule families (gated independently via config):**

- **DRIFT-T\* — token bypass.** Regex-based detection against `design-system/tokens.json` (W3C DTCG format).
  - DRIFT-T001 — hex color literal outside the loaded palette
  - DRIFT-T002 — font-family string outside the typography palette (system fallbacks always allowed)
  - DRIFT-T003 — pixel margin/padding/gap value outside the spacing scale (skipped when no spacing tokens)
  - DRIFT-T004 — reference to a `$deprecated: true` token (or `$extensions.harness.deprecated: true`), in both string-literal and CSS-var-kebab forms

- **DRIFT-P\* — primitive adoption.** TS Compiler API JSX parsing against `design-system/DESIGN.md` `## Component Registry`.
  - DRIFT-P001 — raw `<button>` where `Button` is registered
  - DRIFT-P002 — raw `<input>` where `Input` is registered
  - DRIFT-P003 — raw `<a>` where `Link` or `Anchor` is registered
  - DRIFT-P004 — raw `<textarea>` where `Textarea` is registered

**Soft-dependency design.** Either resolver returning `null` (`tokens.json` absent, or DESIGN.md without a `## Component Registry` section) is not a failure — the matching rule family silently skips. Projects that haven't opted in see zero false positives.

**Surfaces:**

- `harness validate` — fast-mode hook (gated by `design.audit.driftDetection.enabled`, default `true`). Degrades gracefully on verifier failure (single warning, other checks continue).
- `harness check-design` — third composed verifier alongside audit-component-anatomy and design-craft critique. Findings flow into `DesignConstraintAdapter.recordFindings()` for idempotent graph persistence.
- `mcp__harness__detect_drift` — MCP tool. Input: `{ path, mode, files?, designStrictness?, rules? }`. Output: `{ findings, summary, catalog, meta }`. Consumed by the (future) #5 design-pipeline orchestrator.

**Severity model.** Mirrors audit-anatomy. `design.strictness: strict` → every finding `error`; `standard` → T001/T002/P001 `error`, rest `warn`; `permissive` → everything `info`.

**Config additions** (all optional — block-omission yields built-in defaults):

```json
{
  "design": {
    "audit": {
      "driftDetection": {
        "enabled": true,
        "rules": { "tokenBypass": true, "primitiveAdoption": true },
        "fastMode": { "maxFiles": 500 }
      }
    }
  }
}
```

**Verifier-shape convention** — third invoker of the `{ findings, summary, catalog, meta }` shape (per `check-design-verifier` changeset note). The `Verifier<F>` interface extraction trigger is now met; deferred to a follow-on PR so this ship stays focused.

**Long-term trajectory** (documented in proposal — not in this PR): primitive-adoption subsumes legacy DESIGN-001/002 in v1.x; align-design-system ships as a sibling sub-project; pluggable resolver interface supports projects that ship non-DTCG token formats.
