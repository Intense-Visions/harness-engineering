---
number: 0014
title: Doctor hardened checks — credential shape, hook validity, baseline freshness, session corruption
date: 2026-05-16
status: accepted
tier: medium
source: docs/changes/hermes-phase-3-notifications/proposal.md
---

## Context

`harness doctor` today (pre-Phase 3) verifies that Node is the right
version, that slash commands are installed for each host, that the MCP
config references the harness server, and that Tier-0 integrations are
configured. It is a **presence** check across well-known files.

After Phases 0–2 added live runtime state (auth tokens, webhook
subscriptions, telemetry export, custom maintenance jobs, optional
session archives, architecture/benchmark/coverage baselines), the
presence check can be misleading. A green doctor report no longer
implies a healthy system: env vars may be missing or malformed, hooks
may be unparseable, baselines may be months stale, sessions may have
corrupted summaries that never get cleaned up.

Three shapes were on the table:

- **A. Live HTTP probes** for everything: ping the orchestrator, ping
  Slack, ping Anthropic, ping the OTel collector, ping the GitHub API.
- **B. File-IO + env-var presence/shape** checks only. No outbound
  HTTP. Verify credentials look right (prefix + length), hooks parse,
  baselines aren't stale, session summaries parse.
- **C. No new checks** — punt to a future "harness verify" command.

## Decision

We chose **option B — file-IO + env-var presence/shape checks**, with an
explicit `--probe` flag reserved for follow-on work if operator demand
for live HTTP surfaces.

Concrete commitments:

1. Four new check categories land in `packages/cli/src/commands/doctor.ts`:
   - **Live pings** (`checkLivePings`). Verifies env-var presence + shape
     for `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GITHUB_TOKEN`. Missing →
     `info` (operator may not use that integration); wrong prefix or too
     short → `warn`; well-shaped → `pass`. No outbound HTTP.
   - **Hook validity** (`checkHookValidity`). For each file under
     `.harness/hooks/`: JSON hooks parse → `pass` / `fail`. Shell hooks
     with a shebang → `pass`. Without a shebang → `warn`. Empty → `fail`.
     No directory → `info` (hooks are optional).
   - **Baseline freshness** (`checkBaselineFreshness`). For each of
     `.harness/arch/baselines.json`, `benchmark-baselines.json`, and
     `coverage-baselines.json`: mtime < 30 days → `pass`; 30–89 days →
     `warn`; ≥ 90 days → `fail`; absent → `info`.
   - **Session corruption** (`checkSessionCorruption`). Sample the five
     most-recent `.harness/sessions/<id>/` directories. Aggregate one
     `CheckResult` reporting parsed / missing-summary / corrupt counts;
     `fail` if every sample is corrupt, `warn` if some, `pass` otherwise.
2. All checks are **synchronous**. `runDoctor(cwd)` remains a synchronous
   call so existing JSON consumers keep their shape.
3. **No outbound HTTP** unless the operator explicitly opts in. The
   `--probe` flag is reserved but not implemented this phase.
4. Existing checks (`checkNodeVersion`, `checkSlashCommands`,
   `checkMcpConfig`, `checkIntegrations`) are unchanged and run first.
   The four new checks append to the end of the report.

## Consequences

- **Doctor stays fast.** No network calls means no timeouts, no proxy
  surprises. p95 stays under 1 second.
- **Doctor runs anywhere.** Air-gapped environments, restricted CI,
  flaky proxies — all work.
- **More noise.** The check count roughly doubles. Operators who
  previously got "5/5 checks passed" now get "15/18 checks passed" with
  more `info` lines. The increase is mostly `info` (not user-actionable).
- **Wrong-prefix credentials surface.** Operators that paste an `sk-`
  key into `ANTHROPIC_API_KEY` get a `warn`, not a silent pass.
- **Stale baselines stay visible.** A baseline file untouched for six
  months fails the doctor, prompting `harness check-arch --update` or
  the equivalent for that baseline.
- **No false-negative on a real outage.** Because we don't probe
  external services, we can't lie about whether they're reachable. The
  trade-off: we also don't notice when Slack is down.

## Alternatives rejected

- **Live HTTP probes (Option A).** Slow + privacy-leaky (phones home).
  Hostile to air-gapped operators. Cached results would lie about
  outages. Operator-hostile if doctor is in a pre-commit hook.
- **No new checks (Option C).** Leaves the misleading-green-report
  problem in place. The whole point of Phase 3's A7 bundle is to close
  the gap.
- **Per-check configurability via a `doctor` section in
  `harness.config.json`.** Premature — defer until an operator
  complains. Default thresholds (30/90 days for baselines, 5 sessions
  sampled) are conservative.
- **Hook script execution** (not just parse). Too slow, risk of side
  effects on every doctor run.

## References

- Spec: `docs/changes/hermes-phase-3-notifications/proposal.md` §D5–D7
- Parent meta: `docs/changes/hermes-adoption/proposal.md` §A7
- Implementation: `packages/cli/src/commands/doctor.ts`
- Tests: `packages/cli/tests/commands/doctor-hardening.test.ts`
