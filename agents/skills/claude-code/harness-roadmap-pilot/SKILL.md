# Harness Roadmap Pilot

> AI-assisted selection of the next highest-impact unblocked roadmap item. Scores candidates, recommends one, assigns it, and transitions to the appropriate next skill.

## When to Use

- When the team or individual needs to pick the next item to work on from the roadmap
- When there are multiple unblocked items and prioritization guidance is needed
- After completing a feature and looking for the next highest-impact work
- NOT when the roadmap does not exist (direct user to harness-roadmap --create)
- NOT when the user already knows what to work on (use harness-brainstorming or harness-autopilot directly)

## Process

### Iron Law

**Never assign or transition without the human confirming the recommendation first.**

Present the ranked candidates, the AI reasoning, and the recommended pick. Wait for explicit confirmation before making any changes.

---

### Phase 1: SCAN -- Score Candidates

1. Check if `docs/roadmap.md` exists.
   - If missing: error. "No roadmap found at docs/roadmap.md. Run harness-roadmap --create first."
2. Parse the roadmap using `parseRoadmap` from `@harness-engineering/core`.
3. Determine the current user:
   - Use the `--user` argument if provided
   - Otherwise, attempt to detect from git config: `git config user.name` or `git config user.email`
   - If neither available, proceed without affinity scoring
4. Call `scoreRoadmapCandidates(roadmap, { currentUser })` from `@harness-engineering/core`.
5. If no candidates: inform the human. "No unblocked planned or backlog items found. All items are either in-progress, done, blocked, or the roadmap is empty."

Present the top 5 candidates:

```
ROADMAP PILOT -- Candidate Scoring

Top candidates (scored by position 50%, dependents 30%, affinity 20%):

  #  Feature               Milestone    Priority  Score   Breakdown
  1. Feature A             MVP Release  P0        0.85    pos:0.9 dep:0.8 aff:1.0
  2. Feature B             MVP Release  P1        0.72    pos:0.8 dep:0.6 aff:0.5
  3. Feature C             Q2 Release   --        0.65    pos:0.7 dep:0.5 aff:0.0
  4. Feature D             Backlog      --        0.40    pos:0.3 dep:0.4 aff:0.0
  5. Feature E             Backlog      --        0.35    pos:0.2 dep:0.3 aff:0.0
```

### Phase 2: RECOMMEND -- AI-Assisted Analysis

1. For the top 3 candidates, read their spec files (if they exist):
   - Read the spec's Overview and Goals section
   - Read the spec's Success Criteria section
   - Assess effort and impact from the spec content

2. Provide a recommendation with reasoning:

```
RECOMMENDATION

I recommend Feature A (MVP Release, P0, score: 0.85).

Reasoning:
- Highest priority (P0) with strong positional signal (first in MVP milestone)
- Unblocks 2 downstream features (Feature X, Feature Y)
- You completed its blocker "Foundation" -- high context affinity
- Spec exists with clear success criteria (12 acceptance tests)
- Estimated effort: medium (8 tasks in the plan)

Alternative: Feature B (P1, score: 0.72) -- consider if Feature A's scope is too large for the current time window.

Proceed with Feature A? (y/n/pick another)
```

### Phase 3: CONFIRM -- Human Decision

1. Wait for human confirmation.
   - If **yes**: proceed to Phase 4.
   - If **pick another**: ask which candidate number, then proceed with that pick.
   - If **no**: stop. No changes made.

### Phase 4: ASSIGN -- Execute Assignment and Transition

1. Call `assignFeature(roadmap, feature, currentUser, todayDate)` from `@harness-engineering/core`.
   - This updates the feature's `Assignee` field
   - Appends `assigned` record to assignment history (and `unassigned` for previous assignee if reassignment)

2. Serialize and write the updated roadmap to `docs/roadmap.md`.

3. If tracker config exists in `harness.config.json`, sync the assignment:
   - Call the external tracker's `assignTicket` to push the assignment
   - Log result but do not block on failure

4. Determine the transition target:
   - If the feature has a `spec` field (non-null): transition to `harness:autopilot`
   - If the feature has no `spec`: transition to `harness:brainstorming`

