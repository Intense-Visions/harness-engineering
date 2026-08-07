---
'@harness-engineering/cli': patch
---

Add `harness proposals status` and correct the skill-proposal docs (#551).

`harness proposals status` is a provider-independent, read-only report of the
skill-proposal loop: queue counts by status plus, per emission surface, whether it
is live or dormant and why. It reuses the same env predicates the runtime uses
(`HARNESS_SESSION_RETROSPECTION` truthy test; `ANTHROPIC_API_KEY` /
`HARNESS_ANALYSIS_BASE_URL` provider resolvability) so the report cannot drift from
behavior, and it never constructs a provider or mutates the queue. Supports the
global `--json` flag; always exits 0.

Docs honesty pass: the README "Skill Proposals" bullet no longer implies an
always-on loop — it now describes an opt-in capture surface plus opt-in
session-terminus retrospection, links the new operator guide, and fixes the stale
ADR link. New guide `docs/guides/skill-proposal-loop.md` documents both emission
surfaces, the exact retrospection gating, local activation, and the
review → soundness-gate → promotion flow.
