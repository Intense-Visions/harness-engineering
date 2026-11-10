---
type: business_process
domain: orchestrator
tags: [maintenance, custom-tasks, scheduler, check-script, context-chaining, hermes-phase-2]
phase: hermes-phase-2
---

# Custom maintenance jobs

**Phase:** Hermes Phase 2 — Custom Maintenance Jobs
**Related ADR:** `docs/knowledge/decisions/0015-hermes-phase-2-custom-maintenance-jobs.md`

Phase 2 extends `MaintenanceScheduler` beyond the 21 built-in tasks: operators
declare arbitrary recurring jobs in `harness.orchestrator.md` (under
`maintenance.customTasks`) and they flow through the same leader-elected,
history-tracked, dashboard-rendered pipeline as the built-ins. Per-run outputs
persist on disk so downstream jobs can chain context, the agent prompt can
inline skill markdown at runtime, and every run is tagged with its trigger
origin (cron / cli / api / chain).

## Pipeline

```
harness.orchestrator.md                  Orchestrator boot                 Scheduler
─────────────────────────                ────────────────                  ─────────
maintenance:                       ─►   validateCustomTasks()        ─►   resolveTasks() merges
  customTasks:                            cycles, missing fields,           BUILT_IN_TASKS + customs
    my-lint:                              skill refs, script paths
      type: mechanical-ai
      checkScript: { path }
      inlineSkills: [...]
      contextFrom: [...]
                                                                      ─►   cron fires task
                                                                            origin: 'cron'
                                                                      ─►   TaskRunner.run(task, origin)

TaskRunner                              ContextResolver                    CheckScriptRunner
──────────                              ───────────────                    ─────────────────
runMechanicalAI/runPureAI/...           resolveInlineSkills(...)           run(spec, cwd)
  composePromptContext(task)  ─►          char-budget cap                    execFile(path, args)
                                          warn-then-truncate                 parse last JSON line
                                        resolveContextFrom(...)              fall back to heuristic regex
                                          per-upstream truncation
                                          stale/missing markers

                                                                          TaskOutputStore
                                                                          ───────────────
runMechanicalAI returns                                                   write(taskId, entry)
{ result, captured }                                                       per-task retention
  result.origin set by caller                                              .harness/maintenance/<id>/outputs/
  persistOutput(...) writes entry                                          <iso>.json
```

All four task types support custom tasks; no new type is introduced.

## Configuration

`MaintenanceConfig` (in `@harness-engineering/types`) gains an optional
`customTasks: Record<string, CustomTaskDefinition>` field. Task IDs must
match `^[a-z0-9][a-z0-9-]*$` and may not collide with built-ins.

```ts
maintenance:
  enabled: true
  customTasks:
    weekly-stripe-rotation-audit:
      type: mechanical-ai
      description: Audit Stripe key rotation freshness
      schedule: '0 9 * * 1'
      branch: harness-maint/stripe-rotation
      checkScript:
        path: ./bin/audit-stripe-rotation
        parseStdoutJson: true
        timeoutMs: 60000
      fixSkill: harness-stripe-rotation-fix
      inlineSkills:
        - pci-dss-rotation-policy
      inlineSkillsBudgetTokens: 6000
      contextFrom:
        - security-findings
      contextFromMaxAgeMinutes: 1440
      outputRetention:
        runs: 100
        maxAgeDays: 90
```

## `checkScript` status envelope

When `parseStdoutJson` is enabled (default), the runner scans stdout from
the last non-empty line backward for a JSON object matching:

```json
{
  "status": "ok" | "findings" | "skip" | "error",
  "findings": 4,
  "wakeAgent": true,
  "message": "...",
  "outputs": { "...": "..." }
}
```

Mapping to `RunResult`:

| envelope status | `wakeAgent`     | Effect                                                       |
| --------------- | --------------- | ------------------------------------------------------------ |
| `ok`            | (any)           | `status: 'no-issues'`, no AI dispatch                        |
| `findings`      | `true` (or > 0) | mechanical-ai branch fires AI dispatch with `findings` count |
| `findings`      | `false`         | Findings recorded, no AI dispatch (`status: 'no-issues'`)    |
| `skip`          | (any)           | `status: 'skipped'`, `message` recorded                      |
| `error`         | (any)           | `status: 'failure'`, `message` becomes `RunResult.error`     |

Built-ins keep the legacy regex-extraction path (`/\d+\s+(?:finding|issue|...)/i`)
without modification.

## Output persistence

`TaskOutputStore` writes one JSON file per run at:

```
.harness/maintenance/<task-id>/outputs/<iso-timestamp>.json
```

Each entry is a `PersistedOutputEntry`:

```ts
{
  taskId, startedAt, completedAt,
  status, findings, fixed, prUrl, prUpdated,
  origin,
  stdout?, stderr?, structured?,
  context?,
}
```

Retention sweeps after every write (last-N + maxAgeDays, default
50 / 30 days, per-task overridable via `outputRetention`).

## `origin` provenance

`RunResult.origin: RunOrigin` is set by the entry point and never
configurable:

| Variant                             | Set by                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| `'cron'`                            | `MaintenanceScheduler`                                                        |
| `'cli'`                             | `harness maintenance run …` (reserved; Phase 2 v1 ships only `list` / `show`) |
| `{ kind: 'api', tokenName }`        | Gateway API trigger (Phase 0)                                                 |
| `{ kind: 'chain', upstreamTaskId }` | Downstream `contextFrom` resolution (reserved)                                |

Optional on `RunResult` so older dashboards rendering newer payloads stay safe.

## CLI surface

- `harness maintenance list` — built-in + custom tasks merged view.
- `harness maintenance show <task-id> --limit N` — last N persisted runs.
- `harness mcp-guard check` — pre-launch OSV malware guard for the `.mcp.json` packages.
- `harness cleanup-sessions --all` — sweep every registered `.harness/` target.

## See also

- `docs/knowledge/decisions/0015-hermes-phase-2-custom-maintenance-jobs.md`
- `docs/changes/hermes-phase-2-custom-jobs/proposal.md`
- `docs/knowledge/cli/pre-launch-osv-guard.md`
