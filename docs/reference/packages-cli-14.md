# Reference: packages / cli / 14

Auto-generated reference index for previously-undocumented modules in this group. Each entry links the source file and summarizes its purpose and key exports.

## packages/cli/src/api-craft/catalog/rubrics/collections-paginate-and-filter.ts

[`packages/cli/src/api-craft/catalog/rubrics/collections-paginate-and-filter.ts`](/packages/cli/src/api-craft/catalog/rubrics/collections-paginate-and-filter.ts)

API-R007 rubric: judges whether every growable collection is bounded by default and whether one pagination style, one filter grammar, and one sort convention hold across the whole surface — sourced from Stripe cursor pagination and the Zalando guidelines.

**Exports:** `collectionsPaginateAndFilterRubric`

## packages/cli/src/api-craft/catalog/rubrics/errors-are-actionable.ts

[`packages/cli/src/api-craft/catalog/rubrics/errors-are-actionable.ts`](/packages/cli/src/api-craft/catalog/rubrics/errors-are-actionable.ts)

API-R005 rubric: judges whether an error body carries a stable machine-readable code distinct from the human message, names the offending field, keeps one shape API-wide, and points at a remedy rather than leaking internals — benchmarked against Stripe typed errors and RFC 9457.

**Exports:** `errorsAreActionableRubric`

## packages/cli/src/api-craft/catalog/rubrics/evolves-without-breaking.ts

[`packages/cli/src/api-craft/catalog/rubrics/evolves-without-breaking.ts`](/packages/cli/src/api-craft/catalog/rubrics/evolves-without-breaking.ts)

API-R009 rubric: judges the compatibility promise — an explicit versioning strategy for breaking changes, additive-only growth within a version, and tolerant-reader-friendly enums and optional fields.

**Exports:** `evolvesWithoutBreakingRubric`

## packages/cli/src/api-craft/catalog/rubrics/mutations-are-idempotency-honest.ts

[`packages/cli/src/api-craft/catalog/rubrics/mutations-are-idempotency-honest.ts`](/packages/cli/src/api-craft/catalog/rubrics/mutations-are-idempotency-honest.ts)

API-R008 rubric: the one rubric scoped to `route` targets rather than `*`, because retry-safety is handler behavior a declarative spec rarely captures — judges idempotency-key support on creates, genuine idempotence for PUT/PATCH/DELETE, and double-execution guards on unsafe side effects.

**Exports:** `mutationsAreIdempotencyHonestRubric`

## packages/cli/src/api-craft/catalog/rubrics/naming-is-predictable.ts

[`packages/cli/src/api-craft/catalog/rubrics/naming-is-predictable.ts`](/packages/cli/src/api-craft/catalog/rubrics/naming-is-predictable.ts)

API-R002 rubric: judges whether a consumer who learned one endpoint can guess the next — consistent pluralization, nesting only for genuine ownership, and the path-selects / query-filters split that keeps a status out of a URL segment.

**Exports:** `namingIsPredictableRubric`

## packages/cli/src/api-craft/catalog/rubrics/resource-models-the-domain.ts

[`packages/cli/src/api-craft/catalog/rubrics/resource-models-the-domain.ts`](/packages/cli/src/api-craft/catalog/rubrics/resource-models-the-domain.ts)

API-R001 rubric: judges the abstraction level of the resource model — whether endpoints are domain nouns at the right granularity rather than database tables, internal service seams, or RPC procedures leaking through.

**Exports:** `resourceModelsTheDomainRubric`

## packages/cli/src/api-craft/catalog/rubrics/response-shapes-are-predictable.ts

[`packages/cli/src/api-craft/catalog/rubrics/response-shapes-are-predictable.ts`](/packages/cli/src/api-craft/catalog/rubrics/response-shapes-are-predictable.ts)

API-R006 rubric: judges shape consistency — the same resource serialized identically whether embedded or fetched directly, an all-or-nothing envelope, uniform casing/date/money representations, and mutations returning the full resource instead of forcing a re-fetch.

**Exports:** `responseShapesArePredictableRubric`

## packages/cli/src/api-craft/catalog/rubrics/status-codes-are-correct.ts

[`packages/cli/src/api-craft/catalog/rubrics/status-codes-are-correct.ts`](/packages/cli/src/api-craft/catalog/rubrics/status-codes-are-correct.ts)

API-R004 rubric: judges whether the status code — the first thing every client branches on — carries honest meaning, covering the specific 2xx for creates and async accepts, the specific 4xx per failure mode, and 5xx reserved for genuine server faults.

