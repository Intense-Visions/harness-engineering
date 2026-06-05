---
feature: brainstorm-auto-promote
status: draft
created: 2026-06-04
keywords:
  [
    brainstorming,
    roadmap,
    promotion,
    manage_roadmap,
    state-transition,
    orchestrator-pickup,
    atomic-commit,
  ]
sub_project_of: brainstorm-driven-roadmap-loop
sub_project_index: 1
sub_project_total: 4
---

# Auto-promotion of brainstormed roadmap items

## Overview and Goals

Sub-project 1 of 4 in the larger initiative to make `harness-brainstorming` the primary human-facing loop. The brainstorming skill produces usable specs (validated empirically over hundreds of sessions). The remaining friction is at the seam between brainstorm completion and orchestrator pickup.

### Problem

`harness-brainstorming` Phase 4 step 8 calls `manage_roadmap action: add` with `status: 'planned'` [evidence: `agents/skills/claude-code/harness-brainstorming/SKILL.md:198-203`]. This creates a _new_ row regardless of whether the same feature already exists in `backlog`. The common path — human writes a backlog one-liner, later brainstorms it — produces a duplicate row instead of advancing the original. The orchestrator's `selectCandidates` (`packages/orchestrator/src/core/candidate-selection.ts:98`) filters by `activeStates: ['planned', 'in-progress']` [evidence: `packages/orchestrator/src/workflow/config.ts:226`], so the original `backlog` row stays invisible to dispatch while a duplicate `planned` row gets picked up. The link between brainstorm and roadmap row is broken.

### Goal

Brainstorm against a named backlog row → row transitions `backlog → planned`, gains the spec link, and the change ships in a single atomic git commit alongside the spec. Refuse loudly when the named row is in an unsafe state for promotion.

### Observable outcomes

1. Approved brainstorm against `backlog` row → row state = `planned`, `Spec` field = `docs/changes/<feature>/proposal.md`, one commit contains both `proposal.md` and `roadmap.md` changes.
2. Approved brainstorm against named row that doesn't exist → new row created with `Status: planned` (unchanged from today).
3. Brainstorm against `in-progress` or `done` row → structured refusal naming the conflict; skill exits without writing spec.
4. Brainstorm against `planned` or `blocked` row → spec link updated, status preserved, warned.
5. Re-running against already-promoted row with identical spec path → no-op success.

### Strategy grounding

Advances the "Agent Autonomy" KPI (`STRATEGY.md#key-metrics`) by removing a manual step between brainstorm and dispatch. Consistent with the "humans stay in the thinking layer" thesis (`STRATEGY.md#our-approach`).

### Non-goals (out of scope for sub-project 1)

- Detecting which backlog items need brainstorming (sub-project 2).
- Queue UI / "Needs You" view (sub-project 2).
- Re-triggering brainstorm from planning or execution blockers (sub-project 4).
- File-less mode write semantics — already handled by existing `manage_roadmap` infrastructure.
- Improving brainstorming output quality — empirically validated.

### Assumptions

- **Runtime:** Node.js >= 18.x (LTS), consistent with the rest of `@harness-engineering/core` and `packages/cli` (uses `fs.writeFile`, `path.join`).
- **Roadmap location:** Single `docs/roadmap.md` file per project (file mode) or single file-less store (file-less mode), per existing `manage_roadmap` infrastructure.
- **Encoding:** UTF-8 markdown, consistent with existing `parseRoadmap`/`serializeRoadmap` round-trip behavior.
- **Git availability:** Phase 4 step 8 commit requires `git` on PATH and a writable working tree, consistent with the existing step-7 commit in `harness-brainstorming`.
- **MCP availability:** `manage_roadmap` is reachable. Fallback to direct `parseRoadmap`/`serializeRoadmap` is inherited from the existing brainstorming Phase 4 fallback (see `SKILL.md:202`).

## Decisions Made

Six decisions settled during brainstorming EVALUATE and PRIORITIZE phases.

### D1. Roadmap-row lookup key = `ARGUMENTS` string from the slash command

