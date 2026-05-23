# Rubric: Typography Craft

> Paper rubric authored against the catalog/rubrics schema (spec lines 203–231).
> Sprint 0 deliverable #2 of 3 paper rubrics.

```yaml
id: rubric-typography-craft
kind: rubric
name: Typography Craft
version: 1
status: stable
authoredAt: 2026-05-23
contributors: [@chadjw]
appliesTo: [component, page]
source:
  ref: 'vercel-geist#typography'
  url: https://vercel.com/geist/introduction
prompt: |
  Evaluate the typographic craft of {target}.
  - Is the type scale consistent (modular, or at least intentionally
    chosen ratios) or arbitrary?
  - Are line-heights tuned to font size and reading width? (Body copy
    typically 1.4–1.6; headings 1.05–1.25.)
  - Is measure (line length) within the 45–75 char reading band for
    body copy?
  - Is letter-spacing tuned at display sizes? (Large headings usually
    benefit from slight negative tracking.)
  - Is font-weight contrast meaningful (e.g., 400 vs 600) or muddy
    (e.g., 400 vs 500)?
  - Are numerals tabular where alignment matters (tables, prices)?
  Use the 3-axis output model. Confidence should drop when the target
  lacks a declared type scale to compare against.
positiveExample: |
  Geist Sans + Geist Mono pair: explicit modular scale, tuned line-heights
  per role (display, heading, body, caption), tabular numerals on
  pricing rows, negative tracking on display sizes. Every text element
  has an obvious role in the scale.
negativeExample: |
  Headings, body, and captions all set in same weight at 14/16/18 with
  default 1.5 line-height. No visible scale, no role differentiation,
  letter-spacing untouched at all sizes. Numerals proportional inside
  a pricing table — columns misalign.
findingTemplate:
  code: CRAFT-C002
  tier: foundational
  impact: medium
```

## Notes for schema-fit review

- `source` here cites a public design system but the rubric synthesizes
  general typography craft principles — schema should allow either
  specific or thematic source references.
- `appliesTo` covers both component (e.g., a Button label) and page
  (e.g., an article body).
- The prompt enumerates six bullet criteria; this is longer than the
  hierarchy rubric. Schema should not cap prompt length but the
  contribution review process should advise concision.
