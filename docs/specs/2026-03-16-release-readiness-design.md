# Release Readiness: Preparing Harness Engineering for General Consumption

**Date:** 2026-03-16
**Status:** Approved
**Audience:** Internal stakeholders + public (low-key but polished)

## Context

Harness Engineering is a complete toolkit for agent-first software development — 6 packages, 26 skills, 3 personas, 5 templates, 3 examples, and 52 documentation files across 329 commits. The core implementation is solid. What remains is polish, packaging, and professional presentation so the project is ready for internal adoption pitches and public consumption.

## Goals

1. Make a compelling first impression via README and documentation
2. Make packages installable via npm
3. Make onboarding frictionless via CLI init
4. Make the project trustworthy via clean tests, builds, and repo hygiene

## Non-Goals

- Viral open-source launch or marketing optimization
- New feature development
- Major architectural changes

## Target Audience

Dual audience with unified messaging:

- **Senior engineers / tech leads** — organizational adoption, constraint enforcement, team scaling
- **Individual developers** — personal productivity, agent-first development on their own projects

---

## Section 1: README & Documentation Polish

### README Structure

1. **Title + one-liner** — "Harness Engineering: A toolkit for agent-first software development"
2. **Why this exists** — 2-3 sentences: AI agents are powerful but unreliable without constraints; this toolkit provides mechanical enforcement, not hope
3. **Key features** — 6 bullet points mapping to the 6 core principles, each with a one-sentence explanation
4. **Quick start** — 3 commands: install, init, validate
5. **Packages overview** — table of 6 packages with one-line descriptions
6. **Architecture diagram** — mermaid diagram of the layered dependency model
7. **Documentation links** — organized by audience: Getting Started, Core Concepts, API Reference, Examples
8. **Progressive examples** — `hello-world` (5 min), `task-api` (15 min), `multi-tenant-api` (30 min)
9. **Contributing** — pointer to CONTRIBUTING.md
10. **License** — MIT

### Other Documentation

- Refine `getting-started.md` to match README's quick start promise
- Ensure docs site navigation is coherent: standard -> guides -> reference -> examples
- Clean up placeholder TODOs in documentation files

---

## Section 2: npm Publishing & CI/CD

### Prerequisites

- Register `@harness-engineering` npm organization
- Provision `NPM_TOKEN` as a GitHub repository secret for CI publishing

### Package Publishing

All 6 packages currently lack `publishConfig`, `repository`, `bugs`, and `homepage` fields. These must be created (not just verified) across every package.

**Fields to add to each package.json:**

```json
{
  "publishConfig": { "access": "public" },
  "repository": {
    "type": "git",
    "url": "https://github.com/<org>/harness-engineering",
    "directory": "packages/<name>"
  },
  "bugs": { "url": "https://github.com/<org>/harness-engineering/issues" },
  "homepage": "https://github.com/<org>/harness-engineering/tree/main/packages/<name>#readme",
  "files": ["dist", "README.md"]
}
```

**Exports remediation** — current state and required work:

| Package         | Has `exports` | Has `module` | Has `files` | Action                   |
| --------------- | :-----------: | :----------: | :---------: | ------------------------ |
| `core`          |      Yes      |     Yes      |     Yes     | Verify only              |
| `types`         |      Yes      |     Yes      |   **No**    | Add `files`              |
| `cli`           |    **No**     |    **No**    |     Yes     | Add `exports` + `module` |
| `eslint-plugin` |    **No**     |    **No**    |     Yes     | Add `exports` + `module` |
| `linter-gen`    |    **No**     |    **No**    |     Yes     | Add `exports` + `module` |
| `mcp-server`    |    **No**     |    **No**    |     Yes     | Add `exports` + `module` |

**Peer dependencies:** Audit and document peer dependency requirements, especially `eslint` for `eslint-plugin` and any Node built-in assumptions.

### Versioning

