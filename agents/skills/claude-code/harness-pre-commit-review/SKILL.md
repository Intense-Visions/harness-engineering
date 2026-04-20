# Harness Pre-Commit Review

> Lightweight pre-commit quality gate — mechanical checks first, AI review second. Fast feedback before code leaves your machine.

## When to Use

- Before committing code (manual invocation or git pre-commit hook)
- As a quick sanity check before pushing to a branch
- When you want fast feedback without a full code review cycle
- NOT as a replacement for full peer review (use `harness-code-review` for that)
- NOT for commits that only update documentation or configuration (fast path skips AI review)

## Process

### Iron Law

**Mechanical checks gate AI review. No exceptions.**

If lint, typecheck, or tests fail, the pipeline stops. AI review does not run. Observations from AI review are advisory — they never block a commit. Only mechanical failures block. This ordering is non-negotiable.

---

## Principle: Deterministic First

This skill follows the Deterministic-vs-LLM Responsibility Split principle. Mechanical checks run first and must pass before any AI review occurs. If a linter or type checker can catch the problem, the LLM should not be the one finding it.

## Process

### Phase 1: Mechanical Checks

Run all deterministic checks against staged changes. These are binary pass/fail — no judgment required.

#### 1. Detect Available Check Commands

```bash
# Check for project-specific commands
cat package.json 2>/dev/null | grep -E '"(lint|typecheck|test)"'
cat Makefile 2>/dev/null | grep -E '^(lint|typecheck|test):'
```

#### 2. Run Checks in Order

Run whichever of these are available in the project:

```bash
# Lint (fastest — run first)
pnpm lint 2>&1 || npm run lint 2>&1 || make lint 2>&1

# Type check
pnpm typecheck 2>&1 || npx tsc --noEmit 2>&1 || make typecheck 2>&1

# Tests (slowest — run last)
pnpm test 2>&1 || npm test 2>&1 || make test 2>&1
```

#### 2b. Harness Health Check

If the project uses harness, run `assess_project` for harness-specific validation:

```json
assess_project({
  path: "<project-root>",
  checks: ["validate", "deps"],
  mode: "summary"
})
```

If `healthy: false`, include harness check failures in the mechanical check report. This replaces manually running `harness validate` and `harness check-deps` as separate commands.

#### 3. Gate Decision

- **Any check fails:** STOP. Report the failure. Do not proceed to AI review. The author must fix mechanical issues first.
- **All checks pass:** Proceed to Phase 2.

**Output format for failures:**

```
Pre-Commit Check: FAIL

Mechanical Checks:
- Lint: FAIL — 3 errors (see output above)
- Types: PASS
- Tests: NOT RUN (blocked by lint failure)

Action: Fix lint errors before committing.
```

### Graph Freshness Check

If a knowledge graph exists at `.harness/graph/` and code files have changed since the last scan, run `harness scan` before proceeding. The AI review phase uses graph-enhanced MCP tools (impact analysis, harness checks) that return stale results with an outdated graph.

If no graph exists, skip this step — the tools fall back to non-graph behavior.

### Impact Preview

After mechanical checks pass, run `harness impact-preview` to surface the blast radius of staged changes. This is informational only — it never blocks the commit.

```bash
harness impact-preview
```

Include the output in the report between the mechanical checks section and the AI review section:

```
Impact Preview (3 staged files)
  Code:   12 files   (routes/login.ts, middleware/verify.ts, +10)
  Tests:   3 tests   (auth.test.ts, integration.test.ts, +1)
  Docs:    2 docs    (auth-guide.md, api-reference.md)
  Total:  17 affected
```

If no graph exists, the command prints a nudge message and returns — no action needed. If no files are staged, it says so. Neither case blocks the workflow.

### Phase 2: Classify Changes

Determine whether AI review is needed based on what changed.

```bash
# Get list of staged files
git diff --cached --name-only

# Check if only docs/config files changed
git diff --cached --name-only | grep -v -E '\.(md|yml|yaml|json|toml|ini|cfg|conf|env|env\..*)$' | wc -l
```

#### Fast Path: Skip AI Review

If ALL staged files match these patterns, skip AI review and approve:

- `*.md` (documentation)
- `*.yml`, `*.yaml` (configuration)
- `*.json` (configuration — unless in `src/`)
- `*.toml`, `*.ini`, `*.cfg` (configuration)
- `.env*` (environment — but warn about secrets)
- `LICENSE`, `CODEOWNERS`, `.gitignore`

**Output for fast path:**

```
Pre-Commit Check: PASS (fast path)

Mechanical Checks:
- Lint: PASS
- Types: PASS
- Tests: PASS (12/12)

AI Review: SKIPPED (docs/config only)
```

#### Standard Path: Proceed to AI Review

