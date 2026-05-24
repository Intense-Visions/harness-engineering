# Rubric: Motion Quality

> Paper rubric authored against the catalog/rubrics schema (spec lines 203–231).
> Sprint 0 deliverable #3 of 3 paper rubrics.

```yaml
id: rubric-motion-quality
kind: rubric
name: Motion Quality
version: 1
status: stable
authoredAt: 2026-05-23
contributors: [@chadjw]
appliesTo: [component]
source:
  ref: 'emil-design-eng#animation-decision-framework'
  url: https://github.com/emilkowalski/skill/blob/main/skills/emil-design-eng/SKILL.md
prompt: |
  Evaluate the motion quality of {target}.
  - Does the motion communicate something (state change, causality,
    spatial relationship) or is it decorative?
  - Is the easing physically plausible? (Spring physics or
    custom-tuned curves beat default ease/ease-in-out.)
  - Are durations proportionate? (Microinteractions <150ms; transitions
    150–400ms; large layout shifts up to 600ms but rare.)
  - Do entrances/exits use the same envelope, or do they feel jarring?
  - Does the motion respect `prefers-reduced-motion`?
  - Are interruptions handled gracefully (e.g., reversing mid-flight
    instead of snap-resetting)?
  Use the 3-axis output model. Confidence should drop on code-only
  analysis — motion quality is hard to judge without rendering.
positiveExample: |
  Stripe checkout amount input: spring-physics character ticker on
  value change, 180ms entrance with subtle scale + opacity, reversible
  mid-flight if value changes again. Respects reduced-motion (cross-
  fade fallback). Causality is clear — the number that animated is the
  number that changed.
negativeExample: |
  Modal opens with 500ms ease-out, closes with instant snap. Hover
  micro-interaction uses 300ms linear (feels mechanical). No
  prefers-reduced-motion handling. A side panel slides in over 800ms,
  blocking the user from interacting with it during the slide.
findingTemplate:
  code: CRAFT-C003
  tier: polish
  impact: medium
```

## Notes for schema-fit review

- `appliesTo: [component]` — motion is typically component-scoped, not
  page-scoped. Schema should NOT require `appliesTo` to include
  `page`.
- This rubric's `findingTemplate.tier` is `polish` rather than
  `foundational` (motion is a craft elevator, not a basic structural
  requirement). Schema should allow any tier value per spec line 131.
- The prompt explicitly notes a confidence ceiling for code-only mode.
  Schema does not need a `confidenceCap` field today but this is worth
  surfacing in the schema-fit review as a possible future addition.