- Initialize Changesets via `pnpm changeset init` (config directory does not exist yet despite `@changesets/cli` being a devDependency)
- Packages retain current versions (core 0.5.0, cli 1.0.0, etc.)
- Automatic interdependency version bumps

### CI/CD (GitHub Actions)

- **CI workflow** (PR + push to main): install -> build -> typecheck -> lint -> test
- **Release workflow** (manual/tag): build -> publish to npm via changesets
- Node 18, 20, and 22 matrix (22 is current LTS)
- pnpm store caching

### Files to Create

- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `.changeset/config.json`
- Root `package.json` changeset scripts

---

## Section 3: CLI Init Experience

### Init Command Flow

1. Detect existing project (check `package.json`) — if none, prompt for project name
2. Ask adoption level: basic / intermediate / advanced (one-line descriptions each)
   - `base` template is internal scaffolding shared by all levels, not user-facing
   - `nextjs` is offered as a separate framework overlay option after level selection
3. Scaffold from matching template (copy, not symlink)
4. Install dependencies via detected package manager
5. Run initial validation
6. Print "what's next" summary with suggested commands

### Polish Items

- Complete `add` command TODO — add individual skills/personas post-init
- Fix `create-skill` scaffolding to use useful defaults instead of TODO placeholders
- Add `--yes` flag for non-interactive mode
- Add color/formatting to CLI output

### Scope Boundary

Refine existing CLI, not rebuild. The `init` and `add` commands are the two gaps to fill.

---

## Section 4: Test & Build Hygiene

### Build Verification

- `pnpm build` succeeds across all 6 packages, no warnings
- `pnpm typecheck` passes with strict mode
- `pnpm lint` and `pnpm format:check` pass with zero issues

### Test Cleanup

- Full test suite passes (all 116 test files)
- Remove or document any skipped/pending tests

### Code Cleanup

- Resolve ~11 TODO/FIXME items (implement or convert to GitHub issues)
- Remove any debugging console.log statements
- Verify all package exports are correct and importable

### Repo Hygiene

- GitHub issue templates (bug report, feature request)
- `.github/PULL_REQUEST_TEMPLATE.md`
- `SECURITY.md` — security reporting policy with contact email
- `CODE_OF_CONDUCT.md` — standard Contributor Covenant
- Verify `.gitignore` coverage
- Verify `turbo.json` pipeline config and caching are correct for CI
- Add root `CHANGELOG.md` (managed by changesets going forward)

---

## Implementation Order

Build/test hygiene is a prerequisite for CI/CD (a red build can't have a green CI workflow), so it runs first in parallel with docs:

1. **Section 4 + Section 1 (parallel)** — Test/build hygiene + documentation polish. These are independent and can proceed simultaneously.
2. **Section 2** — npm publishing + CI/CD. Requires green builds (Section 4) and benefits from polished docs (Section 1).
3. **Section 3** — CLI init experience. Benefits from publishable packages (Section 2).

---

## Acceptance Criteria

### Section 1: README & Documentation

- [ ] README renders correctly on GitHub with all sections present
- [ ] Getting-started guide walks a user from zero to working project in under 5 minutes
- [ ] No TODO placeholders remain in user-facing documentation

### Section 2: npm Publishing & CI/CD

- [ ] All 6 packages install cleanly from npm via `pnpm add @harness-engineering/<pkg>`
- [ ] CI workflow runs green on a PR to main
- [ ] Release workflow successfully publishes to npm (dry-run verified)

### Section 3: CLI Init

- [ ] `npx @harness-engineering/cli init` scaffolds a working project for each adoption level
- [ ] `--yes` flag produces a working project with no prompts
- [ ] `add` command successfully adds a skill to an existing project

### Section 4: Test & Build Hygiene

- [ ] `pnpm build && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test` all pass with zero errors
- [ ] No TODO/FIXME items remain in source (resolved or converted to GitHub issues)
- [ ] All repo hygiene files present: issue templates, PR template, SECURITY.md, CODE_OF_CONDUCT.md, CHANGELOG.md
