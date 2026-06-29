---
number: 0046
title: The standard hook tier carries a security floor
date: 2026-06-26
status: accepted
tier: medium
source: docs/changes/sentinel-standard-profile/proposal.md
---

## Context

`sentinel-pre` / `sentinel-post` provide prompt-injection defense (zero-width and
RTL/LTR override detection, role-reassignment and permission-escalation detection,
base64 exfiltration detection, and — for `sentinel-pre` specifically — blocking of
destructive bash during an already-tainted session; `sentinel-post` is detection-only
and always exits 0). They shipped at the `strict` profile only, while the default
profile is `standard` (`packages/cli/src/commands/setup.ts`). The overwhelming majority
of adopters therefore received none of this defense.

The header doc comment in `packages/cli/src/hooks/profiles.ts` framed `standard` as
"warns, never blocks." Taken literally, that framing made promoting a hook that _can_
exit-2 block look like a tier-contract violation. But `block-no-verify` already blocks
at `minimal`, so "never blocks" was always about _quality gates_, never about _safety
floors_. `sentinel-pre` only blocks a destructive op in an already-tainted session
(`sentinel-pre.js`) — the same safety-floor class as `block-no-verify`.

## Decision

The `standard` tier carries a **security/safety floor** distinct from quality gates:

- Quality gates (`quality-warner`) warn-never-block until `strict` (where
  `strict-quality-gate` enforces). This is unchanged.
- Safety floors may block: `block-no-verify` and `sentinel-pre` exit-2 block;
  `sentinel-post` is detection-only (always exit 0, never blocks). `sentinel-pre`'s
  exit-2 block is preserved, not neutered.

Concretely: `sentinel-pre` and `sentinel-post` move to `minProfile: 'standard'`, and the
tier-contract doc comment is corrected to read "quality gates warn-never-block PLUS
security/safety floors." `cost-tracker` stays `strict` — it is cost telemetry, not a
security floor.

Reconciliation rides the existing `harness update` → `initHooks` path; no migration code
is added. Existing `standard` projects pick up sentinel on their next `harness update`.

## Consequences

**Positive:**

- Default adopters receive prompt-injection detection and tainted-session enforcement
  without opting into `strict`.
- The tier contract is now precise: "warn-never-block" scopes to quality gates, and the
  security floor is a named, documented property of `standard`.

**Negative / risks:**

- Default adopters now run two `matcher:'*'` hooks on every tool call. The overhead is
  already proven at `strict`, but it is real per-call cost at the new default.
- The first tainted-session block may surprise a default adopter. The changeset notice
  exists to make the behavior change discoverable.
