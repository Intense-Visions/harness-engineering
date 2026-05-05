# Pulse First-Run Interview Reference

The first-run interview converts vague intent ("I want to know how the product is doing") into a concrete `pulse:` block in `harness.config.json`. This document is the rule book the skill quotes when pushing back on input.

## SMART Pushback Rules

For every metric or event the user proposes, the skill MUST evaluate it against the SMART bar and push back when it fails. SMART = **S**pecific, **M**easurable, **A**chievable, **R**elevant, **T**ime-bound.

| Test       | Question                                                             | Reject when                                         |
| ---------- | -------------------------------------------------------------------- | --------------------------------------------------- |
| Specific   | Does the name uniquely identify one event/metric?                    | "engagement", "activity", "usage" without qualifier |
| Measurable | Is there a wired data source that emits this?                        | No analytics/tracing source covers it               |
| Achievable | Can it be queried in <30s within the lookback window?                | Requires a full-table scan over years of data       |
| Relevant   | Does it map to a `STRATEGY.md` Key metric or a documented user pain? | Vanity metric ("total signups ever")                |
| Time-bound | Is the window declared (24h, 7d, 30d)?                               | Naked counter with no time scope                    |

### Pushback script

When a proposed metric fails, the skill MUST:

1. Quote the failing test and the rule.
2. Suggest a concrete repair (example: "engagement" → "session_started events per active user per day").
3. Ask the user to either accept the repair, propose a new name, or skip this metric (it lands in `pendingMetrics` if no source covers it).

The skill MUST NOT silently accept a metric that fails the bar. Pushback is mandatory.

## READ-WRITE-DB Rejection Rule

When the user offers a database connection string for the `db` source:

1. The skill MUST inspect the connection string and reject any of the following without exception:
   - User has `INSERT`, `UPDATE`, `DELETE`, `DROP`, `TRUNCATE`, `ALTER`, `CREATE`, or `GRANT` privileges
   - Connection string includes `?role=admin`, `?role=write`, `?ssl=disable` (the last is a separate red flag worth surfacing)
   - The connection user is named `root`, `admin`, `postgres`, `mysql`, or any name matching `*_admin`, `*_write`, `*_rw`
2. The skill MUST NOT attempt to "downgrade" the credentials silently. It MUST ask the user to provide a read-only credential.
3. If the user insists, the skill MUST refuse and write `sources.db.enabled: false`. Pulse is read-only by contract (Decision 6).
4. The rejection message MUST cite "Decision 6 of the feedback-loops spec: pulse refuses read-write DB credentials".

The skill cannot verify the privilege grant directly without connecting (and connecting is exactly what we're refusing for write creds). The signal-set above is heuristic; when in doubt, refuse and ask.

## Adapter availability check

Before accepting a `sources.analytics` or `sources.tracing` value, the skill MUST verify a `SanitizeFn` adapter is registered for that name:

```ts
import { getPulseAdapter } from '@harness-engineering/core';
if (!getPulseAdapter(value)) {
  // refuse — Decision 7: pulse refuses to enable for a provider whose
  // adapter has no `sanitize` implementation.
}
```

In Phase 3 NO adapters are registered yet — Phase 4 ships them. So during the interview the skill warns:

> "No `SanitizeFn` adapters are currently registered. Recording your selection but pulse will refuse to run until Phase 4 ships adapters for posthog/sentry."

The selection is still written to `harness.config.json` (so re-running pulse later finds it); the runtime refusal is the safety gate.

## Strategy seeding

If `STRATEGY.md` exists at repo root:

- The product `name` is read from frontmatter (`name: '<X>'`); fallback to the first `# <Title>` H1.
- The `## Key metrics` bullet list is treated as a list of REQUIRED metrics that the interview MUST walk through one-by-one.
- Each Key metric goes through the SMART bar; the user may map it to an event/source, defer it to `pendingMetrics`, or explicitly exclude it (which lands it in `excludedMetrics`).

If `STRATEGY.md` is absent, the skill proceeds with no seed and prompts the user from scratch.

## Interview output

After the interview, the skill calls `writePulseConfig(config, { configPath })` from `@harness-engineering/core`:

- The full config matches `PulseConfigSchema`.
- All non-pulse keys in `harness.config.json` are preserved.
- A `harness.config.json.bak` is written before mutation.

Then the skill offers to register the `product-pulse` maintenance task (deferred — that wiring is Phase 6 of the spec; for now the skill notes the offer and explains the user can register it manually later).