5. Present the transition to the human via `emit_interaction`:

   ```json
   emit_interaction({
     path: "<project-root>",
     type: "transition",
     transition: {
       completedPhase: "roadmap-pilot",
       suggestedNext: "<brainstorming|autopilot>",
       reason: "Feature '<name>' assigned and ready for <brainstorming|execution>",
       artifacts: ["docs/roadmap.md"],
       requiresConfirmation: true,
       summary: "Assigned '<name>' to <user>. <Spec exists -- ready for autopilot|No spec -- needs brainstorming first>.",
       qualityGate: {
         checks: [
           { "name": "roadmap-parsed", "passed": true },
           { "name": "candidate-scored", "passed": true },
           { "name": "human-confirmed", "passed": true },
           { "name": "assignment-written", "passed": true }
         ],
         allPassed: true
       }
     }
   })
   ```

6. Run `harness validate`.

---

## Harness Integration

- **`parseRoadmap` / `serializeRoadmap`** -- Parse and write `docs/roadmap.md`. Import from `@harness-engineering/core`.
- **`scoreRoadmapCandidates`** -- Core scoring algorithm. Import from `@harness-engineering/core`. Takes a `Roadmap` and optional `PilotScoringOptions` (currentUser for affinity).
- **`assignFeature`** -- Assignment with history tracking. Import from `@harness-engineering/core`. Handles new assignment and reassignment (unassigned + assigned records).
- **`emit_interaction`** -- Used for the skill transition at the end. Transitions to `harness:brainstorming` (no spec) or `harness:autopilot` (spec exists).
- **`harness validate`** -- Run after assignment is written.
- **External sync** -- If `harness.config.json` has tracker config, use `fullSync` or direct `assignTicket` to push assignment to external service.

## Success Criteria

1. Roadmap is parsed and unblocked planned/backlog items are scored
2. Scoring uses two-tier sort: explicit priority first, then weighted score
3. AI reads top candidates' specs and provides recommendation with reasoning
4. Human confirms before any changes are made
5. Assignment updates feature field, appends history records, and syncs externally
6. Reassignment produces two history records (unassigned + assigned)
7. Transition routes to brainstorming (no spec) or autopilot (spec exists)
8. `harness validate` passes after all changes

## Examples

### Example: Pick Next Item from a Multi-Milestone Roadmap

**Context:** A roadmap with 3 milestones, 8 features. 2 are in-progress, 1 is done, 2 are blocked, 3 are planned/backlog and unblocked. User is @cwarner who completed "Core Library Design".

**Phase 1: SCAN**

```
ROADMAP PILOT -- Candidate Scoring

Top candidates:
  #  Feature               Milestone    Priority  Score   Breakdown
  1. Graph Connector       MVP Release  P2        0.78    pos:0.8 dep:0.6 aff:1.0
  2. Performance Baselines Q3 Hardening --        0.45    pos:0.5 dep:0.3 aff:0.0
  3. Push Notifications    Backlog      --        0.30    pos:0.2 dep:0.2 aff:0.5
```

**Phase 2: RECOMMEND**

```
I recommend Graph Connector (MVP Release, P2, score: 0.78).

Reasoning:
- Only prioritized item among candidates (P2)
- You completed its blocker "Core Library Design" -- maximum affinity bonus
- Unblocks "API Integration" downstream
- Spec exists at docs/changes/graph-connector/proposal.md

Proceed? (y/n/pick another)
```

Human confirms **y**.

**Phase 4: ASSIGN**

```
Assigned: Graph Connector -> @cwarner
History: +1 record (assigned, 2026-04-02)
Roadmap updated: docs/roadmap.md
External sync: github:harness-eng/harness#43 assigned

Transitioning to harness:autopilot (spec exists)...
```

## Gates

- **No assignment without human confirmation.** The CONFIRM phase must complete with explicit approval. Never auto-assign.
- **No transition without assignment.** The skill must write the assignment before transitioning to the next skill.
- **No scoring without a parsed roadmap.** If `docs/roadmap.md` does not exist or fails to parse, stop with an error.

## Escalation

- **When no unblocked candidates exist:** Inform the human. Suggest reviewing blocked items to see if blockers can be resolved, or adding new features via `harness-roadmap --add`.
- **When affinity data is unavailable:** Proceed without affinity scoring (weight falls to 0 for all candidates). Note this in the output.
- **When external sync fails:** Log the error, complete the local assignment, and note that external sync can be retried with `harness-roadmap --sync`.
