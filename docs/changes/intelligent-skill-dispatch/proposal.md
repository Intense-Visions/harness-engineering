# Intelligent Skill Dispatch

> Change-triggered automatic skill selection. Extends the existing recommendation engine with change-type and stack-domain signals derived from git diffs, exposed via a new `dispatch_skills` MCP tool with optional session-start auto-invocation.

**Keywords:** skill-dispatch, change-detection, health-signals, stack-profile, workflow-composition, MCP-tool, session-integration, annotated-sequence

## Overview

When files change, Intelligent Skill Dispatch automatically recommends the optimal skill sequence based on what changed (change-type + domain) combined with codebase health. It extends the existing 3-layer recommendation engine by introducing change-type and domain signals as first-class `HealthSignal` entries, requiring no new scoring engine.

The feature is exposed as a composable `dispatch_skills` MCP tool that any skill or agent can invoke, plus an optional session-start auto-invocation that fires when HEAD has changed since the last session. Output is an annotated skill sequence — each skill tagged with a parallel-safe flag, estimated impact, and suggested gate condition.

### Goals

1. Automatically recommend the optimal skill sequence based on what changed (change-type + domain) combined with codebase health
2. Expose dispatch as a composable MCP tool (`dispatch_skills`) that any skill or agent can invoke
3. Auto-invoke at session start when HEAD has changed since last session, using cached health snapshot for speed
4. Return annotated sequences — each skill tagged with parallel-safe flag, estimated impact, and suggested gate condition
5. Zero new `skill.yaml` declarations required for basic operation — change-type and domain signals use the existing `SkillAddress` signal field, with fallback rules for bundled skills

### Non-Goals

