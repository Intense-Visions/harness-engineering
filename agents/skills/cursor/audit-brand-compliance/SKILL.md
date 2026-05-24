# Audit Brand Compliance

> Rule-based brand-semantics audit. Detects (a) tokens used in forbidden contexts per their `$extensions.harness.brand.forbidden_contexts` metadata (BRAND-T001) and (b) UI copy containing phrases listed in `DESIGN.md ## Brand Rules → voice.forbidden_phrases` (BRAND-V001). The 4th composed verifier in `harness check-design`, alongside audit-component-anatomy, design-craft critique, and detect-design-drift.

## When to Use

- After authoring or editing `DESIGN.md ## Brand Rules` — verify the new constraints are enforceable on the existing codebase
- After adding `$extensions.harness.brand` metadata to a token — discover existing call sites in forbidden contexts
- As part of `harness validate` (fast-mode hook, gated by `design.audit.brandCompliance.enabled`)
- As the 4th composed verifier in `harness check-design` (the unified design check)
- Before a PR with UI copy or token-usage changes lands
- NOT for tone-by-context rules (deferred to v1.x — requires component-state inference)
- NOT for reading-level or sentence-length rules (deferred to v1.x — ship with tone-context)
- NOT for asset-usage rules (deferred to v1.x — requires image-tag scanning)
- NOT for semantic-token-alias enforcement (overlaps with detect-design-drift T001 — design after both have shipped)
- NOT for brand-rule authoring (use `harness-design` skill to draft DESIGN.md sections)

## Process

### Phase 1: LOAD — Parse the two input sources

1. **Read project configuration.** Check `harness.config.json` for:
   - `design.strictness` — `strict` / `standard` / `permissive` (default `standard`)
   - `design.audit.brandCompliance.enabled` — gate (default `true`)
   - `design.audit.brandCompliance.rules.{tokenMisuse,voice}` — per-rule toggles

2. **Load `design-system/DESIGN.md` `## Brand Rules`.** The parser extracts:
   - `voice.forbiddenPhrases: string[]` — used by BRAND-V001 in v1
   - `voice.constant`, `voice.readingLevel`, `voice.maxSentenceWords` — parsed but unused in v1 (forward-compat)
   - `toneByContext`, `assets`, `semanticTokenAliases` — parsed but unused (v1.x)
   - Returns `null` when DESIGN.md absent or `## Brand Rules` section missing → BRAND-V001 silently skips.

3. **Load `design-system/tokens.json` `$extensions.harness.brand`.** Walks the DTCG token tree capturing per-token `role`, `approved_contexts`, `forbidden_contexts`. Returns `null` when no token carries the extension → BRAND-T\* silently skips.

### Phase 2: SCAN — Apply the two rule families

1. **BRAND-T001 — token misuse (regex-based).** For each token whose `forbidden_contexts` is non-empty:
   - Find every reference to the token's dotted path in source (recognizes three forms):
     - `tokens.X.Y.Z` (JS accessor)
     - `var(--X-Y-Z)` (CSS var, kebab-cased)
     - `'X.Y.Z'` / `"X.Y.Z"` (string literal)
   - Inspect surrounding context (same line + nearest non-blank previous and next line) for the v1 context-vocabulary keywords: `cta`, `selection`, `focus`, `data-visualization`, `decorative`, `background`, `text`, `border`, `error`, `success`, `warning`.
   - If a forbidden context matches: emit BRAND-T001.

2. **BRAND-V001 — forbidden phrases (TS Compiler API).** For each `.tsx`/`.jsx` file:
   - Walk the JSX tree.
   - For each `JsxText` node: case-insensitive substring scan for any forbiddenPhrase.
   - For each `JsxAttribute` whose initializer is a string literal: same scan.
   - Deduplicate per `(file, line, phrase)`.

### Phase 3: REPORT — Aggregate and surface

1. **Severity from `design.strictness`** (uses `severityFor`):
   - `strict` — all findings `error`
   - `standard` — BRAND-T001 `error` (declared violation), BRAND-V001 `warn` (copy nuance)
   - `permissive` — all findings `info`

2. **Aggregate `bySeverity` and `byCode`** into the standard Verifier shape: `{ findings, summary, catalog, meta }`.

3. **Persist findings to the graph (when composed by check-design).** check-design routes brand findings through `DesignConstraintAdapter.recordFindings()` alongside anatomy / craft / drift. v1 uses the shared `VIOLATES_design` edge; v1.x may add a brand-specific edge.

## Harness Integration

- **`harness validate`** — Fast-mode hook gated by `design.audit.brandCompliance.enabled`. Degrades gracefully on failure (single warning; other checks continue).
- **`harness check-design`** — Composes brand as the 4th verifier alongside audit-anatomy, design-craft critique, and detect-design-drift. This is the canonical invocation path.
- **`mcp__harness__audit_brand`** — MCP tool. Input: `{ path, mode, files?, designStrictness?, rules? }`. Output: `{ findings, summary, catalog, meta }`. Consumed by check-design and the (future) #5 design-pipeline orchestrator.
- **`DesignConstraintAdapter.recordFindings()`** — Generic graph persistence entry point shipped in PR #390. Brand findings reuse the adapter (no graph schema changes in v1).
- **`harness-design` skill** — Authors `DESIGN.md ## Brand Rules`. audit-brand-compliance is the matching enforcer.
- **`Verifier<F>` interface** — Extracted in this PR at the 4th-verifier threshold. Lives at `packages/cli/src/shared/verifier.ts`. Adding a 5th verifier requires only a type-alias declaration of conformance.