If any staged file contains code changes, proceed to Phase 3.

### Phase 3: Security Scan

Run the built-in security scanner against staged files. This is a mechanical check — no AI judgment involved.

```bash
# Get list of staged source files
git diff --cached --name-only --diff-filter=d | grep -E '\.(ts|tsx|js|jsx|go|py)$'
```

Run `harness check-security --changed-only` on the staged files. Report any findings:

- **Error findings (blocking):** Hardcoded secrets, eval/injection, weak crypto — these block the commit just like lint failures.
- **Warning/info findings (advisory):** CORS wildcards, HTTP URLs, disabled TLS — reported but do not block.

Include security scan results in the report output:

```
Security Scan: [PASS/WARN/FAIL] (N errors, N warnings)
```

If no source files are staged, skip the security scan.

### Phase 4: AI Review (Lightweight)

Perform a focused, lightweight review of staged changes. This is NOT a full code review — it catches obvious issues only.

#### 1. Quick Review via review_changes

Use the `review_changes` MCP tool with `depth: 'quick'` for fast pre-commit analysis:

```json
review_changes({
  path: "<project-root>",
  diff: "<output of git diff --cached>",
  depth: "quick",
  mode: "summary"
})
```

This runs forbidden pattern checks and size analysis. For the semantic review items below, supplement with manual diff reading.

#### 2. Quick Review Checklist

Review the staged diff for these high-signal issues only:

- **Obvious bugs:** null dereference, infinite loops, off-by-one errors, resource leaks
- **Security issues:** hardcoded secrets, SQL injection, path traversal, unvalidated input (complements the mechanical scan with semantic analysis — e.g., tracing user input across function boundaries)
- **Broken imports:** references to files/modules that do not exist
- **Debug artifacts:** console.log, debugger statements, TODO/FIXME without issue reference
- **Type mismatches:** function called with wrong argument types (if visible in diff)

Do NOT review for:

