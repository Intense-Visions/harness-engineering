# Plan: Environment Configuration via .env File

**Date:** 2026-04-03
**Spec:** docs/changes/env-config/proposal.md
**Estimated tasks:** 3
**Estimated time:** 10 minutes

## Goal

The harness CLI loads environment variables from a root-level `.env` file at startup, with all known variables documented in `.env.example` and all `.env` variants gitignored except the example.

## Observable Truths (Acceptance Criteria)

1. When a `.env` file exists at the repo root containing `TEST_VAR=hello`, running `node packages/cli/dist/bin/harness.js --version` results in `process.env.TEST_VAR` being set to `"hello"` in the process.
2. When a `.env` file exists at the repo root, the `harness-mcp` entry point also loads it (verified by the `import 'dotenv/config'` statement present as the first import).
3. The file `.env.example` exists at the repo root with comments documenting all known environment variables (GITHUB_TOKEN, CONFLUENCE_API_KEY, CONFLUENCE_BASE_URL, JIRA_API_KEY, JIRA_BASE_URL, SLACK_API_KEY, PERPLEXITY_API_KEY, HARNESS_NO_UPDATE_CHECK, CI, PORT).
4. When `.env`, `.env.local`, `.env.production`, or `.env.staging` files exist, `git check-ignore` reports them as ignored.
5. `git check-ignore .env.example` returns no match (the file is NOT ignored).
6. If no `.env` file exists, the CLI works without error (dotenv silently does nothing).
7. `pnpm build` passes across the workspace.

## File Map

- MODIFY `packages/cli/package.json` (add `dotenv` to dependencies)
- MODIFY `packages/cli/src/bin/harness.ts` (add `import 'dotenv/config'` as first import)
- MODIFY `packages/cli/src/bin/harness-mcp.ts` (add `import 'dotenv/config'` as first import)
- CREATE `.env.example` (document all known env vars)
- MODIFY `.gitignore` (replace lines 20-21 with broader pattern)

## Tasks

### Task 1: Add dotenv dependency and import in both entry points

**Depends on:** none
**Files:** `packages/cli/package.json`, `packages/cli/src/bin/harness.ts`, `packages/cli/src/bin/harness-mcp.ts`

1. Add `dotenv` as a runtime dependency in `packages/cli/package.json`. Insert after the `commander` entry in the dependencies object:

   ```json
   "dotenv": "^16.6.1",
   ```

2. In `packages/cli/src/bin/harness.ts`, add the following as the very first import (line 2, after the shebang):

   ```typescript
   import 'dotenv/config';
   ```

   The existing imports shift down by one line.

3. In `packages/cli/src/bin/harness-mcp.ts`, add the following as the very first import (line 2, after the shebang):

   ```typescript
   import 'dotenv/config';
   ```

   The existing import shifts down by one line.

4. Run: `cd /Users/cwarner/Projects/harness-engineering && pnpm install`
5. Run: `cd /Users/cwarner/Projects/harness-engineering && pnpm build`
6. Observe: build succeeds with no errors.
7. Run: `npx harness validate`
8. Commit: `feat(cli): add dotenv support to load .env at startup`

### Task 2: Create .env.example and update .gitignore

**Depends on:** none (can run in parallel with Task 1)
**Files:** `.env.example`, `.gitignore`

1. Create `.env.example` at the repo root with the following content:

   ```env
   # API Keys — Graph Connectors & Roadmap Sync
   GITHUB_TOKEN=               # Used by graph CI connector and roadmap sync
   CONFLUENCE_API_KEY=
   CONFLUENCE_BASE_URL=
   JIRA_API_KEY=
   JIRA_BASE_URL=
   SLACK_API_KEY=

   # Integrations
   PERPLEXITY_API_KEY=

   # Feature Flags
   HARNESS_NO_UPDATE_CHECK=    # Set to "1" to disable update checks
   CI=                         # Set to "true" when running in CI

   # Server (used by templates)
   PORT=3000
   ```

2. In `.gitignore`, replace lines 20-21:

   ```
   .env
   .env*.local
   ```

   With:

   ```
   .env*
   !.env.example
   ```

3. Verify gitignore works:

   ```bash
   cd /Users/cwarner/Projects/harness-engineering
   git check-ignore .env && echo "PASS: .env ignored"
   git check-ignore .env.local && echo "PASS: .env.local ignored"
   git check-ignore .env.production && echo "PASS: .env.production ignored"
   git check-ignore .env.example || echo "PASS: .env.example NOT ignored"
   ```

4. Run: `npx harness validate`
5. Commit: `chore: add .env.example and broaden .gitignore env patterns`

### Task 3: Verify end-to-end and final build

**Depends on:** Task 1, Task 2
**Files:** none (verification only)

[checkpoint:human-verify]

1. Run full workspace build:

   ```bash
   cd /Users/cwarner/Projects/harness-engineering && pnpm build
   ```

   Observe: all packages build successfully.

2. Verify dotenv loads correctly (smoke test):

   ```bash
   cd /Users/cwarner/Projects/harness-engineering
   echo "HARNESS_TEST_VAR=dotenv_works" > .env
   node -e "import('dotenv/config').then(() => console.log(process.env.HARNESS_TEST_VAR))"
   rm .env
   ```

   Observe: prints `dotenv_works`.

3. Verify CLI works without `.env`:

   ```bash
   cd /Users/cwarner/Projects/harness-engineering
   node packages/cli/dist/bin/harness.js --version
   ```

   Observe: prints version without error.

4. Run: `npx harness validate`
5. Observe: all checks pass. No commit needed for this task (verification only).

## Traceability

| Observable Truth                              | Delivered By                                       |
| --------------------------------------------- | -------------------------------------------------- |
| 1. `.env` vars loaded by `harness` CLI        | Task 1 (import in harness.ts), Task 3 (smoke test) |
| 2. `.env` vars loaded by `harness-mcp`        | Task 1 (import in harness-mcp.ts)                  |
| 3. `.env.example` exists with documented vars | Task 2                                             |
| 4. `.env` variants are gitignored             | Task 2 (gitignore update + verification)           |
| 5. `.env.example` is NOT gitignored           | Task 2 (gitignore update + verification)           |
| 6. CLI works without `.env` file              | Task 3 (verification)                              |
| 7. Build passes                               | Task 1 (build), Task 3 (final build)               |
