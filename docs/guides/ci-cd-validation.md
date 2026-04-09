# CI/CD Validation

Run harness checks as part of your CI/CD pipeline to catch constraint violations, documentation drift, and entropy before merge.

## Overview

Harness validation in CI works the same way on every platform:

1. Install `@harness-engineering/cli`
2. Run `harness ci check --json`
3. Interpret the exit code (0 = pass, 1 = fail, 2 = error)
4. Optionally parse the JSON output for detailed reporting

## The `harness ci check` Command

### Full Reference

```bash
harness ci check [--json] [--fail-on <severity>] [--skip <check>]
```

**Options:**

| Flag                   | Default | Description                                                                                                                     |
| ---------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `--json`               | off     | Output structured JSON report                                                                                                   |
| `--fail-on <severity>` | `error` | Exit non-zero on `error` (default) or `warning`                                                                                 |
| `--skip <checks>`      | none    | Comma-separated checks to skip: `validate`, `deps`, `docs`, `entropy`, `security`, `perf`, `phase-gate`, `arch`, `traceability` |

### Checks

| Check          | What it validates                                                    | Severity on failure |
| -------------- | -------------------------------------------------------------------- | ------------------- |
| `validate`     | AGENTS.md exists, has required sections, no broken links             | Error               |
| `deps`         | Layer dependency boundaries respected, no forbidden imports          | Error               |
| `docs`         | Documentation coverage — undocumented source files flagged           | Warning             |
| `entropy`      | Code drift between docs and source, dead code detection              | Warning             |
| `security`     | Security scan — permission bypass, injection patterns, secrets       | Error               |
| `perf`         | Performance budgets — complexity thresholds, bundle size             | Warning             |
| `phase-gate`   | Spec-to-implementation mapping (when `phaseGates.enabled` in config) | Configurable        |
| `arch`         | Architecture constraints — layer boundaries, module-size baselines   | Error               |
| `traceability` | Requirement-to-code traceability mapping                             | Warning             |

### Exit Codes

| Code | Meaning                                                  | Action      |
| ---- | -------------------------------------------------------- | ----------- |
| `0`  | All checks passed (or only skipped)                      | Proceed     |
| `1`  | One or more checks failed at the configured severity     | Block merge |
| `2`  | Harness internal error (config not found, parse failure) | Investigate |

### JSON Output Schema

```typescript
interface CICheckReport {
  version: 1;
  project: string;
  timestamp: string;
  checks: Array<{
    name:
      | 'validate'
      | 'deps'
      | 'docs'
      | 'entropy'
      | 'security'
      | 'perf'
      | 'phase-gate'
      | 'arch'
      | 'traceability';
    status: 'pass' | 'fail' | 'warn' | 'skip';
    issues: Array<{
      severity: 'error' | 'warning';
      message: string;
      file?: string;
      line?: number;
    }>;
    durationMs: number;
  }>;
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
    skipped: number;
  };
  exitCode: 0 | 1 | 2;
}
```

## Platform-Agnostic Patterns

Every CI platform supports running shell commands and checking exit codes. The universal pattern:

```bash
# Install harness CLI
npm install -g @harness-engineering/cli

# Run checks — exit code determines pass/fail
harness ci check --json

# Or with specific options
harness ci check --json --fail-on warning --skip entropy
```

The `--json` flag makes output machine-parseable for downstream steps (PR comments, issue creation, dashboards).

## GitHub Actions Setup

### Quick Setup

```bash
harness ci init --platform github
```

This generates `.github/workflows/harness.yml`. Commit and push.

### Manual Setup

See the [GitHub Actions recipe](./recipes/github-actions-harness.yml) for a complete workflow that includes:

- Running checks on push to main and on pull requests
- Posting a summary comment on the PR
- Labeling the PR on failure

### Key Configuration

```yaml
- name: Run harness checks
  id: harness
  run: harness ci check --json > harness-report.json
  continue-on-error: true # Capture exit code without failing the step

- name: Comment on PR
  if: github.event_name == 'pull_request'
  run: |
    # Parse report and post as PR comment
    gh pr comment ${{ github.event.number }} --body "$(cat harness-report.json | jq -r '.summary')"
```

## GitLab CI Setup

### Quick Setup

```bash
harness ci init --platform gitlab
```

This generates `.gitlab-ci-harness.yml`. Include it in your main `.gitlab-ci.yml` or use it directly.

### Manual Setup

See the [GitLab CI recipe](./recipes/gitlab-ci-harness.yml) for a complete job configuration with:

- Running in the `test` stage
- Using the Node 22 image
- Saving the JSON report as a job artifact

## Other Platforms

For Jenkins, CircleCI, Azure Pipelines, or any other platform:

1. Generate a platform-agnostic script: `harness ci init --platform generic`
2. Or use the [shell script recipe](./recipes/ci-check-script.sh)
3. Run the script in your pipeline's build step

The shell script handles installation, running checks, and interpreting exit codes.

## Customizing Checks

### Skipping Checks

Skip checks that don't apply to your project:

```bash
# Skip entropy detection (useful for early adoption)
harness ci check --skip entropy

# Skip multiple checks
harness ci check --skip entropy,phase-gate
```

### Fail on Warnings

By default, only errors fail the pipeline. To also fail on warnings:

```bash
harness ci check --fail-on warning
```

### Configuring Phase Gates

Phase gates require configuration in `harness.config.json`:

```json
{
  "phaseGates": {
    "enabled": true,
    "severity": "warning",
    "mappings": [
      {
        "specPattern": "docs/changes/*/proposal.md",
        "implPattern": "src/**/*.ts"
      }
    ]
  }
}
```

## Interpreting Results

### Common Issues

| Check      | Common failure             | Fix                                                                                 |
| ---------- | -------------------------- | ----------------------------------------------------------------------------------- |
| `validate` | Missing AGENTS.md sections | Add required sections: Project Overview, Repository Structure, Development Workflow |
| `validate` | Broken links in AGENTS.md  | Update file paths that have moved                                                   |
| `deps`     | Layer boundary violation   | Move the import or update `layers` config in `harness.config.json`                  |
| `docs`     | Low documentation coverage | Add documentation for undocumented source files                                     |
| `entropy`  | Doc drift detected         | Run `harness fix-drift` to auto-fix, or update docs manually                        |

### Reading the JSON Report

```bash
# Get just the summary
harness ci check --json | jq '.summary'

# List all failing checks
harness ci check --json | jq '.checks[] | select(.status == "fail")'

# Get all error-level issues
harness ci check --json | jq '[.checks[].issues[] | select(.severity == "error")]'
```
