# Design: Adopting Framework Research Patterns

**Date:** 2026-03-14
**Research:** `docs/research/framework-research-round-2.md`

## Summary

Adopt 14 patterns from 7 researched frameworks (Claude Flow, Gas Town, Turbo Flow, Devika, Tessl, Cursor P/W/J, OpenSpec) into harness engineering. Patterns split into mechanical enforcement (code changes) and behavioral guidance (SKILL.md updates).

## Decisions Made During Design

- **Layered approach:** Mechanical enforcement for high-priority patterns, behavioral conventions for low-priority
- **Prefer new files; schema changes only when additive and optional:** `.harness/failures.md`, `.harness/handoff.json`, `.harness/trace.md` are new files. `lastSession` gets optional field additions only — no migration needed.
- **Two-tier verification:** Quick mechanical gate (every task) + deep 3-level audit (milestones/PRs)
- **Minimal learning tags:** `[skill:name] [outcome:status]` only — two tags, simple grep
- **Scoped failure log:** Failures archived at milestone boundaries, not accumulated forever
- **Behavioral patterns woven into skills:** No separate conventions doc — colocated where agents read it
- **Specs/changes directory convention:** `docs/specs/` (source of truth) + `docs/changes/` (proposals) — behavioral, not enforced

## Phase 1: Core State Extensions

### New functions in `packages/core/src/state/state-manager.ts`

**`appendFailure(projectPath, failure, skillName, type)`**
- Appends to `.harness/failures.md` with date, skill, type tag
- Format: `- **YYYY-MM-DD [skill:name] [type:dead-end]:** description`
- Creates file with `# Failures` header if missing

**`loadFailures(projectPath)`**
- Reads `.harness/failures.md`, returns array of parsed failure entries
- Used by skills at phase start

**`archiveFailures(projectPath)`**
- Moves `.harness/failures.md` to `.harness/archive/failures-YYYY-MM-DD.md`
- Creates fresh empty failures file

**`loadRelevantLearnings(projectPath, skillName?)`**
- Reads `.harness/learnings.md`, parses tags, filters by skill name
- Returns matching entries; falls back to all entries if no filter

**`saveHandoff(projectPath, handoff)`**
- Writes `.harness/handoff.json` with structured context

**`loadHandoff(projectPath)`**
- Reads `.harness/handoff.json`, returns parsed handoff or null

### Modified function

**`appendLearning(projectPath, learning, skillName?, outcome?)`**
- New format (when tags provided): `- **YYYY-MM-DD [skill:name] [outcome:status]:** text`
- Without tags: `- **YYYY-MM-DD:** text` (existing format, unchanged)
- `skillName` and `outcome` are optional parameters — existing callers work without modification
- `loadRelevantLearnings` handles all three historical formats: plain dated entries, heading-based entries (from execution skill), and tagged entries. When called with no `skillName` filter, it returns all entries (replacement for generic "load all learnings").

### Schema change in `types.ts`

`lastSession` gains optional fields:
- `lastSkill?: string`
- `pendingTasks?: string[]`

New Zod schemas:
- `FailureEntry` — date, skill, type, description
- `Handoff` — timestamp, fromSkill, phase, summary, completed, pending, concerns, decisions, blockers, contextKeywords
- `GateResult` — `{ passed: boolean, checks: Array<{ name: string, passed: boolean, command: string, output?: string, duration?: number }> }`
- `GateConfig` — `{ checks?: Array<{ name: string, command: string }>, trace?: boolean }` (schema for `.harness/gate.json`)

### New `.harness/` file conventions

| File | Purpose | Written by | Read by |
|------|---------|-----------|---------|
| `failures.md` | Dead ends, anti-patterns | Any skill on failure | All skills at start |
| `handoff.json` | Structured context between phases | Execution/planning at phase end | Next skill/session |
| `trace.md` | Optional reasoning monologue | Execution (when verbose) | Humans only |
| `archive/` | Archived failure logs | `archiveFailures()` | Historical reference |

## Phase 2: Mechanical Done Gate

### New function: `runMechanicalGate(projectPath, checks?)`

Runs configurable binary pass/fail checklist. Returns `GateResult`.
- Auto-detects project type (package.json → npm, go.mod → go, etc.)
- Default checks: test, lint, typecheck, build, harness validate
- Skips checks that don't apply
- Override via `.harness/gate.json` (conforms to `GateConfig` schema)
- `runMechanicalGate` is a superset of `harness validate` — it calls `harness validate` as one of its checks alongside test/lint/typecheck/build
- If `archiveFailures` is called twice on the same day, appends a counter suffix: `failures-YYYY-MM-DD-2.md`

### Two-tier verification

