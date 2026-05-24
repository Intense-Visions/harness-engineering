# Phase 0 Schema-Fit Review

> One paragraph per artifact noting any schema gap discovered. Exit gate: all 5 specs are accepted by `ConventionRule` / `PatternRule` without ambiguity, OR the gap is escalated as a Phase 0 stop-condition trigger before Sprint 1 begins.

## Method

Each of the five Phase 0 specs was authored directly against the data structures defined in `proposal.md` ("Data structures" section): `ConventionRule` for the three convention specs (Button, Tabs, EmptyState) and `PatternRule` for the two pattern specs (ANAT-P001, ANAT-P004). For each artifact the review asks: (a) does every fact in the spec land in a schema field, (b) is any field overloaded beyond its intended semantics, and (c) is anything material missing? Each paragraph below records the finding and a recommendation (accept / extend / revise) for Sprint 1.

## Artifact reviews

### conventions/button.md

The Button convention is a clean fit. Every part of the spec — the four orthogonal axes (slots, states, variants, sizes), the `disabled` / `loading` mutual exclusion via `exclusive: true`, the per-part `fixHint` text, the `source.ref` citation pointing to APG — lands in a defined schema field with no overloading. The `AnatomyPart` shape (`name`, `required`, `exclusive?`, `fixHint`) absorbs every Button concept without extension. **Schema gap: none. Accept as-is.**

### conventions/tabs.md

Tabs exposes two latent schema concerns, both of which are _acceptable for v1_ but should be documented as known limitations before Sprint 1 codifies them. First, the trigger/panel _pairing relationship_ (one panel per trigger, matched by id) cannot be expressed in `ConventionRule` — the schema can assert "tablist, trigger, panel all required" but cannot assert "trigger count == panel count" or "each panel's `value` matches a trigger's `value`." This is a structural rule the AST runner would need to encode out-of-band. Second, `states.selected` and `states.focused` reuse `exclusive: true` to mean "exactly-one across the sibling set" rather than the original "cannot combine with other states on the same instance" — same flag, different scope. **Schema gap: minor semantic overloading of `exclusive`, plus no first-class way to express child-pairing constraints. Recommend documenting both in `convention-rule.ts` JSDoc; extend post-v1 only if more compound components surface the same need. Accept with documentation.**

### conventions/empty-state.md

EmptyState fits the component-side schema cleanly. The hybrid concern (EmptyState is also the _referenced_ fix target for pattern rules like ANAT-P001) is correctly _not_ modeled in the schema — pattern rules reference EmptyState by component-name string in their `fixHint`, which is a durable and decoupled linkage. The three `variants` (zero-data / no-results / error) are correctly handled as a taxonomy without needing `exclusive`. One small observation: `source.ref = "OpenUI/empty-state"` introduces a new citation prefix (the spec previously emphasised APG / Radix). The Decision #5 source hierarchy explicitly allows Open UI, so this is in policy, but the v1 catalog should publish the allowed `ref` prefixes (`APG/`, `OpenUI/`, `Radix/`, `design-component-anatomy/`) to keep the corpus consistent. **Schema gap: none in the data shape; recommend a published `source.ref` prefix vocabulary as a Sprint 1 docs deliverable. Accept as-is.**

### patterns/anat-p001-map-without-empty.md

ANAT-P001 reveals a real schema gap: the `treeSitterQuery` string is necessary but not sufficient — the rule requires a _postprocessing predicate_ that walks ancestors of the matched node to detect guard expressions (ternaries, logical-and, early returns). The current `PatternRule` shape has no field for this; the postprocessing logic lives implicitly in the runner that consumes the rule, which means two rules with very different complexity (one purely query-driven, one with substantial AST traversal) look identical in the schema. The `message: (capture) => string` and `fixHint: string` fields are adequate for finding output. **Schema gap: postprocessing predicate is unmodelled. Recommendation: add an optional `postProcess?: (matches, file) => matches` field to `PatternRule` in Sprint 1 so the rule fully owns its decision logic. Not a stop-condition — the runner-side workaround is viable for the vertical slice — but worth fixing before catalog expansion (Phase 2) to keep rules self-contained. Accept with a Sprint 1 schema extension.**

### patterns/anat-p004-conditional-render-without-fallback.md

ANAT-P004 reinforces the same `postProcess` gap noted for ANAT-P001 _and_ surfaces a second, smaller gap: the rule depends on a hard-coded list of "known fallback component names" (`EmptyState`, `ErrorBoundary`, `Skeleton`, `Spinner`, `Placeholder`, `ErrorBanner`, `Toast`) to suppress matches whose rendered child is already a fallback affordance. This list is rule-specific implementation data but the schema has no field for it — it would otherwise live as a runner-side constant, which couples rule semantics to runner internals. The query itself (with `[...]` alternation between short-circuit and explicit-`null` ternary) is well-served by the `treeSitterQuery: string` field. The `severityDefault: info` correctly captures the genuine ambiguity of the pattern. **Schema gap: same `postProcess` gap as ANAT-P001; additionally, `PatternRule` would benefit from an optional `knownFallbackComponents?: string[]` (or a more general `auxiliary?: Record<string, unknown>` bag) so each rule can carry tuneable data. Recommendation: bundle both schema extensions (`postProcess` and `auxiliary`) into a single Sprint 1 revision. Accept with a Sprint 1 schema extension.**

## Verdict

**All five specs are accepted by the v1 schemas** — three (Button, Tabs, EmptyState) fully, two (ANAT-P001, ANAT-P004) with a small schema extension recommended before Phase 2 catalog expansion. **No Phase 0 stop-condition is triggered.** The discovered gaps are additive (new optional fields, no breaking changes to the existing shape) and can be folded into the Sprint 1 design of `rules/pattern-rule.ts` without re-spec.

### Recommended Sprint 1 schema extensions

1. Add optional `PatternRule.postProcess?: (matches: TreeSitterMatch[], file: SourceFile) => TreeSitterMatch[]` so guard / suppression logic is rule-owned, not runner-owned.
2. Add optional `PatternRule.auxiliary?: Record<string, unknown>` (or a more typed `knownFallbackComponents?: string[]`) so rule-tuneable data travels with the rule.
3. Document in `convention-rule.ts` JSDoc that `exclusive` carries two scopes — per-instance and per-sibling-set — and that compound child-pairing constraints (trigger/panel id matching) are out-of-band runner responsibilities, not schema-encoded.
4. Publish the allowed `source.ref` prefix vocabulary (`APG/`, `OpenUI/`, `Radix/`, `design-component-anatomy/`) as Sprint 1 documentation so the catalog stays consistent.

None of the above blocks Sprint 1 from starting; all four can land in the same Sprint 1 PR that introduces `rules/convention-rule.ts` and `rules/pattern-rule.ts`.
