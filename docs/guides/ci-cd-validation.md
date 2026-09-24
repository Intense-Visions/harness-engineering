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

| Code | Meaning                                                                 | Action      |
| ---- | ----------------------------------------------------------------------- | ----------- |
| `0`  | Every requested check ran, and none failed at the configured severity   | Proceed     |
| `1`  | A check failed at the configured severity, **or a check could not run** | Block merge |
| `2`  | Harness internal error (config not found, parse failure)                | Investigate |

### Checks that could not run

A check reports `skip` for one of two quite different reasons, and only one of
them is green:

- **You asked for it.** `--skip docs` is an explicit, acknowledged decision not
  to enforce that gate. It exits `0`.
- **It abstained.** The check wanted to run and could not — it crashed, or it
  had nothing configured to evaluate. It exits `1`, and the report carries a
  `skipReason` explaining what was missing.

An abstaining check is never counted in `summary.passed`, and the run never
prints "All checks passed". A gate that did not run must not be readable as
green: reporting a pass over a check that evaluated nothing is indistinguishable,
to whoever reads the pipeline, from a genuine pass.

The common abstentions and their fixes:

| Abstention                                | Why                                                               | Fix                                                                             |
| ----------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `deps` — no layers configured             | Nothing to validate against                                       | Add `layers` to `harness.config.json`, or `--skip deps`                         |
| `traceability` — no knowledge graph found | Coverage was never computed, so `minCoverage` was never evaluated | Run `harness scan`, set `traceability.enabled: false`, or `--skip traceability` |
| `docs` / `entropy` / `perf` — crashed     | The analyzer threw (often "Could not resolve entry points")       | Fix the underlying config (e.g. `performance.entryPoints`), or `--skip <check>` |

#### Escape hatch

If you need the previous exit code while you fix the configuration, name the
check explicitly:

```bash
harness ci check --skip deps,traceability
```

That is deliberately louder than silence: the gate is still not enforced, but
the pipeline now says so out loud instead of reporting a pass over it.

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
    /** Present only when the check abstained — absent for an operator `--skip`. */
    skipReason?: string;
  }>;
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
    /** Operator-requested skips and abstentions alike. */
    skipped: number;
    /** Of those, how many abstained. Non-zero forces a non-zero exit code. */
    abstained: number;
  };
  exitCode: 0 | 1 | 2;
}
```

## The `harness ci notify` Command

Post CI results to GitHub as a PR comment or create a tracking issue. This bridges CI checks with the issue tracker — no manual `jq` piping required.

### Full Reference

```bash
harness ci notify <report.json> --target <pr-comment|issue> [options]
```

**Options:**

| Flag                | Default                    | Description                                        |
| ------------------- | -------------------------- | -------------------------------------------------- |
| `--target <type>`   | (required)                 | `pr-comment` to comment on a PR, `issue` to create |
| `--pr <number>`     | (required for pr-comment)  | PR number to comment on                            |
| `--title <title>`   | Auto-generated from report | Custom title for created issues                    |
| `--labels <labels>` | none                       | Comma-separated labels for created issues          |

**Requirements:**

- `GITHUB_TOKEN` or `GH_TOKEN` environment variable set
- `roadmap.tracker` configured in `harness.config.json` with `kind: "github"` and `repo: "owner/repo"`

### Examples

```bash
# Post CI results as a PR comment
harness ci check --json > report.json
harness ci notify report.json --target pr-comment --pr 42

# Create a tracking issue from failures
harness ci notify report.json --target issue --title "CI failure on main"

# Skip issue creation when all checks pass (exits silently)
harness ci notify report.json --target issue
```

### Output

The formatted markdown includes:

- Summary header (pass/fail)
- Per-check status table with issue counts and duration
- Detailed issue listings with file paths and line numbers
- Timestamp and generation metadata

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

This generates `.github/workflows/ci.yml`. Commit and push.

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

## Scoping `harness validate` to the changed surface

`harness validate` runs a set of project checks. Most are fixed-scope and cheap
(AGENTS.md, roadmap health, ADR numbers, STRATEGY.md, pulse), but the design
audits — detect-drift and audit-brand — walk the **whole** source tree on every
run. On a large repo, re-walking the full tree for a one-file change is the
dominant cost.

Affected-only mode derives the changed surface from git and hands just those files
to the walkers:

```bash
# Scope the design walkers to files changed vs the merge-base with the default branch
harness validate --changed          # (--affected is an alias)

# Scope to files changed since an explicit ref
harness validate --since origin/main

# Override the branch used for the merge-base (default: main)
harness validate --changed --default-branch develop
```

The changed surface is the union of files that differ from the base ref (staged,
unstaged, and committed-on-branch) plus untracked files, narrowed to the source
extensions and exclude globs a full sweep would scan — so a scoped run is always a
**subset** of a full run (it never reports a finding a full sweep would not). Every
affected run prints what it scoped:

```
Scope: affected — 12 changed file(s) vs <base-sha>. Scoped checks: driftDetection,
brandCompliance. Fixed-scope checks (roadmap, ADR, AGENTS.md, STRATEGY.md, pulse)
always ran. Unchanged files were NOT re-validated — run a full `harness validate`
before merge/release.
```

If the changed surface cannot be derived (not a git repo, unknown ref), the run
**falls back to a full sweep** and reports why — it never validates an empty
surface.

### Staleness contract — when a full sweep is still required

Affected-only mode is **opt-in** and intended for the interactive/agent inner loop.
Because it only re-validates files in the changed surface, a finding whose input
file is unchanged since the base ref is **not** re-checked. Reserve the full sweep
(bare `harness validate`, with no `--changed`/`--since`) for:

- **pre-merge** gates (a PR's merge result must be validated in full),
- **scheduled** runs (nightly/weekly drift catches), and
- **release** readiness.

Bare `harness validate` is unchanged and remains the default, so existing adopters
and CI pipelines keep full-sweep semantics with no migration.

> **Telemetry:** scoped-vs-full invocations are recorded (the `variant` field on
> the `cli/validate` adoption record) so the split is measurable after adoption.

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
