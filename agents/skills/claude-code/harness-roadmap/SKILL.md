# Harness Roadmap

> Create and manage a unified project roadmap from existing specs and plans. Interactive, human-confirmed, always valid.

## When to Use

- When a user asks about project status and a roadmap exists (default -- no args)
- When a project needs a unified roadmap and none exists yet (`--create`)
- When adding a new feature to an existing roadmap (`--add <feature-name>`)
- When roadmap statuses may be stale and need updating from plan execution state (`--sync`)
- When features need reordering, moving between milestones, or blocker updates (`--edit`)
- When user asks about project status and no roadmap exists -- suggest `--create`
- NOT for programmatic CRUD (use `manage_roadmap` MCP tool directly)

## Process

### Iron Law

**Never write `docs/roadmap.md` without the human confirming the proposed structure first.**

If the human has not seen and approved the milestone groupings and feature list, do not write the file. Present. Wait. Confirm. Then write.

---

### Command: `--create` -- Bootstrap Roadmap

#### Phase 1: SCAN -- Discover Artifacts

1. Check if `docs/roadmap.md` already exists.
   - If it exists: warn the human. "A roadmap already exists. Overwriting will replace it. Continue? (y/n)" Wait for confirmation before proceeding. If declined, stop.
2. Scan for specs:
   - `docs/specs/*.md`
   - `docs/changes/*/proposal.md`
   - Record each spec's title, status (if detectable from frontmatter or content), and file path.
3. Scan for plans:
   - `docs/plans/*.md`
   - Record each plan's title, estimated tasks, and file path.
4. Match plans to specs:
   - Plans often reference their spec in frontmatter (`spec:`) or body text. Link them when a match is found.
   - Unmatched plans become standalone features.
5. Infer feature status from artifacts:
   - Has spec + plan + implementation evidence (committed code referenced in plan) -> `in-progress` or `complete`
   - Has spec + plan but no implementation -> `planned`
   - Has spec but no plan -> `backlog`
   - Has plan but no spec -> `planned` (unusual, flag for human review)
6. Detect project name from `harness.yaml` `project` field, or `package.json` `name` field, or directory name as fallback.

Present scan summary:

```
SCAN COMPLETE

Project: <name>
Found: N specs, N plans
Matched: N spec-plan pairs
Unmatched specs: N (backlog candidates)
Unmatched plans: N (flag for review)
```

#### Phase 2: PROPOSE -- Interactive Grouping

1. Present discovered features in default milestone groupings:
   - **Current Work** -- features with status `in-progress`
   - **Backlog** -- everything else

   ```
   Proposed Roadmap Structure:

   ## Current Work
   - Feature A (in-progress) -- spec: docs/changes/feature-a/proposal.md
   - Feature B (in-progress) -- spec: docs/specs/feature-b.md

   ## Backlog
   - Feature C (planned) -- spec: docs/changes/feature-c/proposal.md
   - Feature D (backlog) -- spec: docs/specs/feature-d.md
   ```

2. Offer choices:
   - **(A) Accept** -- proceed with this structure
   - **(B) Rename** -- rename milestones or features
   - **(C) Reorganize** -- move features between milestones
   - **(D) Add milestones** -- create additional milestones (e.g., "v2.0", "Q2 2026")

3. Ask: "Are there additional features not captured in specs that should be on the roadmap?"
   - If yes: collect name, summary, and milestone for each.

4. Repeat until the human selects **(A) Accept**.

#### Phase 3: WRITE -- Generate Roadmap

1. Build the roadmap structure:
   - Frontmatter: `project`, `version: 1`, `created`, `updated` timestamps
   - One H2 section per milestone
   - One H3 section per feature with 5 fields: `Status`, `Spec`, `Summary`, `Blockers`, `Plan`

