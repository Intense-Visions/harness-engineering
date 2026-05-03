# Plan: Phase 5 -- Post-Publish Smoke Test

**Date:** 2026-03-28
**Spec:** docs/changes/ci-pipeline-hardening/proposal.md
**Estimated tasks:** 1
**Estimated time:** 3 minutes

## Goal

After a successful Release workflow, a smoke-test workflow automatically installs the published npm packages and verifies they work.

## Observable Truths (Acceptance Criteria)

1. `.github/workflows/smoke-test.yml` exists with a `workflow_run` trigger on the `Release` workflow.
2. When the Release workflow completes successfully on `main`, the smoke-test job runs on `ubuntu-latest`.
3. The smoke job installs `@harness-engineering/cli` globally and runs `harness --version`.
4. The smoke job installs `@harness-engineering/core` and `@harness-engineering/types` into a temp project and verifies they are importable via `require()`.
5. If the Release workflow did not succeed, the smoke job is skipped (via `if` condition on `workflow_run.conclusion`).
6. `harness validate` passes after the file is added.

## File Map

- CREATE `.github/workflows/smoke-test.yml`

## Tasks

### Task 1: Create post-publish smoke test workflow

**Depends on:** none
**Files:** `.github/workflows/smoke-test.yml`

1. Create `.github/workflows/smoke-test.yml` with the following exact content:

   ```yaml
   name: Post-Publish Smoke Test
   on:
     workflow_run:
       workflows: [Release]
       types: [completed]
       branches: [main]

   jobs:
     smoke:
       if: ${{ github.event.workflow_run.conclusion == 'success' }}
       runs-on: ubuntu-latest
       steps:
         - uses: actions/setup-node@v4
           with:
             node-version: 22
         - name: Wait for npm CDN propagation
           run: sleep 30
         - name: Install published CLI
           run: npm install -g @harness-engineering/cli
         - name: Verify CLI runs
           run: harness --version
         - name: Verify core exports
           run: |
             mkdir /tmp/smoke && cd /tmp/smoke
             npm init -y
             npm install @harness-engineering/core @harness-engineering/types
             node -e "const c = require('@harness-engineering/core'); console.log('core OK:', typeof c.validateProject)"
             node -e "const t = require('@harness-engineering/types'); console.log('types OK:', Object.keys(t).length > 0)"
   ```

2. Verify the file is valid YAML (no syntax errors).

3. Run: `harness validate`

4. Commit: `ci(smoke-test): add post-publish smoke test workflow`
