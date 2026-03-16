# Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare harness-engineering for general consumption — polished docs, npm-publishable packages, smooth CLI init, clean builds.

**Architecture:** Four workstreams executed in dependency order: (1) test/build hygiene + README polish in parallel, (2) npm publishing + CI/CD, (3) CLI init experience. Each workstream produces independently committable changes.

**Tech Stack:** pnpm monorepo, Turborepo, TypeScript, tsup, Vitest, GitHub Actions, Changesets

**Spec:** `docs/specs/2026-03-16-release-readiness-design.md`

---

## Chunk 1: Test & Build Hygiene

### Task 1: Verify Build Pipeline

**Files:**

- Verify: `turbo.json`
- Verify: all `packages/*/package.json` build scripts

- [ ] **Step 1: Run full build**

```bash
cd /Users/cwarner/Projects/harness-engineering
pnpm build
```

Expected: All 6 packages build successfully with no errors.

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: No type errors.

- [ ] **Step 3: Run lint**

```bash
pnpm lint
```

Expected: No lint errors.

- [ ] **Step 4: Run format check**

```bash
pnpm format:check
```

Expected: No formatting issues. If any, run `pnpm format` and commit.

- [ ] **Step 5: Run tests**

```bash
pnpm test
```

Expected: All test files pass. Note any failures for Task 2.

- [ ] **Step 6: Search for stray console.log in source files**

```bash
grep -rn "console\.log" packages/*/src/ --include="*.ts" | grep -v "logger\." | grep -v "test" | grep -v "dist"
```

Remove any debugging `console.log` statements. Intentional logging should use the `logger` utility. Leave `console.log` in CLI output code (init.ts, add.ts) where it's deliberate user output.

- [ ] **Step 7: Search for skipped/pending tests**

```bash
grep -rn "\.skip\|\.todo\|xit(\|xdescribe(" packages/*/tests/ packages/*/src/ --include="*.ts" | grep -v node_modules | grep -v dist
```

For each skipped test: either re-enable it (if the underlying issue is fixed) or add a comment explaining why it's skipped and create a GitHub issue reference.

- [ ] **Step 8: Verify .gitignore coverage**

Read `.gitignore` and confirm it covers: `node_modules/`, `dist/`, `build/`, `.turbo/`, `coverage/`, `.next/`, `.env*.local`, `*.tsbuildinfo`. All are present in the current `.gitignore`. Verify no build artifacts are accidentally tracked:

```bash
git ls-files | grep -E "(dist/|build/|coverage/|\.env)" | head -20
```

Expected: no results.

- [ ] **Step 9: Verify turbo.json pipeline syntax**

The current `turbo.json` uses `"pipeline"` (Turbo v1 syntax). Check installed Turbo version:

```bash
npx turbo --version
```

If Turbo v2+, rename `"pipeline"` to `"tasks"` in `turbo.json`. If Turbo v1.x, leave as-is.

- [ ] **Step 10: Fix any issues found and commit**

```bash
git add -A
git commit -m "fix: resolve build/lint/test issues for release readiness"
```

---

### Task 2: Resolve TODO/FIXME Items

**Files:**

- Modify: `packages/cli/src/commands/add.ts:28-46`
- Modify: `packages/cli/src/commands/create-skill.ts:63-113`
- Modify: `packages/core/src/context/generate.ts:111,159`

- [ ] **Step 1: Fix add.ts templates — remove literal TODO strings**

In `packages/cli/src/commands/add.ts`, the goal is to remove grep-visible `TODO` strings while keeping the templates as useful scaffolding. Replace the MODULE_TEMPLATE (lines 28-35) and DOC_TEMPLATE (lines 37-46):

```typescript
const MODULE_TEMPLATE = (name: string) => `/**
 * ${name} module
 */

export function ${name}(): void {
  // Add implementation
}
`;

const DOC_TEMPLATE = (name: string) => `# ${name}

## Overview

[Describe what ${name} does and why it exists.]

## Usage