- Style (that is the linter's job)
- Architecture (that is the full review's job)
- Test completeness (that is the full review's job)
- Naming preferences (subjective and noisy at this stage)

#### 3. Report

**If no issues found:**

```
Pre-Commit Check: PASS

Mechanical Checks:
- Lint: PASS
- Types: PASS
- Tests: PASS (12/12)
- Security Scan: PASS (0 errors, 0 warnings)

Impact Preview (3 staged files)
  Code:   12 files   (routes/login.ts, middleware/verify.ts, +10)
  Tests:   3 tests   (auth.test.ts, integration.test.ts, +1)
  Docs:    2 docs    (auth-guide.md, api-reference.md)
  Total:  17 affected

AI Review: PASS (no issues found)
```

**If issues found:**

```
Pre-Commit Check: WARN

Mechanical Checks:
- Lint: PASS
- Types: PASS
- Tests: PASS (12/12)
- Security Scan: WARN (0 errors, 1 warning)
  - [SEC-NET-001] src/cors.ts:5 — CORS wildcard origin

Impact Preview (2 staged files)
  Code:    8 files   (cors.ts, server.ts, +6)
  Tests:   2 tests   (cors.test.ts, server.test.ts)
  Total:  10 affected

AI Review: 2 observations
1. [file:line] Possible null dereference — `user.email` accessed without null check after `findUser()` which can return null.
2. [file:line] Debug artifact — `console.log('debug:', payload)` appears to be left from debugging.

Action: Review observations above. Commit anyway if intentional, or fix first.
```

## Git Hook Installation

To use as an automatic pre-commit hook, add to `.git/hooks/pre-commit` or configure via your git hooks manager (husky, lefthook, etc.):

```bash
#!/bin/bash
# .git/hooks/pre-commit
harness skill run harness-pre-commit-review
exit_code=$?
if [ $exit_code -ne 0 ]; then
  echo "Pre-commit review failed. Fix issues before committing."
  exit 1
fi
```

**Note:** AI review observations (WARN) do not block the commit — only mechanical check failures (FAIL) block. The author decides whether to address AI observations.

## Red Flags

| Flag | Corrective Action |
| ---- | ----------------- |
| "The lint errors are just warnings, I can proceed to AI review" | STOP. The gate is absolute. Any mechanical check failure means STOP. Warnings configured as errors are failures. |
| "I'll run the full test suite later in CI" | STOP. Pre-commit checks include tests. The purpose is to catch failures BEFORE they reach CI — not to defer them. |
| "This is just a config change, skip the security scan" | STOP. Phase 3 runs against all staged source files regardless of change type. Config files can contain hardcoded secrets. |
| `// quick fix, will clean up before PR` or `// TODO: handle error` in staged code | STOP. Pre-commit is the last line of defense before code enters the repository. Code committed with cleanup TODOs gets merged with cleanup TODOs. Fix it now. |

**Review-never-fixes:** Pre-commit review identifies observations. It never modifies staged code. AI review findings are reported for the author to decide — not applied automatically. A review that silently modifies code is not a review.

## Rubric Compression

Pre-commit review checklists MUST use compressed single-line format. Each check is one line with pipe-delimited fields:

```
phase|check-name|blocking|criterion
```

**Example:**

```
mechanical|lint|yes|Zero lint errors in staged files
mechanical|typecheck|yes|Zero type errors reported by tsc --noEmit
mechanical|tests|yes|All tests pass with exit code 0
mechanical|harness-health|yes|assess_project returns healthy: true
security|secrets|yes|No hardcoded secrets, API keys, or credentials in staged files
security|injection|yes|No eval(), exec(), or unparameterized SQL in staged files
security|advisory|no|CORS wildcards, HTTP URLs, disabled TLS — reported but non-blocking
ai|obvious-bugs|no|Null dereference, infinite loops, off-by-one, resource leaks
ai|debug-artifacts|no|No console.log, debugger statements, or TODO without issue ref
```

**Why:** Dense single-line rubrics minimize token consumption while preserving the same review signal. More budget for actual diff analysis.

**Rules:**

- Phase must be `mechanical`, `security`, or `ai`
- Blocking must be `yes` or `no`
- Maximum 80 characters per criterion text

## Gates

- **Mechanical checks must pass before AI review.** Do not run AI review if lint/typecheck/tests fail.
- **Fast path is mandatory.** If only docs/config changed, skip AI review — do not waste tokens.
- **AI review is advisory only.** Observations do not block the commit. Only mechanical failures block.

## Harness Integration

- Follows Principle 7 (Deterministic-vs-LLM Split) — mechanical checks first, AI review second
- Reads `.harness/review-learnings.md` for calibration (if present)
- Complements harness-code-review (full review) — use pre-commit for quick checks, code-review for thorough analysis
- **`assess_project`** — Used in Phase 1 for harness-specific health checks (validate + deps) in a single call.
- **`review_changes`** — Used in Phase 4 with `depth: 'quick'` for fast pre-commit diff analysis.
- **`harness impact-preview`** — Run after mechanical checks pass to show blast radius of staged changes. Informational only — never blocks.

## Success Criteria

- [ ] Mechanical checks ran and produced clear pass/fail results
- [ ] Fast path correctly identified docs/config-only changes
- [ ] AI review focused on high-signal issues only (no style nits)
- [ ] Report follows the structured format exactly

## Rationalizations to Reject

| Rationalization                                                               | Why It Is Wrong                                                                                                                                               |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The lint errors are just warnings, so I can proceed to AI review"            | The gate is absolute: any mechanical check failure means STOP. AI review does not run until lint, typecheck, and tests all pass.                              |
| "This is a docs-only change but let me run AI review anyway for thoroughness" | The fast path is mandatory. If only docs/config files changed, AI review is skipped. Running it anyway wastes tokens.                                         |
| "The AI found a style issue, so I should block the commit"                    | AI review observations are advisory only. Only mechanical check failures block the commit.                                                                    |
| "I will skip the security scan since this is an internal endpoint"            | Phase 3 runs the security scanner against all staged source files regardless of exposure. Hardcoded secrets and injection are blocking even in internal code. |
| "The AI found an issue so I should fix it before reporting"                   | Pre-commit review reports findings — it does not apply fixes. The author decides what to act on. A review that silently modifies code is editing, not reviewing. |
| "The mechanical checks passed so the code is ready — skip the AI review"     | If source files are staged (not docs/config only), AI review runs. Mechanical checks catch syntax and type errors; AI review catches semantic issues like null dereference and resource leaks. Both layers have value. |

## Examples

### Example: Clean Commit

```
Pre-Commit Check: PASS

Mechanical Checks:
- Lint: PASS
- Types: PASS
- Tests: PASS (12/12)

Impact Preview (2 staged files)
  Code:    5 files   (auth.ts, login.ts, +3)
  Tests:   2 tests   (auth.test.ts, login.test.ts)
  Total:   7 affected

AI Review: PASS (no issues found)
```

### Example: Docs-Only Fast Path

```
Pre-Commit Check: PASS (fast path)

Mechanical Checks:
- Lint: PASS
- Types: PASS
- Tests: PASS (12/12)

AI Review: SKIPPED (docs/config only)
```

## Escalation

- **Mechanical checks fail:** Fix the issues. Do not bypass the hook.
- **AI review finds a potential issue you disagree with:** Commit anyway — AI review observations are advisory, not blocking. If the observation is consistently wrong, add it to `.harness/review-learnings.md` under Noise / False Positives.
- **Hook is too slow:** If the full test suite is slow, configure the project to run only affected tests in pre-commit. The full suite runs in CI.
