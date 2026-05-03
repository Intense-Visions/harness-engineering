# Roadmap Guide

The harness roadmap system tracks project features across milestones in a single markdown file (`docs/roadmap.md`), with optional bidirectional sync to GitHub Issues and AI-assisted next-item selection.

## The Roadmap File

### Creating a Roadmap

```
/harness:roadmap --create
```

This creates `docs/roadmap.md` with frontmatter and your first milestone. You can also create it manually.

### Structure

A roadmap file has three sections: **frontmatter**, **milestones with features**, and an optional **assignment history**.

```markdown
---
project: my-project
version: 1
created: 2026-04-01
updated: 2026-04-03
last_synced: 2026-04-03T10:00:00Z
last_manual_edit: 2026-04-02
---

# Roadmap

## v1.0 MVP

### Authentication

- **Status:** done
- **Spec:** docs/changes/auth/proposal.md
- **Summary:** User authentication with OAuth2
- **Blockers:** none
- **Plan:** docs/changes/auth/plans/2026-03-15-auth-plan.md

### API Gateway

- **Status:** in-progress
- **Spec:** docs/changes/api-gateway/proposal.md
- **Summary:** REST API with rate limiting and versioning
- **Blockers:** none
- **Plan:** docs/changes/api-gateway/plans/2026-04-01-api-gateway-plan.md
- **Assignee:** @alice
- **Priority:** P0
- **External-ID:** github:myorg/myproject#12

### Dashboard UI

- **Status:** planned
- **Spec:** —
- **Summary:** Admin dashboard for monitoring
- **Blockers:** API Gateway

## Backlog

### Mobile App

- **Status:** backlog
- **Spec:** —
- **Summary:** iOS and Android companion app
- **Blockers:** —

## Assignment History

| Feature        | Assignee | Action    | Date       |
| -------------- | -------- | --------- | ---------- |
| Authentication | @alice   | assigned  | 2026-03-15 |
| Authentication | @alice   | completed | 2026-03-28 |
| API Gateway    | @alice   | assigned  | 2026-04-01 |
```

### Feature Fields

Every feature under a milestone heading (`### Feature Name`) has these fields:

| Field         | Required | Description                                                              |
| ------------- | -------- | ------------------------------------------------------------------------ |
| `Status`      | Yes      | One of: `backlog`, `planned`, `in-progress`, `done`, `blocked`           |
| `Spec`        | Yes      | Path to the proposal spec, or `—` if none exists                         |
| `Summary`     | Yes      | One-line description of the feature                                      |
| `Blockers`    | Yes      | Comma-separated list of feature names this depends on, or `none`/`—`     |
| `Plan`        | No       | Path to the implementation plan                                          |
| `Assignee`    | No       | Who is working on this (GitHub username, email, or name)                 |
| `Priority`    | No       | Override: `P0`, `P1`, `P2`, `P3`. Replaces position as primary sort key. |
| `External-ID` | No       | Auto-populated by sync. Format: `github:owner/repo#42`.                  |

The `Assignee`, `Priority`, and `External-ID` fields are conditionally emitted — if none are set on any feature, the output is identical to a legacy roadmap with no diff noise.

### Feature Statuses

| Status        | Meaning                                |
| ------------- | -------------------------------------- |
| `backlog`     | Identified but not yet planned         |
| `planned`     | Has a spec and/or plan, ready to start |
| `in-progress` | Actively being worked on               |
| `done`        | Completed                              |
| `blocked`     | Cannot proceed — waiting on blockers   |

Status progression follows a directional rule: `backlog` → `planned` → `in-progress` → `done`. The sync system enforces this — status can only advance forward, never regress, unless explicitly forced.

### Milestones

Features are grouped under H2 milestone headings (`## v1.0 MVP`). The special `## Backlog` milestone holds items not yet assigned to a release. Features are ordered by priority within each milestone — earlier position = higher priority (unless an explicit `Priority` field overrides this).

## Managing the Roadmap

### Via Slash Command

```
/harness:roadmap --show              # Display current roadmap
/harness:roadmap --add               # Add a feature interactively
/harness:roadmap --sync              # Sync roadmap with project state
/harness:roadmap --edit              # Edit a feature's fields
/harness:roadmap --query status=blocked  # Query features by field
```