**Exports:** `statusCodesAreCorrectRubric`

## packages/cli/src/api-craft/catalog/rubrics/verbs-are-honest.ts

[`packages/cli/src/api-craft/catalog/rubrics/verbs-are-honest.ts`](/packages/cli/src/api-craft/catalog/rubrics/verbs-are-honest.ts)

API-R003 rubric: judges HTTP method semantics against RFC 9110 — GET genuinely safe, POST for non-idempotent action, PUT replacing versus PATCH partially updating, so callers can predict retry-safety and caching without reading prose.

**Exports:** `verbsAreHonestRubric`

## packages/cli/src/design-craft/catalog/exemplars/baillat-studio-marketing-page.ts

[`packages/cli/src/design-craft/catalog/exemplars/baillat-studio-marketing-page.ts`](/packages/cli/src/design-craft/catalog/exemplars/baillat-studio-marketing-page.ts)

MarketingPage exemplar (CRAFT-B016), sourced from Locomotive's published case study: the corpus reference for restraint as a committed direction — display type as the sole spectacle and deliberate flatness that reads as absent-by-decision rather than absent-by-default.

**Exports:** `baillatStudioMarketingPageExemplar`

## packages/cli/src/design-craft/catalog/exemplars/commercial-construction-marketing-page.ts

[`packages/cli/src/design-craft/catalog/exemplars/commercial-construction-marketing-page.ts`](/packages/cli/src/design-craft/catalog/exemplars/commercial-construction-marketing-page.ts)

MarketingPage exemplar (CRAFT-B017), an Awwwards Honorable Mention cited via the award page because the live site is gone: the reference for b2b gravitas without template blue — credentials set as designed typographic tables in a dark-grey world with one metallic accent governed by a color law.

**Exports:** `commercialConstructionMarketingPageExemplar`

## packages/cli/src/design-craft/catalog/exemplars/crav-burgers-marketing-page.ts

[`packages/cli/src/design-craft/catalog/exemplars/crav-burgers-marketing-page.ts`](/packages/cli/src/design-craft/catalog/exemplars/crav-burgers-marketing-page.ts)

MarketingPage exemplar (CRAFT-B011), Awwwards Site of the Day: the reference for SVG-first art direction under a no-photography constraint, and for edge-surface craft — hovers, cursor moments, footer — as where bespoke quality is actually detected.

**Exports:** `cravBurgersMarketingPageExemplar`

## packages/cli/src/design-craft/catalog/exemplars/fort-point-beer-marketing-page.ts

[`packages/cli/src/design-craft/catalog/exemplars/fort-point-beer-marketing-page.ts`](/packages/cli/src/design-craft/catalog/exemplars/fort-point-beer-marketing-page.ts)

MarketingPage exemplar (CRAFT-B014), sourced from Manual's published case study — the rare corpus entry whose design rationale is public rather than inferred: a place-derived modular motif that scales from favicon to full-bleed band and does the page's compositional work.

**Exports:** `fortPointBeerMarketingPageExemplar`

## packages/cli/src/design-craft/catalog/exemplars/hagis-barbershop-marketing-page.ts

[`packages/cli/src/design-craft/catalog/exemplars/hagis-barbershop-marketing-page.ts`](/packages/cli/src/design-craft/catalog/exemplars/hagis-barbershop-marketing-page.ts)

MarketingPage exemplar (CRAFT-B013), Awwwards Site of the Day: the canonical local-service-business reference at award tier — a monochrome world where the trade itself is the art direction, proving a small trade page need not use the trust-blue template stack.

**Exports:** `hagisBarbershopMarketingPageExemplar`

## packages/cli/src/design-craft/catalog/exemplars/kvell-marketing-page.ts

[`packages/cli/src/design-craft/catalog/exemplars/kvell-marketing-page.ts`](/packages/cli/src/design-craft/catalog/exemplars/kvell-marketing-page.ts)

MarketingPage exemplar (CRAFT-B015), cited to the Awwwards page after the planned studio case-study URL 404'd under the catalog's verify-never-invent rule: the reference for commissioned photography, color law, and type character designed as one argument, with choreographed catalog scroll as the signature move.

**Exports:** `kvellMarketingPageExemplar`

## packages/cli/src/design-craft/catalog/exemplars/la-revoltosa-marketing-page.ts

[`packages/cli/src/design-craft/catalog/exemplars/la-revoltosa-marketing-page.ts`](/packages/cli/src/design-craft/catalog/exemplars/la-revoltosa-marketing-page.ts)

