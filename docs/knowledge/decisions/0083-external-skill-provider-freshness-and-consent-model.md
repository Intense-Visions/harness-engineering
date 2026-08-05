---
number: 0083
title: External skill-provider freshness & consent model
date: 2026-08-05
status: accepted
tier: large
source: docs/changes/skill-provider-freshness/proposal.md
---

## Context

External skill providers installed via `harness install --from github:owner/repo` or the
`@harness-skills/*` npm namespace were fire-and-forget: the lockfile recorded only
`resolved: "local:<tempdir>"` for GitHub installs, discarding the upstream source, so the CLI
could never detect that a provider's upstream had changed. The external-adoption flywheel
(`STRATEGY.md`) depends on third-party skill providers staying fresh, which forces two durable,
cross-cutting commitments: an on-disk format that records enough provenance to diff against
upstream, and a supply-chain posture for _when_ unvetted upstream code is allowed to run. Both
outlive this change and must be honored by future skill-distribution work, which is why they are
captured here rather than left implicit in the code.

## Decision

**D1 — Passive nudge + on-demand, never auto-apply (v1).** The CLI records provenance and probes
upstream, but a detected update only produces a one-line nudge. Applying an update re-executes
third-party skill content; doing so silently would run unvetted code without a human "yes".
Auto-apply is deferred as a future, config-gated opt-in.

**D4 — Lockfile v2 + source provenance.** `LockfileEntry` gains an optional
`source: SkillSource` (`github {owner,repo,ref,commit}` | `npm {package,registry?}` |
`local {path}`) and the community lockfile bumps to **version 2**. The reader accepts v1 **or**
v2; the writer always emits v2, upgrading a v1 file in place on read-then-write with no
destructive rewrite. A v1 (sourceless) entry loads freshness-ineligible and is reported
"reinstall to enable freshness", never crashing. This on-disk format is a durable contract.

**D6 — Per-provider consent is the enforcement of D1.** `harness skill update` confirms each
outdated provider (`old -> new`, default **N**) before re-pulling. The confirm _is_ the consent
to execute upstream code — the mechanical teeth behind D1's posture.

**D7 — `harness update` surfaces freshness too.** `harness update` is where users refresh
everything harness-related, so it also probes providers and (on a TTY) offers the same
shared-core update, degrading to a report-only hint in non-TTY / `HARNESS_NO_UPDATE_CHECK=1` and
never aborting `update` on a freshness error.

Probing is hardened against hostile lockfiles: `execFileSync` argument arrays (no shell), a
leading-dash guard, `owner/repo`/`ref` separator guards on re-pull, and `MAX_PROVIDERS` /
`PROBE_BUDGET_MS` / per-probe-timeout caps.

## Consequences

- **Positive.** Providers can be kept current with explicit consent; the recorded `source` gives
  future skill-distribution work a stable base to diff and re-pull against; freshness reuses the
  trusted `update-checker` gating (`HARNESS_NO_UPDATE_CHECK` + interval), so one switch silences
  all background network probes.
- **Neutral.** The lockfile format is now versioned (v1 ⇄ v2); consumers reading it directly must
  tolerate both. Auto-apply remains unbuilt by design.
- **Negative (accepted residual risk).** A custom **npm registry URL** recorded in a _community_
  lockfile becomes an attacker-reachable outbound host during probing: `npm view <pkg> --registry <url>`
  contacts whatever registry the entry names, so an actor who can plant a lockfile entry
  can cause a victim's machine to make an outbound request to a host of their choosing on the next
  CLI invocation. This is **accepted** because supporting custom/private registries is a
  first-class, documented install feature that inherently requires probing them. It is mitigated,
  not eliminated: the 15s per-probe timeout, the `MAX_PROVIDERS` / `PROBE_BUDGET_MS` caps, the
  leading-dash guard (no smuggled flags), and the `HARNESS_NO_UPDATE_CHECK` kill-switch bound the
  blast radius to a timeout-limited outbound GET that any user can disable.

See [`docs/knowledge/cli/skill-freshness.md`](../cli/skill-freshness.md) for the full contract and
[`docs/knowledge/cli/skill-provenance.md`](../cli/skill-provenance.md) for the distinct authorship
axis.
