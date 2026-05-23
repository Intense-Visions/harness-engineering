# Pattern: Spring Physics Micro-interaction

> Paper pattern authored against the catalog/patterns schema (spec lines 233–259).
> Sprint 0 deliverable #1 of 3 paper patterns.

```yaml
id: pattern-spring-physics
kind: pattern
name: Spring Physics Micro-interaction
version: 1
status: stable
authoredAt: 2026-05-23
contributors: [@chadjw]
source:
  ref: 'emil-design-eng#spring-physics'
  url: https://github.com/emilkowalski/skill/blob/main/skills/emil-design-eng/SKILL.md
applicableTo:
  - { kind: 'jsx-attribute', match: 'transition' }
  - { kind: 'css-property', match: 'transition-timing-function' }
  - { kind: 'jsx-attribute', match: 'animate' }
when: |
  Element transitions currently use cubic-bezier easing or any of the
  CSS keyword timings (ease, ease-in, ease-out, ease-in-out, linear).
  This produces motion that feels mechanical and ignores the inertia
  cues real materials give the eye.
suggest: |
  Replace with spring physics. Recommended starting tuning:
    - Primary interactions: stiffness:200 damping:25
    - Secondary interactions: stiffness:300 damping:30
    - Entrances: stiffness:170 damping:26
  Use motion library (framer-motion, react-spring, or @react-spring/web)
  or a CSS spring polyfill. Always pair with `prefers-reduced-motion`
  fallback to a cross-fade or instantaneous state change.
before: |
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
after: |
  // Using framer-motion
  <motion.div
    animate={{ scale: hovered ? 1.05 : 1 }}
    transition={{ type: 'spring', stiffness: 200, damping: 25 }}
  />
findingTemplate:
  code: CRAFT-P001
  tier: polish
  impact: medium
```

## Notes for schema-fit review

- `applicableTo` is an array of discriminator objects with `kind` and
  `match`. Three patterns will exercise three distinct `kind` values
  — schema should NOT enumerate `kind` (would block future kinds).
- `before` and `after` use markdown code-block conventions inside YAML
  literal blocks. The example here mixes CSS (before) and JSX (after)
  — schema should allow that.
- `suggest` is a free-form recommendation. Length unspecified; flag for
  the review process to advise concision but no schema cap.
