# Plan: Phase 3 — Codecov Integration

**Date:** 2026-03-28
**Spec:** docs/changes/ci-pipeline-hardening/proposal.md
**Estimated tasks:** 2
**Estimated time:** 8 minutes

## Goal

Codecov receives coverage uploads from CI on every push/PR to main, providing PR-level coverage diff reports and a public coverage dashboard.

## Observable Truths (Acceptance Criteria)

1. **Ubiquitous:** The file `codecov.yml` exists at repo root with `target: auto`, `threshold: 1%` for project status, `target: 80%` for patch status, and an `unittests` flag scoped to `packages/`.
2. **Event-driven:** When CI runs on `ubuntu-latest`, the workflow uploads coverage files for all 7 packages to Codecov via `codecov/codecov-action@v4`.
3. **State-driven:** While `CODECOV_TOKEN` is not configured, CI still passes because `fail_ci_if_error: false`.
4. **Unwanted:** If the matrix OS is not `ubuntu-latest`, then the system shall not run the Codecov upload step (avoids duplicate uploads).

## File Map

- CREATE `codecov.yml`
- MODIFY `.github/workflows/ci.yml` (add Codecov upload step after coverage ratchet check)

## Tasks

### Task 1: Create codecov.yml configuration

**Depends on:** none
**Files:** `codecov.yml`

1. Create `codecov.yml` at repo root with the following content:

   ```yaml
   coverage:
     status:
       project:
         default:
           target: auto
           threshold: 1%
       patch:
         default:
           target: 80%
     flags:
       unittests:
         paths:
           - packages/
   ```

2. Verify the file is valid YAML:

   ```bash
   node -e "const fs = require('fs'); const yaml = require('yaml'); yaml.parse(fs.readFileSync('codecov.yml', 'utf8')); console.log('valid')"
   ```

   If `yaml` is not available, use:

   ```bash
   node -e "const fs = require('fs'); const content = fs.readFileSync('codecov.yml', 'utf8'); console.log('file exists, length:', content.length)"
   ```

3. Run: `npx harness validate`

4. Commit: `ci(codecov): add codecov.yml configuration`

### Task 2: Add Codecov upload step to CI workflow

**Depends on:** Task 1
**Files:** `.github/workflows/ci.yml`

1. In `.github/workflows/ci.yml`, add the following step **after** the "Coverage ratchet check" step and **before** the `pnpm test:platform-parity` step:

   ```yaml
   - name: Upload coverage to Codecov
     if: matrix.os == 'ubuntu-latest'
     uses: codecov/codecov-action@v4
     with:
       files: packages/core/coverage/coverage-final.json,packages/graph/coverage/coverage-final.json,packages/cli/coverage/coverage-final.json,packages/eslint-plugin/coverage/coverage-final.json,packages/linter-gen/coverage/coverage-final.json,packages/orchestrator/coverage/coverage-final.json,packages/types/coverage/coverage-final.json
       flags: unittests
       fail_ci_if_error: false
     env:
       CODECOV_TOKEN: ${{ secrets.CODECOV_TOKEN }}
   ```

2. Verify the full workflow YAML is still valid:

   ```bash
   node -e "const fs = require('fs'); const yaml = require('yaml'); yaml.parse(fs.readFileSync('.github/workflows/ci.yml', 'utf8')); console.log('valid')"
   ```

3. Verify the upload step appears in the correct position (after ratchet, before platform-parity):

   ```bash
   grep -n "Coverage ratchet\|Upload coverage to Codecov\|test:platform-parity" .github/workflows/ci.yml
   ```

   Expected: ratchet line < upload line < platform-parity line.

4. Run: `npx harness validate`

5. Commit: `ci(codecov): add coverage upload step to CI workflow`

### Post-plan: Human Action Required

[checkpoint:human-action]

**Add `CODECOV_TOKEN` secret to the GitHub repository:**

1. Go to https://app.codecov.io and set up the `harness-engineering` repository
2. Copy the upload token from Codecov
3. Go to GitHub repo Settings > Secrets and variables > Actions
4. Add a new repository secret named `CODECOV_TOKEN` with the token value
5. Push the changes from Tasks 1-2 or open a PR to verify Codecov receives the upload

Without this secret, the upload step will silently skip (due to `fail_ci_if_error: false`), but Codecov will not receive any data.