2. Write via `manage_roadmap` MCP tool if available. If MCP is unavailable, write directly using the roadmap markdown format:

   ```markdown
   ---
   project: <name>
   version: 1
   created: YYYY-MM-DD
   updated: YYYY-MM-DD
   ---

   # Roadmap

   ## Current Work

   ### Feature A

   - **Status:** in-progress
   - **Spec:** docs/changes/feature-a/proposal.md
   - **Summary:** One-line description of the feature
   - **Blockers:** none
   - **Plan:** docs/plans/2026-03-20-feature-a-plan.md
   ```

3. Write to `docs/roadmap.md`.

#### Phase 4: VALIDATE -- Verify Output

1. Read back `docs/roadmap.md`.
2. Verify via `manage_roadmap show` if MCP is available -- confirms round-trip parsing.
3. Run `harness validate`.
4. Present summary to human:

   ```
   Roadmap created: docs/roadmap.md
   Milestones: N
   Features: N
   harness validate: passed
   ```

---

### Command: `--add <feature-name>` -- Add a Feature

#### Phase 1: SCAN -- Load Existing Roadmap

1. Check if `docs/roadmap.md` exists.
   - If missing: error with clear message. "No roadmap found at docs/roadmap.md. Run `--create` first to bootstrap one."
2. Parse the roadmap (via `manage_roadmap show` or direct read).
3. Check for duplicate feature names. If `<feature-name>` already exists: error with message. "Feature '<feature-name>' already exists in milestone '<milestone>'. Use a different name or edit the existing feature."

#### Phase 2: PROPOSE -- Collect Feature Details

Ask the human for each field interactively:

1. **Milestone:** "Which milestone should this feature belong to?" List existing milestones plus a `[NEW]` option. If `[NEW]`: ask for the new milestone name.
2. **Status:** "What is the current status?" Offer: `backlog`, `planned`, `in-progress`, `blocked`.
3. **Spec:** "Is there a spec for this feature?" If yes, ask for the path. If no, leave as `none`.
4. **Summary:** "One-line summary of the feature."
5. **Blockers:** "Any blockers?" If yes, collect. If no, set to `none`.
6. **Plan:** "Is there a plan for this feature?" If yes, ask for the path. If no, leave as `none`.

Present the collected details for confirmation:

```
New feature to add:

  Milestone: Current Work
  Name: Feature E
  Status: planned
  Spec: docs/changes/feature-e/proposal.md
  Summary: Add feature E to the system
  Blockers: none
  Plan: none

Confirm? (y/n)
```

Wait for confirmation before proceeding.

#### Phase 3: WRITE -- Add Feature to Roadmap

1. Add via `manage_roadmap add` MCP tool if available. If MCP is unavailable, parse the roadmap, add the feature to the specified milestone, and serialize back.
2. If the milestone is `[NEW]`: create the milestone section, then add the feature.
3. Write to `docs/roadmap.md`.

#### Phase 4: VALIDATE -- Verify Output

1. Read back `docs/roadmap.md`.
2. Verify the new feature appears in the correct milestone.
3. Run `harness validate`.
4. Confirm to human:

   ```
   Feature added: Feature E -> Current Work
   Total features: N
   harness validate: passed
   ```

---

### Command: _(no args)_ -- Show Roadmap Summary

#### Phase 1: SCAN -- Load Roadmap

1. Check if `docs/roadmap.md` exists.
   - If missing: suggest `--create`. "No roadmap found at docs/roadmap.md. Run `--create` to bootstrap one from existing specs and plans."
2. Parse the roadmap (via `manage_roadmap show` or direct read).

#### Phase 2: PRESENT -- Display Summary

1. Display a compact summary of the roadmap:

   ```
   ROADMAP: <project-name>
   Last synced: YYYY-MM-DD HH:MM

   ## <Milestone 1> (N features)
     - Feature A .................. in-progress
     - Feature B .................. planned
     - Feature C .................. blocked (by: Feature A)

   ## <Milestone 2> (N features)
     - Feature D .................. done
     - Feature E .................. backlog

   Total: N features | N done | N in-progress | N planned | N blocked | N backlog
   ```