- No feedback/learning loop — deferred to Skill Effectiveness Tracking (#91)
- No workflow execution engine — output is advisory, agents/autopilot decide execution
- No git hook integration — dispatch runs in agent context only
- No new health checks or graph queries — reuses existing health snapshot infrastructure

## Decisions

| #   | Decision                                     | Rationale                                                                                                                                                                                                   |
| --- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Hybrid trigger: MCP tool + session-start     | MCP tool is composable and testable; session-start provides automatic feel without commit-time latency. Git hooks rejected due to health snapshot cost.                                                     |
| D2  | Annotated sequence output                    | Richer than a flat list (parallel-safe flags, impact, gates) but simpler than a workflow plan or dynamic persona. Incrementally upgradeable.                                                                |
| D3  | Change-type + diff-scoped domain matching    | Leverages existing `detectChangeType()` and stack profile. No new file-pattern declarations needed. Domain detection scoped to changed files, not whole project.                                            |
| D4  | Tiered caching: cached default, --fresh flag | Session-start must be fast (cached only). Manual invocation defaults to cached but can force recapture. Reuses existing HEAD-based staleness detection.                                                     |
| D5  | No feedback loop in v1                       | Skill Effectiveness Tracking (#91) designs this properly. Building a lightweight version now risks throwaway code.                                                                                          |
| D6  | Extend existing signal system (Approach 3)   | Maximum reuse of the 3-layer recommendation engine. Change-type and domain signals become first-class `HealthSignal` entries addressed by existing `SkillAddress` scoring. No second scoring engine needed. |

## Technical Design

### Signal Extensions

Extend `HealthSignal` with change-type and domain signal types:

```typescript
// New signals added to existing HealthSignal type

// Change-type signals (exactly one active per dispatch)
'change-feature' | 'change-bugfix' | 'change-refactor' | 'change-docs';

// Domain signals (zero or more active per dispatch, derived from changed files)
// Names match SIGNAL_DOMAIN_MAP keys in stack-profile.ts
'domain-database' |
  'domain-containerization' |
  'domain-deployment' |
  'domain-infrastructure-as-code' |
  'domain-api-design' |
  'domain-secrets' |
  'domain-e2e' |
  'domain-mutation-test' |
  'domain-load-testing' |
  'domain-data-pipeline' |
  'domain-mobile-patterns' |
  'domain-incident-response';
```

Change-type signals map 1:1 from `detectChangeType()`. Domain signals are derived by a new `detectDomainsFromFiles()` function in `stack-profile.ts` that checks whether each changed file path matches or is a descendant of any key in `SIGNAL_DOMAIN_MAP`. For example, if `migrations/001.sql` is in the changed files, it matches the `migrations` key and emits `domain-database`.

### SkillAddress Usage

No schema change needed — skills address change/domain signals using the existing `signal` field:

```yaml
# Example: harness-tdd addresses bugfix changes
addresses:
  - signal: change-bugfix
    weight: 0.9
  - signal: low-coverage
    metric: coverage
    threshold: 60
    weight: 0.7
```

### Enriched Snapshot

New function `enrichSnapshotForDispatch()` wraps the existing health snapshot with dispatch-specific signals:

```typescript
interface DispatchContext {
  snapshot: HealthSnapshot; // existing cached or fresh
  changeType: ChangeType; // from detectChangeType()
  changedFiles: string[]; // from git diff
  domains: string[]; // from diff-scoped stack profile
  allSignals: string[]; // snapshot.signals + change + domain signals
}

function enrichSnapshotForDispatch(
  projectPath: string,
  options: { files?: string[]; commitMessage?: string; fresh?: boolean }
): Promise<DispatchContext>;
```

This function:

1. Loads cached snapshot (or captures fresh if `fresh: true` or HEAD changed)
2. Runs `detectChangeType()` on commit message / diff
3. Runs stack profile domain detection scoped to `files` (changed files only)
4. Merges all signals into `allSignals`

### Dispatch Output

```typescript
interface DispatchResult {
  context: {
    changeType: ChangeType;
    domains: string[];
    signalCount: number;
    snapshotFreshness: 'fresh' | 'cached';
  };
  skills: DispatchedSkill[]; // ordered by recommendation engine
  generatedAt: string;
}

interface DispatchedSkill {
  name: string;
  score: number; // from recommendation engine
  urgency: 'critical' | 'recommended' | 'nice-to-have';
  reason: string; // human-readable: "bugfix change + low-coverage signal"
  parallelSafe: boolean; // true if no file overlap with adjacent skills
  estimatedImpact: 'high' | 'medium' | 'low'; // hard address match → high, score >= 0.7 → medium, else low
  dependsOn?: string[]; // skills that should run first (from skill index dependsOn field)
}
```

### MCP Tool: `dispatch_skills`

```typescript
interface DispatchSkillsInput {
  path: string; // project root
  files?: string[]; // changed files (auto-detected from git if omitted)
  commitMessage?: string; // for change-type detection (auto-detected if omitted)
  fresh?: boolean; // force fresh health snapshot (default: false)
  limit?: number; // max skills to return (default: 5)
}
```

When `files` and `commitMessage` are omitted, the tool auto-detects:

- **files:** `git diff --name-only HEAD` (staged + unstaged changes)
- **commitMessage:** `git log -1 --format=%s`
- **DiffInfo construction:** `git diff --numstat` for total lines changed, `git diff --diff-filter=A --name-only` for new files list, remainder are changed files

**Error handling:**

- If `git log` fails (no commits, detached HEAD): default changeType to `'feature'`
- If `git diff` fails or returns empty: return empty dispatch result with `skills: []`
- In non-git directories: return error `"dispatch_skills requires a git repository"`

Registered alongside existing MCP tools in `packages/cli/src/mcp/tools/`.

### Session-Start Integration

Session-start dispatch hooks into the CLI startup path (`packages/cli/src/cli.ts`), not `manage_state`. When any harness CLI command runs that involves agent interaction (skill execution, autopilot, etc.):

1. Read last-seen HEAD from `.harness/dispatch-last-head.txt`
2. Compare to current `git rev-parse HEAD`
3. If different: call `dispatchSkills()` internally with `fresh: false`
4. Present results as an informational banner to stderr (not blocking, does not interfere with tool output)
5. Write current HEAD to `dispatch-last-head.txt`
6. If HEAD file does not exist (first run): create it, skip dispatch

Session-start dispatch is advisory only — it prints recommendations but does not auto-execute skills. The banner can be suppressed via `harness.config.json` setting `dispatch.sessionStart: false`.

### Parallel-Safe Detection

Skills in the sequence are marked `parallelSafe: true` when they target non-overlapping signal categories:

| Category    | Signals                                              | Example Skills                      |
| ----------- | ---------------------------------------------------- | ----------------------------------- |
| Structure   | `circular-deps`, `layer-violations`, `high-coupling` | enforce-architecture                |
| Quality     | `dead-code`, `drift`, `doc-gaps`                     | cleanup-dead-code, detect-doc-drift |
| Security    | `security-findings`                                  | security-scan, supply-chain-audit   |
| Performance | `perf-regression`                                    | perf                                |
| Coverage    | `low-coverage`                                       | tdd                                 |

Two adjacent skills targeting signals in the **same** category are `parallelSafe: false`. Two skills in **different** categories are `parallelSafe: true`. Change-type and domain signals do not affect parallelism (they inform selection, not execution conflict).

Default to `parallelSafe: false` if unable to determine category membership.

### Fallback Rules for Change/Domain Signals

Extend `recommendation-rules.ts` with default change-type and domain addresses for bundled skills that don't declare them in `skill.yaml`:

```typescript
// Example fallback rules
'harness-tdd':           [{ signal: 'change-bugfix', weight: 0.9 }],
'harness-refactoring':   [{ signal: 'change-refactor', weight: 0.9 }],
'harness-detect-doc-drift': [{ signal: 'change-docs', weight: 0.8 }],
'harness-enforce-architecture': [{ signal: 'change-feature', weight: 0.6 }],
'harness-supply-chain-audit':  [{ signal: 'domain-secrets', weight: 0.9 }],
'harness-security-scan':       [{ signal: 'domain-secrets', weight: 0.8 }],
```

### File Layout

```
packages/cli/src/skill/
  dispatch-engine.ts          # enrichSnapshotForDispatch() + dispatchSkills()
  dispatch-types.ts           # DispatchContext, DispatchResult, DispatchedSkill
  recommendation-engine.ts    # existing (no changes — consumes new signal types)
  recommendation-rules.ts     # extended with change/domain fallback rules
  recommendation-types.ts     # HealthSignal type extended
  health-snapshot.ts          # existing (no changes)
  dispatcher.ts               # existing suggest() (no changes)

packages/cli/src/mcp/tools/
  dispatch-skills.ts          # new MCP tool registration
```

## Success Criteria

1. When `dispatch_skills` is called with changed files, it returns an annotated skill sequence that includes change-type and domain signals in the scoring — not just health signals
2. When no files/commitMessage are provided, the tool auto-detects from `git diff` and `git log`
3. When `fresh: true` is passed, a new health snapshot is captured; otherwise cached snapshot is used with HEAD-based staleness detection
4. Change-type signals (`change-feature`, `change-bugfix`, `change-refactor`, `change-docs`) are derived from `detectChangeType()` and flow into the existing recommendation engine's scoring
5. Domain signals (`domain-database`, `domain-api`, etc.) are derived by running stack profile domain detection against only the changed files
6. Each skill in the output includes `parallelSafe`, `estimatedImpact`, `urgency`, `reason`, and optional `dependsOn`
7. Existing recommendation engine behavior is unchanged when no change/domain signals are present (backward compatible)
8. Fallback rules in `recommendation-rules.ts` provide change-type and domain addresses for bundled skills without explicit declarations
9. Session-start integration detects HEAD delta, auto-invokes dispatch with cached snapshot, and presents results as a non-blocking informational banner
10. `harness validate` passes after all changes

## Implementation Order

### Phase 1: Signal & Type Foundation

- Extend `HealthSignal` type with change-type and domain signals
- Add `DispatchContext`, `DispatchResult`, `DispatchedSkill` types
- Extend `recommendation-rules.ts` with change/domain fallback rules
- Unit tests for new signal types and fallback rule resolution

### Phase 2: Dispatch Engine Core

- Implement `detectDomainsFromFiles(files: string[]): string[]` in `stack-profile.ts` — checks each file path against `SIGNAL_DOMAIN_MAP` keys (exact match or descendant)
- Implement `enrichSnapshotForDispatch()` — wires `detectChangeType()` + `detectDomainsFromFiles()` + cached snapshot
- Implement `dispatchSkills()` — feeds enriched signals into existing `recommend()`, annotates output with parallel-safe flags (signal category comparison), `estimatedImpact` (hard → high, score ≥ 0.7 → medium, else low), and `dependsOn` (from skill index)
- Git auto-detection helpers: construct `DiffInfo` from `git diff --numstat` + `git diff --diff-filter=A`
- Error handling: no-commit fallback, empty diff, non-git directory
- Unit tests for signal derivation, domain detection, scoring integration, annotation, and error paths

### Phase 3: MCP Tool

- Register `dispatch_skills` MCP tool in `packages/cli/src/mcp/tools/`
- Auto-detection of files/commitMessage from git when omitted
- Integration tests

### Phase 4: Session-Start Integration

- HEAD delta detection via `.harness/dispatch-last-head.txt`
- Auto-dispatch on session init with `fresh: false`
- Advisory banner output (non-blocking)
