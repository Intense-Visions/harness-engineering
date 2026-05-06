---
number: 0005
title: Pulse config in harness.config.json
date: 2026-05-05
status: accepted
tier: small
source: docs/changes/compound-engineering-adoption/feedback-loops/proposal.md
---

## Context

`harness-pulse` requires per-project configuration: lookback window default, primary
event name, enabled sources (PostHog, Sentry, Stripe, etc.), and source-specific
selectors. Two storage options were considered: a dedicated `pulse.config.json` next to
`harness.config.json`, or a new `pulse:` section inside the existing `harness.config.json`.

## Decision

Pulse configuration lives under a `pulse:` section inside `harness.config.json`. The
Phase 1 Zod schema (`packages/core/src/pulse/`) validates the shape, and the Phase 3
first-run interview writes selections to that section.

Secrets (`PULSE_POSTHOG_TOKEN`, `PULSE_SENTRY_DSN`, etc.) live in environment variables
and are **never** persisted to the config file. The interview validates env-var presence
but does not read or store the values.

## Consequences

**Positive:**

- One config file for agents to discover, validate, and present to users.
- Secrets stay out of disk config by construction; no accidental commit risk for tokens.
- Schema validation runs through the same `harness validate` path that already covers
  the rest of `harness.config.json`.

**Negative:**

- `harness.config.json` grows over time as new subsystems land their own sections.
- Schema migrations affect a shared file rather than a scoped pulse-only one.

**Neutral:**

- Tooling that already reads `harness.config.json` (CLI, dashboard) gets pulse config
  for free.