2. If any features have stale sync timestamps (last_synced older than 24 hours), append a note:

   ```
   Hint: Roadmap may be stale. Run `--sync` to update statuses from plan execution state.
   ```

3. No file writes. This is a read-only operation. No `harness validate` needed.

---

### Command: `--sync` -- Sync Statuses from Execution State

#### Phase 1: SCAN -- Load Roadmap and Execution State

1. Check if `docs/roadmap.md` exists.
   - If missing: error with clear message. "No roadmap found at docs/roadmap.md. Run `--create` first to bootstrap one."
   - Do NOT create a roadmap. Do NOT offer alternatives. Stop.
2. Parse the roadmap (via `manage_roadmap show` or direct read).
3. For each feature with linked plans, scan execution state:
   - `.harness/state.json` (root execution state)
   - `.harness/sessions/*/autopilot-state.json` (session-scoped execution state)
   - Plan file completion markers

#### Phase 2: PROPOSE -- Present Status Changes

1. Infer status for each feature:
   - All tasks complete -> suggest `done`
   - Any task started -> suggest `in-progress`
   - Blocker feature not done -> suggest `blocked`
   - No execution data found -> no change

2. Check the **human-always-wins** rule: if `last_manual_edit` is more recent than `last_synced` for a feature, preserve the manually set status. Report it as "skipped (manual override)".

3. Present proposed changes:

   ```
   SYNC RESULTS

   Changes detected:
     - Feature A: planned -> in-progress (3/8 tasks started)
     - Feature B: in-progress -> done (all tasks complete)
     - Feature C: planned -> blocked (blocked by: Feature A, not done)

   Unchanged:
     - Feature D: done (no change)

   Skipped (manual override):
     - Feature E: kept as "planned" (manually edited 2h ago)

   Apply these changes? (y/n)
   ```

4. Wait for human confirmation before applying.

#### Phase 3: WRITE -- Apply Changes

1. Apply via `manage_roadmap sync` MCP tool if available, or via `manage_roadmap update` for each changed feature. If MCP is unavailable, parse the roadmap, update statuses, and serialize back.
2. Update `last_synced` timestamp in frontmatter.
3. Write to `docs/roadmap.md`.

#### Phase 4: VALIDATE -- Verify Output

1. Read back `docs/roadmap.md`.
2. Verify changes applied correctly via `manage_roadmap show` if MCP is available.
3. Run `harness validate`.
4. Present summary:

   ```
   Sync complete: docs/roadmap.md
   Updated: N features
   Skipped: N (manual override)
   Unchanged: N
   harness validate: passed
   ```

## Harness Integration

- **`manage_roadmap` MCP tool** -- Primary read/write interface for roadmap operations. Supports `show`, `add`, `update`, `remove`, and `query` actions. Use this when MCP is available for structured CRUD.
- **`harness validate`** -- Run after any roadmap modification to verify project health. Mandatory in the VALIDATE phase of both `--create` and `--add`.
- **Core `parseRoadmap`/`serializeRoadmap`** -- Fallback when MCP is unavailable. These functions in `packages/core/src/roadmap/` handle parsing and serializing the roadmap markdown format directly.
- **Roadmap file** -- Always at `docs/roadmap.md`. This is the single source of truth for the project roadmap.

## Success Criteria

1. `--create` discovers all specs (`docs/specs/*.md`, `docs/changes/*/proposal.md`) and plans (`docs/plans/*.md`)
2. `--create` proposes groupings and waits for human confirmation before writing
3. `--create` produces a valid `docs/roadmap.md` that round-trips through `parseRoadmap`/`serializeRoadmap`
4. `--add` collects all fields interactively (milestone, status, spec, summary, blockers, plan)
5. `--add` rejects duplicate feature names with a clear error message
6. `--add` errors gracefully when no roadmap exists, directing the user to `--create`
7. Output matches the roadmap markdown format exactly (frontmatter, H2 milestones, H3 features, 5 fields each)
8. `harness validate` passes after both `--create` and `--add` operations

## Examples

### Example: `--create` -- Bootstrap a Roadmap from Existing Artifacts