| Tier | When | What | Speed |
|------|------|------|-------|
| Quick gate | After every task | test + lint + typecheck + build + harness validate | ~10-30s |
| Deep audit | Milestones, PRs | EXISTS → SUBSTANTIVE → WIRED (3-level) | ~2-5min |

### Execution integration

- After each task: run `runMechanicalGate()`
- All pass → proceed
- Any fail → retry with error context (max 2 attempts)
- Still failing → record in failures.md, escalate

## Phase 3: Skill Updates (Mechanical)

### harness-execution

- **PREPARE:** Load failures + learnings + handoff at start
- **EXECUTE:** Mechanical gate after each task
- **VERIFY:** Quick gate default; `--deep` for full verification
- **PERSIST:** Write handoff.json, failures, tagged learnings, enriched lastSession

### harness-verification

- Add "When to Use" tier clarification
- Tagged learnings on completion

### harness-state-management

- Document all new `.harness/` files
- Add archival workflow instructions

### harness-planning

- **VALIDATE:** Check failures before planning
- Write handoff.json on completion

## Phase 4: Skill Updates (Behavioral)

### harness-execution — Trace Output (Optional)
When `--verbose` or `.harness/gate.json` has `"trace": true`, append one-sentence reasoning at each phase boundary to `.harness/trace.md`. Format: `**[PHASE HH:MM:SS]** summary`.

### harness-brainstorming — Context Keywords
Extract 5-10 domain keywords during EVALUATE phase. Include in spec frontmatter. Flow into handoff.json contextKeywords field.

### harness-planning — Change Specifications
When modifying existing functionality, express requirements as deltas: `[ADDED]`, `[MODIFIED]`, `[REMOVED]`. Not mandatory for greenfield.

### harness-skill-authoring — Skill Quality Checklist
Evaluate skills on two dimensions: activation clarity (when to use) and implementation specificity (how to do it). Score: clear/ambiguous/missing.

### harness-verification — Non-Determinism Tolerance
For behavioral verification (not code), accept threshold-based results. If a convention fails >40% of the time, the convention is poorly written.

### harness-onboarding — Adoption Maturity
Frame progression: Manual → Repeatable → Automated → Self-improving. Orientation, not prescription.

## Phase 5: Specs/Changes Convention

### Directory structure (in harness-adopting projects)

```
docs/
  specs/           # Source of truth: what the system does today
  changes/         # Proposals: what's being built right now
    <feature>/
      proposal.md
      delta.md     # ADDED/MODIFIED/REMOVED
      tasks.md
```

### Lifecycle
1. Brainstorming → `docs/changes/<feature>/proposal.md`
2. Planning → `delta.md` + `tasks.md`
3. Execution → implements from tasks.md
4. Completion → merge deltas into `docs/specs/`, archive change dir

### Skill integration
- harness-brainstorming: write proposals to `docs/changes/` when `docs/specs/` exists
- harness-planning: produce delta.md alongside tasks.md
- harness-execution: prompt to merge deltas on completion
- initialize-harness-project: add dirs to intermediate+ templates

Not mechanically enforced. Convention that skills follow when directory structure is present.

## Implementation Notes

- **Phase ordering:** Phases 1-2 (core) must complete before Phase 3 (mechanical skill updates). Phase 4 (behavioral) and Phase 5 (conventions) are independent and can be done in any order after Phase 1.
- **No migration needed:** All new `.harness/` files are created on demand. All schema additions are optional. Existing projects work without changes.
- **Rollout:** Functions create `.harness/archive/` directory on first archive call. No pre-creation needed.

## Pattern-to-Source Traceability

| Pattern | Source Framework | Implementation |
|---------|-----------------|----------------|
| Mechanical done criteria | Cursor P/W/J | `runMechanicalGate()` |
| Checkpoint handoff | Turbo Flow, Gas Town | `saveHandoff()` / `loadHandoff()` |
| Phase gates | Turbo Flow, Cursor | Already exist in harness |
| Anti-pattern/failure log | Turbo Flow | `appendFailure()` / `loadFailures()` |
| Tagged learnings | Claude Flow | Modified `appendLearning()` + `loadRelevantLearnings()` |
| Structured handoff docs | Cursor, Gas Town | Handoff schema in `types.ts` |
| Session continuity | Claude Flow, Gas Town | `lastSkill` + `pendingTasks` on `lastSession` |
| Specs vs changes | OpenSpec | Directory convention |
| Delta-spec format | OpenSpec | Behavioral in harness-planning |
| Internal monologue | Devika | Behavioral in harness-execution |
| Context keywords | Devika | Behavioral in harness-brainstorming |
| Skill scoring | Tessl | Behavioral in harness-skill-authoring |
| Error budgets | Tessl | Behavioral in harness-verification |
| CDLC maturity | Tessl | Behavioral in harness-onboarding |
