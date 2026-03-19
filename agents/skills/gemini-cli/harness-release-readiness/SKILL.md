# Harness Release Readiness

> Audit, fix, and track your project's path to a publishable release. No release without a passing report.

## When to Use

- Before publishing packages to npm — audit readiness and fix gaps
- At milestone boundaries — check progress toward release (fires on `on_milestone` trigger)
- When resuming release prep after a previous session — loads state and shows what changed
- NOT for actually performing the release (that is CI/CD — Changesets, GitHub Actions, etc.)
- NOT for non-npm targets (Docker, PyPI, etc.) — this skill is npm-focused
- NOT when the project has no packages to publish (use harness-verification for general health)

## Arguments

- **`--comprehensive`** — Run additional checks beyond the standard set: API doc coverage, example project validation, dependency health audit, and git hygiene scan. These checks are slower and may require network access (e.g., `npm audit`). Omit for a fast standard audit.

## Process

### Iron Law

**No release may be performed without a passing release readiness report.**

If the report shows failures, the project is not ready. Fix the failures first. A "mostly passing" report is not a passing report — every failure is a risk that lands on your users.

---

### Phase 1: AUDIT — Release-Specific Checks

#### Session Resumption

Before running checks, look for existing state:

1. Read `.harness/release-readiness.json`. If it exists, this is a resumption.
2. Display a delta summary:

   ```
   Release Readiness — resuming from <timestamp>

   Since last run:
     ✓ N items fixed (<list>)
     → N items remaining (<list>)

   Re-running full audit...
   ```

3. If no state file exists, this is a fresh run. Proceed directly to checks.

#### Monorepo Detection

Detect whether the project is a monorepo:

1. Check for `packages/*/package.json` or a `workspaces` field in root `package.json`.
2. If monorepo: collect all non-private packages. Run packaging checks against each independently. Run shared checks (docs, repo hygiene, CI/CD) once at the root.
3. If single package: run all checks against the root `package.json`.

#### Standard Checks (always run)

Run every check below. Record each as **pass**, **warn**, or **fail**:

- **pass** — check satisfied, no action needed
- **warn** — not blocking but should be addressed before release (e.g., missing optional field)
- **fail** — must be fixed before release

##### Packaging (per package)

| Check                                                                                | Severity if missing |
| ------------------------------------------------------------------------------------ | ------------------- |
| `name` field exists and is scoped (`@org/name`) or valid unscoped name               | fail                |
| `version` field exists and is valid semver                                           | fail                |
| `license` field exists                                                               | fail                |
| `exports` or `main` field exists (entry point is defined)                            | fail                |
| `files` field exists (controls what gets published)                                  | fail                |
| `publishConfig` field exists with `access: "public"` (for scoped packages)           | warn                |
| `repository` field exists with valid URL                                             | warn                |
| `bugs` field exists                                                                  | warn                |
| `homepage` field exists                                                              | warn                |
| `description` field exists                                                           | warn                |
| Build succeeds: run the project's build command                                      | fail                |
| `pnpm pack --dry-run` produces expected files (no test files, no src if dist exists) | warn                |

##### Documentation (root level)

| Check                                                                                                             | Severity if missing |
| ----------------------------------------------------------------------------------------------------------------- | ------------------- |
| `README.md` exists                                                                                                | fail                |
| README contains an install/quickstart section (search for `install`, `getting started`, `quickstart`, or `npm i`) | warn                |
| README contains a usage or API section                                                                            | warn                |
| `CHANGELOG.md` exists                                                                                             | fail                |
| CHANGELOG has at least one entry (not empty or template-only)                                                     | warn                |
| `LICENSE` file exists                                                                                             | fail                |

##### Repo Hygiene (root level)

