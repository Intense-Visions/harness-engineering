# Harness Pre-Commit Review

> Lightweight pre-commit quality gate — mechanical checks first, AI review second. Fast feedback before code leaves your machine.

## When to Use
- Before committing code (manual invocation or git pre-commit hook)
- As a quick sanity check before pushing to a branch
- When you want fast feedback without a full code review cycle
- NOT as a replacement for full peer review (use `harness-code-review` for that)
- NOT for commits that only update documentation or configuration (fast path skips AI review)

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

### Phase 3: AI Review (Lightweight)

Perform a focused, lightweight review of staged changes. This is NOT a full code review — it catches obvious issues only.

#### 1. Get the Staged Diff

```bash
git diff --cached
```

#### 2. Quick Review Checklist

Review the staged diff for these high-signal issues only:

- **Obvious bugs:** null dereference, infinite loops, off-by-one errors, resource leaks
- **Security issues:** hardcoded secrets, SQL injection, path traversal, unvalidated input
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

AI Review: PASS (no issues found)
```

**If issues found:**

```
Pre-Commit Check: WARN

Mechanical Checks:
- Lint: PASS
- Types: PASS
- Tests: PASS (12/12)

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

## Gates

- **Mechanical checks must pass before AI review.** Do not run AI review if lint/typecheck/tests fail.
- **Fast path is mandatory.** If only docs/config changed, skip AI review — do not waste tokens.
- **AI review is advisory only.** Observations do not block the commit. Only mechanical failures block.

## Harness Integration

- Follows Principle 7 (Deterministic-vs-LLM Split) — mechanical checks first, AI review second
- Reads `.harness/review-learnings.md` for calibration (if present)
- Complements harness-code-review (full review) — use pre-commit for quick checks, code-review for thorough analysis

## Success Criteria

- [ ] Mechanical checks ran and produced clear pass/fail results
- [ ] Fast path correctly identified docs/config-only changes
- [ ] AI review focused on high-signal issues only (no style nits)
- [ ] Report follows the structured format exactly

## Examples

### Example: Clean Commit

```
Pre-Commit Check: PASS

Mechanical Checks:
- Lint: PASS
- Types: PASS
- Tests: PASS (12/12)

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