\`\`\`typescript
import { ${name} } from './${name}';
\`\`\`
`;
```

- [ ] **Step 2: Fix create-skill.ts — remove literal TODO strings from generated SKILL.md**

In `packages/cli/src/commands/create-skill.ts`, the `buildSkillMd` function generates SKILL.md with `_TODO:` prefixed lines. These are already descriptive prompts — the fix is simply removing the `TODO` prefix so they don't trigger grep checks. The template placeholders like `[brackets]` are the standard pattern used in existing skills.

Find and replace in the `buildSkillMd` return string (lines 63-113):

- `- _TODO: describe when this skill should be invoked_` → `- [Describe when this skill should be invoked]`
- `- _TODO: describe the trigger conditions_` → `- [Describe the trigger conditions]`
- `1. _TODO: describe the step-by-step process_` → `1. [Describe the step-by-step process]`
- `2. _TODO: add additional steps_` → `2. [Add additional steps as needed]`
- `- _TODO: define what success looks like_` → `- [Define what a successful execution looks like]`
- `- _TODO: add measurable criteria_` → `- [Add measurable criteria]`
- `# TODO: add usage examples` → `harness skill run ${opts.name}`

- [ ] **Step 3: Fix generate.ts — replace TODOs with instructive placeholders**

In `packages/core/src/context/generate.ts`, find and replace (exact string match):

Find: `lines.push('> TODO: Add project description');`
Replace: `lines.push('> Add a brief description of this project, its purpose, and key technologies.');`

Find: `lines.push('> TODO: Add development workflow instructions');`
Replace: `lines.push('> Document your development workflow: branching strategy, testing commands, deployment process.');`

- [ ] **Step 4: Run tests to verify nothing broke**

```bash
pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/add.ts packages/cli/src/commands/create-skill.ts packages/core/src/context/generate.ts
git commit -m "fix: replace TODO placeholders with useful defaults in scaffolding"
```

---

### Task 3: Repo Hygiene Files

**Files:**

- Create: `.github/ISSUE_TEMPLATE/bug_report.md`
- Create: `.github/ISSUE_TEMPLATE/feature_request.md`
- Create: `.github/PULL_REQUEST_TEMPLATE.md`
- Create: `SECURITY.md`
- Create: `CODE_OF_CONDUCT.md`
- Create: `CHANGELOG.md`

- [ ] **Step 1: Create .github directory structure**

```bash
mkdir -p .github/ISSUE_TEMPLATE
```

- [ ] **Step 2: Create bug report template**

Create `.github/ISSUE_TEMPLATE/bug_report.md`:

```markdown
---
name: Bug Report
about: Report a bug in harness-engineering
title: '[Bug] '
labels: bug
assignees: ''
---

## Description

A clear description of the bug.

## Steps to Reproduce

1. Run `...`
2. See error

## Expected Behavior

What you expected to happen.

## Actual Behavior

What actually happened.

## Environment

- Node version:
- pnpm version:
- OS:
- Package version:
```

- [ ] **Step 3: Create feature request template**

Create `.github/ISSUE_TEMPLATE/feature_request.md`:

```markdown
---
name: Feature Request
about: Suggest a feature for harness-engineering
title: '[Feature] '
labels: enhancement
assignees: ''
---

## Problem

What problem does this feature solve?

## Proposed Solution

How should it work?

## Alternatives Considered

Other approaches you've considered.
```

- [ ] **Step 4: Create PR template**

Create `.github/PULL_REQUEST_TEMPLATE.md`:

```markdown
## Summary

Brief description of changes.

## Changes

- Change 1
- Change 2

## Testing

- [ ] `pnpm build` passes
- [ ] `pnpm test` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes

## Related Issues

Closes #
```

- [ ] **Step 5: Create SECURITY.md**

Create `SECURITY.md`:

```markdown
# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly.

**Do not open a public issue.** Instead, email security concerns to: [security contact email]

We will acknowledge receipt within 48 hours and provide a timeline for a fix.

## Supported Versions

| Version | Supported |
| ------- | --------- |
| Latest  | Yes       |
```