**Context:** A project with 3 specs and 2 plans. Two specs have matching plans (in-progress), one spec has no plan (backlog).

**Phase 1: SCAN**

```
SCAN COMPLETE

Project: my-project
Found: 3 specs, 2 plans
Matched: 2 spec-plan pairs
Unmatched specs: 1 (backlog candidates)
Unmatched plans: 0
```

**Phase 2: PROPOSE**

```
Proposed Roadmap Structure:

## Current Work
- Unified Code Review (in-progress) -- spec: docs/changes/unified-code-review/proposal.md
- Update Checker (in-progress) -- spec: docs/changes/update-checker/proposal.md

## Backlog
- Design System (backlog) -- spec: docs/specs/design-system.md

Options:
  (A) Accept this structure
  (B) Rename milestones or features
  (C) Reorganize -- move features between milestones
  (D) Add milestones

Any additional features not captured in specs? (y/n)
```

Human selects **(A) Accept**.

**Phase 3: WRITE**

```
Writing docs/roadmap.md...
  2 milestones, 3 features
```

**Phase 4: VALIDATE**

```
Roadmap created: docs/roadmap.md
Milestones: 2 (Current Work, Backlog)
Features: 3
harness validate: passed
```

### Example: `--add` -- Add a Feature to an Existing Roadmap

**Context:** A roadmap exists with 2 milestones and 3 features. Adding a new feature.

**Phase 1: SCAN**

```
Roadmap loaded: docs/roadmap.md
Milestones: 2 (Current Work, Backlog)
Features: 3
No duplicate found for "Notification System"
```

**Phase 2: PROPOSE**

```
Which milestone? [1] Current Work  [2] Backlog  [NEW] Create new
> 1

Status? [backlog] [planned] [in-progress] [blocked]
> planned

Spec? (path or "none")
> docs/changes/notification-system/proposal.md

One-line summary:
> Real-time notification delivery with WebSocket and email channels

Blockers? (or "none")
> none

Plan? (path or "none")
> none

New feature to add:

  Milestone: Current Work
  Name: Notification System
  Status: planned
  Spec: docs/changes/notification-system/proposal.md
  Summary: Real-time notification delivery with WebSocket and email channels
  Blockers: none
  Plan: none

Confirm? (y/n)
```

Human confirms **y**.

**Phase 3: WRITE**

```
Adding feature to Current Work...
```

**Phase 4: VALIDATE**

```
Feature added: Notification System -> Current Work
Total features: 4
harness validate: passed
```

## Gates

These are hard stops. Violating any gate means the process has broken down.

- **No writing `docs/roadmap.md` without human confirmation of structure.** The PROPOSE phase must complete with an explicit accept before any file is written. Skipping confirmation produces a roadmap the human did not agree to.
- **No overwriting an existing roadmap without explicit user consent.** If `docs/roadmap.md` exists when `--create` runs, the human must confirm the overwrite. Silent overwrites destroy prior work.
- **No adding features with duplicate names.** If a feature with the same name already exists in any milestone, reject the add with a clear error. Duplicates corrupt the roadmap structure.
- **No proceeding when `docs/roadmap.md` is missing for `--add`.** If the roadmap does not exist, do not create one silently. Error and direct the user to `--create`.

## Escalation

- **When no specs or plans are found during `--create`:** Suggest creating a minimal roadmap with just a Backlog milestone containing features described verbally by the human. Alternatively, suggest running `harness:brainstorming` first to generate specs that can then be discovered by `--create`.
- **When the roadmap file is malformed and cannot be parsed:** Report the specific parse error with line numbers if available. Suggest manual inspection of `docs/roadmap.md` or recreation with `--create` (after backing up the existing file).
- **When MCP tool is unavailable:** Fall back to direct file manipulation via Read/Write tools using the roadmap markdown format. The core `parseRoadmap`/`serializeRoadmap` functions handle the format. Report the fallback to the human: "MCP tool unavailable, using direct file operations."
