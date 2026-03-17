# Headless Agents

Run harness skills and personas in CI without a human in the loop. Headless execution enables automated workflows like spec generation from issues, code review on PRs, and entropy remediation.

## Overview

Harness agents normally run interactively in Claude Code or Gemini CLI, with a human guiding decisions. Headless mode removes the human from the loop — the agent reads context from a file or stdin, executes a skill, and writes results to an output path.

**Key differences from interactive mode:**

| Aspect | Interactive | Headless |
|--------|------------|----------|
| Context source | Conversation | File or stdin |
| Decision making | Human chooses | Agent decides or uses defaults |
| Output | Conversation | File (`--output`) |
| Timeout | None (human-paced) | Configurable (`--timeout`) |
| Trust level | Human reviews each action | Pre-approved operations only |

## Environment Setup

### Signaling Headless Mode

Set `CI=true` in the environment. Harness tools detect this and adjust behavior:

```bash
export CI=true
```

Most CI platforms set this automatically (GitHub Actions, GitLab CI, Jenkins, CircleCI).

### API Keys

Headless agents require an LLM API key. Configure via environment variables:

```bash
# For Claude-based agents
export ANTHROPIC_API_KEY=sk-ant-...

# For other providers
export OPENAI_API_KEY=sk-...
```

**Secret management recommendations:**

- Use your CI platform's secret store (GitHub Secrets, GitLab CI/CD Variables, Vault)
- Never commit API keys to the repository
- Use separate keys for CI with restricted permissions
- Rotate keys on a regular schedule

## Running Skills Headlessly

### Basic Usage

```bash
harness agent run --headless --skill <skill-name> --context <file> --output <path>
```

**Parameters:**

| Flag | Required | Description |
|------|----------|-------------|
| `--headless` | Yes | Run without interactive input |
| `--skill <name>` | Yes | Skill to execute (e.g., `harness-code-review`, `detect-doc-drift`) |
| `--context <file>` | Yes | Path to context file (issue body, PR description, etc.) |
| `--output <path>` | No | Write results to file (default: stdout) |
| `--timeout <seconds>` | No | Maximum execution time (default: 300) |
| `--dry-run` | No | Validate only — no writes, no commits |

### Context File Format

The context file provides the information the agent needs. Use plain text or markdown:

```markdown
# Task
Review the changes in PR #42 for architectural violations.

# Files Changed
- src/services/auth.ts
- src/api/routes/login.ts

# Additional Context
The auth service was recently refactored to use OAuth2.
```

### Example: Running Code Review

```bash
# Extract PR diff as context
gh pr diff 42 > /tmp/pr-context.md

# Run code review skill headlessly
harness agent run \
  --headless \
  --skill harness-code-review \
  --context /tmp/pr-context.md \
  --output /tmp/review-result.json \
  --timeout 120
```

### Example: Detecting Documentation Drift

```bash
harness agent run \
  --headless \
  --skill detect-doc-drift \
  --context /dev/null \
  --output /tmp/drift-report.json
```

## Timeout and Failure Handling

### Timeout

Set a timeout to prevent runaway agents:

```bash
harness agent run --headless --skill <name> --context <file> --timeout 300
```

When the timeout is reached, the agent is terminated and exits with a non-zero code.

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Skill completed successfully |
| `1` | Skill completed with findings (review comments, drift detected, etc.) |
| `2` | Skill failed (error, timeout, missing context) |

### Handling Failures in CI

```bash
# Run agent, capture exit code
harness agent run --headless --skill detect-doc-drift --context /dev/null --output report.json || true

# Check if report was generated
if [ -f report.json ]; then
  echo "Agent completed. Processing results..."
  # Parse and act on results
else
  echo "Agent failed to produce output."
  exit 1
fi
```

## Trust Boundary

Headless agents operate with limited trust. They should not have the same freedom as interactive agents.

### Principles

1. **Read-only by default.** Headless agents should analyze and report, not modify code
2. **Pre-approved writes only.** If writes are needed (e.g., auto-fix drift), the CI workflow should explicitly opt in
3. **No credential access.** Agents should not handle secrets beyond what's needed for the LLM API
4. **Audit trail.** All agent actions should be logged and reviewable

### Dry Run Mode

Use `--dry-run` to validate without side effects:

```bash
harness agent run --headless --skill harness-code-review --context pr.md --dry-run
```

In dry-run mode:
- No files are written or modified
- No git operations are performed
- The agent reports what it would do, but does not do it

### Restricting Operations

For CI environments, consider limiting the agent's scope:

```bash
# Run in a read-only checkout
git clone --depth 1 --no-checkout $REPO_URL /tmp/review
cd /tmp/review
git checkout $PR_SHA

# Agent can read but writes go to a temporary directory
harness agent run --headless --skill harness-code-review --context pr.md --output /tmp/result.json
```

## Security Considerations

### API Key Hygiene

- Use **CI-specific API keys** with usage limits
- Set **per-run spend caps** if your LLM provider supports them
- **Rotate keys** monthly or on team member departure
- **Monitor usage** for unexpected spikes that could indicate key compromise

### Network Access

Headless agents may need network access for:
- LLM API calls (Anthropic, OpenAI)
- Package registry checks (npm, PyPI)

Block all other outbound traffic if your CI platform supports network policies.

### Input Validation

Context files come from potentially untrusted sources (issue bodies, PR descriptions). The agent handles this naturally through its skill boundaries, but be aware that:

- Malicious context could attempt prompt injection
- Very large context files could exhaust API token budgets
- Context should be size-limited before passing to the agent

## Examples

### GitHub Action: Auto-Review PRs

```yaml
- name: Run headless code review
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    CI: true
  run: |
    gh pr diff ${{ github.event.number }} > pr-context.md
    harness agent run \
      --headless \
      --skill harness-code-review \
      --context pr-context.md \
      --output review.json \
      --timeout 120

    # Post review as PR comment
    jq -r '.summary' review.json | gh pr comment ${{ github.event.number }} --body-file -
```

### Scheduled Entropy Check

```yaml
# Run weekly to catch drift
on:
  schedule:
    - cron: '0 9 * * 1'  # Monday 9am UTC

jobs:
  entropy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g @harness-engineering/cli
      - name: Detect entropy
        env:
          CI: true
        run: |
          harness ci check --json --skip deps,phase-gate > report.json
          WARNINGS=$(jq '.summary.warnings' report.json)
          if [ "$WARNINGS" -gt 0 ]; then
            gh issue create --title "Entropy detected ($WARNINGS warnings)" \
              --body "$(jq -r '.checks[] | select(.status == \"warn\") | .issues[] | .message' report.json)"
          fi
```

See the [headless agent action recipe](./recipes/headless-agent-action.yml) for a complete workflow.