The user already invokes `/harness:brainstorming <feature name>`. The string already serves as the feature description; extending its role to "lookup key" adds zero ceremony. Exact match against the `### Heading` text in `docs/roadmap.md` (or `manage_roadmap action: query` in file-less mode), case-insensitive with leading/trailing whitespace trimmed. No fuzzy matching — fail loudly with the three closest alternatives listed.

**Collision behavior (S3-001):** If multiple milestones host a row with the same heading text, refuse with `{ok: false, reason: 'ambiguous', matches: [...]}` where each entry is milestone-qualified (e.g. `'v1.0 Foundation > Auto-promote'`, `'v2.0 Polish > Auto-promote'`). The skill surfaces the matches and stops; the user re-invokes with a milestone-qualified `ARGUMENTS` string (format: `<milestone> > <feature>`). Same loud-failure principle as the no-fuzzy-match rule.

Rejected: auto-detect from session-slug parsing (couples slug to a load-bearing format); tracker-side fuzzy discovery (silent misroute risk); silently preferring earliest-occurring row on collision (silent misroute risk).

### D2. State-conditional behavior

| Current row state | Action                                    | Reason                                                                                                                                              |
| ----------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backlog`         | Promote → `planned`, set `Spec`           | The happy path. The whole feature exists for this case.                                                                                             |
| not found         | Create new with `Status: planned`         | Unchanged from today's Phase 4 step 8.                                                                                                              |
| `planned`         | Update `Spec` only, preserve status       | Re-brainstorm of an already-planned item; user is filling in or refining the spec. Warn so a typo'd feature name doesn't silently target a sibling. |
| `blocked`         | Update `Spec` only, preserve status       | Same rationale as `planned`. The blocker remains the gating concern; brainstorming the unblock plan is legitimate.                                  |
| `in-progress`     | **Refuse and exit** with structured error | Agent is dispatched. Yanking the spec mid-flight produces undefined behavior. Skill exits without writing spec.                                     |
| `done`            | **Refuse and exit** with structured error | Feature already shipped. Re-brainstorming means a new feature; user must name it differently.                                                       |

Rejected (in-progress): "update with warning" — too easy to accidentally rewrite a running agent's spec.

### D3. Orchestrator dispatch signaling = next-tick polling

The orchestrator already polls `tracker.fetchCandidateIssues()` (`packages/orchestrator/src/orchestrator.ts:861`) every tick. Default polling interval is short enough that the brainstorm-complete → dispatch latency is invisible. The existing Phase 4 step 9 `emit_interaction({type: 'transition', suggestedNext: 'planning'})` handles the _skill-chain_ signal — a different concern from dispatch wake-up.

Rejected: new `roadmap-promoted` event bus message (adds wiring for a problem we don't have); overloading the existing `transition` interaction with a dispatch-ready flag.

### D4. Failure handling and idempotency

- If `manage_roadmap` fails during promotion, the brainstorm session is _not_ considered complete. The spec file may exist on disk (Phase 4 step 3 writes it), but the (new) Phase 4 step 7 promote-call failure is surfaced to the human verbatim and the session can be re-run after the roadmap state is repaired. The (new) Phase 4 step 8 commit is skipped, so no commit is produced.
- Re-running against an already-promoted row where `Status: planned` and `Spec` matches the path written this session → no-op success.
- Re-running with a _different_ spec path → update the link, emit a warning naming both paths.
- If `docs/roadmap.md` does not exist at promote time, fall through to the same "no roadmap" silent-skip behavior already documented in the brainstorming SKILL.md Phase 4 step 8 ("If no roadmap exists, skip silently"). The skill still commits the spec; no envelope is surfaced.
- If `docs/roadmap.md` exists but `parseRoadmap` returns `Err` (malformed file), surface a `write-failed` envelope verbatim — promotion cannot proceed against a broken roadmap and the human must repair it before re-running.

**Concurrency (S4-001):** Two simultaneous promotions of the same row are out of scope for this sub-project. Brainstorming is an interactive human-in-the-loop skill, so two humans actively brainstorming the same feature in parallel is implausible. The genuine re-entrancy concern is downstream: a running agent (sub-project 4's re-trigger path) racing against a human brainstorm against the same row. ETag/lock support belongs in the `promote` handler when sub-project 4 lands, with the right context about which writers actually contend. Last-write-wins is acceptable until then.

Rejected: silent overwrite of differing spec paths (loses the prior spec without trace).

### D5. Roadmap field-write policy

Write: `Status: planned`, `Spec: <new path>`, `Summary: <H1 from spec>` _only if currently empty_ (don't overwrite a human-written summary).

Preserve untouched: `Plan`, `Assignee`, `Priority`, `External-ID`, `Blockers`, `Milestone`.

**Milestone behavior (S3-002):** `Milestone` is preserved on every state transition. Promotion changes state, not roadmap layout — the milestone reflects where the human organized the work and is not the promote action's concern. For the create-new path (row didn't exist), the row is appended under "Current Work" by default, matching today's `add` action behavior; this is the one and only case where `promote` writes a `Milestone` value.

### D6. Implementation lives in core, exposed via `manage_roadmap action: 'promote'`

State-transition business rules (D2, D4) need to hold across every caller — brainstorming today, autopilot and dashboard later. Markdown is the wrong place for those rules. The new action returns a structured envelope (see Technical Design); skill consumes the envelope and surfaces reason-specific human messages.

Rejected: branching inside `SKILL.md` prose (puts business rules in markdown, untestable, unreusable); bare `update`/`add` calls without a `promote` action (forces every caller to reimplement state-transition rules).

## Technical Design

### File layout

| Path                                                                     | Change                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/roadmap/promote.ts`                                   | **NEW.** Pure function `promoteFeature(roadmap, args) → { result, nextRoadmap }`. State-transition logic per D2; idempotency per D4; field-write policy per D5.                                                                                                        |
| `packages/core/src/roadmap/index.ts`                                     | Export `promoteFeature`, `PromoteCoreResult`, `PromoteResult`, `PromoteArgs`.                                                                                                                                                                                          |
| `packages/core/tests/roadmap/promote.test.ts`                            | **NEW.** Unit table covering every D2 cell + every D4 case + every D5 preserved-field.                                                                                                                                                                                 |
| `packages/cli/src/mcp/tools/roadmap.ts`                                  | Add `'promote'` to the `action` enum at `roadmap.ts:23` (and the `ManageRoadmapInput` union at `roadmap.ts:76`). Add handler branch wiring to `promoteFeature` + serialize result envelope. Reuse existing `parseRoadmap`/`serializeRoadmap` infra from `RoadmapDeps`. |
| `packages/cli/tests/mcp/tools/roadmap.test.ts`                           | Add coverage for the new action and its envelope shape.                                                                                                                                                                                                                |
| `agents/skills/claude-code/harness-brainstorming/SKILL.md`               | Rewrite Phase 4 step 7 (commit includes roadmap.md) and Phase 4 step 8 (call `promote` instead of `add`, branch on envelope).                                                                                                                                          |
| `agents/skills/{cursor,gemini-cli,codex}/harness-brainstorming/SKILL.md` | Mirror the same SKILL.md changes (per `platforms` list in `skill.yaml`).                                                                                                                                                                                               |

