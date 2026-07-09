---
title: 'harness:rollback — Automated Revert Primitive'
status: proposed
milestone: 'v5.0 — Enforcement Hardening'
roadmap: 'github:Intense-Visions/harness-engineering#533'
keywords:
  [
    rollback,
    revert,
    post-merge,
    circuit-breaker,
    outcome-eval,
    signals,
    operations-gap,
    trust-model,
  ]
---

# harness:rollback — Automated Revert Primitive

## Overview

A post-ship circuit breaker for the harness SDLC. When a merged PR fails post-merge
evaluation or a tracked signal crosses a configured threshold, the system classifies
whether the PR is safely revertible and, if so, **opens a full-context revert PR for a
human to merge**. This fills the **Operations `gap`** identified in
`docs/knowledge/skills/sdlc-coverage-and-agentic-trajectory.md` (recommendation #4,
"extend enforcement past ship") — the article's circuit breaker that "physically stops
the fall before it hits the ground."

The core is a testable `harness rollback` CLI command. A post-merge GitHub workflow
(sibling of `.github/workflows/roadmap-auto-done.yml`) triggers it; the `harness:rollback`
skill is the manual/agent entry point for a considered on-demand revert.

`[evidence]` `docs/knowledge/skills/sdlc-coverage-and-agentic-trajectory.md` — Operations
marked `gap`; recommendation #4 "extend enforcement past ship."
`[evidence]` `STRATEGY.md#tracks` — advances the "Full-lifecycle reach" track
(post-ship enforcement, the outcome/adjudication edge).

## Goals

- **G1** — A merged PR that crosses a configured signal threshold produces a revert PR
  with full context, no human polling required (the live v1 arm).
- **G2** — A revert PR is only opened when the PR is _revert-ready_ (clean `git revert` +
  no dependent later merge); non-clean cases are surfaced, not silently attempted.
- **G3** — The revert PR body carries decision context: trigger, target PR, blast-radius
  score, and any migration/irreversibility warnings.
- **G4** — Every proposal emits an append-only `rollback_event` breadcrumb so a future
  auto-merge tier's trust can be justified by data rather than hope.
- **G5** — The eval-triggered arm exists behind a flag, dark until #31 wires outcome-eval
  post-merge; activating it is a config flip, not a redesign.

**Non-goals:** auto-merging reverts (deferred tier); deployment/infrastructure rollback;
migration _reversal_ (only detection → warning).

## Decisions made

| #   | Decision                                                                                               | Rationale                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Trigger-agnostic engine; **signal arm live, eval arm dark until #31**                                  | Ships value now without the #31 dependency; the eval arm is a config flip, not a redesign.                                                   |
| D2  | **Propose-only** in v1; guardrails built for a later auto-merge tier                                   | Auto-merging code is high-blast-radius; earn trust via audited proposals first (matches `required-review` rollout).                          |
| D3  | Revert-ready = **clean `git revert` + no dependent later merge**; blast-radius/migration as PR context | Catches the dominant failure (naive revert orphans newer work) without hard migration-reversibility detection; the human is the v1 backstop. |
| D4  | **`harness rollback` CLI command** as core; thin post-merge workflow; skill = manual entry             | Testable seam in `packages/cli`; mirrors the command-does-work / workflow-triggers split.                                                    |
| D5  | **Stateless composer + append-only `rollback_event`** (Approach 3)                                     | Proven `roadmap-auto-done` mechanism; the one non-backfillable thing (proposal correctness) is captured cheaply.                             |

## Technical Design

### CLI core — `harness rollback` (`packages/cli/src/commands/rollback.ts`)

Single entry point the workflow and skill both call:

```
harness rollback evaluate --pr <n> [--trigger signal|eval] [--reason <str>] [--dry-run]
```

Pipeline: **resolve target** (merged PR → merge commit + changed files) →
**classify revert-ready** → **compose** (dry-run prints the PR body; real opens the PR) →
**emit breadcrumb**. Returns a structured `RollbackDecision`.

`RollbackDecision` (new type, `packages/core/src/rollback/`):

```ts
interface RollbackDecision {
  targetPr: number;
  trigger: 'signal' | 'eval';
  revertReady: boolean;
  reasons: string[]; // why ready / not ready
  cleanRevert: boolean; // git revert -n applies without conflict
  dependentMerges: number[]; // later PRs touching the same files
  blastRadius?: number; // context only, never a gate
  migrationWarnings: string[]; // context only
  action: 'proposed' | 'skipped' | 'blocked';
  prUrl?: string;
}
```

### Classification (`packages/core/src/rollback/classify.ts`)

Pure and unit-testable (git/gh reached through injected IO seams, not called directly):

- **`cleanRevert`** — attempt `git revert -n -m 1 <mergeSha>` in a scratch index (no
  working-tree mutation), capture conflict status, then abort. Clean apply → `true`.
- **`dependentMerges`** — PRs merged after the target whose changed-file set intersects
  the target's. Non-empty → `revertReady=false`, `action='blocked'`.
- **`blastRadius` / `migrationWarnings`** — best-effort **context, never a gate**.
  Blast-radius via the existing `compute_blast_radius` capability; migration detection is
  a path heuristic (`**/migrations/**`, `*.sql`, schema files) emitting warning strings.

### Trigger arms

- **Signal arm (live in v1)** — a scheduled workflow reads `.harness/signals/timeline.json`.
  A `rollback.signals` block in `harness.config.json` maps
  `signalName → { threshold, direction, window }`. A crossing resolves to the PR(s)
  merged in the window and calls `evaluate --trigger signal`.
