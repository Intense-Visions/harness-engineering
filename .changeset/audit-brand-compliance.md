---
'@harness-engineering/cli': minor
---

Add `audit-brand-compliance` — rule-based brand-semantics audit (design-pipeline sub-project #3). The last unshipped floor-layer audit; closes the floor layer and unblocks #5 design-pipeline orchestrator.

**Two rule families in v1 (narrow + deep):**

- **BRAND-T001 (token misuse)** — flags tokens used in contexts declared as `forbidden_contexts` in `$extensions.harness.brand`. Recognizes three reference forms: `tokens.X.Y.Z`, `var(--X-Y-Z)`, and `'X.Y.Z'` string literals. Context inference v1 uses same-line + adjacent-non-blank-line vocabulary scan against `cta` / `selection` / `focus` / `data-visualization` / `decorative` / `background` / `text` / `border` / `error` / `success` / `warning`.
- **BRAND-V001 (forbidden phrases)** — TS Compiler API walk over `.tsx`/`.jsx` files. Scans `JsxText` nodes and string-typed `JsxAttribute` initializers for case-insensitive substring matches against `voice.forbiddenPhrases` from `DESIGN.md ## Brand Rules`.

**Three decisions locked in the spec:**

1. **v1 rule scope:** BRAND-T\* + BRAND-V001 only. Defers tone-by-context (needs component-state inference), reading-level / sentence-length (ship with tone-context), asset rules (image-tag + filesystem), and semantic-token-alias enforcement (overlaps with detect-drift T001) to v1.x.
2. **Input sources:** Both `DESIGN.md ## Brand Rules` AND `tokens.json $extensions.harness.brand`. Per ADR 0028. Either resolver returning null silently skips the matching rule family.
3. **check-design composition:** 4th verifier (triggers `Verifier<F>` interface extraction).

**Cross-cutting: Verifier<F> interface extraction**

The convention note in `check-design.ts` deferred extracting a formal Verifier interface until the 3rd check-\* command landed. Brand makes 4 verifiers in `harness check-design` (anatomy / craft / drift / brand). This PR extracts:

```ts
// packages/cli/src/shared/verifier.ts
export interface Verifier<F, Cat = ..., Meta = ...> {
  findings: F[];
  summary: { totalFiles, durationMs, bySeverity, byCode };
  catalog: Cat;
  meta: Meta;
}
```

All three rule-based verifiers (anatomy / drift / brand) declare structural conformance via type aliases. design-craft has a different output shape (cost telemetry, exemplar citations) and remains composed but does not conform — that's by design, the interface captures the rule-based pattern.

**Surface area:**

- `audit_brand` MCP tool (count 72 → 73)
- `harness validate` fast-mode hook gated by `design.audit.brandCompliance.enabled` (default true)
- 4th verifier in `harness check-design` (degrades gracefully on failure)
- 4-platform skill markdown (claude-code / codex / cursor / gemini-cli)
- New `design.audit.brandCompliance.{enabled, rules, fastMode}` config block

**Configuration** (additive, all optional):

```json
{
  "design": {
    "audit": {
      "brandCompliance": {
        "enabled": true,
        "rules": { "tokenMisuse": true, "voice": true },
        "fastMode": { "maxFiles": 500 }
      }
    }
  }
}
```

**Long-term trajectory** (documented in proposal):

- v1.x: BRAND-Tone* tone-by-context rules (after component-state inference matures); BRAND-V002/V003 reading-level + sentence-length; BRAND-A* asset rules; semantic-token-alias enforcement; standalone `harness audit-brand` CLI if signal warrants.
- v2: `align-brand-compliance` sibling FIX skill (forbidden-phrase suggestions, token-misuse alias swaps); `VIOLATES_brand` dedicated graph edge.
- v3: LLM-judgment tone rules paired with craft-pipeline #5 copy-craft.

**Tests:** 35+ new unit + integration tests across resolvers (DESIGN.md parser, $extensions walker), rules (token-misuse, forbidden-phrases), and end-to-end audit composition. check-design test extended for 4-verifier case. 821 tests pass across the cli suite.
