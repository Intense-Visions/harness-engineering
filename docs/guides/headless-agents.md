# Headless Agents

Run harness checks and personas in CI without a human in the loop. Headless execution enables automated validation, entropy detection, and persona-driven workflows in pipelines.

## Overview

Harness provides two levels of headless CI execution:

1. **`harness ci check`** — Runs all validation checks with structured output. Fully headless, no LLM required.
2. **`harness agent run --persona <name>`** — Runs a predefined persona's command sequence (e.g., architecture-enforcer, documentation-maintainer, entropy-cleaner).

Both work without interactive input and produce deterministic output suitable for CI.

**Key differences from interactive mode:**

| Aspect          | Interactive (Claude Code / Gemini CLI) | Headless (CI)                                      |
| --------------- | -------------------------------------- | -------------------------------------------------- |
| Context source  | Conversation                           | Config file + repo state                           |
| Decision making | Human chooses                          | Persona rules or check defaults                    |
| Output          | Conversation                           | JSON (`--json`) or stdout                          |
| Timeout         | None (human-paced)                     | Configurable (`--timeout`)                         |
| Commands        | All skills available                   | `ci check`, `agent run --persona`, `skill run`     |

## Environment Setup

### CI Environment

Set `CI=true` in the environment. Most CI platforms set this automatically (GitHub Actions, GitLab CI, Jenkins, CircleCI).

```bash
export CI=true
```

### Installation

```bash
npm install -g @harness-engineering/cli
```

## Running Checks Headlessly

### `harness ci check` (Recommended)

The primary headless command. Runs all harness checks and returns structured results:

```bash
harness ci check --json
```

**Options:**

| Flag                   | Description                                                 |
| ---------------------- | ----------------------------------------------------------- |
| `--json`               | Output structured JSON report                               |
| `--skip <checks>`      | Comma-separated checks to skip: validate, deps, docs, entropy, phase-gate |
| `--fail-on <severity>` | Exit non-zero on `error` (default) or `warning`             |

**Exit codes:** `0` = pass, `1` = check failures, `2` = internal error

See the [CI/CD Validation guide](./ci-cd-validation.md) for full reference.

### `harness agent run --persona <name>`

Runs a persona's predefined command sequence. Personas combine multiple harness checks into a role-specific workflow:

```bash
# Run the architecture enforcer persona
harness agent run --persona architecture-enforcer

# Run the documentation maintainer persona
harness agent run --persona documentation-maintainer

# Run the entropy cleaner persona
harness agent run --persona entropy-cleaner

# With timeout (milliseconds)
harness agent run --persona architecture-enforcer --timeout 60000
```

**Available personas:**

| Persona                    | What it checks                                    |
| -------------------------- | ------------------------------------------------- |
| `architecture-enforcer`    | Layer boundaries, dependency violations, circular deps |
| `documentation-maintainer` | Doc coverage, drift detection, broken links        |
| `entropy-cleaner`          | Dead code, doc drift, pattern violations           |

### `harness agent run <task>`

Runs a predefined agent task:

```bash
# Code review task
harness agent run review

# Documentation review task
harness agent run doc-review

# Test review task
harness agent run test-review
```

### `harness skill run <name>`

Outputs a skill's content with context preamble. Useful for piping to an LLM CLI or for automation scripts that need skill instructions:

```bash
# Get skill content for automation
harness skill run harness-code-review --path .

# With specific complexity level
harness skill run detect-doc-drift --complexity light
```

## Timeout and Failure Handling

### Timeout

Set a timeout on persona runs to prevent hangs:

```bash
harness agent run --persona architecture-enforcer --timeout 60000
```

### Exit Codes

| Command | Code 0 | Code 1 | Code 2 |
| ------- | ------ | ------ | ------ |
| `ci check` | All checks pass | Check failures | Internal error |
| `agent run` | Task/persona succeeded | Issues found | Task failed |

### Handling Failures in CI

```bash
# Run checks, capture exit code
harness ci check --json > report.json || true
EXIT_CODE=$(jq -r '.exitCode' report.json)

if [ "$EXIT_CODE" -eq 0 ]; then
  echo "All checks passed."
elif [ "$EXIT_CODE" -eq 1 ]; then
  echo "Check failures detected."
  jq '.checks[] | select(.status == "fail") | .issues[]' report.json
else
  echo "Harness internal error."
  exit 2
fi
```

## Trust Boundary

Headless harness commands operate within strict boundaries:

1. **Read-only analysis.** `ci check` and `agent run review` analyze and report — they do not modify code
2. **Persona-scoped writes.** Personas only execute whitelisted harness commands (validate, check-deps, check-docs, cleanup, fix-drift, add)
3. **No credential access.** Commands do not handle secrets beyond what's in `harness.config.json`
4. **Audit trail.** All output is structured and logged

### Restricting Operations

For sensitive CI environments, limit scope:

```bash
# Run in a shallow read-only checkout
git clone --depth 1 $REPO_URL /tmp/check
cd /tmp/check

# Run checks only (no writes possible)
harness ci check --json > /tmp/report.json
```

## Security Considerations

### Secret Management

- Harness CLI commands do not require API keys (they are deterministic, not LLM-based)
- If your CI workflow uses LLM-powered tools alongside harness (e.g., Claude Code for PR review), store API keys in your CI platform's secret store
- Never commit secrets to the repository

### Network Access

Harness CLI commands are fully offline — they analyze local files only. No network access is required for `ci check`, `agent run`, or `skill run`.

## Examples

### GitHub Action: Validate on Every PR

```yaml
- name: Run harness checks
  run: |
    npm install -g @harness-engineering/cli
    harness ci check --json > report.json || true

- name: Comment results on PR
  if: github.event_name == 'pull_request'
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: |
    SUMMARY=$(jq -r '"Passed: " + (.summary.passed|tostring) + " | Failed: " + (.summary.failed|tostring) + " | Warnings: " + (.summary.warnings|tostring)' report.json)
    gh pr comment ${{ github.event.number }} --body "**Harness CI:** $SUMMARY"
```

### GitHub Action: Run Architecture Enforcer Persona

```yaml
- name: Enforce architecture
  run: |
    npm install -g @harness-engineering/cli
    harness agent run --persona architecture-enforcer --timeout 60000
```

### Scheduled Entropy Check

```yaml
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
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          harness ci check --json --skip deps,phase-gate > report.json
          WARNINGS=$(jq '.summary.warnings' report.json)
          if [ "$WARNINGS" -gt 0 ]; then
            gh issue create --title "Entropy detected ($WARNINGS warnings)" \
              --body "$(jq -r '.checks[] | select(.status == "warn") | .issues[] | .message' report.json)"
          fi
```

See the [headless agent action recipe](./recipes/headless-agent-action.yml) for a complete workflow.
