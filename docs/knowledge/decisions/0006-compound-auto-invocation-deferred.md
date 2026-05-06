---
number: 0006
title: Compound auto-invocation deferred
date: 2026-05-05
status: accepted
tier: small
source: docs/changes/compound-engineering-adoption/feedback-loops/proposal.md
---

## Context

`harness-compound` could be triggered automatically by phrase detection -- watching agent
conversation for cues like "that worked", "fixed", or "got it". The risk: false positives
generate noisy or wrong post-mortems, polluting `docs/solutions/` with low-signal entries
that authors then have to clean up.

## Decision

Auto-invocation by phrase detection is deferred. The orchestrator template's step 6b
(Phase 7) uses **mechanical triggers** instead -- factual signals derived from the
session transcript:

- `harness-debugging` skill was invoked.
- The session produced a multi-commit fix.
- The session shows multiple attempts (failed run, then successful run, on the same path).
- A hotspot file (top 10% churn) was touched during the fix.

These signals are observable from the harness session log without interpreting natural
language. Manual invocation (`/harness:compound`) and the weekly `compound-candidates`
maintenance task cover the remaining surface where mechanical signals are absent but a
post-mortem is still warranted.

## Consequences

**Positive:**

- No AI-confidently-wrong post-mortems generated from misread conversation cues.
- Opt-in path is safer: `/harness:compound` always works when humans see the need.
- Mechanical signals are auditable; phrase detection is not.

**Negative:**

- Some learnings will go uncaptured until a human or the weekly scanner picks them up.
- Authors must remember that the post-mortem capture is not fully automatic.

**Neutral:**

- The decision is reversible. If usage data shows the candidate-list action rate stays
  high but coverage gaps remain (lots of fixes never written up), revisit phrase
  detection with a confidence threshold and a confirmation prompt.
