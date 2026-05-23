# Exemplar: Raycast Command Palette

> Paper exemplar authored against the catalog/exemplars schema (spec lines 261–286).
> Sprint 0 deliverable #3 of 3 paper exemplars.
> v1 is link-based with critique notes — no screenshots per spec.

```yaml
id: exemplar-raycast-command-palette
kind: exemplar
name: Raycast Command Palette
componentType: CommandPalette
version: 1
status: stable
url: https://www.raycast.com
addedAt: 2026-05-23
addedBy: @chadjw
contributors: [@chadjw]
source:
  ref: 'raycast-app'
  url: https://www.raycast.com
critique: |
  Hierarchy: input field reads first (largest, top, focus ring); result
  list reads second with the active row highlighted; keyboard hints
  read last (smallest, dim, monospace). Three tiers, cleanly
  separated.
  Typography: result rows use sentence-case labels in reading weight;
  metadata (app source, action shortcut) uses tabular monospace at
  reduced weight + contrast. Numerals and shortcut keys align across
  rows.
  Visual: every row has a consistent left icon column, a label
  column, and a right metadata column. Vertical rhythm is locked.
  Active row gets a subtle saturated fill plus a 1px focus indicator,
  no shadow tricks.
  Density: 32px row height — dense enough for keyboard scanning,
  loose enough for mouse use. Inter-row padding is zero (rows abut),
  which sharpens the scan rhythm.
  Motion: result list updates with no entrance animation per row
  (would interfere with rapid keyboard scrolling); selection
  highlight moves with a 40ms transition just enough to confirm
  causality without slowing the keyboard user.
whyExemplar: |
  Demonstrates that high-craft can be utility-first. Raycast's
  command palette is the canonical reference for keyboard-driven
  density done right: no chrome wasted, every pixel informational,
  motion subordinated to speed. The exemplar teaches restraint at
  the opposite end of the spectrum from Linear's empty state —
  proving that "stunning" is not synonymous with "minimal whitespace"
  but with "every choice intentional."
radarReference:
  philosophicalCoherence: 95
  hierarchy: 92
  craftExecution: 95
  function: 98
  innovation: 88
citationCount: 0
```

## Notes for schema-fit review

- `componentType: CommandPalette` — a sixth componentType not in the
  v1 seed list (spec line 458 enumerates EmptyState, LoadingState,
  ErrorState, Modal, Button). Schema must allow extension beyond
  the seed list; flag for review whether the v1 catalog itself
  should ship this exemplar or defer to v2.
- `url` points to product home — same indirect URL pattern as Linear
  and Stripe exemplars.
- This exemplar scores high on `innovation: 88`, contrasting Linear
  (70) and Stripe (75). The schema imposes no calibration constraint
  across exemplars — flag for the contribution review process to
  watch for score drift.