### Core API

```ts
// packages/core/src/roadmap/promote.ts

export interface PromoteArgs {
  feature: string; // ARGUMENTS string (D1); trimmed, case-insensitive lookup
  spec: string; // path to docs/changes/<feature>/proposal.md
  summary?: string; // H1 from spec; only applied if row's summary is empty (D5)
}

// Core function returns only the state-transition results it can actually produce:
export type PromoteCoreResult =
  | {
      ok: true;
      transitioned: 'backlog→planned' | 'spec-updated' | 'created' | 'noop';
      feature: string;
    }
  | { ok: false; reason: 'in-progress' | 'done'; detail: string; feature: string }
  | { ok: false; reason: 'not-found'; detail: string; feature: string; closestMatches: string[] }
  | { ok: false; reason: 'ambiguous'; detail: string; feature: string; matches: string[] }; // milestone-qualified (D1)

// The MCP-handler-level envelope adds IO failures the core cannot know about:
export type PromoteResult =
  | PromoteCoreResult
  | { ok: false; reason: 'write-failed'; detail: string; feature: string };

export function promoteFeature(
  roadmap: Roadmap,
  args: PromoteArgs
): { result: PromoteCoreResult; nextRoadmap: Roadmap };
```

Pure over `(Roadmap, args) → (PromoteCoreResult, Roadmap)`. No IO. The MCP handler owns parse/serialize/write and is responsible for adding the `write-failed` envelope variant if its `writeFile`/sync step throws — that variant is part of the public `PromoteResult` consumed by callers (skill, dashboard, autopilot), not the core function's contract.

