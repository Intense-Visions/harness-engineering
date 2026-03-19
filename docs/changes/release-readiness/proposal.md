# Release Readiness Skill

**Status:** Proposed
**Date:** 2026-03-19
**Keywords:** release-readiness, npm, packaging, repo-hygiene, changelog, maintenance, audit, auto-fix, state-tracking, orchestration

## Overview

A skill that audits a project's readiness for npm release, runs maintenance checks via existing skills, offers auto-remediation, and tracks progress across sessions.

### Goals

1. Give a clear pass/fail answer to "is this project ready to release?"
2. Surface specific, actionable findings — not vague warnings
3. Auto-fix what can be fixed mechanically, with human approval
4. Reuse existing maintenance skills rather than duplicating checks
5. Support multi-session workflows via state tracking

### Non-goals

- Actually performing the release (that's CI/CD)
- Supporting non-npm targets (future consideration)
- Replacing existing maintenance skills (this orchestrates them)

## Decisions

| Decision                | Choice                                                 | Rationale                                                                |
| ----------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------ |
| Scope                   | Standard checks by default, comprehensive behind flags | Keeps the default fast and focused; power users opt into deeper analysis |
| Triggers                | `manual` + `on_milestone`                              | Manual for ad-hoc use; milestone trigger for natural check-in points     |
| Output                  | Report + auto-fix + state tracking                     | Release readiness is a multi-session effort; state lets you resume       |
| Maintenance integration | Parallel dispatch via existing skills                  | Independent checks run concurrently; no logic duplication                |
| Orchestration model     | Single skill delegating to sub-skills                  | One entry point, reuses existing skills, no persona needed               |
| Release target          | npm-only                                               | Matches current project; avoids YAGNI                                    |
| Auto-fix behavior       | Prompt before each fix                                 | Prevents unwanted changes; human stays in control                        |

## Technical Design

### Skill Metadata

- **Name:** `harness-release-readiness`
- **Type:** rigid
- **Cognitive mode:** `meticulous-verifier`
- **Triggers:** `manual`, `on_milestone`
- **Tools:** `Bash`, `Read`, `Write`, `Edit`, `Glob`, `Grep`
- **Depends on:** `detect-doc-drift`, `cleanup-dead-code`, `align-documentation`, `enforce-architecture`, `harness-diagnostics`, `harness-parallel-agents`
- **State:** persistent, files: `.harness/release-readiness.json`

### Phase 1: AUDIT — Release-Specific Checks

Runs checks in these categories, each producing pass/warn/fail:

| Category              | Checks                                                                                                                                                            | Default | `--comprehensive` |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------- |
| **Packaging**         | package.json has name, version, license, exports, files, publishConfig, repository, bugs, homepage; build succeeds; `pnpm pack --dry-run` produces expected files | Yes     | —                 |
| **Documentation**     | README exists with install/usage/API sections; CHANGELOG exists and has entries; LICENSE file present                                                             | Yes     | —                 |
| **Repo hygiene**      | CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md exist; .gitignore present; no TODO/FIXME in published source (`files` glob)                                      | Yes     | —                 |
| **CI/CD**             | CI workflow exists; release workflow exists; test/lint/typecheck commands defined in package.json scripts                                                         | Yes     | —                 |
| **API docs**          | Exported symbols have JSDoc/TSDoc comments                                                                                                                        | —       | Yes               |
| **Examples**          | Example projects build and run successfully                                                                                                                       | —       | Yes               |
| **Dependency health** | No deprecated deps; no known vulnerabilities (`npm audit`)                                                                                                        | —       | Yes               |
| **Git hygiene**       | No large binaries tracked; .gitignore covers common artifacts; no secrets in history                                                                              | —       | Yes               |

For monorepos, packaging checks run against each package independently.

### Phase 2: MAINTAIN — Parallel Maintenance Skill Dispatch

Dispatches these skills in parallel:

- `/harness:detect-doc-drift`
- `/harness:cleanup-dead-code`
- `/harness:enforce-architecture`
- `/harness:diagnostics`

Each skill runs independently. Results are collected and merged into the unified report. Failures in one skill don't block others.

### Phase 3: FIX — Auto-Remediation

For each fixable finding, the skill offers to apply a fix:

| Finding                        | Fix                                                     |
| ------------------------------ | ------------------------------------------------------- |
| Missing package.json fields    | Add fields with sensible defaults                       |
| Missing repo hygiene files     | Generate from templates                                 |
| Doc drift detected             | Delegate to `/harness:align-documentation`              |
| Dead code found                | Delegate to `/harness:cleanup-dead-code` (with `--fix`) |
| TODO/FIXME in published source | List locations; no auto-fix (requires human judgment)   |
| Missing CHANGELOG entries      | Generate skeleton entry from git log since last tag     |

Each fix prompts for confirmation: `Fix: Add "repository" field to packages/core/package.json? [y/n/all]`

The `all` option applies remaining fixes without prompting (for users who've reviewed the report and want to batch-fix).

### Phase 4: REPORT — Final Output

Writes two artifacts:

**1. `release-readiness-report.md`** — Human-readable report:

```markdown
# Release Readiness Report — 2026-03-19

## Summary: 14/18 checks passed, 2 warnings, 2 failures

## Packaging [5/6 passed]

- [x] name, version, license present
- [ ] packages/types missing "files" field

## Maintenance Results

### Doc Drift: 2 issues found

### Dead Code: clean

### Architecture: clean

### Diagnostics: 1 warning

## Remaining Items

- [ ] Add "files" field to packages/types/package.json
- [ ] Fix doc drift in docs/api/index.md
```

**2. `.harness/release-readiness.json`** — Machine-readable state:

```json
{
  "timestamp": "2026-03-19T10:30:00Z",
  "summary": { "passed": 14, "warned": 2, "failed": 2, "total": 18 },
  "categories": {
    "packaging": { "passed": 5, "warned": 0, "failed": 1, "findings": ["..."] },
    "documentation": { "passed": 3, "warned": 0, "failed": 0, "findings": [] },
    "repo-hygiene": { "passed": 4, "warned": 1, "failed": 0, "findings": ["..."] },
    "ci-cd": { "passed": 2, "warned": 0, "failed": 0, "findings": [] },
    "maintenance": {
      "doc-drift": { "issues": 2 },
      "dead-code": { "issues": 0 },
      "architecture": { "issues": 0 },
      "diagnostics": { "issues": 1 }
    }
  },
  "fixes": {
    "applied": ["added-files-field-types"],
    "pending": ["doc-drift-api-index"],
    "skipped": ["todo-in-cli-init"]
  },
  "flags": { "comprehensive": false }
}
```

### Session Resumption

When the skill is invoked again, it loads `.harness/release-readiness.json`, re-runs all checks, and displays a delta:

```
Release Readiness — resuming from 2026-03-19T10:30:00Z

Since last run:
  ✓ 2 items fixed (added "files" field, resolved doc drift)
  → 1 item remaining (TODO in cli/init.ts:42)

Re-running full audit...
```

### Monorepo Support

Packaging checks iterate over all non-private packages found via `pnpm ls --json` or by scanning `packages/*/package.json`. Each package gets its own section in the report. Shared checks (repo hygiene, CI/CD, maintenance) run once at the root level.

### Milestone Trigger

When fired via `on_milestone`, the report uses a progress framing:

```
Release Readiness Progress — Milestone: v1.0
  12/18 checks passing (up from 8/18 last run)
  3 items auto-fixable, 3 require manual attention
```

### File Layout

```
agents/skills/claude-code/harness-release-readiness/
├── skill.yaml
└── SKILL.md
```

## Success Criteria

1. Running `/harness:release-readiness` on a project with known gaps produces a report that identifies all of them — no false negatives on standard checks
2. Running it on a clean project produces an all-pass report with no false positives
3. Maintenance skills are dispatched in parallel and their results appear in the unified report
4. Auto-fix applies correct changes — package.json modifications are valid JSON, generated files match project conventions
5. State file persists across sessions and subsequent runs show accurate deltas
6. `--comprehensive` flag activates additional checks without affecting standard check behavior
7. `on_milestone` trigger fires and produces a progress-style report (not just pass/fail)
8. Monorepo support: each package is audited independently with per-package results in the report
9. `harness validate` passes after the skill's SKILL.md and skill.yaml are written

## Implementation Order

1. **Skill scaffolding** — Create `skill.yaml` and `SKILL.md` skeleton with phase definitions, metadata, and dependency declarations
2. **Audit phase** — Implement the standard check categories (packaging, docs, repo hygiene, CI/CD) with pass/warn/fail output
3. **Comprehensive flags** — Add `--comprehensive` checks (API docs, examples, dep health, git hygiene) gated behind the flag
4. **Maintain phase** — Wire up parallel dispatch of maintenance skills and result collection/merging
5. **Fix phase** — Implement auto-remediation with per-fix prompting and the `all` batch option
6. **Report phase** — Generate the markdown report and `.harness/release-readiness.json` state file
7. **Session resumption** — Load prior state on re-invocation, re-run checks, display deltas
8. **Monorepo support** — Ensure packaging checks iterate over all packages, with per-package reporting
9. **Milestone trigger** — Add `on_milestone` trigger behavior with progress-focused report variant
10. **Validate on self** — Run the skill against harness-engineering as the first real-world test
