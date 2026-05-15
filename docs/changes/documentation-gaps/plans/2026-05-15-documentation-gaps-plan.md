# Plan: Fix Documentation Gaps from Release Readiness Audit

**Date:** 2026-05-15 | **Tasks:** 6 | **Time:** ~25 min | **Integration Tier:** medium

## Goal

Fill all documentation gaps identified by the release readiness audit and knowledge pipeline: missing API reference pages, undocumented ESLint rule, and empty knowledge domains.

## Observable Truths (Acceptance Criteria)

1. `docs/api/intelligence.md` exists with version, installation, architecture, and API reference sections
2. `docs/api/dashboard.md` exists with version, installation, pages, API routes, and architecture sections
3. Links from `docs/api/index.md` to `intelligence.md` and `dashboard.md` resolve correctly
4. `docs/reference/eslint-rules.md` contains a `### no-process-env-in-spawn` section with description, rationale, examples, and configuration
5. `docs/knowledge/intelligence/provider-architecture.md` exists with frontmatter and content on multi-provider setup
6. `docs/knowledge/intelligence/failure-modes.md` exists with frontmatter and content on degradation behavior
7. `docs/knowledge/skills/skill-authoring.md` exists with frontmatter and content on skill format, schema, cognitive modes
8. `docs/knowledge/skills/skill-lifecycle.md` exists with frontmatter and content on discovery, activation, dispatch
9. `docs/knowledge/testing/strategy.md` exists with frontmatter and content on test patterns
10. VitePress builds without errors (`pnpm docs:build`)

## File Map

```
CREATE  docs/api/intelligence.md
CREATE  docs/api/dashboard.md
MODIFY  docs/reference/eslint-rules.md
CREATE  docs/knowledge/intelligence/provider-architecture.md
CREATE  docs/knowledge/intelligence/failure-modes.md
CREATE  docs/knowledge/skills/skill-authoring.md
CREATE  docs/knowledge/skills/skill-lifecycle.md
CREATE  docs/knowledge/testing/strategy.md
```

## Tasks

### Task 1: Create docs/api/intelligence.md

**Depends on:** none | **Files:** `docs/api/intelligence.md`

1. Create `docs/api/intelligence.md` following the structure of existing API docs (core.md, graph.md):
   - H1 with package name
   - Version from `packages/intelligence/package.json` (0.2.2)
   - Installation section
   - Architecture diagram (reuse from `packages/intelligence/README.md`)
   - Quick Start code example
   - Layer descriptions (SEL, CML, PESL)
   - API Reference tables (Pipeline, Adapters, Types, Effectiveness, Specialization, Analysis)
   - Dependencies section
   - Source: derive content from `packages/intelligence/README.md` which already has comprehensive documentation
2. Verify link from `docs/api/index.md` resolves (file exists at expected path)
3. Commit: `docs(api): add intelligence package API reference`

### Task 2: Create docs/api/dashboard.md

**Depends on:** none | **Files:** `docs/api/dashboard.md`

1. Create `docs/api/dashboard.md` following the API doc structure:
   - H1 with package name
   - Version from `packages/dashboard/package.json` (0.6.1)
   - Installation / Quick Start (CLI: `harness dashboard`)
   - Pages table (10 pages with routes and descriptions — from `packages/dashboard/README.md`)
   - API routes section (12 routers from `packages/dashboard/src/server/index.ts`)
   - Architecture section (React + Hono + SSE, client/server split)
   - Source: derive from `packages/dashboard/README.md`
2. Verify link from `docs/api/index.md` resolves
3. Commit: `docs(api): add dashboard package API reference`

### Task 3: Add no-process-env-in-spawn to ESLint rules reference

**Depends on:** none | **Files:** `docs/reference/eslint-rules.md`

1. Add a `### no-process-env-in-spawn` section after the existing `require-path-normalization` section in `docs/reference/eslint-rules.md`:
   - **Category:** Security
   - **Description:** Disallow passing `process.env` directly to `spawn`/`execFile`/`fork`, which leaks all server-side secrets to child processes
   - **Rationale:** When `process.env` is passed directly, the child process inherits every environment variable including API keys, database credentials, and secrets. Build an explicit env object with only needed variables.
   - **Examples:** Bad (`spawn('cmd', [], { env: process.env })`), Good (`spawn('cmd', [], { env: { PATH: process.env.PATH, NODE_ENV: process.env.NODE_ENV } })`)
   - **Affected functions:** `spawn`, `spawnSync`, `execFile`, `execFileSync`, `fork`
   - **Default severity:** `error` in both `recommended` and `strict`
   - Source: `packages/eslint-plugin/src/rules/no-process-env-in-spawn.ts`
2. Add the rule to the quick-reference table at the top of the file (line ~520 area, after `require-path-normalization`)
3. Commit: `docs(eslint): add no-process-env-in-spawn rule reference`

