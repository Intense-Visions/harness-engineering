# Exemplar: Linear Empty List State

> Paper exemplar authored against the catalog/exemplars schema (spec lines 261–286).
> Sprint 0 deliverable #1 of 3 paper exemplars.
> v1 is link-based with critique notes — no screenshots per spec.

```yaml
id: exemplar-linear-empty-list
kind: exemplar
name: Linear Empty List State
componentType: EmptyState
version: 1
status: stable
url: https://linear.app/method
addedAt: 2026-05-23
addedBy: @chadjw
contributors: [@chadjw]
source:
  ref: 'linear-app'
  url: https://linear.app/method
critique: |
  Hierarchy: concise verb-led heading ("Inbox zero" / "No active issues")
  reads first; eye then drops to a single sentence of body guidance,
  then to a single primary CTA. No competing for attention.
  Typography: tight pairing — heading set in display weight, body in
  reading weight, generous leading on the body line. Tracked tight on
  the heading.
  Visual: subtle monochromatic line illustration sits left or above the
  text, matching Linear's overall monochromatic aesthetic. The
  illustration does not compete; it accents.
  Density: generous whitespace between heading and body, tighter
  pairing between body and CTA — creates a clear focal cluster
  centered in the available space.
  Motion: gentle entrance (fade + slight upward translate) on first
  paint, no looping animation.
whyExemplar: |
  Demonstrates the 4-part anatomy (heading + body + visual + action)
  with restraint. Visual doesn't compete with the message. Single CTA
  respects the user's decision budget. The component teaches that
  "empty" should feel calm and resolved, not anxious or busy. Most
  competing empty-state designs over-illustrate or stack two CTAs;
  Linear's restraint is the lesson.
radarReference:
  philosophicalCoherence: 90
  hierarchy: 95
  craftExecution: 92
  function: 95
  innovation: 70
citationCount: 0
```

## Notes for schema-fit review

- `url` here points to Linear's brand site (which showcases the
  product) rather than a deep-link to a specific empty state — the
  app requires login. Schema must allow URLs that demonstrate the
  exemplar indirectly when direct linking isn't possible.
- `radarReference` carries five integer scores in 0–100. The schema
  must allow these as bare ints (no nested `{score, confidence, notes}`
  object — that nested shape is reserved for `BenchmarkScore`, not
  `radarReference` on an exemplar). Flag this asymmetry for review.
- `citationCount: 0` is the seed value; incremented at use time by the
  measurement subsystem (spec line 463).
- `addedBy` and `contributors` are both present. Per the spec
  example (lines 263-286), only `addedBy` is shown. Schema should
  reconcile — either standardize on `contributors` (matching rubric/
  pattern shape) or document `addedBy` as exemplar-specific.
