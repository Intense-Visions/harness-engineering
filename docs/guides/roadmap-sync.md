# Roadmap Sync & Auto-Pick

Bidirectional sync between your project roadmap and GitHub Issues, plus AI-assisted next-item selection.

## Overview

The roadmap sync system keeps `docs/roadmap.md` and an external issue tracker in sync using a split-authority model:

- **Roadmap owns planning fields** — status, spec, plans, blockers, summary
- **External service owns execution fields** — assignee, real-time status updates

Sync fires automatically on every state transition (task-start, task-complete, phase-start, phase-complete, save-handoff, archive_session). Errors are swallowed — sync never blocks your work.

## Prerequisites

- A `docs/roadmap.md` file in your project (create with `/harness:roadmap --create`)
- A GitHub repository with Issues enabled
- A `GITHUB_TOKEN` environment variable with `repo` scope

## Configuring GitHub Issues Sync

Add a `roadmap.tracker` section to your `harness.config.json`:

```json
{
  "version": 1,
  "name": "my-project",
  "roadmap": {
    "tracker": {
      "kind": "github",
      "repo": "owner/repo",
      "labels": ["harness-managed"],
      "statusMap": {
        "backlog": "open",
        "planned": "open",
        "in-progress": "open",
        "done": "closed",
        "blocked": "open"
      },
      "reverseStatusMap": {
        "closed": "done",
        "open:in-progress": "in-progress",
        "open:blocked": "blocked",
        "open:planned": "planned"
      }
    }
  }
}
```

### Configuration Fields

| Field              | Required | Description                                                                                 |
| ------------------ | -------- | ------------------------------------------------------------------------------------------- |
| `kind`             | Yes      | Tracker type. Currently only `"github"` is supported.                                       |
| `repo`             | No       | Repository in `"owner/repo"` format. Defaults to your git remote.                           |
| `labels`           | No       | Labels auto-applied to every synced issue. Use for filtering (e.g., `["harness-managed"]`). |
| `statusMap`        | Yes      | Maps each roadmap status to a GitHub issue state (`"open"` or `"closed"`).                  |
| `reverseStatusMap` | No       | Maps GitHub state (+ optional label) back to a roadmap status.                              |

### How Status Mapping Works

GitHub Issues only have two states: `open` and `closed`. Since multiple roadmap statuses map to `open`, the adapter uses **labels** as a secondary discriminator:

**Push (roadmap → GitHub):**

| Roadmap Status | GitHub State | Label Added   |
| -------------- | ------------ | ------------- |
| `backlog`      | open         | _(none)_      |
| `planned`      | open         | `planned`     |
| `in-progress`  | open         | `in-progress` |
| `blocked`      | open         | `blocked`     |
| `done`         | closed       | _(none)_      |

**Pull (GitHub → roadmap):**

| GitHub State | Label                | Roadmap Status       |
| ------------ | -------------------- | -------------------- |
| `closed`     | _(any)_              | `done`               |
| `open`       | `in-progress`        | `in-progress`        |
| `open`       | `blocked`            | `blocked`            |
| `open`       | `planned`            | `planned`            |
| `open`       | _(none or multiple)_ | _(preserve current)_ |

The `reverseStatusMap` uses compound keys like `"open:in-progress"` to express state + label combinations.

### Setting Up the Token

The adapter reads `GITHUB_TOKEN` from your environment. If the token is absent, external sync is silently skipped.

```bash
# Option 1: Export in your shell profile
export GITHUB_TOKEN=ghp_your_token_here

# Option 2: Add to .env (already in .gitignore)
echo "GITHUB_TOKEN=ghp_your_token_here" >> .env
```

The token needs `repo` scope for read/write access to issues.

## How Sync Works

### Automatic Sync

Once configured, sync fires automatically whenever a state transition occurs:

1. **Local sync runs first** — updates roadmap status based on local execution state (specs, plans, sessions)
2. **External sync runs second** — pushes planning fields, then pulls execution fields
3. **Errors are logged but never block** — the state operation always succeeds

The 6 trigger points are: `task-start`, `task-complete`, `phase-start`, `phase-complete`, `save-handoff`, `archive_session`.

### What Gets Synced

**Push (every sync):**

