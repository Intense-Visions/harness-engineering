# Pattern: Stagger Timing

> Paper pattern authored against the catalog/patterns schema (spec lines 233–259).
> Sprint 0 deliverable #3 of 3 paper patterns.

```yaml
id: pattern-stagger-timing
kind: pattern
name: Stagger Timing
version: 1
status: stable
authoredAt: 2026-05-23
contributors: [@chadjw]
source:
  ref: 'emil-design-eng#stagger'
  url: https://github.com/emilkowalski/skill/blob/main/skills/emil-design-eng/SKILL.md
applicableTo:
  - { kind: 'jsx-pattern', match: 'list.map(item => <motion.div' }
  - { kind: 'css-selector', match: ':nth-child' }
  - { kind: 'animation-property', match: 'animation-delay' }
when: |
  A list of items all animate in simultaneously. The result reads as
  "everything appeared at once" — the eye gets a single flash with no
  spatial or temporal information about ordering. This wastes an
  opportunity to convey hierarchy or directionality.
suggest: |
  Stagger entrance animations by 30–60ms per item (faster for short
  lists, slower for ordered/hierarchical lists). For lists of >10
  items, cap stagger so total entrance duration stays under 600ms
  (otherwise the tail of the list feels late). For grid layouts,
  consider a 2D stagger (diagonal sweep from top-left).
  Reverse the stagger direction on exit so the most recently focused
  items leave last.
  Always respect `prefers-reduced-motion` (cross-fade all items
  simultaneously, no stagger).
before: |
  {items.map(item => (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    />
  ))}
after: |
  {items.map((item, i) => (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: Math.min(i * 0.04, 0.6),
        type: 'spring',
        stiffness: 200,
        damping: 25,
      }}
    />
  ))}
findingTemplate:
  code: CRAFT-P003
  tier: polish
  impact: small
```

## Notes for schema-fit review

- `applicableTo` introduces a third novel `kind` value
  (`jsx-pattern`) — schema must keep `kind` open-ended.
- This pattern's `impact: small` deliberately under-rates stagger
  because in many contexts it is genuinely optional. Schema should
  not enforce a tier ↔ impact correlation.
- The pattern cross-references spring physics (`pattern-spring-physics`)
  in the `after` block. Schema does not currently model
  pattern-to-pattern dependencies; flag for future consideration.