### Via MCP Tool

The `manage_roadmap` MCP tool provides programmatic access:

| Action   | Description                                              |
| -------- | -------------------------------------------------------- |
| `show`   | Display the full roadmap or a filtered view              |
| `add`    | Add a new feature to a milestone                         |
| `update` | Update a feature's fields (status, spec, assignee, etc.) |
| `remove` | Remove a feature                                         |
| `query`  | Query features by status, milestone, or other fields     |
| `sync`   | Trigger local + external sync                            |

### Local Sync

Local sync (`syncRoadmap`) scans your project's execution state — specs, plans, and session files — and proposes status changes. For example, if a spec exists for a `backlog` feature, sync proposes advancing it to `planned`. If all tasks in the plan are complete, sync proposes `done`.

The **human-always-wins rule** applies: manually edited statuses are never overwritten unless `force_sync` is set. This prevents the system from fighting human judgment.

Local sync fires automatically after every state transition via `autoSyncRoadmap`.

## External Tracker Sync (GitHub Issues)

### Prerequisites

- A GitHub repository with Issues enabled
- A `GITHUB_TOKEN` environment variable with `repo` scope
- Tracker configuration in `harness.config.json`

### Configuring GitHub Issues Sync

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

#### Required Permissions

The token needs read/write access to issues and labels. The exact scopes depend on whether you use a classic token or a fine-grained token.

**Classic personal access token:**

| Scope  | Why                                            |
| ------ | ---------------------------------------------- |
| `repo` | Read/write access to issues, labels, and state |

For public-only repos, `public_repo` is sufficient instead of `repo`.

**Fine-grained personal access token (recommended):**

| Permission | Access     | Why                                     |
| ---------- | ---------- | --------------------------------------- |
| `Issues`   | Read/Write | Create, update, and close synced issues |
| `Metadata` | Read       | Required for all fine-grained tokens    |

Set **Repository access** to "Only select repositories" and choose the repo(s) your roadmap syncs with.

#### Creating a Token for Personal Repos

1. Go to **Settings → Developer settings → Personal access tokens**
2. Choose **Fine-grained tokens** (or **Tokens (classic)** for a classic token)
3. Click **Generate new token**
4. For fine-grained tokens:
   - Set a descriptive name (e.g., `harness-roadmap-sync`)
   - Set an expiration
   - Under **Repository access**, select "Only select repositories" and pick your repo
   - Under **Permissions → Repository permissions**, grant `Issues: Read and write` and `Metadata: Read`
5. For classic tokens:
   - Set a descriptive name and expiration
   - Check the `repo` scope (or `public_repo` for public repos only)
6. Click **Generate token** and copy the value

#### Creating a Token for Organization Repos

Organization repos may require additional steps depending on the org's security policies.

1. **Check org token policy** — Org admins can restrict which token types are allowed under **Organization settings → Personal access tokens**. Some orgs require fine-grained tokens; others block them entirely. Confirm with your admin if unsure.
2. **Create the token** — Follow the same steps as for personal repos above, selecting the org repo under repository access.
3. **Authorize for SSO (classic tokens only)** — If the org uses SAML SSO, you must authorize the token after creation:
   - Go to **Settings → Developer settings → Personal access tokens → Tokens (classic)**
   - Find your token and click **Configure SSO**
   - Click **Authorize** next to the organization name
4. **Request admin approval (fine-grained tokens)** — If the org requires approval for fine-grained tokens, your token will be in a "pending" state after creation. An org admin must approve it before it will work.

#### Providing the Token

```bash
# Option 1: Export in your shell profile
export GITHUB_TOKEN=ghp_your_token_here

# Option 2: Add to .env (already in .gitignore)
echo "GITHUB_TOKEN=ghp_your_token_here" >> .env
```

> **Tip:** If you use the GitHub CLI (`gh`), you can reuse its token: `export GITHUB_TOKEN=$(gh auth token)`

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
- **Plan:** docs/changes/my-feature/plans/2026-04-01-my-feature-plan.md
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
