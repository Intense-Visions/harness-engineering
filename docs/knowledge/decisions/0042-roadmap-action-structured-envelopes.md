---
number: 0042
title: manage_roadmap state-changing actions return structured envelopes
date: 2026-06-24
status: accepted
tier: medium
source: docs/changes/brainstorm-auto-promote/proposal.md
---

## Context

The `manage_roadmap` MCP tool's existing write actions (`add`, `update`, `remove`) return
either the serialized roadmap or a free-form error string. That is adequate when the only
caller is a human reading the result, but the brainstorm-driven roadmap loop adds machine
consumers — the brainstorming skill must branch on the outcome (promote vs. refuse vs.
create), and the dashboard and autopilot (sub-projects 2 and 4) will render
reason-specific UI for the same outcomes.

The new `promote` action has a genuinely branchy result space: it can succeed in four ways
(`backlog→planned`, `spec-updated`, `created`, `noop`) and refuse in five
(`in-progress`, `done`, `not-found`, `ambiguous`, `write-failed`), some carrying payloads
(`closestMatches`, `matches`). Encoding that as prose would force every caller to
string-match human text that is free to drift.

## Decision

State-changing `manage_roadmap` actions return a structured envelope with a stable
discriminant: `{ ok: boolean, reason?: string, detail?: string, ...payload }`. `reason`
strings are part of the contract and do not change; `detail` strings are human-readable but
never parsed. The `promote` action is the first to adopt this, returning `RoadmapPromoteResult`
from `@harness-engineering/core`. The MCP layer serializes the envelope as JSON and marks
refusals/failures `isError` so the auto-sync trigger skips them, while still carrying the
full envelope in the response text.

This establishes the convention for future state-transition actions on the tool: emit a
discriminated envelope, not a sentence.

## Consequences

- **Positive:** callers (skill, dashboard, autopilot) branch on `reason` without re-parsing
  prose. Payloads (`closestMatches`, `matches`) ride alongside the discriminant. The shape
  is unit-testable at the core boundary.
- **Positive:** the `ok: false` refusal reasons are exhaustively typed, so a missing branch
  is a TypeScript error at each consumer.
- **Negative:** the envelope is richer than a string, so trivial callers that only wanted
  "did it work?" must read `.ok`. Acceptable — the tool's results are now data, not text.
- **Follow-on:** `add`/`update`/`remove` keep their current returns until a caller needs the
  structured form; this ADR does not retrofit them. It sets the direction for new actions.