## Success Criteria

See `docs/changes/design-pipeline/audit-brand-compliance/proposal.md` for the full 34 success criteria. Highlights:

- DESIGN.md parser returns `null` when section absent (silent-skip pattern)
- Token-extensions walker returns `null` when no token carries `$extensions.harness.brand`
- BRAND-T001 fires on `tokens.X`, `var(--x)`, and `'X'` reference forms
- BRAND-T001 honors approved_contexts (no finding when context is allowed)
- BRAND-V001 fires on JSX text + string-typed JSX attributes (case-insensitive)
- BRAND-V001 deduplicates per `(file, line, phrase)`
- Verifier interface extraction: anatomy / drift / brand all declare structural conformance
- `harness check-design` test extended for 4-verifier composition (zero regressions)
- MCP tool count bumps 72 → 73

## Examples

### Example: Token used in forbidden context

**Input:**

`design-system/tokens.json`:

```json
{
  "color": {
    "brand": {
      "500": {
        "$type": "color",
        "$value": "#3b82f6",
        "$extensions": {
          "harness": {
            "brand": {
              "role": "primary",
              "approved_contexts": ["cta", "selection", "focus"],
              "forbidden_contexts": ["data-visualization", "decorative"]
            }
          }
        }
      }
    }
  }
}
```

`src/Chart.tsx`:

```tsx
// data-visualization color palette
const palette = [tokens.color.brand.500, ...];
```

**Output:**

```
BRAND-T001 [error] src/Chart.tsx:2 — Token "color.brand.500" is used in forbidden context "data-visualization"
  Fix: Token "color.brand.500" is not approved for the "data-visualization" context.
       Use an approved token (allowed contexts: cta, selection, focus), or update
       tokens.json $extensions.harness.brand if the policy is wrong.
```

### Example: Forbidden phrase in UI copy

**Input:**

`DESIGN.md`:

```markdown
## Brand Rules

### Voice

forbidden_phrases:

- "click here"
- "best-in-class"
```

`src/Cta.tsx`:

```tsx
export const Cta = () => <a href="/x">Click here</a>;
```

**Output:**

```
BRAND-V001 [warn] src/Cta.tsx:1 — UI copy contains forbidden phrase "click here" — declared at DESIGN.md ## Brand Rules → Voice → forbidden_phrases
  Fix: Rewrite to avoid "click here". If the phrase is unavoidable for this context,
       remove it from voice.forbidden_phrases (or scope the audit) — but the default
       policy is that brand voice trumps convenience.
```

## Gates

- **No findings without parsed inputs.** DESIGN.md absent → BRAND-V001 skips silently. tokens.json `$extensions.harness.brand` absent on every token → BRAND-T001 skips silently. Either resolver returning null is NOT a verifier failure.
- **No `.ts`/`.js` file scans for BRAND-V001.** Only `.jsx`/`.tsx` (user-visible JSX). Doc copy in `.md` is a different audience.
- **No tone-by-context inference.** v1 only matches the explicit context-vocabulary keywords against surrounding source text. v1.x adds component-state inference.
- **No autofix.** audit-only. The matching `align-brand-compliance` fix-side skill is deferred until detect signals demand.
- **No graph schema changes.** v1 reuses `VIOLATES_design` via `recordFindings()`. v1.x may add `VIOLATES_brand` edge for queryability.
- **Strictness from config, not assumed.** Read `design.strictness` from `harness.config.json`; default `standard` if absent.

## Escalation

- **When BRAND-T001 false-positives on a far-context reference:** the v1 context inference is intentionally narrow (same line + adjacent non-blank). For a token used in a "background" context where the keyword appears 10 lines away, v1 misses it. v1.x adds richer context inference; for now, either widen the surrounding comment or accept the miss.
- **When BRAND-V001 false-positives on a substring (e.g., "as is" in "as issued"):** v1 uses substring match. Add word-boundary regex in v1.x. For now, rephrase the copy or remove the phrase from voice.forbidden_phrases.
- **When a project ships tokens with a different `$extensions` shape:** v1 reads only `harness.brand`. Document the actual shape your project uses and add it to the schema sketch in ADR 0028 — DTCG `$extensions` namespaces are vendor-prefixed and additions are forward-compatible.
- **When `harness validate` runtime exceeds 3 seconds:** Set `design.audit.brandCompliance.fastMode.maxFiles` to cap the scope. The MCP tool ignores the cap (`fast`/`full` equivalent in v1).
- **When the graph persistence fails:** Skip graph integration for that run; findings still appear in the report. The graph is a consumer, not a gate.
- **When you want tone-by-context rules today:** Manual audit until v1.x ships. Component-state inference (empty/error/success/loading) requires JSX-context analysis that's a separate brainstorm.

## Status

**v1 — in implementation.** See:

- Spec: `docs/changes/design-pipeline/audit-brand-compliance/proposal.md`
- ADR (input schema source): `docs/knowledge/decisions/0028-brand-guidelines-source-of-truth.md`
- Roadmap entry: `design-pipeline sub-project #3` in `docs/roadmap.md`
- Sibling rule-based audits: `audit-component-anatomy` (#2), `detect-design-drift` (#1)
- Cross-cutting: extracts `Verifier<F>` interface at `packages/cli/src/shared/verifier.ts` (deferred until 4th data point — this is it)
