# Issue Tracker Integration

Bidirectional integration between harness and issue trackers. Harness results flow into GitHub Issues and Jira, and issue events trigger harness workflows.

## Overview

Issue tracker integration operates in two directions:

- **Outbound (Harness → Issues):** CI check failures create issues, label PRs, and post comments
- **Inbound (Issues → Harness):** Issue labels and PR comments trigger harness agent workflows

Both directions use CI triggers and scripts — no dedicated webhook service is required.

## Harness → Issues (Outbound)

### Pattern 1: CI Failure → PR Comment

When `harness ci check` fails in CI, post a summary comment on the PR.

**How it works:**

1. `harness ci check --json` runs in CI and produces a report
2. A CI step parses the report and formats a comment
3. The comment is posted to the PR via `gh` CLI

**Setup (GitHub Actions):**

```yaml
- name: Run harness checks
  id: harness
  run: harness ci check --json > report.json || true

- name: Comment on PR
  if: github.event_name == 'pull_request'
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: |
    BODY=$(jq -r '"## Harness Check Results\n\n" + ([.checks[] | "- **" + .name + "**: " + .status + (.issues | if length > 0 then "\n" + ([.[] | "  - " + .message] | join("\n")) else "" end)] | join("\n"))' report.json)
    gh pr comment ${{ github.event.number }} --body "$BODY"
```

See the full [GitHub Actions recipe](./recipes/github-actions-harness.yml).

### Pattern 2: Entropy Detected → Create Issue

When entropy detection finds drift above a threshold, automatically create a GitHub issue.

**How it works:**

1. A scheduled CI job runs `harness ci check --json`
2. A script checks if entropy warnings exceed a threshold
3. If so, create an issue with the drift details

**Setup (GitHub Actions):**

```yaml
on:
  schedule:
    - cron: '0 9 * * 1' # Weekly

jobs:
  entropy-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g @harness-engineering/cli
      - name: Check entropy
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          harness ci check --json > report.json || true
          WARNINGS=$(jq '.summary.warnings' report.json)
          if [ "$WARNINGS" -gt 0 ]; then
            BODY=$(jq -r '[.checks[] | select(.status == "warn") | .issues[] | "- " + .message + (if .file then " (`" + .file + "`)" else "" end)] | join("\n")' report.json)
            gh issue create \
              --title "Entropy detected: $WARNINGS warnings" \
              --body "## Entropy Report"$'\n\n'"$BODY"$'\n\n'"Run \`harness fix-drift\` to auto-fix." \
              --label "entropy,automated"
          fi
```

For a standalone webhook handler approach, see the [webhook recipe](./recipes/github-issue-webhook.ts).

### Pattern 3: Phase Gate Violation → PR Label

When a phase gate check fails, label the PR with `needs-spec` or `needs-plan`.

**Setup (GitHub Actions):**

```yaml
- name: Label on phase gate failure
  if: github.event_name == 'pull_request'
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: |
    PHASE_GATE_STATUS=$(jq -r '.checks[] | select(.name == "phase-gate") | .status' report.json)
    if [ "$PHASE_GATE_STATUS" = "fail" ]; then
      gh pr edit ${{ github.event.number }} --add-label "needs-spec"
    fi
```

## Issues → Harness (Inbound)

### Pattern 4: `needs-review` Label → Architecture Enforcer

When an issue is labeled `needs-review`, run the architecture enforcer persona and post results.

**Setup (GitHub Actions):**

````yaml
on:
  issues:
    types: [labeled]

jobs:
  auto-review:
    if: github.event.label.name == 'needs-review'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g @harness-engineering/cli
      - name: Run architecture enforcer
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          harness agent run --persona architecture-enforcer --timeout 60000 > review.txt 2>&1 || true

          # Post result as comment
          {
            echo "## Architecture Review"
            echo '```'
            cat review.txt
            echo '```'
          } | gh issue comment ${{ github.event.issue.number }} --body-file -
````

See the full [headless agent action recipe](./recipes/headless-agent-action.yml).

### Pattern 5: `check-entropy` Label → Entropy Report

When an issue is labeled `check-entropy`, run entropy checks and post a summary.

```yaml
on:
  issues:
    types: [labeled]

jobs:
  entropy-check:
    if: github.event.label.name == 'check-entropy'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g @harness-engineering/cli
      - name: Run entropy checks
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          harness ci check --json --skip deps,phase-gate > report.json || true
          BODY=$(jq -r '[.checks[] | select(.status == "warn") | .issues[] | "- " + .message] | join("\n")' report.json)
          gh issue comment ${{ github.event.issue.number }} --body "## Entropy Report"$'\n\n'"$BODY"
```

### Pattern 6: `/harness check` PR Comment → Run Checks

When someone comments `/harness check` on a PR, run `harness ci check` and reply with results.

**Setup (GitHub Actions):**

```yaml
on:
  issue_comment:
    types: [created]

jobs:
  harness-check:
    if: github.event.issue.pull_request && contains(github.event.comment.body, '/harness check')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.issue.pull_request.head.ref }}
      - run: npm install -g @harness-engineering/cli
      - name: Run checks and reply
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          harness ci check --json > report.json || true
          SUMMARY=$(jq -r '"**Harness Check Results**\n\n" + (.summary | "Passed: " + (.passed | tostring) + " | Failed: " + (.failed | tostring) + " | Warnings: " + (.warnings | tostring))' report.json)
          gh pr comment ${{ github.event.issue.number }} --body "$SUMMARY"
```

### Pattern 7: Jira Transition → GitHub Branch + Harness Init

When a Jira issue transitions to "In Development", create a linked GitHub branch and initialize harness state.

See the [Jira automation rules recipe](./recipes/jira-automation-rules.md) for setup instructions.

## GitHub Issues Setup

To enable the full set of GitHub integrations:

1. **Create labels:** `harness-failed`, `needs-spec`, `needs-plan`, `entropy`, `automated`
2. **Set up secrets:** Add `ANTHROPIC_API_KEY` to your repository secrets (for headless agent patterns)
3. **Copy workflows:** Use the recipes from `docs/guides/recipes/` or generate with `harness ci init`
4. **Test:** Create a test PR and verify the workflow runs

## Jira Setup

Jira integration uses Jira Automation rules that trigger webhooks to GitHub Actions:

1. **Configure Jira Automation rules** following the [Jira automation recipe](./recipes/jira-automation-rules.md)
2. **Set up a GitHub webhook receiver** (GitHub Actions `repository_dispatch` trigger)
3. **Map Jira transitions** to harness workflows

## Combining Patterns

These patterns compose well. A typical full-loop setup:

1. Developer creates a Jira issue → transitions to "In Development"
2. Jira automation creates a GitHub branch via webhook
3. Developer pushes code to the branch, opens a PR
4. `harness ci check` runs automatically, posts results as PR comment
5. If phase gate fails → PR labeled `needs-spec`
6. `needs-spec` label triggers headless brainstorming agent → spec draft posted
7. Developer refines spec, implements, pushes again
8. `harness ci check` passes → label removed, PR ready for review
9. Weekly entropy check creates issues for any drift detected