MarketingPage exemplar (CRAFT-B010), Awwwards Site of the Day: the reference for illustration-driven scroll storytelling under a hard two-color commitment, and for kinetic energy achieved through composition and choreographed reveals rather than a heavy motion budget.

**Exports:** `laRevoltosaMarketingPageExemplar`

## packages/cli/src/design-craft/catalog/exemplars/sakazuki-marketing-page.ts

[`packages/cli/src/design-craft/catalog/exemplars/sakazuki-marketing-page.ts`](/packages/cli/src/design-craft/catalog/exemplars/sakazuki-marketing-page.ts)

MarketingPage exemplar (CRAFT-B012), an Awwwards Site of the Day carrying the Typography honor: the reference for a type-led page where letterform character supplies the mood photography would otherwise carry, with scale contrast as the signature move.

**Exports:** `sakazukiMarketingPageExemplar`

## packages/cli/src/design-craft/catalog/exemplars/son-daven-marketing-page.ts

[`packages/cli/src/design-craft/catalog/exemplars/son-daven-marketing-page.ts`](/packages/cli/src/design-craft/catalog/exemplars/son-daven-marketing-page.ts)

MarketingPage exemplar (CRAFT-B009), the first whole-page entry in the corpus and an Awwwards Site of the Day: the reference for narrative information architecture — a chaptered scroll where the place is the narrator and a place-derived two-color world holds across every section.

**Exports:** `sonDavenMarketingPageExemplar`

## packages/cli/src/design-craft/catalog/patterns/editorial-two-column-split.ts

[`packages/cli/src/design-craft/catalog/patterns/editorial-two-column-split.ts`](/packages/cli/src/design-craft/catalog/patterns/editorial-two-column-split.ts)

CRAFT-P008 polish pattern (polish x large): prescribes the concrete remedy for the left-column-monotony finding the `density-rhythm` rubric detects — re-composing a stack of narrow left-hugged prose sections into a sticky heading rail plus body column that collapses to one column on mobile.

**Exports:** `editorialTwoColumnSplitPattern`

## packages/cli/src/design-craft/catalog/rubrics/composition-art-direction.ts

[`packages/cli/src/design-craft/catalog/rubrics/composition-art-direction.ts`](/packages/cli/src/design-craft/catalog/rubrics/composition-art-direction.ts)

CRAFT-C012 page-scoped rubric: judges per-section compositional variety, whether an underlying grid is broken under license (overlap, asymmetry, full-bleed), whitespace confidence, and whether craft decays after the first viewport — cross-section evidence component-scoped rubrics cannot see.

**Exports:** `compositionArtDirectionRubric`

## packages/cli/src/design-craft/catalog/rubrics/concept-coherence.ts

[`packages/cli/src/design-craft/catalog/rubrics/concept-coherence.ts`](/packages/cli/src/design-craft/catalog/rubrics/concept-coherence.ts)

CRAFT-C011 page-scoped rubric, the first of the marketing-page tier: judges whether one nameable idea runs the whole page, whether every section can cite it, and whether the concept is strong enough to reject a nonconforming design — a concept that can only approve is decoration, not direction.

**Exports:** `conceptCoherenceRubric`

## packages/cli/src/design-craft/catalog/rubrics/surface-texture-material.ts

[`packages/cli/src/design-craft/catalog/rubrics/surface-texture-material.ts`](/packages/cli/src/design-craft/catalog/rubrics/surface-texture-material.ts)

CRAFT-C013 page-scoped rubric completing the concept/composition/surface trio: judges whether the background is a committed decision, whether texture is present or deliberately absent, whether material is built with owned CSS within the performance covenant, and whether it reaches edge surfaces such as selection and hover.

**Exports:** `surfaceTextureMaterialRubric`

## packages/cli/src/design-craft/phases/award-bar.ts

[`packages/cli/src/design-craft/phases/award-bar.ts`](/packages/cli/src/design-craft/phases/award-bar.ts)

Derives the BENCHMARK phase's award-tier verdict in TypeScript rather than from the LLM: each radar dimension must clear its own hybrid floor (the config floor or a fraction of the median cited-exemplar reference, whichever is higher), low confidence on any dimension forces `indeterminate`, and a separate responsive gate can veto an aesthetic pass so `cleared` never certifies a phone-broken page.

**Exports:** `AwardBarConfig`, `DEFAULT_AWARD_BAR_CONFIG`, `resolveAwardBarConfig`, `computeAwardBar`, `applyResponsiveGate`
