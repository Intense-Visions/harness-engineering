---
'@harness-engineering/cli': minor
---

feat(design-craft): MarketingPage exemplar tier + page-level rubrics

The design-craft catalog gains a page-scoped `MarketingPage` component type: nine
award-documented whole-page exemplars (CRAFT-B009..B017 — Awwwards SOTD/HM winners
and published studio case studies, each with verified provenance) and three
page-level rubrics — `concept-coherence` (CRAFT-C011), `composition-art-direction`
(CRAFT-C012), and `surface-texture-material` (CRAFT-C013), all `appliesTo: ['page']`.

BENCHMARK on a page target with `componentType: 'MarketingPage'` now resolves to the
marketing-page corpus instead of the product-UI component set, so marketing/brochure
pages converge toward art-direction craft (concept, composition, texture) rather than
component polish alone. No matcher changes were needed (open-string ComponentType,
equality filtering) — recorded in ADR 0082 along with the decision to ship the page
tier before section-level anchors.
