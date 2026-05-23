# Rubric: Hierarchy Clarity

> Paper rubric authored against the catalog/rubrics schema (spec lines 203–231).
> Sprint 0 deliverable #1 of 3 paper rubrics.

```yaml
id: rubric-hierarchy-clarity
kind: rubric
name: Hierarchy Clarity
version: 1
status: stable
authoredAt: 2026-05-23
contributors: [@chadjw]
appliesTo: [component, page]
source:
  ref: 'huashu-design#hierarchy'
  url: https://github.com/alchaincyf/huashu-design
prompt: |
  Evaluate the visual hierarchy of {target}.
  - Is there a clear primary, secondary, tertiary level?
  - Does typographic scale support the hierarchy or muddy it?
  - Are spacing, color, and weight all aligned with hierarchy intent?
  - Identify any "competing for primary" elements (e.g., two buttons
    with equal weight, two headings with equal size, color/weight
    pulling against scale).
  - Where does the eye land first? Is that the intended entry point?
  Use the 3-axis output model (tier × impact × confidence). Be honest
  about confidence — if the target is ambiguous, say so.
positiveExample: |
  Linear command palette — primary action reads with weight + saturation
  + spacing; secondary items reduced weight; tertiary metadata gets a
  dedicated visual register (monospace, dim). Eye lands on the search
  field, then drops cleanly down the result list.
negativeExample: |
  Three CTAs in a row, all with identical weight, color, and size. No
  primary signal — user must read every label to decide. Same failure
  mode in card layouts where every card claims equal visual loudness.
findingTemplate:
  code: CRAFT-C001
  tier: foundational
  impact: large
```

## Notes for schema-fit review

- `appliesTo` list discriminates rubrics that operate at component vs
  page scope. Three rubrics span both scopes; the schema must allow
  multi-value `appliesTo`.
- `source` uses the `{ ref, url }` shape per spec line 213. `url` is
  optional in practice (some rubrics derive from internal knowledge);
  flag for review whether schema should make `url` required or optional.
- `prompt`, `positiveExample`, `negativeExample` are free-form markdown
  blocks. Length cap unspecified — flag for review.
- `findingTemplate.code` follows `CRAFT-C\d{3}` pattern for critique
  rubrics (vs `CRAFT-P\d{3}` for polish patterns).
