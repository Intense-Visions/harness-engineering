---
number: 0055
title: Curated signals live in a shared leaf package, not behind the dashboard
date: 2026-07-02
status: accepted
tier: medium
source: docs/changes/senior-accountability-surface/proposal.md
---

## Context

The pre-merge brief's "Signal status" section needs the five curated repo-health
signals computed **fresh in CI**. That computation lived entirely in
`packages/dashboard/src/server/signals/` — a dashboard-server-only subtree with no
library surface. Two constraints collided:

- The brief runs from the CLI. The CLI must not route signal computation through
  the dashboard **application** (dashboard is a leaf app, not a library; the brief
  should not need to stand up a dashboard server in CI).
- Reading the dashboard's persisted `.harness/signals/timeline.json` snapshot was
  rejected: in CI that file is stale or absent, so the signal section would almost
  always render "unavailable", hollowing out the decision to show signal status.

## Decision

Extract the self-contained `signals/` subtree into a new leaf package
`@harness-engineering/signals` (public entry: `gatherSignals`, `signalRegistry`).
The dashboard re-imports from it; the CLI's `pre-merge-brief` command depends on it
directly and computes signals fresh. The subtree was verified fully self-contained
(only external deps: `@harness-engineering/graph`, `zod`, node built-ins), so the
move was mechanical.

**Scope precision:** this is NOT "the CLI must not depend on the dashboard app."
The CLI package already depends on `@harness-engineering/dashboard` (pre-existing)
for the `harness dashboard` launch command. D6 is the narrower rule that **signal
computation lives in a shared leaf, not behind the dashboard app**.

## Consequences

- The dependency edge is `dashboard → signals` and `cli → signals`; never
  `signals → dashboard`. `signals` imports nothing from `core`, `orchestrator`,
  `intelligence`, or `dashboard`.
- `harness check-deps` proves no `signals → dashboard` edge and no new cycles; a
  grep guard backs the boundary (`@harness-engineering/dashboard` must not appear
  under `packages/signals/`).
- Fully extracting the remaining signal providers into shared core (and the adopter
  template graduation) are tracked follow-ups, not part of this change.
- See the machine-readable fact
  `docs/knowledge/senior-accountability-surface/cli-not-dashboard-dependency.md`.
