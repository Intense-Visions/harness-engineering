---
type: business_process
domain: cli
tags:
  [
    doctor,
    hardening,
    live-pings,
    hook-validity,
    baseline-freshness,
    session-corruption,
    hermes-phase-3,
  ]
phase: hermes-phase-3
status: shipped
---

# Doctor Hardened Checks

`harness doctor` is the operator-facing health command. Pre-Phase 3 it
verified presence-only state: Node version, slash command files, MCP
config, Tier-0 integrations. After Phases 0–2 added live runtime state
(auth tokens, webhook subscriptions, telemetry export, optional session
archives, architecture/benchmark/coverage baselines), a presence-only
report could be misleading — every file present and yet env vars
missing, hooks unparseable, baselines stale, sessions corrupted.

Phase 3 adds four new check classes, all synchronous and all file-IO
only. Outbound HTTP probes are explicitly out of scope for the default
run; a future `--probe` flag is reserved.

## Check classes

### Live integration credentials (`checkLivePings`)

Verifies env-var presence and **shape** for well-known integration
credentials:

| Env var             | Required prefix | Min length |
| ------------------- | --------------- | ---------- |
| `ANTHROPIC_API_KEY` | `sk-ant-`       | 30         |
| `OPENAI_API_KEY`    | `sk-`           | 20         |
| `GITHUB_TOKEN`      | _(none)_        | 30         |

Each credential produces one `CheckResult`:

- absent → `info` (operator may not use that integration)
- present, prefix + length OK → `pass`
- present, wrong prefix OR too short → `warn` with a fix hint

No outbound HTTP. The shape check catches the most common error class
(pasting the wrong key into the wrong env var).

### Hook validity (`checkHookValidity`)

For each file under `.harness/hooks/`:

- `.json` hooks parse → `pass` / `fail` on syntax error
- shell or node hooks: empty → `fail`; missing shebang → `warn`;
  shebang present → `pass`
- directory absent → single `info` result (hooks are optional)

One `CheckResult` per hook so a single bad hook is individually
addressable in the operator's report.

### Baseline freshness (`checkBaselineFreshness`)

For each of `.harness/arch/baselines.json`, `benchmark-baselines.json`,
and `coverage-baselines.json`:

| Age        | Result |
| ---------- | ------ |
| < 30 days  | `pass` |
| 30–89 days | `warn` |
| ≥ 90 days  | `fail` |
| absent     | `info` |

`fix` hints point at the canonical refresh command for each
(`harness check-arch --update`, etc.).

### Session corruption (`checkSessionCorruption`)

Samples the five most-recent `.harness/sessions/<id>/` directories,
parses each `session-summary.json`, aggregates one `CheckResult`:

- all parse → `pass`
- some parse, some fail → `warn` (names the corrupt sessions)
- all sampled fail → `fail`
- no sessions directory → `info`

Bounded sample size keeps the check fast even on long-running projects
with thousands of archived sessions.

## Operating invariants

- **All checks are synchronous.** `runDoctor(cwd)` retains its sync
  shape; JSON consumers keep their result schema.
- **No outbound HTTP** in the default run. Air-gapped environments
  and restricted CI continue to work unchanged.
- **Existing checks unchanged.** Node version, slash commands, MCP
  config, integrations registry — all four legacy checks run first,
  then the four new ones append.
- **Status taxonomy unchanged.** `pass | fail | warn | info` and the
  existing `CheckResult` shape are preserved. New checks add new
  `name` fields only.

## CLI surface

```
harness doctor          # human output (color, icons)
harness doctor --json   # JSON for programmatic consumers
```

The JSON shape is additive: new checks add entries to `checks[]`;
nothing existing is removed or renamed.

## Related concepts

- **Doctor Live Ping** — credential presence + shape check (no HTTP).
- **Doctor Baseline Freshness** — staleness threshold (30/90 days).
- **Doctor Session Corruption** — sample-and-parse newest sessions.
- **Doctor Hook Validity** — JSON parse / shebang detection.

## Rules

- Live-ping default is presence + shape only; outbound HTTP requires
  explicit `--probe` (reserved, not implemented this phase).
- Baseline `< 30 days` → pass; `30–89 days` → warn; `≥ 90 days` → fail;
  absent → info.
- Session corruption sample is fixed at the 5 most-recent sessions;
  bounded to keep doctor under 1 second p95.
- Doctor exit code is non-zero if any check is `fail`. `warn` and
  `info` do not affect the exit code.

## References

- ADR: `docs/knowledge/decisions/0014-doctor-live-state-checks.md`
- Spec: `docs/changes/hermes-phase-3-notifications/proposal.md` §D5–D7
- Parent: `docs/changes/hermes-adoption/proposal.md` §A7
- Implementation: `packages/cli/src/commands/doctor.ts`
- Tests: `packages/cli/tests/commands/doctor-hardening.test.ts`
