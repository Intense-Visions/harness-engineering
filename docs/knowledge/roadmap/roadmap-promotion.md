---
type: business_process
domain: roadmap
tags: [roadmap, promotion, brainstorming, manage_roadmap, state-transition, atomic-commit]
---

# Roadmap Promotion

Roadmap promotion is the brainstorm-complete → `planned` transition. When a human
brainstorms an existing backlog row to an approved spec, the row advances in place —
gaining the spec link and shipping in the same git commit as the spec — instead of a
duplicate `planned` row being appended beside the original. It is exposed as
`manage_roadmap action: 'promote'` and backed by the pure `promoteFeature` function in
`@harness-engineering/core` (`packages/core/src/roadmap/promote.ts`).

## Why it exists

`harness-brainstorming` Phase 4 historically called `manage_roadmap action: 'add'` with
`status: 'planned'`, creating a new row regardless of whether the feature already existed
in `backlog`. The common path — a human writes a backlog one-liner, then later brainstorms
it — produced a duplicate row. The orchestrator's `selectCandidates` filters by
`activeStates: ['planned', 'in-progress']`, so the original `backlog` row stayed invisible
to dispatch while a duplicate `planned` row got picked up, breaking the link between the
brainstorm and its roadmap row. Promotion advances the original row so the brainstorm,
the spec, and dispatch all reference one feature.

## The PromoteResult envelope

`promote` returns a structured envelope (`RoadmapPromoteResult`) rather than free-form
text, so the brainstorming skill, the dashboard, and autopilot all branch on stable
`reason` strings without re-parsing prose:

```ts
type RoadmapPromoteCoreResult =
  | { ok: true; transitioned: 'backlog→planned' | 'spec-updated' | 'noop'; feature: string }
  | { ok: false; reason: 'in-progress' | 'done'; detail: string; feature: string }
  | { ok: false; reason: 'not-found'; detail: string; feature: string; closestMatches: string[] }
  | { ok: false; reason: 'ambiguous'; detail: string; feature: string; matches: string[] };

// The MCP handler adds the IO-failure variant the pure core cannot know about:
type RoadmapPromoteResult =
  | RoadmapPromoteCoreResult
  | { ok: false; reason: 'write-failed'; detail: string; feature: string };
```

`closestMatches` (≤3, Levenshtein-ranked) appears only on `not-found`. `matches`
(milestone-qualified, e.g. `'v1.0 Foundation > Auto-promote'`) appears only on `ambiguous`.
The MCP tool returns the envelope as JSON; success and `noop` are non-error responses,
while every refusal/failure is marked `isError` so the external-sync trigger skips it.

See [ADR 0042](../decisions/0042-roadmap-action-structured-envelopes.md) for the
envelope-as-convention decision.

## State-transition rules (D2)

The lookup key is the brainstorming `ARGUMENTS` string — trimmed, case-insensitive, exact
heading match. Behavior is conditional on the matched row's current state:

| Current state | Action                               | Rationale                                                                       |
| ------------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| `backlog`     | Promote → `planned`, set `Spec`      | The happy path; the feature exists for this case.                               |
| not found     | Caller creates a new `planned` row   | Unchanged from the legacy `add` behavior.                                       |
| `planned`     | Update `Spec` only, preserve status  | Re-brainstorm of an already-planned item; refining the spec.                    |
| `blocked`     | Update `Spec` only, preserve status  | The blocker remains the gating concern; brainstorming the unblock is valid.     |
| `needs-human` | Update `Spec` only, preserve status  | Non-active, non-terminal — re-brainstorming is legitimate (treated like above). |
| `in-progress` | **Refuse** (`reason: 'in-progress'`) | An agent may be dispatched; yanking the spec mid-flight is undefined behavior.  |
| `done`        | **Refuse** (`reason: 'done'`)        | Already shipped; a revision must use a new feature name.                        |

Lookup edge cases: zero matches → `not-found` with `closestMatches`; two or more matches
across milestones → `ambiguous` with milestone-qualified `matches` (no silent
earliest-row preference).

## Idempotency and field-write policy

- **Idempotent no-op (D4):** re-running against a non-`backlog` row whose `Spec` already
  equals the new path returns `transitioned: 'noop'` and produces zero roadmap diff.
- **Field-write policy (D5):** promotion writes `Status` (backlog only), `Spec`, and
  `Summary` _only when the row's summary is empty_ (em-dash or blank — never overwrites a
  human-written summary). `Plan`, `Assignee`, `Priority`, `External-ID`, `Blockers`, and
  `Milestone` are preserved untouched. The one case that writes a `Milestone` is the
  create-new path (row didn't exist), which appends under "Current Work".

## Atomicity and signaling

The brainstorming skill commits `proposal.md`, `SKILLS.md`, and `roadmap.md` in a single
commit (`docs(<feature>): add spec and promote to planned`), so the promotion is atomic
with the spec. Any refusal aborts before the commit — the spec may remain on disk, but no
commit and no transition interaction are produced.

Promotion emits **no events**. The orchestrator's existing `tracker.fetchCandidateIssues()`
poll picks up the promoted row on its next tick; there is no skill-side dispatch
notification. Neither `promote.ts` nor the MCP handler imports `emit_interaction` or any
event-bus publisher.

## Where the rules live

The state-transition rules live in `@harness-engineering/core`, not in skill markdown, so
every caller shares one tested source of truth. The file-mode MCP handler and the file-less
handler both call `promoteFeature` and translate its result to their respective store
(roadmap file write vs. `RoadmapTrackerClient.update`). See
[ADR 0043](../decisions/0043-roadmap-rules-in-core.md).

## Callers

- **`harness-brainstorming` Phase 4 step 7** — today's primary caller (all four platform
  variants via the shared `harness-brainstorming` symlink).
- **Autopilot / dashboard** — future consumers of the same envelope (brainstorm-driven
  roadmap loop sub-projects 2 and 4).
