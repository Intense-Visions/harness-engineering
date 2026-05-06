# Feedback Loops: Pulse Reports and Compound Learning Capture

> Add the read-side and post-mortem capture that close harness's compound feedback loop. Pulse reports surface what users actually experienced; compound docs preserve solved problems as reusable playbooks. Both integrate as scheduled maintenance tasks alongside the existing 18 built-ins.

**Date:** 2026-05-05
**Status:** Proposed
**Keywords:** pulse-report, compound-learning, maintenance-tick, post-mortem, observability-readside, knowledge-pipeline

## Overview

Harness writes structural domain facts to `docs/knowledge/` and designs observability instrumentation via `harness-observability`. It does not:

- _Read_ observability data back as a periodic product signal
- Capture _solved problem_ playbooks (post-mortem, "we tried X, Y was the fix") in a structured form

The `.harness/learnings.md` file exists as an unstructured ephemeral sink, but it is not categorized, not searchable, and not durable across context resets.

This spec adds:

1. `harness-pulse` skill — generates a single-page time-windowed report (usage, errors, latency, followups) and writes to `docs/pulse-reports/YYYY-MM-DD_HH-MM.md`
2. `harness-compound` skill — captures a recently solved problem as a structured doc in `docs/solutions/<track>/<category>/<slug>.md` with YAML frontmatter
3. Two new maintenance tasks: `product-pulse` (daily report-only) and `compound-candidates` (weekly report-only scanner)
4. `pulse:` config section in `harness.config.json` (no new config files)
5. Orchestrator integration: per-issue compound step; deprecation of `.harness/learnings.md` as a learnings sink
6. Roadmap-pilot integration: read latest pulse report when prioritizing

### Goals

1. Close the read-side observability gap with a daily, single-page pulse report
2. Preserve solved-problem learnings in structured, categorized, searchable form
3. Reuse the existing maintenance system as the canonical scheduling engine
4. Establish a clear boundary between this work and `harness-knowledge-pipeline`
5. Surface read-side signal upstream into roadmap prioritization and milestone planning

### Non-Goals

- Replacing `harness-knowledge-pipeline` (which extracts structural domain facts from code)
- Building dashboards or metric thresholds — pulse reports are read by humans who interpret
- Auto-writing post-mortems via AI without human invocation (defer; AI-generated post-mortems are confidently wrong)
- Persisting PII in saved reports
- Mutating any external data source (analytics, tracing, payments, DB)