- **Eval arm (dark in v1)** — guarded by `rollback.evalTrigger.enabled` (default `false`).
  When #31 lands, the post-merge eval job calls `evaluate --trigger eval` on a
  high-confidence `NOT_SATISFIED`. Until then the code path exists and is unit-tested but
  never fires.

### PR composer (`packages/cli/src/rollback/compose.ts`)

Builds the `git revert` PR via `gh`: title `revert: <original> (automated rollback)`,
marker label `harness:rollback` for idempotency (skip if an open revert PR for that target
already exists), body = the full context block (trigger, target, blast-radius, warnings,
classification reasons).

### Breadcrumb

Append-only `rollback_event` to `.harness/signals/` plus a graph node linked to the
target's `execution_outcome`:
`{ targetPr, trigger, revertReady, action, prUrl, ts }`. The outcome (did the revert PR
merge?) is reconciled later by the same merge-close path that powers `roadmap-auto-done`.

### Workflow — `.github/workflows/rollback-propose.yml`

Sibling of `roadmap-auto-done.yml`: `pull_request: [closed]` plus a scheduled cron for the
signal sweep; permissions `contents: write` + `pull-requests: write`;
concurrency-serialized. **No self-approving PAT** — propose-only means a human merges; that
guardrail arrives only with the deferred auto-merge tier.

## Integration Points

### Entry Points

- New CLI command `harness rollback` (`evaluate` subcommand).
- New skill `harness:rollback` (manual / agent on-demand revert).
- New workflow `.github/workflows/rollback-propose.yml`.
- New core module `packages/core/src/rollback/`.

### Registrations Required

- Register `rollback` in the CLI command table.
- Add `rollback` exports to the core barrel — **curated allowlist**:
  `scripts/generate-core-barrel.mjs` must be edited or the export is a silent no-op.
- Four byte-identical skill dir copies under
  `agents/skills/{claude-code,cursor,codex,gemini-cli}/harness-rollback`.
- Skill tier assignment (Tier-1, library / on-demand).
- `harness.config.json` schema gains a `rollback` block (`signals`, `evalTrigger.enabled`).

### Documentation Updates

- AGENTS.md — new command + skill.
- `docs/reference/*` regeneration via `pnpm run generate-docs` (pre-push gates on
  reference-doc freshness).
- `docs/knowledge/skills/sdlc-coverage-and-agentic-trajectory.md` — move Operations
  `gap → partial`.

### Architectural Decisions

- **D2 (propose → auto-merge trust progression)** warrants a standalone ADR: it is a
  durable commitment about how much autonomy the harness earns over post-merge writes, and
  D1/D5 are subordinate to it. One ADR: _"Post-ship rollback trust model."_

### Knowledge Impact

- New concepts: `rollback_candidate`, `revert-ready classification`, `rollback_event`.
- Relationship: `rollback_event → execution_outcome → PR`.
- The signal-threshold → revert mapping as a documented domain rule.

## Success Criteria

- **SC1** — Given a merged PR and a crossed config threshold,
  `harness rollback evaluate --trigger signal` opens exactly one revert PR labeled
  `harness:rollback` with the context block; re-running is idempotent (no duplicate PR). _(G1)_
- **SC2** — When a PR's `git revert` conflicts, or it has a dependent later merge, the
  decision is `revertReady=false`, `action='blocked'|'skipped'`, and **no** PR is opened. _(G2)_
- **SC3** — The revert PR body contains trigger, target PR, blast-radius score, and
  migration warnings when present. _(G3)_
- **SC4** — Each `evaluate` call appends exactly one `rollback_event` breadcrumb carrying
  trigger, verdict, and action. _(G4)_
- **SC5** — With `rollback.evalTrigger.enabled=false`, an eval `NOT_SATISFIED` produces no
  PR; flipping it to `true` routes through the same `evaluate` path — proven by unit test,
  no #31 required. _(G5)_
- **SC6** — `classify.ts` has unit coverage for: clean revert, conflicting revert,
  dependent-merge block, and the migration-warning path.

### Requirements (EARS)

- When a configured signal crosses its threshold within the window, the system shall call
  `rollback evaluate --trigger signal` for each PR merged in that window.
- When `rollback evaluate` classifies a target as revert-ready, the system shall open one
  revert PR labeled `harness:rollback` with the full context block.
- If a revert-ready open PR already exists for the target, then the system shall not open a
  second revert PR.
- If `git revert` does not apply cleanly, or a later merge depends on the target, then the
  system shall not open a revert PR and shall record `action='blocked'|'skipped'`.
- If `rollback.evalTrigger.enabled` is `false`, then the system shall not open a revert PR
  from an eval trigger.

## Implementation Order

1. **Core classification** — `packages/core/src/rollback/` types + `classify.ts`
   (clean-revert, dependent-merge, blast-radius/migration context) + unit tests; barrel and
   config-schema wiring.
2. **CLI command + composer** — `harness rollback evaluate`, PR composer, idempotency
   label, `rollback_event` breadcrumb; command tests against a fake git/`gh` seam.
3. **Signal arm live** — `rollback.signals` config + scheduled workflow reading
   `timeline.json`; the post-merge `rollback-propose.yml`.
4. **Eval arm dark + docs** — flag-guarded eval path (unit-tested, unfired), skill (four
   platform copies), the trust-model ADR, AGENTS.md + reference-doc regen, and the
   SDLC-coverage `gap → partial` update.