### Task 4: Expand intelligence knowledge docs (2 new files)

**Depends on:** none | **Files:** `docs/knowledge/intelligence/provider-architecture.md`, `docs/knowledge/intelligence/failure-modes.md`

1. Create `docs/knowledge/intelligence/provider-architecture.md`:

   ```yaml
   ---
   type: business_concept
   domain: intelligence
   tags: [intelligence, providers, anthropic, openai, local-model, analysis]
   ---
   ```

   Content: Multi-provider architecture (Anthropic, OpenAI, local LLM), how AnalysisProvider interface abstracts providers, model override per-layer (SEL/PESL), configuration in `harness.config.json`, connection sharing with orchestrator backend.
   Source: `packages/intelligence/README.md` Configuration section + `packages/intelligence/src/analysis-provider/`

2. Create `docs/knowledge/intelligence/failure-modes.md`:

   ```yaml
   ---
   type: business_concept
   domain: intelligence
   tags: [intelligence, failure, degradation, fallback, error-handling]
   ---
   ```

   Content: What happens when LLM is unavailable (pipeline skipped), when graph is empty (reduced CML accuracy), when simulation confidence is low (abort + escalate), timeout handling, failure cache TTL, tier-based graceful degradation.
   Source: `packages/intelligence/README.md` Tier-Based Behavior table + orchestrator integration docs

3. Commit: `docs(knowledge): expand intelligence domain with provider and failure docs`

### Task 5: Create skills knowledge domain (2 new files)

**Depends on:** none | **Files:** `docs/knowledge/skills/skill-authoring.md`, `docs/knowledge/skills/skill-lifecycle.md`

1. Create directory `docs/knowledge/skills/`

2. Create `docs/knowledge/skills/skill-authoring.md`:

   ```yaml
   ---
   type: business_concept
   domain: skills
   tags: [skills, authoring, schema, cognitive-modes, yaml, skill-format]
   ---
   ```

   Content: SKILL.md format (sections: When to Use, Process, Iron Law, Phases, Gates, Escalation, Examples, Rationalizations), skill.yaml schema (name, version, stability, cognitive_mode, triggers, platforms, tools, phases, state, depends_on), cognitive modes (6 standard modes), tier system (Tier 1 workflow, Tier 2 maintenance, Tier 3 domain), rigid vs flexible type.
   Source: `agents/skills/claude-code/harness-brainstorming/skill.yaml` as exemplar + `packages/cli/src/skill/schema.ts`

3. Create `docs/knowledge/skills/skill-lifecycle.md`:

   ```yaml
   ---
   type: business_process
   domain: skills
   tags: [skills, lifecycle, dispatch, discovery, activation, recommendation]
   ---
   ```

   Content: How skills are discovered (index built from `agents/skills/` tree), how dispatch works (CLI `skill run`, MCP `run_skill`, slash command routing), how recommendations work (health snapshot → rule matching → weighted scoring → topological sort), skill-to-skill transitions (brainstorming → planning → execution → verification → review), platform differences (claude-code vs cursor vs gemini-cli vs codex).
   Source: `packages/core/src/state/` skill recommendation engine + `packages/cli/src/skill/`

4. Commit: `docs(knowledge): create skills domain with authoring and lifecycle docs`

### Task 6: Create testing strategy doc + VitePress build verification

**Depends on:** Tasks 1-5 | **Files:** `docs/knowledge/testing/strategy.md`

1. Create directory `docs/knowledge/testing/`

2. Create `docs/knowledge/testing/strategy.md`:

   ```yaml
   ---
   type: business_concept
   domain: testing
   tags: [testing, vitest, coverage, strategy, isolation, fixtures]
   ---
   ```

   Content: Testing stack (Vitest, co-located in `tests/` directories), coverage enforcement (coverage ratchet with V8 variance tolerance), test organization by package (788 test files, 13,304 tests), key patterns (temp directories for git tests, `mkdtempSync` for isolation, `afterEach` cleanup), monorepo testing (turbo run test, per-package vitest.config.mts), coverage baselines (coverage-baselines.json, `--update` flag), pre-commit (eslint + prettier + harness validate), pre-push (format:check + typecheck + test:ci + coverage-ratchet).
   Source: `packages/core/vitest.config.mts`, `scripts/coverage-ratchet.mjs`, `.husky/pre-commit`, `.husky/pre-push`

3. Run `pnpm docs:build` to verify VitePress builds with all new pages
4. Commit: `docs(knowledge): create testing strategy doc`

## Sequencing

Tasks 1-5 are independent and can be executed in parallel. Task 6 depends on all others (VitePress build verification covers all new files).

```
Task 1 ─┐
Task 2 ─┤
Task 3 ─┼──→ Task 6 (build verification)
Task 4 ─┤
Task 5 ─┘
```

**Estimated total:** 6 tasks, ~25 minutes.