## Decisions

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Rationale                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --- | ---- | ----- | ------- | ------- | ------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Two distinct skills, two distinct artifact roots: `harness-pulse` → `docs/pulse-reports/YYYY-MM-DD_HH-MM.md`; `harness-compound` → `docs/solutions/<track>/<category>/<slug>.md` (canonical path; see Decision 8 for tracks). All references in this spec use the two-level layout                                                                                                                                                                                                                                                                                                                             | They serve different purposes (read-side metrics vs. post-mortem playbooks); shared state would couple them unnecessarily                           |
| 2   | Boundary with `harness-knowledge-pipeline`: pipeline extracts structural domain facts FROM CODE; compound captures post-mortem playbooks WRITTEN BY HUMANS/AGENTS after a fix. Compound output is a _candidate input_ to the knowledge pipeline; the pipeline does not write solutions                                                                                                                                                                                                                                                                                                                         | Clean separation; complementary, not overlapping                                                                                                    |
| 3   | `harness-pulse` registered as a `report-only` maintenance task (`product-pulse`, daily 8am cron)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | The maintenance system is harness's canonical scheduling engine. Reuses leader election, dashboard surfacing, run history for free                  |
| 4   | `harness-compound` is per-issue/opportunistic (invoked from orchestrator step 6b); a _separate_ `compound-candidates` `report-only` maintenance task scans for undocumented learnings weekly                                                                                                                                                                                                                                                                                                                                                                                                                   | Compound itself does not fit cron (it's opportunistic). The candidate scanner DOES fit cron and surfaces gaps. Two clean fits                       |
| 5   | Pulse config lives in `harness.config.json` under `pulse:` section; secrets (analytics provider tokens) stay in env vars                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Consistent with existing harness config layout; no new config file or location to discover                                                          |
| 6   | Pulse is read-only by contract: refuses read-write DB credentials; analytics/tracing tools invoked read-only only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Mirrors CE's safety rule; eliminates entire class of accidents from a scheduled task                                                                |
| 7   | No PII in saved pulse reports. PII contract: each provider adapter (analytics, tracing, payments, db) implements a `sanitize(rawResult): SanitizedResult` interface. The interface's contract: (a) drop fields outside an explicit allowlist (`event_name`, `count`, `timestamp_bucket`, `error_signature`, `latency_ms`, `category`); (b) aggregate any per-row data into count distributions before return; (c) reject any field name matching `email                                                                                                                                                        | user_id                                                                                                                                             | session_id | ip  | name | phone | address | message | content | payload`. Pulse refuses to enable for a provider whose adapter has no `sanitize` implementation | Pulse reports are committed to the repo; PII would be a privacy violation. The interface boundary is the only sanitization layer — making it explicit prevents bypass |
| 8   | Compound categories split into `bug-track/` (build-errors, test-failures, runtime-errors, performance-issues, database-issues, security-issues, ui-bugs, integration-issues, logic-errors) and `knowledge-track/` (architecture-patterns, design-patterns, tooling-decisions, conventions, dx, best-practices). Categories are extensible via schema, not closed                                                                                                                                                                                                                                               | Proven CE taxonomy; both fix-shape and pattern-shape learnings have a home                                                                          |
| 9   | `.harness/learnings.md` is deprecated **as a compounding-knowledge sink only**. The runtime read paths in `packages/core/src/state/learnings*.ts`, the MCP `learnings` resource, and ephemeral session use are all preserved unchanged. The orchestrator template (root `harness.orchestrator.md` AND the templated copy in `templates/orchestrator/harness.orchestrator.md`) replaces "Document your progress and any learnings in `.harness/learnings.md`" with the new compound directive (Decision orchestrator-step-6b). Code paths writing to `.harness/learnings.md` for ephemeral session notes remain | Avoids breaking live consumers; the deprecation is scoped to the orchestrator's "preserve compounding knowledge" semantic, not the file's existence |
| 10  | Compound auto-invocation via trigger phrases ("that worked", "fixed") deferred                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | YAGNI — opt-in is safer until usage data justifies; manual invocation or candidate-list dispatch is enough                                          |
| 11  | Pulse "single page" constraint: 30–40 lines target output                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Dashboards with 40 metrics produce attention sprawl; a constrained output forces noticing what matters                                              |
| 12  | Strategy seeding when present: pulse first-run interview reads `STRATEGY.md` `Key metrics` and treats them as required wiring targets; soft fallback if absent                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Closes the loop between strategic-anchor and feedback-loops without coupling the two specs                                                          |
| 13  | Roadmap-pilot reads the most recent `docs/pulse-reports/` file when present, but does not block on absence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Strategic alignment is enriched with current product signal; soft-fails when pulse hasn't been wired yet                                            |
| 14  | `compound-candidates` task is `report-only`, NOT `pure-ai`. Output is a list of candidate prompts, not auto-written solution docs                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | AI-generated post-mortems would be confidently wrong; the gap report is the right level of automation                                               |

## Technical Design

### `pulse:` config section in `harness.config.json`

```jsonc
"pulse": {
  "enabled": true,
  "lookbackDefault": "24h",
  "primaryEvent": "<engagement event name>",
  "valueEvent": "<value-realization event name>",
  "completionEvents": ["<event 1>", "..."],
  "qualityScoring": false,
  "qualityDimension": null,
  "sources": {
    "analytics": "posthog",
    "tracing": "sentry",
    "payments": null,
    "db": { "enabled": false }
  },
  "metricSourceOverrides": {},
  "pendingMetrics": [],
  "excludedMetrics": []
}
```

Tokens for analytics/tracing providers stay in env vars (e.g. `PULSE_POSTHOG_TOKEN`, `PULSE_SENTRY_TOKEN`). Schema validation lives in `packages/core/src/pulse/`.

### `harness-pulse` skill structure

Phases:

- **Phase 0**: Route by config state. If `pulse.enabled` is unset → first-run interview (Phase 1). If set → skip to Phase 2
- **Phase 1**: First-run interview — seed from `STRATEGY.md` if present (extract product name and key metrics); ask about events, completions, quality scoring, data sources, default lookback. Apply SMART bar pushback on every metric/event proposed. Refuse read-write DB credentials. Write `pulse:` to `harness.config.json`. Offer to register `product-pulse` maintenance task
- **Phase 2**: Run the pulse — dispatch analytics/tracing/payments queries in parallel; serial DB queries with cost cap; optional quality sampling. Apply 15-minute trailing buffer to window upper bound to handle ingestion lag
- **Phase 3**: Assemble report from `references/report-template.md` — Headlines (2–3 lines), Usage, System performance, Followups. 30–40 line target
- **Phase 4**: Save to `docs/pulse-reports/YYYY-MM-DD_HH-MM.md` (local time). Surface Headlines and top Followup in chat

### `harness-compound` skill structure

Phases:

- **Phase 1**: Identify the problem and solution (from conversation, recent commits, debug session output)
- **Phase 2**: Classify track (bug vs knowledge) and category. Read `references/schema.yaml` and `references/category-mapping.md`
- **Phase 3**: Overlap detection — check `docs/solutions/<track>/<category>/` for existing docs covering the same problem. If overlap is high, update the existing doc instead of creating a new one
- **Phase 4**: Assemble doc from `assets/resolution-template.md` — track-appropriate sections (bug: Problem, Root cause, Solution, Prevention; knowledge: Context, Guidance, Applicability)
- **Phase 5**: Write to `docs/solutions/<track>/<category>/<slug>.md` with valid YAML frontmatter (`module`, `tags`, `problem_type`, `last_updated`)
- **Phase 6**: Optional specialized agent reviews based on category (perf-oracle for performance-issues, security-sentinel for security-issues, etc.) — these enhance, not gate

### Maintenance task definitions

Add to `packages/orchestrator/src/maintenance/task-registry.ts`:

```typescript
{
  id: 'product-pulse',
  type: 'report-only',
  description: 'Generate time-windowed pulse report (usage, errors, latency, followups)',
  schedule: '0 8 * * *',  // daily 8am after analytics ingestion settles
  branch: null,
  checkCommand: ['pulse', 'run', '--lookback', '24h', '--non-interactive'],
},
{
  id: 'compound-candidates',
  type: 'report-only',
  description: 'Scan recent fixes for undocumented learnings; surface candidates',
  schedule: '0 9 * * 1',  // Mondays 9am — avoids 6am collision with traceability + cross-check
  branch: null,
  checkCommand: ['compound', 'scan-candidates', '--lookback', '7d'],
},
```

The `product-pulse` task is gated on `pulse.enabled: true` (the only config that exists). It is registered with the maintenance system but a runtime check at task start reads `harness.config.json`; if `pulse.enabled` is missing or false, the task logs "pulse not configured; run /harness:pulse to set up" and exits as `skipped`.

The `compound-candidates` task has no enabled gate — it is a cheap report-only scan; if there are no candidates, it produces an empty report and exits as `no-issues`. There is no `compound:` config block.

**Non-interactive mode for `harness pulse run`:** when invoked without TTY (the maintenance task path), the CLI reads `harness.config.json` for everything an interview would normally collect. If a required value is missing, the task exits as `skipped` with a "pulse not configured" message. The task NEVER attempts to prompt or write config in this path. The `--non-interactive` flag is implicit when there is no TTY; an explicit flag is supported for testing.

### Compound candidate scanner output

Output: `docs/solutions/.candidates/YYYY-WW.md` (week-keyed):

```markdown
# Compound candidates — week 2026-W18

## Undocumented fixes (from `git log` past 7 days)

- **fix(orchestrator): handle stalled lease cleanup** (commit abc123, 4 iterations on branch)
  - Suggested category: bug-track/concurrency-issues
  - Run: `/harness:compound "stalled lease cleanup in orchestrator"`

- **fix(cli): retry budget exhaustion on flaky tests** (commit def456, 7-day debug session)
  - Suggested category: bug-track/test-failures
  - Run: `/harness:compound "retry budget exhaustion"`

## Pattern candidates (from churn + hotspot analysis)

- File `packages/orchestrator/src/state-machine.ts` has 12 commits in 7 days; no docs/solutions/ entry
  - Suggested category: knowledge-track/architecture-patterns
  - Run: `/harness:compound "state machine pattern in orchestrator"`
```

The dashboard's maintenance UI surfaces an "N undocumented learnings this week" badge that links to the candidate file.

### Orchestrator integration

Update `harness.orchestrator.md` template:

```diff
   6. **Code Review:** Use `/harness:code-review` and `/harness:pre-commit-review`
      to perform a final quality check before completing the task.

+  6b. **Compound (when applicable):** Run `/harness:compound` when ANY of these
+      concrete triggers fired during this issue:
+      (a) `/harness:debugging` was invoked at any point (regardless of outcome),
+      (b) the fix required more than one commit on the issue branch,
+      (c) execution involved >1 attempt (orchestrator template's `Attempt Number`
+          variable was incremented), or
+      (d) the change touched a file already listed in the latest hotspot report.
+      Otherwise skip. The triggers are mechanical — no judgment required.

   7. **Ship:** When the review is clean, you are pre-authorized to ship without asking:
      ...

   ## Rules
   - Always verify your changes with `harness validate`.
   - Adhere to the architectural constraints defined in `harness.config.json`.
-  - Document your progress and any learnings in `.harness/learnings.md`.
+  - For non-trivial learnings, run /harness:compound (writes structured docs to
+    docs/solutions/<track>/<category>/). The .harness/learnings.md file remains for
+    ephemeral session notes only and is not preserved as compounding knowledge.
```

### Roadmap-pilot integration

In `harness-roadmap-pilot` Phase 2 RECOMMEND (the actual phase name in the existing skill), add:

```
- Read the most recent docs/pulse-reports/*.md (if any)
- For each candidate roadmap item, check whether the latest pulse surfaces
  signal that elevates or suppresses its priority (e.g., a top followup item
  related to a candidate; an error spike in a candidate's area)
- Cite pulse signal in the recommendation rationale when applicable
- Soft-fail when no pulse reports exist
```

### Knowledge pipeline integration

Update `harness-knowledge-pipeline` Phase 1 EXTRACT to include `docs/solutions/` as a candidate input to `BusinessKnowledgeIngestor`. Solutions docs with knowledge-track category and stable last_updated dates are candidates for promotion to `business_fact` graph nodes.

## Integration Points

### Entry Points

- New slash command: `/harness:pulse [window]`
- New slash command: `/harness:compound [context]`
- New CLI subcommands: `harness pulse run`, `harness pulse scan-candidates` (these power the maintenance tasks)
- New CLI subcommand: `harness compound scan-candidates`
- New maintenance tasks: `product-pulse`, `compound-candidates`

### Registrations Required

- Skill barrel exports for `harness-pulse` and `harness-compound`
- Slash command regeneration
- `BUILT_IN_TASKS` registry entries (in `task-registry.ts`)
- `pulse:` schema registered with `harness validate`
- Maintenance dashboard surfaces both tasks
- Compound categories registered with `BusinessKnowledgeIngestor`

### Documentation Updates

- `harness.orchestrator.md` — step 6b for compound; deprecation of `.harness/learnings.md` as learnings sink
- `AGENTS.md` — surface `docs/solutions/` and `docs/pulse-reports/` for agent discovery; explain the boundary between compound and knowledge-pipeline
- `harness-knowledge-pipeline` SKILL.md — note `docs/solutions/` as candidate input
- `harness-roadmap-pilot` SKILL.md — pulse signal in prioritization
- `harness-observability` SKILL.md — note that pulse is the read-side companion
- `docs/conventions/` — convention doc on compound vs knowledge-pipeline boundary

### Architectural Decisions

- **[ADR-0003](../../../knowledge/decisions/0003-compound-vs-knowledge-pipeline-boundary.md)**: Compound vs knowledge-pipeline scope boundary (post-mortem playbooks vs structural domain facts)
- **[ADR-0004](../../../knowledge/decisions/0004-report-only-maintenance-tasks-for-pulse-and-compound.md)**: Pulse and compound-candidates as report-only maintenance tasks (vs standalone /schedule wiring)
- **[ADR-0005](../../../knowledge/decisions/0005-pulse-config-in-harness-config-json.md)**: Pulse config in `harness.config.json` (vs separate config file)
- **[ADR-0006](../../../knowledge/decisions/0006-compound-auto-invocation-deferred.md)**: Compound auto-invocation deferred (vs trigger-phrase detection)
- **[ADR-0007](../../../knowledge/decisions/0007-learnings-md-deprecation-scope.md)**: Deprecation of `.harness/learnings.md` as a learnings sink

### Knowledge Impact

- New knowledge concept: solution-doc → candidate input for `BusinessKnowledgeIngestor`
- Categories under `docs/solutions/knowledge-track/` may produce stable `business_fact` nodes
- `docs/solutions/.candidates/` becomes a tracked surface for the maintenance dashboard

## Success Criteria

1. `harness-pulse` first-run interview wires up `pulse:` in `harness.config.json` and registers `product-pulse` maintenance task in under 5 minutes for a project with PostHog + Sentry
2. The `product-pulse` maintenance task runs daily at 8am, writes a 30–40 line report to `docs/pulse-reports/`, and surfaces in the maintenance dashboard
3. Pulse refuses any read-write DB credential supplied during interview (test fixture: a connection string with write permissions is rejected)
4. Saved pulse reports contain no PII (test fixture: a query that would return user emails is sanitized to count distributions)
5. `harness-compound` writes a structured doc with valid YAML frontmatter passing schema validation; categories land in correct directories
6. Compound's overlap-detection step prevents duplicate docs (test fixture: invoking `/harness:compound` twice on the same problem updates the existing doc rather than creating a new one)
7. `compound-candidates` task surfaces at least one candidate when run against a fixture repo with 3 recent fixes lacking solution docs; the same task on a fixture with all fixes already documented produces an empty report and `no-issues` status
8. `harness.orchestrator.md` template's step 6b is exercised end-to-end (test: a non-trivial fix flows through orchestrator and produces a `docs/solutions/` entry)
9. `.harness/learnings.md` reference is removed from orchestrator template; replaced with compound directive
10. `harness-roadmap-pilot` cites pulse signal in prioritization rationale when a recent pulse report exists
11. `harness validate` passes on a project with `pulse:` config and a populated `docs/solutions/` directory
12. The boundary between `harness-knowledge-pipeline` and `harness-compound` is exercised: compound writes a knowledge-track doc; pipeline ingests it as a candidate `business_fact`
13. Per-category lock file prevents two concurrent `/harness:compound` invocations on the same category from creating duplicate docs (test fixture: spawn two concurrent invocations on the same problem; verify exactly one doc is created and the other receives "lock held" message)
14. Provider-adapter sanitization rejects a query result containing `email` field (test fixture: a synthetic analytics response containing user emails is sanitized to a count distribution; emails do not appear in the saved report)

## Implementation Order

### Phase 1: Schema Foundations

<!-- complexity: low -->

Define `pulse:` Zod schema in `packages/core/src/pulse/` and solution-doc YAML frontmatter Zod schema in `packages/core/src/solutions/`. Both modules export their types via `@harness-engineering/types` so `packages/graph/src/ingest/BusinessKnowledgeIngestor` can read them without violating the layer boundary. Wire both schemas into `harness validate`. Create category directory structure under `docs/solutions/<track>/<category>/`. Write `references/schema.yaml`, `references/category-mapping.md`, `assets/resolution-template.md`.

### Phase 2: harness-compound Skill

<!-- complexity: medium -->

Implement `harness-compound` skill with phases: identify → classify → overlap-check → assemble → write. Per-category file lock under `.harness/locks/compound-<category>.lock` to serialize concurrent invocations on the same category. Integration tests with bug-track and knowledge-track fixtures including a duplicate-detection fixture for overlap-check.

### Phase 3: harness-pulse Skill (Interview)

<!-- complexity: medium -->

Implement `harness-pulse` first-run interview: SMART pushback rules, refuse read-write DB credentials, seed product name and key metrics from `STRATEGY.md` when present. Write `pulse:` block to `harness.config.json`. Provider-adapter `sanitize` interface defined as part of this phase (each adapter must implement it before being usable).

### Phase 4: harness pulse run CLI

<!-- complexity: high -->

Implement `harness pulse run` CLI subcommand for non-interactive maintenance-task path. Dispatch analytics + tracing + payments queries in parallel with 15-minute trailing buffer. Apply PII sanitization at adapter boundary (drop-allowlist + count distributions). Assemble single-page report from template. High complexity: external-API integration + security-critical sanitization layer + parallel query orchestration.

### Phase 5: harness compound scan-candidates CLI

<!-- complexity: medium -->

Implement `harness compound scan-candidates` CLI subcommand: git log scan + hotspot analysis + cross-reference against existing `docs/solutions/<track>/<category>/`. Write `docs/solutions/.candidates/YYYY-WW.md` with candidate prompts.

### Phase 6: Maintenance Task Registration

<!-- complexity: low -->

Add `product-pulse` and `compound-candidates` to `BUILT_IN_TASKS` in `packages/orchestrator/src/maintenance/task-registry.ts`. `product-pulse` runtime-checks `pulse.enabled` at task start (skipped if false); `compound-candidates` has no gate. Surface both in the maintenance dashboard with last-run result and candidate-count badge.

### Phase 7: Orchestrator and Cross-Skill Integration

<!-- complexity: medium -->

Add step 6b (compound directive with mechanical triggers) to BOTH `harness.orchestrator.md` AND `templates/orchestrator/harness.orchestrator.md`. Replace `.harness/learnings.md` directive in both files with the compound directive. Preserve existing `packages/core/src/state/learnings*.ts` code paths and MCP `learnings` resource. Update `harness-roadmap-pilot` Phase 2 RECOMMEND to read latest pulse report. Update `harness-knowledge-pipeline` Phase 1 EXTRACT to register `docs/solutions/` as candidate input to `BusinessKnowledgeIngestor`.

### Phase 8: Documentation and ADRs

<!-- complexity: low -->

Write 5 ADRs (compound-vs-knowledge-pipeline boundary, maintenance-task-vs-schedule, pulse-config-location, compound-auto-invocation-deferral, learnings.md-deprecation-scope). Update AGENTS.md to surface `docs/solutions/` and `docs/pulse-reports/`. Write conventions doc on the compound vs knowledge-pipeline boundary.

## Risks and Mitigations

- **Risk:** `harness-pulse` and `harness-knowledge-pipeline` boundary blurs over time → **Mitigation:** ADR-0003 explicitly defines the boundary; conventions doc with examples; periodic check during code review
- **Risk:** Compound categories proliferate (every new fix invents a category) → **Mitigation:** Schema validation rejects unknown categories; new category requires PR with rationale
- **Risk:** Pulse reports accumulate as commit churn (1 commit/day) → **Mitigation:** Pulse report writes are explicit commits with consistent message format; tooling can ignore them in change-impact analysis
- **Risk:** `compound-candidates` produces noisy lists nobody acts on → **Mitigation:** Dashboard badge shows count; week-over-week trend visible; if action rate < 10% the task should be revisited
- **Risk:** Maintenance task gating prevents pulse from running silently after a config-key rename → **Mitigation:** `harness validate` flags missing/renamed pulse config keys; CI catches before merge
- **Risk:** PII sanitization gets bypassed by a new analytics provider with different output shape → **Mitigation:** Sanitization is a layer on top of provider adapters; new provider must implement the sanitizer interface or pulse refuses to enable
- **Risk:** Deprecation of `.harness/learnings.md` strands existing content → **Mitigation:** One-time migration script in `harness compound migrate-learnings` reads existing file and proposes compound docs for each entry
- **Risk:** Cross-spec schema drift — strategic-anchor renames `Key metrics` → `Metrics` and pulse first-run silently regresses to soft-fallback → **Mitigation:** Pulse first-run interview validates STRATEGY.md against the schema version it expects; reports a config-drift warning when seeded fields cannot be located; warning surfaced in maintenance dashboard
- **Risk:** Concurrent `/harness:compound` invocations race on overlap-detection and produce duplicate docs → **Mitigation:** Compound takes a per-category file lock in `.harness/locks/compound-<category>.lock` for the duration of overlap-check + write. Lock auto-releases on process exit. Concurrent invocations on different categories proceed in parallel; same-category concurrent invocations serialize
- **Risk:** Solution-doc schema in `packages/core/src/solutions/` and graph package consumption skew → **Mitigation:** Schema types flow only through `@harness-engineering/types` (existing layer rule); type-only imports prevent runtime coupling; integration test asserts `BusinessKnowledgeIngestor` consumes the latest schema version