- Features without an `External-ID` get a new GitHub Issue created (title = feature name, body = summary + spec link)
- Features with an `External-ID` get their planning fields updated (title, body, labels)
- The resulting `External-ID` (e.g., `github:owner/repo#42`) is stored on the feature

**Pull (every sync):**

- Assignee changes from GitHub overwrite local assignee (external wins)
- Status changes are applied with a **directional guard** — status can only advance forward (`planned` → `in-progress` → `done`), never regress, unless `forceSync` is set
- If status is ambiguous (multiple status labels or no label), the current roadmap status is preserved

### Concurrency Protection

An in-process mutex serializes `fullSync` calls. With 6 trigger points, rapid state transitions could otherwise produce write conflicts. The mutex ensures only one write to `roadmap.md` occurs at a time.

## Roadmap Feature Fields

After enabling sync, your roadmap features gain three new optional fields:

```markdown
### My Feature

- **Status:** in-progress
- **Spec:** docs/changes/my-feature/proposal.md
- **Summary:** Implement the widget system
- **Blockers:** —
- **Plan:** docs/plans/2026-04-01-my-feature-plan.md
- **Assignee:** @username
- **Priority:** P1
- **External-ID:** github:owner/repo#42
```

| Field         | Description                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------- |
| `Assignee`    | GitHub username, email, or display name. Updated by external sync.                                                |
| `Priority`    | Optional override: `P0`, `P1`, `P2`, `P3`. When present, replaces position as the primary sort key for auto-pick. |
| `External-ID` | Auto-populated by sync. Format: `github:owner/repo#42`. Do not edit manually.                                     |

These fields are conditionally emitted — if none are set on a feature, the markdown output is identical to before (no diff noise on legacy roadmaps).

## Assignment History

An `## Assignment History` section is automatically maintained at the bottom of `roadmap.md`:

```markdown
## Assignment History

| Feature       | Assignee | Action    | Date       |
| ------------- | -------- | --------- | ---------- |
| Widget System | @alice   | assigned  | 2026-04-01 |
| Widget System | @alice   | completed | 2026-04-03 |
| API Gateway   | @bob     | assigned  | 2026-04-02 |
```

Reassignment produces two records: `unassigned` for the previous assignee, then `assigned` for the new one. This provides a complete audit trail and enables affinity-based routing.

## Auto-Pick Pilot

The `harness-roadmap-pilot` skill uses the roadmap to recommend the next highest-impact item to work on.

### How It Works

1. **Filter** — Only unblocked items with status `planned` or `backlog` are candidates
2. **Score** — Two-tier sort:
   - **Tier 1:** Items with explicit `Priority` sort first (P0 > P1 > P2 > P3)
   - **Tier 2:** Within each tier, weighted score: position (0.5) + dependents (0.3) + affinity (0.2)
3. **Recommend** — AI reads top candidates' specs and presents a recommendation with reasoning
4. **Confirm** — Human approves the selection
5. **Route** — If spec exists → `harness:autopilot`; if no spec → `harness:brainstorming`
6. **Assign** — Updates `Assignee` field, appends to assignment history, syncs to external tracker

### Affinity Scoring

The affinity weight (0.2) gives a bonus to candidates where the current user has context:

- **Blocker affinity (1.0):** User completed a blocker of this candidate
- **Sibling affinity (0.5):** User completed another feature in the same milestone

### Invoking the Pilot

```
/harness:roadmap-pilot
```

The pilot reads `docs/roadmap.md`, scores candidates, and walks you through the selection.

## Troubleshooting

### Sync Not Firing

1. Check that `harness.config.json` has a valid `roadmap.tracker` section
2. Check that `GITHUB_TOKEN` is set in your environment
3. Check that `docs/roadmap.md` exists

### Status Not Updating from GitHub

The directional guard prevents status regression. If a GitHub Issue is reopened after being closed, the roadmap status will not revert from `done` to `in-progress` unless you set `forceSync: true` in the sync options.

### Labels Not Matching

Ensure your `reverseStatusMap` compound keys match the exact labels the adapter applies. For example, if you use custom labels, update both `statusMap` (push) and `reverseStatusMap` (pull) to match.

### Feature Not Syncing

Features need either no `External-ID` (to create a new issue) or a valid `External-ID` in `github:owner/repo#number` format. Malformed IDs are skipped with an error logged to stderr.
