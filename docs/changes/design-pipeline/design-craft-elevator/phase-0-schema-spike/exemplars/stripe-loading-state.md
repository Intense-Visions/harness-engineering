# Exemplar: Stripe Loading State

> Paper exemplar authored against the catalog/exemplars schema (spec lines 261–286).
> Sprint 0 deliverable #2 of 3 paper exemplars.
> v1 is link-based with critique notes — no screenshots per spec.

```yaml
id: exemplar-stripe-loading-state
kind: exemplar
name: Stripe Loading State
componentType: LoadingState
version: 1
status: stable
url: https://stripe.com/payments
addedAt: 2026-05-23
addedBy: @chadjw
contributors: [@chadjw]
source:
  ref: 'stripe-checkout'
  url: https://docs.stripe.com/elements/appearance-api
critique: |
  Hierarchy: skeleton mirrors the about-to-appear layout precisely —
  same row count, same column widths within ~10%, same spatial
  rhythm. The eye sees the destination layout immediately and does
  not need to re-orient when real content arrives.
  Typography: skeleton bars are sized to match expected text widths
  (a header bar is wider than a metadata bar), reinforcing the
  hierarchy preview.
  Visual: gentle gradient shimmer (1.2s cycle, 30deg sweep, low
  contrast against the muted fill). Shimmer is suppressed under
  `prefers-reduced-motion`, replaced by static muted fill.
  Density: skeleton respects the same vertical rhythm as the loaded
  state — no layout shift when content swaps in.
  Motion: shimmer is subtle enough to read as "loading" without
  becoming distracting. Skeleton cross-fades into real content over
  ~180ms (no jarring snap).
whyExemplar: |
  Demonstrates content-matched skeleton (vs generic spinner) at
  production quality. The exemplar teaches that loading is a UI
  state worth designing, not a fallback to apologize for. Layout
  preservation between skeleton and loaded state is the
  high-craft move most competitors miss — they show a centered
  spinner that gives no preview, then dump content into a fresh
  layout.
radarReference:
  philosophicalCoherence: 88
  hierarchy: 85
  craftExecution: 94
  function: 92
  innovation: 75
citationCount: 0
```

## Notes for schema-fit review

- `componentType: LoadingState` — schema should treat `componentType`
  as a free string (no enum) since the catalog will grow beyond the
  5 v1 types (EmptyState, LoadingState, ErrorState, Modal, Button).
- `url` again points to a product page; the actual skeleton is
  observed during checkout-form interactions. Same indirect-URL
  pattern as the Linear exemplar — confirms schema must allow this.
- `radarReference.innovation: 75` is deliberately middling — content-
  matched skeletons are well-established craft, not novel. The
  schema must allow any 0–100 score per dimension independently.