### MCP tool wiring

```ts
// packages/cli/src/mcp/tools/roadmap.ts (extension sketch)

// action enum gains: 'promote'

case 'promote': {
  // File-less mode is dispatched upstream via handleManageRoadmapFileLess
  // (see roadmap.ts:462). The file-mode path:
  const roadmap = await deps.parseRoadmap(roadmapPath);
  const { result, nextRoadmap } = promoteFeature(roadmap, { feature, spec, summary });
  if (result.ok) {
    await fs.writeFile(roadmapPath, deps.serializeRoadmap(nextRoadmap));
  }
  return result;  // envelope returned to caller verbatim
}
```

File-less mode is handled by the existing upstream `handleManageRoadmapFileLess` dispatch (`packages/cli/src/mcp/tools/roadmap.ts:462`), which must gain its own `'promote'` branch wrapping the same `promoteFeature` core call against the file-less roadmap store. `promote` is a state-transition variant of `update`, not a new tracker integration.

### SKILL.md changes (Phase 4)

**Step order swap:** existing step 7 (commit) and step 8 (roadmap update) are reversed so the commit captures the roadmap mutation.

New step 7 (was step 8): call `manage_roadmap action: 'promote'`. Branch on the result envelope:

| Envelope                                    | Skill behavior                                                                                                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ok: true, transitioned: 'backlog→planned'` | Log "Promoted `<feature>`: backlog → planned"                                                                                                                               |
| `ok: true, transitioned: 'spec-updated'`    | Log "Updated spec link for `<feature>` (status preserved: `<status>`)"                                                                                                      |
| `ok: true, transitioned: 'created'`         | Log "Created new roadmap row for `<feature>` as planned"                                                                                                                    |
| `ok: true, transitioned: 'noop'`            | Log "No change — `<feature>` already promoted with this spec"                                                                                                               |
| `ok: false, reason: 'in-progress'`          | **STOP.** Surface: "Refused to promote `<feature>`: an agent is currently dispatched against this row. Stop the agent or use a different feature name."                     |
| `ok: false, reason: 'done'`                 | **STOP.** Surface: "Refused to promote `<feature>`: row is already 'done'. To revise a shipped feature, use a new name."                                                    |
| `ok: false, reason: 'not-found'`            | If no row was expected to exist, fall through to 'created'. Otherwise surface `closestMatches` as a typo hint and **STOP**.                                                 |
| `ok: false, reason: 'ambiguous'`            | **STOP.** Surface: "Refused to promote `<feature>`: matches multiple rows across milestones. Re-invoke with one of: `<matches>`." Each match is milestone-qualified per D1. |
| `ok: false, reason: 'write-failed'`         | **STOP.** Surface `detail` verbatim. Brainstorm is not considered complete (D4).                                                                                            |

"STOP" cases skip Phase 4 step 9 (handoff/transition emit). The spec file written earlier stays on disk; the user re-runs the skill after fixing the conflict.

New step 8 (was step 7): `git add docs/changes/<feature>/proposal.md docs/changes/<feature>/SKILLS.md docs/roadmap.md` then `git commit -m "docs(<feature>): add spec and promote to planned"`.

### Call flow (happy path, backlog row exists)

```
human: /harness:brainstorming <feature name>
   ↓
Phase 1–3 run as today (gather, evaluate, prioritize)
   ↓
Phase 4 step 1–6: section-by-section spec, soundness review,
                  advise_skills, harness validate, human sign-off
   ↓
Phase 4 step 7 (NEW): manage_roadmap({action: 'promote', ...})
                      → promoteFeature() writes roadmap.md
                      → tool returns {ok: true, transitioned: 'backlog→planned'}
   ↓
Phase 4 step 8 (was 7): git add docs/changes/<feature>/proposal.md \
                                docs/changes/<feature>/SKILLS.md \
                                docs/roadmap.md
                        git commit "docs(<feature>): add spec and promote to planned"
   ↓