| Check                                                                                       | Severity if missing |
| ------------------------------------------------------------------------------------------- | ------------------- |
| `CONTRIBUTING.md` exists                                                                    | warn                |
| `CODE_OF_CONDUCT.md` exists                                                                 | warn                |
| `SECURITY.md` exists                                                                        | warn                |
| `.gitignore` exists and covers `node_modules`, `dist`, `.env`                               | fail                |
| No `TODO` or `FIXME` in published source files (files matching each package's `files` glob) | warn                |

##### CI/CD (root level)

| Check                                                           | Severity if missing |
| --------------------------------------------------------------- | ------------------- |
| CI workflow file exists (`.github/workflows/ci.yml` or similar) | fail                |
| Release/publish workflow file exists                            | warn                |
| `test` script exists in root `package.json`                     | fail                |
| `lint` script exists in root `package.json`                     | warn                |
| `typecheck` or `tsc` script exists in root `package.json`       | warn                |
| `harness validate` passes (project-level health check)          | fail                |

#### Comprehensive Checks (only with `--comprehensive`)

These checks run only when `--comprehensive` is passed. They are slower and may require network access.

##### API Documentation

| Check                                                         | Severity if missing |
| ------------------------------------------------------------- | ------------------- |
| Exported functions/classes/types have JSDoc or TSDoc comments | warn                |
| Coverage threshold: >80% of exports documented                | warn                |

To check: for each package, read the main entry point (`exports` or `main`), find all `export` statements, and verify each has a preceding doc comment (`/** ... */`).

##### Examples

| Check                                                                                  | Severity if missing |
| -------------------------------------------------------------------------------------- | ------------------- |
| Example projects exist (in `examples/` directory)                                      | warn                |
| Each example's `package.json` references workspace packages at current versions        | warn                |
| Each example builds successfully: `cd examples/<name> && npm install && npm run build` | fail                |

##### Dependency Health

| Check                                                                  | Severity if missing |
| ---------------------------------------------------------------------- | ------------------- |
| `npm audit` reports no high or critical vulnerabilities                | fail                |
| No deprecated dependencies (check `npm outdated` for deprecated flags) | warn                |

##### Git Hygiene

| Check                                                                                                               | Severity if missing |
| ------------------------------------------------------------------------------------------------------------------- | ------------------- |
| No binary files >1MB tracked in git (check with `git ls-files`)                                                     | warn                |
| `.gitignore` covers common artifacts: `.env`, `.DS_Store`, `*.log`, `coverage/`                                     | warn                |
| No secrets detected in tracked files (search for patterns: `API_KEY=`, `SECRET=`, `PASSWORD=`, private key headers) | fail                |

#### Output

After all checks complete, produce a structured summary for the next phases:

```
AUDIT COMPLETE

Packaging:  8/12 passed, 2 warnings, 2 failures
Docs:       5/6 passed, 1 warning, 0 failures
Hygiene:    3/5 passed, 2 warnings, 0 failures
CI/CD:      4/5 passed, 1 warning, 0 failures
[comprehensive] API Docs:  skipped (use --comprehensive)
[comprehensive] Examples:  skipped (use --comprehensive)
[comprehensive] Dep Health: skipped (use --comprehensive)
[comprehensive] Git Hygiene: skipped (use --comprehensive)

Total: 20/28 passed, 6 warnings, 2 failures
```

Proceed to Phase 2: MAINTAIN.

---

### Phase 2: MAINTAIN — Parallel Maintenance Skill Dispatch

Run existing maintenance skills to catch issues that release-specific checks do not cover. These skills are independent of each other and should be dispatched in parallel.

#### Dispatch

Launch 4 agents concurrently using the Agent tool. Each agent runs one maintenance skill against the project root:

| Agent | Skill                           | Purpose                                                         |
| ----- | ------------------------------- | --------------------------------------------------------------- |
| 1     | `/harness:detect-doc-drift`     | Find documentation that has fallen out of sync with code        |
| 2     | `/harness:cleanup-dead-code`    | Find unused exports, imports, and files                         |
| 3     | `/harness:enforce-architecture` | Validate layer boundaries and dependency rules                  |
| 4     | `/harness:diagnostics`          | Classify any existing errors and route to resolution strategies |

Example dispatch (Claude Code):

```
Use the Agent tool to launch 4 agents in parallel:

Agent 1: "Run /harness:detect-doc-drift on this project and return findings as a structured list"
Agent 2: "Run /harness:cleanup-dead-code on this project and return findings as a structured list"
Agent 3: "Run /harness:enforce-architecture on this project and return findings as a structured list"
Agent 4: "Run /harness:diagnostics on this project and return findings as a structured list"
```

#### Result Collection

Wait for all agents to complete. Set a 2-minute timeout per agent — if an agent exceeds this, treat it as failed. For each agent:

1. If the agent succeeded: extract its findings as a list of issues with file paths and descriptions.
2. If the agent failed (error, timeout, or exceeded 2-minute limit): log the failure reason and continue. A failed maintenance check does not block the release readiness report — it is reported as "unavailable" in the final report.

#### Merge

Combine findings from all maintenance skills into a unified structure:

```
MAINTENANCE RESULTS

Doc Drift:     2 issues found
  - docs/api/index.md references removed function `parseConfig`
  - docs/guides/getting-started.md version number outdated (0.7.0 → 0.8.0)

Dead Code:     0 issues found (clean)

Architecture:  0 violations found (clean)

Diagnostics:   1 warning
  - TypeScript strict mode warning in packages/cli/src/init.ts:42
```

Carry these results forward to Phase 3 (FIX) and Phase 4 (REPORT).

---

### Phase 3: FIX — Auto-Remediation

Review all findings from Phase 1 (AUDIT) and Phase 2 (MAINTAIN). For each fixable finding, offer to apply a fix. Non-fixable findings are listed with remediation guidance for the human.

#### Fixable Findings

| Finding                                      | Auto-Fix                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Missing `publishConfig` in package.json      | Add `"publishConfig": { "access": "public" }`                                                    |
| Missing `repository` field in package.json   | Add `"repository": { "type": "git", "url": "<detected from git remote>" }`                       |
| Missing `bugs` field in package.json         | Add `"bugs": { "url": "<repository>/issues" }`                                                   |
| Missing `homepage` field in package.json     | Add `"homepage": "<repository>#readme"`                                                          |
| Missing `description` field in package.json  | Add `"description": ""` with a TODO comment for the human to fill in                             |
| Missing `files` field in package.json        | Add `"files": ["dist"]` (or `["dist", "src"]` if no build step)                                  |
| Missing `CONTRIBUTING.md`                    | Generate from template with standard sections (how to contribute, development setup, PR process) |
| Missing `CODE_OF_CONDUCT.md`                 | Generate Contributor Covenant v2.1                                                               |
| Missing `SECURITY.md`                        | Generate template with vulnerability reporting instructions                                      |
| Missing `CHANGELOG.md` (file does not exist) | Generate skeleton with `# Changelog` header and initial entry from git log since last tag        |
| Doc drift detected                           | Delegate to `/harness:align-documentation`                                                       |
| Dead code found                              | Delegate to `/harness:cleanup-dead-code` (with `--fix` intent)                                   |

#### Prompting

Present each fix individually:

```
[1/6] Fix: Add "repository" field to packages/core/package.json
      Value: { "type": "git", "url": "https://github.com/org/repo.git" }
      [y]es / [n]o / [a]ll remaining
```

- **y** — Apply this fix and show the next one.
- **n** — Skip this fix. Record it as "skipped" in state.
- **a** — Apply this fix and all remaining fixes without prompting.

After each batch of fixes (or after each individual fix if not batching), run `harness validate` to ensure the fixes did not introduce new issues.

#### Non-Fixable Findings

These require human judgment and cannot be auto-fixed. List them with guidance:

| Finding                                                      | Guidance                                                                                                                                                               |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TODO`/`FIXME` in published source                           | List each location with file:line. Human must resolve or move to a tracked issue.                                                                                      |
| README missing usage/API sections                            | Suggest section structure but do not generate content — only the author knows the API.                                                                                 |
| CHANGELOG exists but has no entries (empty or template-only) | Suggest running `git log --oneline <last-tag>..HEAD` to generate entries. Unlike a missing file (auto-fixable above), an empty CHANGELOG needs human-authored content. |
| CI workflow missing                                          | Provide a starter template but flag for human review before committing.                                                                                                |
| Build failure                                                | Show the error output. Do not attempt to fix build issues automatically.                                                                                               |

#### Output

```
FIX COMPLETE

Applied:  4 fixes
Skipped:  1 fix (README usage section — requires human)
Failed:   0 fixes

Remaining manual items:
  - [ ] Write usage section in README.md
  - [ ] Resolve TODO in packages/cli/src/init.ts:42
```

Proceed to Phase 4: REPORT.

---

### Phase 4: REPORT — Final Output

Write two artifacts: a human-readable report and a machine-readable state file.

#### 1. Release Readiness Report (`release-readiness-report.md`)

Write to the project root by default. If the project uses `.harness/reports/` for generated reports, write there instead. Use this template:

```markdown
# Release Readiness Report

**Date:** YYYY-MM-DD
**Project:** <project name>
**Flags:** standard | comprehensive

## Summary

**Result: PASS / FAIL**

| Category                   | Passed       | Warnings | Failures |
| -------------------------- | ------------ | -------- | -------- |
| Packaging                  | N/N          | N        | N        |
| Documentation              | N/N          | N        | N        |
| Repo Hygiene               | N/N          | N        | N        |
| CI/CD                      | N/N          | N        | N        |
| Maintenance — Doc Drift    | N issues     | —        | —        |
| Maintenance — Dead Code    | N issues     | —        | —        |
| Maintenance — Architecture | N violations | —        | —        |
| Maintenance — Diagnostics  | N warnings   | —        | —        |

## Packaging

### <package-name> [pass/warn/fail per check]

- [x] name: `@org/package`
- [x] version: `1.0.0`
- [ ] missing `files` field

(Repeat for each package in monorepo)

## Documentation

- [x] README.md exists
- [x] README has install section
- [ ] README missing usage section

## Repo Hygiene

- [x] CONTRIBUTING.md exists
- [ ] SECURITY.md missing

## CI/CD

- [x] CI workflow exists
- [x] Release workflow exists

## Maintenance Results

### Doc Drift

(findings from detect-doc-drift, or "clean")

### Dead Code

(findings from cleanup-dead-code, or "clean")

### Architecture

(findings from enforce-architecture, or "clean")

### Diagnostics

(findings from diagnostics, or "clean")

## Fixes Applied

- Added `repository` field to packages/core/package.json
- Generated SECURITY.md from template

## Remaining Items

- [ ] Write usage section in README.md
- [ ] Resolve TODO in packages/cli/src/init.ts:42
- [ ] Add `files` field to packages/types/package.json
```

**Result** is **PASS** only when: zero failures across all categories AND zero maintenance issues with "fail" severity. Warnings alone do not block a PASS.

#### 2. State File (`.harness/release-readiness.json`)

Write to `.harness/release-readiness.json`. This file enables session resumption.

```json
{
  "schemaVersion": 1,
  "timestamp": "YYYY-MM-DDTHH:MM:SSZ",
  "flags": {
    "comprehensive": false
  },
  "summary": {
    "result": "FAIL",
    "passed": 14,
    "warned": 2,
    "failed": 2,
    "total": 18
  },
  "categories": {
    "packaging": {
      "passed": 5,
      "warned": 1,
      "failed": 1,
      "findings": [
        {
          "package": "packages/types",
          "check": "files field exists",
          "severity": "fail",
          "fixable": true,
          "fixed": false
        }
      ]
    },
    "documentation": {
      "passed": 5,
      "warned": 1,
      "failed": 0,
      "findings": []
    },
    "repo-hygiene": {
      "passed": 3,
      "warned": 2,
      "failed": 0,
      "findings": []
    },
    "ci-cd": {
      "passed": 4,
      "warned": 1,
      "failed": 0,
      "findings": []
    },
    "maintenance": {
      "doc-drift": { "issues": 2, "findings": [] },
      "dead-code": { "issues": 0, "findings": [] },
      "architecture": { "issues": 0, "findings": [] },
      "diagnostics": { "issues": 1, "findings": [] }
    }
  },
  "fixes": {
    "applied": ["added-repository-field-core", "generated-security-md"],
    "pending": ["add-files-field-types", "doc-drift-api-index"],
    "skipped": ["readme-usage-section"]
  }
}
```

#### Session Resumption Behavior

When the skill is invoked and `.harness/release-readiness.json` exists:

1. Load the previous state.
2. Re-run all checks (do not trust cached results — code may have changed).
3. Compare new results against previous state.
4. Display a delta:

```
Release Readiness — resuming from 2026-03-19T10:30:00Z

Since last run:
  ✓ 2 items fixed (added "files" field to types, resolved doc drift in api/index.md)
  ↑ 1 new issue (CONTRIBUTING.md was deleted)
  → 1 item remaining (TODO in cli/init.ts:42)

Previous: 14/18 passed (FAIL)
Current:  16/19 passed (FAIL)
```

#### Milestone Trigger Variant

When the skill fires via `on_milestone` trigger, use progress framing instead of pass/fail:

```
Release Readiness Progress — Milestone: <milestone name>

  16/18 checks passing (up from 12/18 last run)
  1 item auto-fixable
  1 item requires manual attention

  Trend: ↑ improving (4 items resolved since last milestone)
```

This framing is informational — it does not block anything. It gives the team a sense of trajectory.

---

## Harness Integration

- **`harness validate`** — Run after auto-fixes to verify project health. Also included in AUDIT phase as a meta-check (does the project pass its own validation?).
- **Sub-skill invocations** — Phase 2 dispatches `detect-doc-drift`, `cleanup-dead-code`, `enforce-architecture`, and `diagnostics` as parallel agents. Phase 3 delegates fixes to `align-documentation` and `cleanup-dead-code`.
- **State file** — `.harness/release-readiness.json` enables session resumption and progress tracking. This file is read at the start of each invocation and written at the end.
- **Report file** — `release-readiness-report.md` is written to the project root. It is a snapshot, not a tracked artifact — regenerate it on each run.

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

## Examples

### Example: First Run on a Monorepo with Gaps

**Context:** A TypeScript monorepo with 3 packages. Two packages are missing `files` fields, README lacks a usage section, and SECURITY.md does not exist.

**Phase 1: AUDIT**

```
No existing state found. Running fresh audit.

Checking packages/core...
  ✓ name: @myorg/core
  ✓ version: 1.2.0
  ✓ license: MIT
  ✓ exports defined
  ✗ files field missing (fail)
  ✗ publishConfig missing (warn)

Checking packages/utils...
  ✓ name: @myorg/utils
  ✓ version: 0.3.0
  ✓ license: MIT
  ✓ exports defined
  ✗ files field missing (fail)

Checking packages/cli...
  ✓ name: @myorg/cli (all fields present)

Documentation:
  ✓ README.md exists
  ✗ README missing usage section (warn)
  ✓ CHANGELOG.md exists with entries
  ✓ LICENSE exists

Repo Hygiene:
  ✓ CONTRIBUTING.md exists
  ✓ CODE_OF_CONDUCT.md exists
  ✗ SECURITY.md missing (warn)
  ✓ .gitignore covers node_modules, dist, .env

CI/CD:
  ✓ CI workflow: .github/workflows/ci.yml
  ✓ Release workflow: .github/workflows/release.yml
  ✓ test, lint, typecheck scripts present

AUDIT COMPLETE
Packaging:  9/12 passed, 1 warning, 2 failures
Docs:       5/6 passed, 1 warning, 0 failures
Hygiene:    4/5 passed, 1 warning, 0 failures
CI/CD:      5/5 passed, 0 warnings, 0 failures
Total: 23/28 passed, 3 warnings, 2 failures
```

**Phase 2: MAINTAIN**

```
Dispatching 4 maintenance agents in parallel...

Doc Drift:     1 issue — docs/api/core.md references removed function `legacyParse`
Dead Code:     0 issues (clean)
Architecture:  0 violations (clean)
Diagnostics:   0 warnings (clean)

MAINTENANCE COMPLETE — 1 issue found
```

**Phase 3: FIX**

```
5 fixable findings:

[1/5] Fix: Add "files": ["dist"] to packages/core/package.json
      [y]es / [n]o / [a]ll remaining
> y
      ✓ Applied

[2/5] Fix: Add "files": ["dist"] to packages/utils/package.json
      [y]es / [n]o / [a]ll remaining
> y
      ✓ Applied

[3/5] Fix: Add "publishConfig": { "access": "public" } to packages/core/package.json
      [y]es / [n]o / [a]ll remaining
> a
      ✓ Applied (and all remaining)

[4/5] Fix: Generate SECURITY.md from template
      ✓ Applied (batch)

[5/5] Fix: Delegate doc drift to /harness:align-documentation
      ✓ Applied (batch) — docs/api/core.md updated

Running harness validate... ✓ passes

FIX COMPLETE — 5 applied, 0 skipped, 0 failed
```

**Phase 4: REPORT**

```
Writing release-readiness-report.md...
Writing .harness/release-readiness.json...

# Release Readiness Report
Date: 2026-03-19
Result: PASS (after fixes)

28/28 checks passed, 0 warnings, 0 failures
Maintenance: all clean

Fixes applied this session: 5
Remaining manual items:
  - [ ] Write usage section in README.md (optional — warning only)
```

### Example: Resuming After Partial Fixes

```
Release Readiness — resuming from 2026-03-18T14:20:00Z

Since last run:
  ✓ 3 items fixed (added files fields, generated SECURITY.md)
  → 2 items remaining (doc drift in api/core.md, README usage section)

Re-running full audit...

Previous: 23/28 passed (FAIL)
Current:  27/28 passed (PASS — 1 warning remaining)

The project is release-ready. The remaining warning (README usage section) is not blocking.
```

## Gates

These are hard stops. Violating any gate means the process has broken down.

- **No release without a passing report.** If the report result is FAIL, the project must not be released. Fix all failures first.
- **No skipping the MAINTAIN phase.** Maintenance checks catch issues that release-specific checks miss (dead code, architecture drift, doc drift). They must run every time.
- **No auto-fix without prompting.** Every fix must be presented to the human before being applied (unless the human chose `all` to batch-approve remaining fixes). Silent fixes are not allowed.
- **All findings must have evidence.** Do not report a check as failed without showing the specific file, line, or field that caused the failure. "Packaging looks incomplete" is not a finding — "packages/core/package.json is missing the `files` field" is.
- **State must be written.** After every run, `.harness/release-readiness.json` must be updated. Without state, session resumption is impossible and progress is lost.

## Escalation

- **When there are too many failures to fix in one session:** Present the full report, highlight the most impactful fixes (failures before warnings, blocking before non-blocking), and suggest a prioritized fix order. Save state so the next session can pick up where this one left off.
- **When a maintenance skill is unavailable or errors out:** Report it as "unavailable" in the maintenance section. Do not block the rest of the report. Suggest running the failed skill manually: "Doc drift check failed — run `/harness:detect-doc-drift` separately to investigate."
- **When monorepo packages have inconsistent configurations:** Flag the inconsistency explicitly: "packages/core has `publishConfig` but packages/utils does not. Should all packages use the same publishing configuration?" Ask the human before applying a uniform fix.
- **When the project has no build command:** Some packages are types-only and have no build step. Skip the build check for packages without a `build` script and note it as "N/A" rather than a failure.
- **When fixes conflict with each other:** Present both findings and let the human choose. Example: dead code cleanup wants to remove a function, but doc drift fix references that function in updated docs. Human must decide which takes priority.
