# Jira Automation Rules for Harness Integration

Configure Jira Automation to create bidirectional flows between Jira issues and harness workflows.

## Prerequisites

- Jira project with Automation enabled (Jira Cloud or Jira Data Center 9.0+)
- GitHub repository with `repository_dispatch` webhook configured
- GitHub Personal Access Token with `repo` scope stored in Jira as a secret

## Rule 1: "In Development" → Create GitHub Branch

When a Jira issue transitions to "In Development", create a GitHub branch and initialize harness state.

### Setup

1. Go to **Project Settings → Automation → Create rule**
2. **Trigger:** When: Issue transitioned → Status: "In Development"
3. **Action:** Send web request
   - **URL:** `https://api.github.com/repos/{OWNER}/{REPO}/dispatches`
   - **Method:** POST
   - **Headers:**
     ```
     Authorization: Bearer {{secrets.GITHUB_TOKEN}}
     Accept: application/vnd.github+json
     ```
   - **Body:**
     ```json
     {
       "event_type": "jira-in-development",
       "client_payload": {
         "issue_key": "{{issue.key}}",
         "issue_summary": "{{issue.summary}}",
         "branch_name": "{{issue.key | lowercase}}-{{issue.summary | slugify}}"
       }
     }
     ```

### GitHub Actions Receiver

Add this workflow to receive the dispatch:

```yaml
# .github/workflows/jira-branch.yml
on:
  repository_dispatch:
    types: [jira-in-development]

jobs:
  create-branch:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Create branch
        run: |
          BRANCH="${{ github.event.client_payload.branch_name }}"
          git checkout -b "$BRANCH"
          git push origin "$BRANCH"
      - name: Initialize harness state
        run: |
          npm install -g @harness-engineering/cli
          mkdir -p .harness
          echo '{"schemaVersion":1,"position":{"phase":"ready"},"jiraKey":"${{ github.event.client_payload.issue_key }}"}' > .harness/state.json
          git add .harness/state.json
          git commit -m "chore: initialize harness state for ${{ github.event.client_payload.issue_key }}"
          git push
```

## Rule 2: Sync Component Labels to PR

When a Jira issue is labeled with a component, sync that label to the linked GitHub PR.

### Setup

1. **Trigger:** When: Field value changed → Field: Labels
2. **Condition:** Issue has a linked pull request (check via development panel or custom field)
3. **Action:** Send web request
   - **URL:** `https://api.github.com/repos/{OWNER}/{REPO}/issues/{PR_NUMBER}/labels`
   - **Method:** POST
   - **Headers:** Same as Rule 1
   - **Body:**
     ```json
     {
       "labels": ["{{issue.labels}}"]
     }
     ```

**Note:** Linking Jira issues to GitHub PRs requires either:
- [GitHub for Jira](https://github.com/marketplace/github-for-jira) app
- A custom field storing the PR number
- Smart Commit messages (`PROJ-123` in commit messages)

## Rule 3: PR Merged → Transition to "Done"

When a linked GitHub PR is merged, transition the Jira issue to "Done".

### Setup

This rule works in reverse — GitHub sends the event, and Jira receives it.

**GitHub Actions side:**

```yaml
# .github/workflows/jira-transition.yml
on:
  pull_request:
    types: [closed]

jobs:
  transition-jira:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - name: Extract Jira key from branch name
        id: jira
        run: |
          BRANCH="${{ github.event.pull_request.head.ref }}"
          # Extract PROJ-123 pattern from branch name
          KEY=$(echo "$BRANCH" | grep -oE '^[A-Z]+-[0-9]+' || echo "")
          echo "key=$KEY" >> "$GITHUB_OUTPUT"

      - name: Transition Jira issue
        if: steps.jira.outputs.key != ''
        run: |
          # Get transition ID for "Done"
          TRANSITIONS=$(curl -s -u "$JIRA_EMAIL:$JIRA_TOKEN" \
            "$JIRA_URL/rest/api/3/issue/${{ steps.jira.outputs.key }}/transitions")
          DONE_ID=$(echo "$TRANSITIONS" | jq -r '.transitions[] | select(.name == "Done") | .id')

          # Transition the issue
          curl -s -X POST \
            -u "$JIRA_EMAIL:$JIRA_TOKEN" \
            -H "Content-Type: application/json" \
            -d "{\"transition\":{\"id\":\"$DONE_ID\"}}" \
            "$JIRA_URL/rest/api/3/issue/${{ steps.jira.outputs.key }}/transitions"
        env:
          JIRA_URL: ${{ secrets.JIRA_URL }}
          JIRA_EMAIL: ${{ secrets.JIRA_EMAIL }}
          JIRA_TOKEN: ${{ secrets.JIRA_API_TOKEN }}
```

## Security Notes

- Store all tokens (GitHub PAT, Jira API token) in their respective secret stores
- Use the minimum required permissions for each token
- Jira Automation rules run with the permissions of the rule creator — use a service account
- Rate limit awareness: GitHub API allows 5,000 requests/hour per token; Jira Automation has plan-specific limits