Phase 4 step 9: emit_interaction transition → suggestedNext: 'planning'
```

### Error envelope rendering

The envelope shape is the same for the skill (now), the dashboard (sub-project 2), and autopilot (sub-project 4). Reason strings are stable; detail strings are human-readable but not parsed.

- `closestMatches` is present only on `not-found` and contains up to 3 nearest roadmap feature names by Levenshtein distance.
- `matches` is present only on `ambiguous` and contains every milestone-qualified row that exact-matched the lookup key (typically 2+ entries; no cap, since the user needs the full list to disambiguate).

## Integration Points

### Entry Points

- **MCP tool action:** `manage_roadmap` gains `action: 'promote'`. New input fields: `feature` (required), `spec` (required), `summary` (optional). Returns the `PromoteResult` envelope from Technical Design.
- **Skill step:** `harness-brainstorming` Phase 4 step 7/8 (renumbered). Calls `manage_roadmap action: 'promote'` instead of `action: 'add'`.
- **Core API:** `promoteFeature` exported from `@harness-engineering/core` via `packages/core/src/roadmap/index.ts`. Sub-project 4 (downstream re-trigger) will consume this directly from the orchestrator.
- **No new CLI command.** Promotion is invoked transitively through the brainstorming skill; no `harness roadmap promote` surface.

### Registrations Required

- `manage_roadmap` action enum at `packages/cli/src/mcp/tools/roadmap.ts:23` and `ManageRoadmapInput` union at `roadmap.ts:76` — add `'promote'` to both.
- Core barrel export at `packages/core/src/roadmap/index.ts` — export `promoteFeature`, `PromoteResult`, `PromoteArgs`.
- Brainstorming skill SKILL.md updated for **all four platform variants** (`claude-code`, `cursor`, `gemini-cli`, `codex` per `skill.yaml:10-13`).
- Phase 4 step ordering swap (step 7 ↔ step 8) documented in SKILL.md.
- No change to `skill.yaml` — phases, triggers, dependencies, and tool list are unchanged.

### Documentation Updates

- `docs/knowledge/roadmap/` — add `roadmap-promotion.md` documenting the `promote` action, the `PromoteResult` envelope shape, and the state-transition table (D2). Durable reference for future skill authors and autopilot work.
- `docs/changes/brainstorm-auto-promote/proposal.md` — this spec.
- `docs/changes/brainstorm-auto-promote/SKILLS.md` — output of `advise_skills` during this brainstorm.
- `AGENTS.md` — no change (no new top-level surface).
- `docs/roadmap.md` — gains the row for this feature itself. Until phase 3 ships, registered via the existing `add` action; once phase 3 ships, future similar specs are promoted via the new `promote` action.

### Architectural Decisions

Two ADR-worthy decisions warrant ADRs under `docs/decisions/`:

1. **ADR: `manage_roadmap` actions return structured envelopes for state-changing operations.** Establishes the `{ok, reason, detail, ...}` pattern as the convention for future state-transition actions on the tool. Rationale: dashboards and autopilot need to render reason-specific UI without re-parsing free-form strings.
2. **ADR: Roadmap state-transition rules live in `@harness-engineering/core`, not in skill markdown.** Establishes a boundary: business rules that hold across callers belong in core. Skill markdown orchestrates; it doesn't decide. Rationale per D6.

### Knowledge Impact

New concepts entering the knowledge graph:

- **Concept:** "Roadmap Promotion" — the brainstorm-complete → planned transition. Edge to: `harness-brainstorming` skill (produces), `manage_roadmap` tool (executes), orchestrator tick loop (consumes).
- **Rule:** "State-conditional promotion behavior" — the D2 transition table. Edge to: the new `roadmap-promotion.md` knowledge doc.
- **Pattern:** "Structured action envelopes" — the `{ok, reason, detail}` shape on state-changing MCP tool actions. Edge to: ADR #1; future `manage_roadmap` actions will reference this as prior art.

`docs/knowledge/orchestrator/issue-routing.md` will need a cross-reference once sub-project 2 (trigger detection) ships, but no edit required for sub-project 1.

## Success Criteria

Each criterion is observable in code, in the file system, or via a single command. No subjective judgments.

### Functional — happy paths

1. **Backlog promotion.** Given a roadmap row with `Status: backlog` and `Spec: —` for feature "X", running `/harness:brainstorming X` through to approval results in: row `Status: planned`, `Spec: docs/changes/x/proposal.md`, written in a single commit whose message is `docs(x): add spec and promote to planned` and whose diff contains `proposal.md`, `SKILLS.md`, and `roadmap.md`.
   - Test: `packages/cli/tests/mcp/tools/roadmap.test.ts` end-to-end fixture; `git log -1 --name-only` assertion in integration test.

2. **Create-new fallback.** Running `/harness:brainstorming Y` where "Y" does not appear in `roadmap.md` results in a new row appended with `Status: planned`, `Spec: <path>`, `Summary: <H1>`. Equivalent to today's Phase 4 step 8 behavior.
   - Test: unit test on `promoteFeature` returning `{ok: true, transitioned: 'created'}`.

3. **Spec-updated, status preserved.** Given a row with `Status: planned` (or `blocked`) and any existing `Spec`, promotion writes the new spec path and leaves `Status` untouched. Result envelope is `{ok: true, transitioned: 'spec-updated'}`. Skill surfaces a warning naming both old and new spec paths.
   - Test: unit table covering `planned` and `blocked` start states.

4. **Idempotent no-op.** Given `Status: planned` and `Spec` already equal to the new spec path, promotion returns `{ok: true, transitioned: 'noop'}` and produces zero diff in `roadmap.md`.
   - Test: `git diff --quiet docs/roadmap.md` after the call; envelope assertion.

### Functional — refusal paths

5. **In-progress refusal.** Promoting against `Status: in-progress` returns `{ok: false, reason: 'in-progress'}`. Skill exits without running Phase 4 step 9. `roadmap.md` is unchanged. No commit is created.
   - Test: unit test on envelope; skill-level test asserting no `transition` interaction fires.

6. **Done refusal.** Promoting against `Status: done` returns `{ok: false, reason: 'done'}`. Same exit semantics as #5.
   - Test: unit test on envelope.

7. **Not-found with typo hint.** Promoting feature "Auto-promot" (typo) when "Auto-promote" exists returns `{ok: false, reason: 'not-found', closestMatches: ['Auto-promote', ...]}` with up to 3 entries ranked by Levenshtein distance.
   - Test: unit table with distance ≤ 3 fixtures.

8. **Ambiguous collision refusal.** Promoting feature "Auto-promote" when two milestones host rows with that heading returns `{ok: false, reason: 'ambiguous', matches: ['v1.0 > Auto-promote', 'v2.0 > Auto-promote']}`. Skill exits without writing spec or producing a commit.
   - Test: unit fixture with two same-named rows in different milestones; envelope shape and `matches` count assertion.

### Field-write policy

9. **Summary preservation.** A row with a non-empty human-written `Summary` is not overwritten when promotion sets other fields. A row with `Summary: —` (or missing) gains the spec H1 as its summary.
   - Test: two-row unit fixture.

10. **Field isolation.** `Plan`, `Assignee`, `Priority`, `External-ID`, `Blockers` are byte-identical before and after promotion on any non-`backlog` row.

- Test: snapshot diff on all preserved fields per D5.

### Atomicity

11. **Single commit invariant.** After successful brainstorm with promotion, `git log -1 --name-only` lists exactly: `docs/changes/<feature>/proposal.md`, `docs/changes/<feature>/SKILLS.md`, `docs/roadmap.md`. No stray commits for the roadmap mutation. No working-tree edits remain.
    - Test: integration test in a throwaway git repo.

12. **Failure-aborts-commit.** If `promoteFeature` returns `{ok: false}` for any reason, the skill exits before the commit step. The spec file may exist on disk from prior step's write, but no commit was created and no `transition` interaction was emitted.
    - Test: skill-level test asserting `git status` shows untracked/uncommitted spec and no commit was added.

### Orchestrator pickup

13. **Polling-only signaling.** No new event types are emitted by the promote path. The orchestrator's existing `tracker.fetchCandidateIssues()` (`packages/orchestrator/src/orchestrator.ts:861`) picks up the promoted row on its next tick with no skill-side notification.
    - Test: grep assertion that `promote.ts` and the new MCP handler branch do not call `emit_interaction` or any event-bus publisher.

### Cross-platform parity

14. **Four-platform SKILL.md sync.** The Phase 4 step swap and the `manage_roadmap action: promote` call are present in all four platform variants (`claude-code`, `cursor`, `gemini-cli`, `codex`) and the relevant sections are byte-identical except for platform-specific frontmatter.
    - Test: `diff` of the four files restricted to the modified sections.

### Gate

- `harness validate` passes after the change.
- `pnpm test` passes across `packages/core`, `packages/cli`.
- `harness check-docs` confirms the new `roadmap-promotion.md` knowledge doc is linked.

## Implementation Order

Four phases. Each is independently mergeable; later phases depend on earlier ones only where noted. Detailed task breakdown is `harness-planning`'s job, not this spec's.

### Phase 1 — Core promote function

`packages/core/src/roadmap/promote.ts` and its unit test table. Pure function over `(Roadmap, args) → (Result, Roadmap)`. No IO, no MCP, no skill. The full D2 state-transition matrix, D4 idempotency rules, D5 field-write policy, and the `closestMatches` Levenshtein ranking all land here and ship with exhaustive table tests. Exposed via `packages/core/src/roadmap/index.ts` barrel.

- **Exit gate:** `pnpm test --filter @harness-engineering/core` passes; promote function callable from another package.
- **Why first:** every later phase calls into this. Landing it with full test coverage means no regressions upstream when the wrappers change.

### Phase 2 — MCP tool action

Extend `packages/cli/src/mcp/tools/roadmap.ts` with the `'promote'` action. Handler parses, calls `promoteFeature`, serializes on success, returns envelope verbatim on failure. File-less mode reuses existing `syncRoadmap` path. Integration test in `packages/cli/tests/mcp/tools/roadmap.test.ts` covers an end-to-end fixture per success criteria #1, #11, #12.

- **Depends on:** Phase 1.
- **Exit gate:** `manage_roadmap action: 'promote'` callable via MCP; integration test passes; existing `manage_roadmap` tests still pass.
- **Shippable alone:** at this point the action exists and is usable by any caller. Brainstorming still uses `add`. Nothing broken.

### Phase 3 — Brainstorming SKILL.md updates

Single edit pass across all four platform variants:

- Swap Phase 4 step 7 (commit) ↔ step 8 (roadmap update) — step ordering rewrite.
- Rewrite (new) step 7 to call `manage_roadmap action: 'promote'` with envelope branching per Technical Design.
- Rewrite (new) step 8 commit instruction to include `docs/roadmap.md` and the new commit message format.
- Cross-platform diff check per success criterion #14.

- **Depends on:** Phase 2.
- **Exit gate:** dry-run brainstorm against a test feature produces the success-criteria #1 result.
- **Shippable alone:** this is the cut-over. Until this lands, the new action is unused.

### Phase 4 — Knowledge doc + ADRs

Write `docs/knowledge/roadmap/roadmap-promotion.md` (state-transition table, envelope shape, caller examples) and two ADRs (structured envelopes pattern; rules-in-core boundary). Update the knowledge graph via `manage_state append_entry` or the ingest pipeline as appropriate.

- **Depends on:** nothing (can run parallel to phases 1–3, but contents reference shipped behavior so best landed last among 1–4).
- **Exit gate:** `harness check-docs` passes; the new knowledge doc shows up in `gather_context` results for relevant intents.

### Sequencing summary

```
Phase 1 (core)  →  Phase 2 (MCP)  →  Phase 3 (skill)
                                  ↘  Phase 4 (docs)
```

**Estimated effort:** Phases 1–4 are roughly 2–3 days of focused work end-to-end.

## Follow-up validation

Not a deliverable of this sub-project's PR; this is what proves the loop works in production.

After Phases 1–3 ship, use the new `/harness:brainstorming` flow against the roadmap row for sub-project 2 (trigger detection + queue surface). Success looks like: sub-project 2's roadmap row transitions `backlog → planned` via the new mechanism, with the spec link landing in a single commit per success criterion #1. This is the first real-world validation and a natural transition into sub-project 2's brainstorm session — but it is process, not shipped code.