- [ ] **Step 6: Create CODE_OF_CONDUCT.md**

Create `CODE_OF_CONDUCT.md` using the [Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/):

Use the standard Contributor Covenant text. Set the enforcement contact to the same email as SECURITY.md.

- [ ] **Step 7: Create CHANGELOG.md**

Create `CHANGELOG.md`:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

This project uses [Changesets](https://github.com/changesets/changesets) for versioning.

## [Unreleased]

### Added

- Initial public release of harness-engineering toolkit
- 6 packages: types, core, cli, eslint-plugin, linter-gen, mcp-server
- 26 agent skills for Claude Code
- 3 agent personas
- 5 project templates (base, basic, intermediate, advanced, nextjs)
- 3 progressive examples (hello-world, task-api, multi-tenant-api)
- Comprehensive documentation
```

- [ ] **Step 8: Commit**

```bash
git add .github/ SECURITY.md CODE_OF_CONDUCT.md CHANGELOG.md
git commit -m "chore: add repo hygiene files — issue templates, PR template, security policy, CoC, changelog"
```

---

## Chunk 2: README & Documentation Polish

### Task 4: Rewrite README

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Read the current README to understand what exists**

Current README is 116 lines with badges, quick start, packages table, examples, principles, project structure, and docs links. The structure is sound but needs to be more compelling and complete per the spec.

- [ ] **Step 2: Rewrite README.md**

Rewrite following the spec's 10-section structure. Key changes from current:

- Add stronger "why this exists" section (problem → solution framing)
- Update component counts (21 → 26 skills, 4 → 5 templates)
- Add mermaid architecture diagram showing the layered dependency model
- Improve quick start to show install → init → validate flow
- Add build/CI badges (placeholders until CI is set up)
- Organize documentation links by audience

The README should be ~150-180 lines. Keep the tone professional but approachable. Lead with value, not features.

- [ ] **Step 3: Verify README renders correctly**

```bash
# Quick check — no broken links to local files
grep -oP '\(\.\/[^)]+\)' README.md | while read link; do
  path=$(echo "$link" | tr -d '()')
  [ ! -e "$path" ] && echo "BROKEN: $path"
done
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for release — compelling intro, architecture diagram, updated counts"
```

---

### Task 5: Polish Getting Started Guide

**Files:**

- Modify: `docs/guides/getting-started.md`

- [ ] **Step 1: Read current getting-started.md**

The guide is 147 lines and already well-structured. Main refinements needed:

- Ensure the quick start matches README's promise
- Update skill count (21 → 26)
- Add a note about `npx` usage for those who haven't installed globally

- [ ] **Step 2: Update getting-started.md**

Key edits:

- Update "21 workflow skills" → "26 workflow skills" in Key Concepts section
- Add `npx @harness-engineering/cli` alternative wherever `harness` CLI is referenced
- Ensure example commands match what the templates actually produce

- [ ] **Step 3: Commit**

```bash
git add docs/guides/getting-started.md
git commit -m "docs: polish getting-started guide — update counts, add npx alternatives"
```

---

### Task 6: Clean Up Documentation TODOs

**Files:**

- Verify: all files in `docs/` for remaining TODO placeholders

- [ ] **Step 1: Search for TODOs in docs**

```bash
grep -rn "TODO" docs/ --include="*.md" | grep -v "plans/" | grep -v "specs/"
```

Only fix TODOs in user-facing documentation. TODOs in plans/specs are expected.

- [ ] **Step 2: Fix any found TODOs**

Replace with actual content or remove the placeholder section if not needed.

- [ ] **Step 3: Commit if changes were made**

```bash
git add docs/
git commit -m "docs: resolve remaining TODO placeholders in user-facing documentation"
```

---

## Chunk 3: npm Publishing & CI/CD

### Task 7: Add Publishing Fields to All Package.json Files

**Files:**

- Modify: `packages/types/package.json`
- Modify: `packages/core/package.json`
- Modify: `packages/cli/package.json`
- Modify: `packages/eslint-plugin/package.json`
- Modify: `packages/linter-gen/package.json`
- Modify: `packages/mcp-server/package.json`

- [ ] **Step 1: Add fields to packages/types/package.json**

Add `files` (currently missing) and publishing metadata after `"license"`:

```json
{
  "files": ["dist", "README.md"],
  "publishConfig": { "access": "public" },
  "repository": {
    "type": "git",
    "url": "https://github.com/Intense-Visions/harness-engineering.git",
    "directory": "packages/types"
  },
  "bugs": { "url": "https://github.com/Intense-Visions/harness-engineering/issues" },
  "homepage": "https://github.com/Intense-Visions/harness-engineering/tree/main/packages/types#readme"
}
```

- [ ] **Step 2: Add fields to packages/core/package.json**

Add `publishConfig`, `repository`, `bugs`, `homepage` (same pattern, `directory: "packages/core"`). The `files` field already exists — update it to `["dist", "README.md"]`.

- [ ] **Step 3: Fix and add fields to packages/cli/package.json**

The CLI builds with `tsup --format esm` which produces `.js` files (not `.mjs`). The existing `"module": "./dist/index.mjs"` field is broken — tsup ESM-only output is `.js`. Fix this:

1. **Remove** the `"module": "./dist/index.mjs"` field (it's wrong and redundant with `"type": "module"`)
2. **Add** `exports` and publishing fields:

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist", "README.md"],
  "publishConfig": { "access": "public" },
  "repository": {
    "type": "git",
    "url": "https://github.com/Intense-Visions/harness-engineering.git",
    "directory": "packages/cli"
  },
  "bugs": { "url": "https://github.com/Intense-Visions/harness-engineering/issues" },
  "homepage": "https://github.com/Intense-Visions/harness-engineering/tree/main/packages/cli#readme"
}
```

- [ ] **Step 4: Add fields to packages/eslint-plugin/package.json**

eslint-plugin has `"type": "module"` and builds with `tsc`. The `tsconfig.base.json` sets `"module": "ESNext"`, so tsc outputs ESM `.js` files. Do NOT add `"require"` — Node will refuse to `require()` ESM `.js` in a `"type": "module"` package. Do NOT add a `"module"` field — it's redundant when `"type": "module"` is set.

Add `exports`, `publishConfig`, `repository`, `bugs`, `homepage`:

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist", "README.md"],
  "publishConfig": { "access": "public" },
  "repository": {
    "type": "git",
    "url": "https://github.com/Intense-Visions/harness-engineering.git",
    "directory": "packages/eslint-plugin"
  },
  "bugs": { "url": "https://github.com/Intense-Visions/harness-engineering/issues" },
  "homepage": "https://github.com/Intense-Visions/harness-engineering/tree/main/packages/eslint-plugin#readme"
}
```

Note: eslint-plugin already has correct `peerDependencies` for eslint and typescript. No changes needed there.

- [ ] **Step 5: Add fields to packages/linter-gen/package.json**

Same ESM-only pattern as eslint-plugin (uses `tsc`, has `"type": "module"`). Add `exports` (ESM-only), `files` (`["dist", "README.md"]`), `publishConfig`, `repository`, `bugs`, `homepage`.

- [ ] **Step 6: Add fields to packages/mcp-server/package.json**

Same ESM-only pattern. Add `exports` (ESM-only), `files` (already has `["dist"]` — update to `["dist", "README.md"]`), `publishConfig`, `repository`, `bugs`, `homepage`.

- [ ] **Step 7: Audit peer dependencies**

The eslint-plugin already has correct `peerDependencies` (eslint ^8-10, typescript ^5). Check other packages:

- `linter-gen`: no peer deps needed (standalone generator)
- `mcp-server`: no peer deps needed (standalone server)
- `core`: no peer deps needed (self-contained with vendored deps)
- `cli`: no peer deps needed (standalone CLI)
- `types`: no peer deps needed (pure type package)

If any package depends on a library that consumers must also install (e.g., eslint for the plugin), ensure `peerDependencies` is set and documented in the package README.

- [ ] **Step 8: Verify builds still work**

```bash
pnpm build
```

- [ ] **Step 9: Commit**

```bash
git add packages/*/package.json
git commit -m "chore: add publishConfig, repository, exports to all packages for npm publishing"
```

---

### Task 8: Initialize Changesets

**Files:**

- Create: `.changeset/config.json`
- Modify: `package.json` (root)

- [ ] **Step 1: Initialize changesets**

```bash
pnpm changeset init
```

This creates `.changeset/config.json` and `.changeset/README.md`.

- [ ] **Step 2: Verify the generated config**

Read `.changeset/config.json` and verify it looks correct. Update if needed:

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.1.1/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

Key: set `"access": "public"` for the `@harness-engineering` scoped packages.

- [ ] **Step 3: Add changeset scripts to root package.json**

Add to `"scripts"`:

```json
{
  "changeset": "changeset",
  "version": "changeset version",
  "release": "pnpm build && changeset publish"
}
```

- [ ] **Step 4: Commit**

```bash
git add .changeset/ package.json
git commit -m "chore: initialize changesets for monorepo version management"
```

---

### Task 9: Create CI Workflow

**Files:**

- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - run: pnpm build

      - run: pnpm typecheck

      - run: pnpm lint

      - run: pnpm format:check

      - run: pnpm test
```

Note: `pnpm/action-setup@v4` auto-detects the version from the `packageManager` field in `package.json` (`pnpm@8.15.4`). No explicit `version` needed.

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add CI workflow — build, typecheck, lint, format, test on Node 18/20/22"
```

---

### Task 10: Create Release Workflow

**Files:**

- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create release workflow**

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: false

permissions:
  contents: write
  pull-requests: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'
          registry-url: 'https://registry.npmjs.org'

      - run: pnpm install --frozen-lockfile

      - run: pnpm build

      - name: Create Release Pull Request or Publish
        id: changesets
        uses: changesets/action@v1
        with:
          publish: pnpm release
          title: 'chore: version packages'
          commit: 'chore: version packages'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add release workflow — changesets-based npm publishing"
```

---

## Chunk 4: CLI Init Experience

### Task 11: Add `--yes` Flag and Polish Init Output

**Files:**

- Modify: `packages/cli/src/commands/init.ts`

- [ ] **Step 1: Add `--yes` flag to init command**

In `packages/cli/src/commands/init.ts`, add the `-y, --yes` option to the command definition at line 69:

```typescript
    .option('-y, --yes', 'Use defaults without prompting')
```

The init command already uses defaults when options aren't provided (`level` defaults to `'basic'`, `name` defaults to `path.basename(cwd)`). The `--yes` flag is already effectively supported — this just makes it explicit.

- [ ] **Step 2: Improve the "next steps" output with chalk coloring**

In `packages/cli/src/commands/init.ts`, update the success output (lines 85-95). Import chalk at the top:

```typescript
import chalk from 'chalk';
```

Replace the console.log block:

```typescript
if (!globalOpts.quiet) {
  console.log('');
  logger.success('Project initialized!');
  console.log('');
  logger.info('Created files:');
  for (const file of result.value.filesCreated) {
    console.log(`  ${chalk.green('+')} ${file}`);
  }
  console.log('');
  console.log(chalk.bold('Next steps:'));
  console.log(`  1. Review ${chalk.cyan('harness.config.json')}`);
  console.log(`  2. Update ${chalk.cyan('AGENTS.md')} with your project context`);
  console.log(`  3. Run ${chalk.cyan('harness validate')} to check your setup`);
  console.log('');
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @harness-engineering/cli test
```

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/init.ts
git commit -m "feat(cli): add --yes flag and polish init output with chalk formatting"
```

---

### Task 12: Expand `add` Command to Support Skills and Personas

**Files:**

- Modify: `packages/cli/src/commands/add.ts`

- [ ] **Step 1: Add 'skill' and 'persona' component types**

In `packages/cli/src/commands/add.ts`, expand the `ComponentType` and add new cases.

Update the type at line 11:

```typescript
type ComponentType = 'layer' | 'module' | 'doc' | 'skill' | 'persona';
```

Add new template constants:

```typescript
const PERSONA_TEMPLATE = (name: string) => `# ${name}

name: ${name}
description: ${name} persona
triggers:
  - manual
focus_areas: []
`;
```

Add new cases in the switch statement (after the `'doc'` case):

```typescript
      case 'skill': {
        // Delegate to create-skill with defaults, passing cwd-relative outputDir
        const { generateSkillFiles } = await import('./create-skill');
        generateSkillFiles({
          name,
          description: `${name} skill`,
          outputDir: path.join(cwd, 'agents', 'skills', 'claude-code'),
        });
        created.push(`agents/skills/claude-code/${name}/skill.yaml`);
        created.push(`agents/skills/claude-code/${name}/SKILL.md`);
        break;
      }

      case 'persona': {
        const personasDir = path.join(cwd, 'agents', 'personas');
        if (!fs.existsSync(personasDir)) {
          fs.mkdirSync(personasDir, { recursive: true });
        }
        const personaPath = path.join(personasDir, `${name}.yaml`);
        if (fs.existsSync(personaPath)) {
          return Err(new CLIError(`Persona ${name} already exists`, ExitCode.ERROR));
        }
        fs.writeFileSync(personaPath, PERSONA_TEMPLATE(name));
        created.push(`agents/personas/${name}.yaml`);
        break;
      }
```

Update the error message in the default case:

```typescript
return Err(
  new CLIError(
    `Unknown component type: ${componentType}. Use: layer, module, doc, skill, persona`,
    ExitCode.ERROR
  )
);
```

- [ ] **Step 2: Update command description**

Update the `.description()` and `.argument()` calls:

```typescript
    .description('Add a component to the project')
    .argument('<type>', 'Component type (layer, module, doc, skill, persona)')
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @harness-engineering/cli test
```

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/add.ts
git commit -m "feat(cli): expand add command to support skill and persona component types"
```

---

### Task 13: Fix create-skill Scaffolding Defaults

This was already handled in Task 2, Step 2. Verify it's committed.

- [ ] **Step 1: Verify the create-skill changes are committed**

```bash
git log --oneline -5
```

Confirm the TODO placeholder fix commit is present.

---

## Chunk 5: Final Verification

### Task 14: End-to-End Verification

- [ ] **Step 1: Full build pipeline**

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
```

All must pass with zero errors.

- [ ] **Step 2: Verify no TODOs remain in source**

```bash
grep -rn "TODO" packages/ --include="*.ts" | grep -v node_modules | grep -v dist | grep -v ".test."
```

Only acceptable TODOs are in test files or template strings that are intentional prompts (not placeholders).

- [ ] **Step 3: Verify all repo hygiene files exist**

```bash
ls -la .github/ISSUE_TEMPLATE/bug_report.md .github/ISSUE_TEMPLATE/feature_request.md .github/PULL_REQUEST_TEMPLATE.md .github/workflows/ci.yml .github/workflows/release.yml SECURITY.md CODE_OF_CONDUCT.md CHANGELOG.md .changeset/config.json
```

All files must exist.

- [ ] **Step 4: Verify package exports are importable**

```bash
node -e "import('@harness-engineering/types').then(m => console.log('types OK:', Object.keys(m).length, 'exports'))"
node -e "import('@harness-engineering/core').then(m => console.log('core OK:', Object.keys(m).length, 'exports'))"
```

- [ ] **Step 5: Test init command end-to-end**

```bash
mkdir /tmp/test-harness-init && cd /tmp/test-harness-init
pnpm --filter @harness-engineering/cli exec harness init --name test-project --level basic --yes
ls -la
cat harness.config.json
cd -
rm -rf /tmp/test-harness-init
```

- [ ] **Step 6: Commit any final fixes**

```bash
git add -A
git commit -m "fix: final verification fixes for release readiness"
```
