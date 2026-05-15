# Changelog

## 0.26.0

### Minor Changes

- 56176cd: feat(compliance): branch naming convention and `harness verify` command (closes #319)

  Adds a project-wide branch naming convention with optional `harness.config.json`
  override under `compliance.branching`, and a `harness verify` command that
  checks the current branch against the convention.
  - **Core:** New `validateBranchName` export from `@harness-engineering/core`
    with `BranchingConfig` type. Enforces prefix list, strict kebab-case slugs
    (no leading/trailing or doubled hyphens), optional ticket-ID pattern
    (`feat/PROJ-123-desc`), slug length cap, and ignore globs for long-lived
    branches.
  - **CLI:** New `harness verify` command. Works without a `harness.config.json`
    by falling back to schema defaults. Supports `--branch <name>` and reads
    `HARNESS_BRANCH` / `GITHUB_HEAD_REF` / `CI_COMMIT_REF_NAME` /
    `BUILDKITE_BRANCH` so CI runners in detached-HEAD state can still verify
    the PR source branch. `--json` emits a machine-readable result.
  - **Config:** Adds `compliance.branching` to `HarnessConfigSchema` with
    fields `prefixes`, `enforceKebabCase`, `customRegex`, `ignore`, and
    `maxLength` (default 60; set to 0 to disable). Defaults declared in the
    schema are the single source of truth.

  Defaults: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`; ignore
  `main`, `release/**`, `dependabot/**`, `harness/**`. `customRegex` is a full
  override -- when set, the prefix, kebab-case, and length checks are bypassed.

### Patch Changes

- bed30c4: fix(deps): bump `@typescript-eslint/typescript-estree` to `^8.29.0` (closes #318)

  The bundled `@typescript-eslint/typescript-estree@7.18.0` capped supported
  TypeScript at `<5.6.0`, so every CLI invocation that parsed TS on a modern
  TypeScript (5.6+ / 6.x) emitted a noisy "you are running a version of
  TypeScript which is not officially supported" warning to stderr. The warning
  cluttered CI logs and hook output and falsely implied a project misconfig.

  Bumps both `@harness-engineering/cli` and `@harness-engineering/core` to
  `^8.29.0`. The 8.x line supports TS 5.6+ and has experimental support for
  newer versions; parser behavior for valid TS is unchanged.

## 0.25.0

### Minor Changes

- 38fa742: fix(dashboard,orchestrator): surface `err.cause` in proxy 502s and reject WHATWG bad ports at startup (#287)

  The dashboard proxy was returning opaque `Orchestrator proxy error: fetch failed` 502s for every request when the orchestrator listened on a port the WHATWG fetch spec marks as "bad" (e.g. `10080`, `6000`, `6666`). `curl` does not enforce the bad-ports list, so the port appeared reachable from the shell — turning a one-line config fix into a multi-hour goose chase (see issue #287).

  **`@harness-engineering/core`:**
  - New `shared/port.ts` exports `WHATWG_BAD_PORTS` (frozen canonical list from [the fetch spec](https://fetch.spec.whatwg.org/#port-blocking)), `isBadPort(port)`, and `assertPortUsable(port, label?)`. `assertPortUsable` throws a clear, actionable error directing the user to choose a different port and linking the spec.

  **`@harness-engineering/dashboard`:**
  - `orchestrator-proxy.ts`: extracted `formatProxyErrorMessage(err)` that surfaces `err.cause.message` / `err.cause.code` alongside the base message. A `fetch failed` from a bad port now reads `Orchestrator proxy error: fetch failed (cause: bad port)`; `ECONNREFUSED`, `ENOTFOUND`, etc. are visible the same way.
  - `getOrchestratorTarget()` logs a one-time `console.error` at resolution time if the configured target port is on the bad-ports list, so the failure mode is announced at startup rather than only per-request.
  - `serve.ts`: calls `assertPortUsable(port, 'dashboard API')` before `serve()` so the dashboard refuses to start on an unreachable port.

  **`@harness-engineering/orchestrator`:**
  - `server/http.ts#start()`: calls `assertPortUsable(this.port, 'orchestrator')` before `httpServer.listen()` so the orchestrator refuses to start on a bad port. The `harness orchestrator start` flow now fails loudly with a clear message instead of starting, appearing healthy to `curl`, and silently breaking every dashboard request.

### Patch Changes

- bb7658b: fix(graph/ingest): materialize general Markdown as `document` nodes (#302); consolidate skip-dir usage across walkers and glob excludes

  **`@harness-engineering/graph`:**
  - Issue #302 — `KnowledgeIngestor.ingestAll()` only ran `ingestADRs`, `ingestLearnings`, and `ingestFailures`. Top-level `README.md`/`AGENTS.md` and `docs/**/*.md` (non-ADR) were silently skipped, so no `document` nodes existed and no `documents` edges were created for general docs. The `detect-doc-drift` skill's graph-enhanced traversal was a no-op on any project without a `docs/adr/` directory.
  - New `KnowledgeIngestor.ingestGeneralDocs(projectPath)` materializes `document` nodes for top-level `*.md` (non-recursive) and `docs/**/*.md` (recursive), skipping subdirs owned by sibling ingestors (`docs/adr` → `ingestADRs`, `docs/knowledge` → `BusinessKnowledgeIngestor`, `docs/changes` → `RequirementIngestor`, `docs/solutions` → solutions pipeline). Node id format: `doc:<rel-path>`. Title parsed from the first H1, falling back to the filename. Runs `linkToCode(content, nodeId, 'documents')` so mentioned code symbols get `documents` edges automatically. Wired into `ingestAll()`, so both the MCP `ingest_source` (knowledge|all) handler and the CLI `harness ingest --source knowledge` path benefit without further changes.
  - New `skipDirGlobs(skipDirs?)` helper exported from `@harness-engineering/graph`. Converts a skip-dirs set (default: `DEFAULT_SKIP_DIRS`) into minimatch glob patterns of the form `**/<name>/**`. Use this for tools that exclude via globs (security scan, doc coverage, entropy snapshot) instead of by reading directory names during traversal — the previously hand-maintained `['**/node_modules/**', '**/dist/**']` mini-lists across packages now derive from the canonical 60+ entry set automatically.
  - Consolidated all hand-rolled skip-dir lists inside the graph package around `DEFAULT_SKIP_DIRS`: `KnowledgeIngestor.findMarkdownFiles`, `BusinessKnowledgeIngestor.findMarkdownFiles` (the byte-identical twin of the #302 bug), `DiagramParser.findDiagramFiles`, `ExtractionRunner.walkSources`. Each picks up the full coverage from #274 (Python `__pycache__`/`.venv`, JS framework caches `.next`/`.turbo`/`.vite`, AI agent sandboxes `.claude`/`.cursor`/`.codex`, etc.) for free, and any future addition to `DEFAULT_SKIP_DIRS` propagates everywhere.

  **`@harness-engineering/core`:**
  - `architecture/collectors/module-size.ts` and `architecture/collectors/dep-depth.ts`: `isSkippedEntry` now combines `name.startsWith('.')` with `DEFAULT_SKIP_DIRS.has(name)`. Preserves the existing broad dotfile heuristic and adds curated non-dotfile names (`vendor`, `out`, `target`, `build`, `coverage`, etc.).
  - `entropy/detectors/size-budget.ts:dirSize`: skip-set widened from `{node_modules, .git}` to the full `DEFAULT_SKIP_DIRS`. Size budgets now exclude `dist`, `build`, `.turbo`, etc., matching intent.
  - `performance/critical-path.ts`: source-file walker uses `DEFAULT_SKIP_DIRS`.
  - `security/types.ts:DEFAULT_SECURITY_CONFIG.exclude` and `security/config.ts:SecurityConfigSchema.exclude`: default exclude list is now `[...skipDirGlobs(), '**/*.test.ts', '**/fixtures/**']` — file-type/fixture filters preserved, dir-skip portion derives from the canonical set.
  - `ci/check-orchestrator.ts`: same treatment for the two `excludePatterns` defaults (doc-coverage fallback and security-scan ignore fallback).
  - `entropy/snapshot.ts`: `excludePatterns` fallback now derives from `skipDirGlobs()`. Also corrects a latent bug — the previous `'node_modules/**'` (no leading `**/`) only matched top-level `node_modules`, missing nested ones in monorepos.

  **`@harness-engineering/cli`:**
  - `commands/migrate.ts:walk`: skip-set uses `DEFAULT_SKIP_DIRS`.
  - `commands/install.ts`: skill-scan walker combines `startsWith('.')` with `DEFAULT_SKIP_DIRS.has(name)`.
  - `config/schema.ts:EntropyConfigSchema.excludePatterns`: default is now `[...skipDirGlobs(), '**/*.test.ts']`.

  **Tests:**
  - New `general docs ingestion (issue #302)` block in `packages/graph/tests/ingest/KnowledgeIngestor.test.ts`: 5 cases covering top-level README/AGENTS creation, `documents`-edge linking to mentioned code symbols, ADR non-duplication, ownership-aware subdir skipping (`docs/{adr,knowledge,changes,solutions}`), and `.harness/*.md` exclusion. Revert-and-fail check confirms 3 of the 5 fail without the fix; the remaining 2 guard against future over-ingestion.
  - Updated `packages/cli/tests/commands/install.test.ts` `child_process` mock to use `importOriginal()` partial pattern so transitively-loaded code from `@harness-engineering/graph` resolves correctly.

- Updated dependencies [bb7658b]
  - @harness-engineering/graph@0.9.0

## 0.24.0

### Minor Changes

- 287ca16: feat(roadmap): tracker-only roadmap mode (file-less)

  Adds opt-in file-less roadmap mode where the configured external tracker is canonical, eliminating `docs/roadmap.md` as a multi-session conflict surface. See [`docs/changes/roadmap-tracker-only/proposal.md`](https://github.com/Intense-Visions/harness-engineering/blob/main/docs/changes/roadmap-tracker-only/proposal.md) and ADRs 0008–0010.

  **`@harness-engineering/core`:**
  - New `packages/core/src/roadmap/tracker/` submodule: `IssueTrackerClient` interface lifted from orchestrator, `createTrackerClient(config)` factory, body-metadata block parser/serializer, ETag store with LRU eviction, conflict-detection policy, and `GitHubIssuesTrackerAdapter` for file-less mode.
  - New `packages/core/src/roadmap/mode.ts` with `getRoadmapMode(config)` helper.
  - New `packages/core/src/roadmap/load-tracker-client-config.ts` (canonical home for tracker-config loading; replaces three duplicates in cli/dashboard/orchestrator).
  - New `packages/core/src/roadmap/migrate/` namespace: body-diff, history-event hashing, plan-builder, idempotent runner.
  - New `packages/core/src/validation/roadmap-mode.ts` with `validateRoadmapMode` enforcing `ROADMAP_MODE_MISSING_TRACKER` and `ROADMAP_MODE_FILE_PRESENT`.
  - New `scoreRoadmapCandidatesFileLess` in `packages/core/src/roadmap/pilot-scoring.ts` (priority + createdAt sort, deliberate D4 semantic break).
  - Config schema: `roadmap.mode: "file-backed" | "file-less"` (optional, defaults to `"file-backed"`).
  - Fixes pre-existing `TS2322` in `packages/core/src/roadmap/tracker/adapters/github-issues.ts` (`updateInternal` return shape) and `TS2379` in `packages/cli/src/commands/validate.ts` (call site against `RoadmapModeValidationConfig` widened to accept `undefined`).

  **`@harness-engineering/orchestrator`:**
  - New tracker kind `tracker.kind: "github-issues"` in workflow config selects `GitHubIssuesTrackerAdapter` (see ADR 0010 for the kind-schema decoupling rationale vs `roadmap.tracker.kind: "github"`).
  - `createTracker()` dispatches on `tracker.kind`; the Phase 4 stub at orchestrator constructor is removed.
  - Roadmap-status (S5) and roadmap-append (S6) endpoints translate `ConflictError` to HTTP `409 TRACKER_CONFLICT` shape; React surface lands in a follow-up.

  **`@harness-engineering/cli`:**
  - New `harness roadmap` command group with `harness roadmap migrate --to=file-less [--dry-run]` subcommand. One-shot, dry-run-capable, idempotent migration that creates GitHub issues for unmigrated features, writes body metadata blocks, posts deduplicated history comments, archives `docs/roadmap.md`, and flips `roadmap.mode`.
  - `manage_roadmap` MCP tool is mode-aware: in file-less mode, dispatches through `IssueTrackerClient` instead of touching `docs/roadmap.md`.
  - `harness validate` runs the two new cross-cutting rules `ROADMAP_MODE_MISSING_TRACKER` and `ROADMAP_MODE_FILE_PRESENT`.

  **Documentation:**
  - Three ADRs added under `docs/knowledge/decisions/`: 0008 (tracker abstraction in core), 0009 (audit history as issue comments), 0010 (`tracker.kind` schema decoupling).
  - New knowledge domain `docs/knowledge/roadmap/` with three entries: `file-less-roadmap-mode` (business_concept), `tracker-as-source-of-truth` (business_rule), `roadmap-migration-to-file-less` (business_process).
  - `docs/guides/roadmap-sync.md` gains a `## File-less mode` section.
  - `docs/reference/configuration.md`, `docs/reference/cli-commands.md`, `docs/reference/mcp-tools.md`, and `AGENTS.md` updated.
  - Migration walkthrough at `docs/changes/roadmap-tracker-only/migration.md` (shipped in Phase 5).
  - Proposal §F2 wording reworded to "best-effort detection" per Phase 2 D-P2-B.

## 0.23.8

### Patch Changes

- ba8da2e: fix(core, cli): preserve tracked categories on `check-arch --update-baseline` (#268)

  `harness check-arch --update-baseline` rewrote `.harness/arch/baselines.json` from scratch using only the categories present in the current `runAll()` output. Any tracked category that the run did not emit — for example because a collector silently returned `[]` after a transient failure or a filtered run — was permanently dropped from the baseline. Combined with the `.husky/pre-commit` hook that auto-stages the regenerated file, this could erase tracked `complexity`, `layer-violations`, and `circular-deps` allowlists in a normal commit without surfacing as a diff worth reviewing.

  **`@harness-engineering/core`:**
  - `packages/core/src/architecture/baseline-manager.ts` — adds `ArchBaselineManager.update(results, commitHash)`. It captures fresh metrics, merges them onto the on-disk baseline (categories present in `results` overwrite, categories absent are preserved), and saves atomically. This mirrors the merge-on-write pattern already used by `packages/core/src/performance/baseline-manager.ts :: BaselineManager.save`.
  - `capture()` and `save()` keep their existing pure / overwrite-only contracts.

  **`@harness-engineering/cli`:**
  - `packages/cli/src/commands/check-arch.ts` — the `--update-baseline` branch now calls `manager.update(results, commitHash)` instead of `manager.capture(results, commitHash)` followed by `manager.save(baseline)`. No CLI surface changes.

  **Tests:**
  - `packages/core/tests/architecture/baseline-manager.test.ts` — three new cases under `describe('update()')`: preserves existing categories when results omit them (the literal #268 reproduction), overwrites categories present in both, writes a fresh baseline when none exists. Each was verified to fail when `update()` is reverted to plain `capture()`+`save()`.
  - `packages/cli/tests/commands/check-arch.test.ts` — adds an integration smoke test that pre-seeds all seven categories and asserts every category is still present after `--update-baseline`, guarding against future regressions in the wiring.

- 54d9494: fix(core): resolve `.js` imports to `.ts`/`.jsx` source files (#279)

  Three resolvers in `packages/core` (dead-code reachability, dependency-graph construction, review-context scoping) silently dropped edges when an import specifier wrote a runtime extension different from the on-disk source extension. On TS NodeNext / "Bundler" projects this caused ~75% false-positive dead-code findings; the same bug class affects Babel/webpack JSX projects (`./Foo.js` → `Foo.jsx`).

  **`@harness-engineering/core`:**
  - `packages/core/src/entropy/detectors/dead-code.ts :: resolveImportToFile` — was the proximate cause of the reported symptom. Appended `.ts` to a `.js` path producing non-existent `foo.js.ts` lookups; now strips the JS-style extension and tries each TS/JSX equivalent before falling back.
  - `packages/core/src/constraints/dependencies.ts :: resolveImportPath` — `hasKnownExt` flat-union accepted `.js` as already-resolved, so dependency-graph edges pointed to non-existent nodes. Now async; verifies file existence before returning. The previous `fromLang === 'typescript'` gate was dropped — Babel/JSX projects need the same swap.
  - `packages/core/src/review/context-scoper.ts :: resolveImportPath` — candidate list never tried stripping `.js` first; now does, with `index.{ts,tsx,jsx}` directory fallbacks.
  - New shared `JS_EXT_FALLBACKS` map (`.js → [.ts, .tsx, .jsx]`, `.jsx → [.tsx]`, `.mjs → [.mts]`, `.cjs → [.cts]`) covers both real-world conventions: TS NodeNext and Babel/webpack JSX.

  **`@harness-engineering/cli`:**
  - `harness cleanup --type dead-code` no longer flags files imported via NodeNext-style `.js` extensions (or Babel-style `.js → .jsx`) as dead. Symptom regression on this monorepo: total findings **1480 → 1016 (-31%)**, dead files **394 → 185 (-53%)**.
  - Downstream commands that consume the dependency graph (`harness fix-drift`, `harness check-perf` coupling/fan-in, `harness knowledge-pipeline`) now see complete edges for `.js`-imported files.

  **Tests:**
  - `packages/core/tests/entropy/detectors/dead-code.test.ts` — 4 NodeNext cases (file, subdirectory, folder-index, full-report).
  - `packages/core/tests/constraints/dependencies.test.ts` — TS NodeNext + Babel JSX cases via `buildDependencyGraph`.
  - `packages/core/tests/review/context-scoper.test.ts` — TS NodeNext + Babel JSX cases via `scopeContext` import fallback.
  - New fixtures under `packages/core/tests/fixtures/{entropy/dead-code-nodenext,nodenext-imports,jsx-imports}/`.
  - Each new test was verified to fail when the corresponding source fix is reverted.

- a1df67e: fix(core, cli): track `.harness/hooks/` and `.harness/security/timeline.json` by default (#270)

  Two pieces of harness state are team-shared but were ignored by the `.harness/.gitignore` that `harness init` scaffolds, so a fresh clone ran without policy enforcement and with no shared security-trend history until someone re-ran `harness init`:
  - **`.harness/hooks/`** — the per-profile policy scripts (`block-no-verify.js`, `protect-config.js`, `quality-gate.js`, `pre-compact-state.js`, `adoption-tracker.js`, `telemetry-reporter.js`, plus `profile.json` for `standard`; `cost-tracker.js`, `sentinel-pre.js`, `sentinel-post.js` add for `strict`). Treat the directory like a tracked lockfile: review CLI-upgrade diffs.
  - **`.harness/security/timeline.json`** — append-only security trend ledger keyed by commit hash. Tracking it surfaces score deltas in PR diffs and gives `findingLifecycles` a real audit trail.

  **`@harness-engineering/cli`:**
  - `packages/cli/src/templates/post-write.ts` — `ensureHarnessGitignore` no longer emits `hooks/`, and replaces `security/` with `security/*` + `!security/timeline.json`.
  - `packages/cli/tests/templates/post-write.test.ts` — adds two assertions that pin the new semantics so future edits cannot silently revert them.

  **`@harness-engineering/core`:**

  `security/timeline.json` was not actually share-safe before this change: `findingLifecycles[].file` stored whatever path the scanner emitted, which is absolute (`packages/cli/src/commands/check-security.ts:90` globs with `absolute: true`). Committing it would have leaked every developer's home-directory username and produced near-guaranteed merge conflicts whenever two developers scanned. The CLI default flip is paired with a normalization fix at the timeline boundary:
  - `packages/core/src/security/security-timeline-manager.ts` — `capture()` and `updateLifecycles()` now relativize `finding.file` against `rootDir` before computing `findingId` and persisting, so IDs are rootDir-independent (two clones agree). Paths that escape `rootDir` (relative starts with `..`) are passed through unchanged so we never silently misattribute findings outside the project.
  - `load()` migrates legacy absolute paths under `rootDir` to repo-relative form on first read and re-saves the file. One-shot fixup; subsequent reads are no-ops.
  - `packages/core/tests/security/security-timeline-manager.test.ts` — six new cases under `describe('path normalization (issue #270)')` covering: absolute→relative on write, no-double-strip on already-relative, rootDir-independent IDs across two managers, escape-paths preserved, on-load migration with re-save, and no-op when paths are already clean.

  **Repo dogfood:**
  - `.gitignore`, `.harness/.gitignore`, `packages/cli/.harness/.gitignore` — flipped to the new template form.
  - `.harness/security/timeline.json`, `packages/cli/.harness/security/timeline.json` — migrated from absolute to relative paths and now tracked.
  - `.harness/hooks/` — now tracked (7 standard-profile entries).

## 0.23.7

### Patch Changes

- Updated dependencies
  - @harness-engineering/graph@0.8.0

## 0.23.6

### Patch Changes

- Updated dependencies [8825aee]
- Updated dependencies [8825aee]
  - @harness-engineering/types@0.11.0

## 0.23.5

### Patch Changes

- Updated dependencies [18412eb]
  - @harness-engineering/graph@0.7.1

## 0.23.4

### Patch Changes

- Updated dependencies [3bfe4e4]
  - @harness-engineering/graph@0.7.0

## 0.23.3

### Patch Changes

- Updated dependencies
  - @harness-engineering/graph@0.6.0

## 0.23.2

### Patch Changes

- f62d6ab: Supply chain audit — fix HIGH vulnerability, bump dependencies, migrate openai to v6
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
  - @harness-engineering/graph@0.5.0
  - @harness-engineering/types@0.10.1

## 0.23.1

### Patch Changes

- chore: auto-generate `src/index.ts` barrel via `scripts/generate-core-barrel.mjs` with `--check` mode for CI staleness detection. New modules with `index.ts` are auto-discovered; selective exports are maintained inline in the script.

## 0.23.0

### Minor Changes

- feat(review): enhance trust scoring with graph enrichment and exported constants
- fix(telemetry): use `distinct_id` (snake_case) for PostHog batch API

  PostHog requires `distinct_id` but the code sent `distinctId` (camelCase), causing all telemetry events to be silently rejected with HTTP 400. Added identity fallbacks from `harness.config.json` name and `git config user.name`. Added `harness telemetry test` command for verifying PostHog connectivity.

### Patch Changes

- fix(ci): cross-platform CI fixes for Windows test timeouts and coverage scripts
- Updated dependencies
- Updated dependencies
  - @harness-engineering/types@0.10.0

## 0.22.0

### Minor Changes

- f1bc300: Add `harness validate --agent-configs` for hybrid agent-config validation.
  - Preferred path shells out to the [agnix](https://github.com/agent-sh/agnix) binary when it
    is installed (385+ rules across CLAUDE.md, hooks, agents, skills, MCP).
  - When agnix is unavailable (or disabled via `HARNESS_AGNIX_DISABLE=1`), the command runs a
    built-in TypeScript fallback rule set (`HARNESS-AC-*`) covering broken agents, invalid
    hooks, unreachable skills, oversize CLAUDE.md, malformed MCP entries, persona references,
    and `.agnix.toml` sanity.
  - `harness init` now ships a default `.agnix.toml` so the agnix path works with no extra
    configuration.
  - Supports `--strict`, `--agnix-bin`, `--json`, and `HARNESS_AGNIX_BIN` env override.

### Patch Changes

- Harden orchestrator, rate limiter, and container security defaults.

  **@harness-engineering/orchestrator:**
  - Extract PR detection from `Orchestrator` into standalone `PRDetector` module
  - Fix rate-limiter stack overflow risk by replacing `Math.min(...spread)` with `reduce`
  - Ensure rate limit delays are always >= 1ms
  - Default container network to `none` and block privileged Docker flags
  - Fix stale claim detection: missing timestamp now treated as stale
  - Fix scheduler to only record `lastRunMinute` on task success
  - Add error handling for `ensureBranch`/`ensurePR`/agent dispatch in task-runner
  - Add resilient `rebase --abort` recovery in pr-manager

  **@harness-engineering/core:**
  - Fix `contextBudget` edge cases (zero total tokens, zero `originalSum` during redistribution)
  - Parse `npm audit` stdout on non-zero exit in `SecurityTimelineManager`
  - Add security rule tests (crypto, deserialization, express, go, network, node, path-traversal, react, xss)

  **@harness-engineering/cli:**
  - Break `StepResult` type cycle between `setup.ts` and `telemetry-wizard.ts` via `setup-types.ts`

## 0.21.4

### Patch Changes

- 802a1dd: Fix `search_skills` returning irrelevant results and compaction destroying skill content.
  - Index all non-internal skills regardless of tier so the router can discover Tier 1/2 skills
  - Add minimum score threshold (0.25) to filter noise from incidental substring matches
  - Fix `resultToMcpResponse` double-wrapping strings with `JSON.stringify`, which collapsed newlines and caused truncation to drop all content
  - Truncate long lines to fit budget instead of silently skipping them; cap marker cost at 50% of budget
  - Exempt 12 tools from lossy truncation (run_skill, emit_interaction, manage_state, etc.) — use structural-only compaction for tools whose output must arrive complete

## 0.21.3

### Patch Changes

- Sync VERSION constant to match package.json
- Document adoption, compaction, caching, and telemetry modules in API reference
- Updated dependencies
  - @harness-engineering/types@0.9.2

## 0.21.2

### Patch Changes

- Reduce Tier 2 structural violations and fix exactOptionalPropertyTypes errors across core modules
- Updated dependencies
- Updated dependencies
  - @harness-engineering/graph@0.4.2
  - @harness-engineering/types@0.9.1

## 0.21.1

### Patch Changes

- **Fix blocked status corruption** — `syncFromExternal` no longer overrides manually-set `blocked` status with `planned` during external sync. GitHub Issues "open" status mapped to "planned" via `reverseStatusMap`, and `STATUS_RANK` lateral equivalence (both rank 1) allowed the directional guard to pass. Added explicit `blocked → planned` guard in `syncFromExternal`.
- Reduce cyclomatic complexity in `prediction-engine` and `aggregator`
- Remove orphaned `impact-lab-generator` module
- Move misplaced `jsonl-reader.test.ts` from `src/` to `tests/`

## 0.21.0

### Minor Changes

- Fix roadmap sync mass-assignment and duplicate issue creation
  - **Remove auto-assignee from sync** — `syncToExternal` no longer auto-assigns the authenticated user to every unassigned feature. Assignment only happens through the explicit pilot workflow (`assignFeature`).
  - **Title-based dedup** — `syncToExternal` accepts pre-fetched tickets and checks for existing GitHub issues by title before creating new ones. Dedup is restricted to issues with configured labels (e.g., `harness-managed`) and prefers open issues over closed when titles collide.
  - **Dedup-linked issues get updated** — When a feature is linked to an existing issue via dedup, planning fields are synced immediately (not deferred to the next cycle).
  - **Single fetch per fullSync** — `fullSync` now calls `fetchAllTickets` once and passes the result to both `syncToExternal` and `syncFromExternal`, eliminating redundant paginated API calls.

### Patch Changes

- Updated dependencies
  - @harness-engineering/types@0.9.0 — `ExternalTicketState.title` field addition

## 0.19.0

### Minor Changes

- GitHub sync assignee support and auto-population
  - **Push assignee on create** — `createTicket` now includes `assignees` in the GitHub Issues API payload when `feature.assignee` is set.
  - **Push assignee on update** — `updateTicket` sends assignee changes (set or clear) via the `assignees` field on issue PATCH.
  - **Auto-populate assignee** — `syncToExternal` fetches the authenticated user's GitHub login via `GET /user` and sets it as the default assignee for features with no assignee. Cached per adapter instance.
  - **`getAuthenticatedUser()`** — New method on `GitHubIssuesSyncAdapter` that calls `GET /user` and returns `@login` format, cached after first call.

### Patch Changes

- Updated dependencies
  - @harness-engineering/types@0.8.0 — `TrackerSyncAdapter.getAuthenticatedUser()` interface addition

## 0.18.0

### Minor Changes

- GitHub Issues sync adapter: milestones, type labels, and rate limit handling
  - **GitHub milestones** — Roadmap milestones are now created as GitHub milestones. Issues are assigned to their corresponding milestone on both create and update. Milestones are cached per adapter instance to minimize API calls.
  - **Feature type labels** — All synced issues receive a `feature` label on create and update, enabling filtering by issue type.
  - **Milestone on update** — `TrackerSyncAdapter.updateTicket` interface extended with optional `milestone` parameter. Sync engine passes milestone name through on updates.
  - **Rate limit retry** — All API calls retry up to 5 times with exponential backoff and jitter on 403/429 responses. Respects `Retry-After` header when present.
  - **Close done issues on create** — Issues created for `done` features are automatically closed via follow-up PATCH.
  - **Configurable retry** — New `maxRetries` and `baseDelayMs` options on `GitHubAdapterOptions`.

## 0.17.0

### Minor Changes

- Roadmap sync, auto-pick, and assignment
  - **External tracker sync** — Bidirectional sync between roadmap.md and GitHub Issues via `TrackerSyncAdapter` interface. Split authority: roadmap owns planning fields, GitHub owns execution/assignment. Sync fires on every state transition (task-start, task-complete, phase-start, phase-complete, save-handoff, archive_session).
  - **Auto-pick pilot** — New `harness-roadmap-pilot` skill with AI-assisted next-item selection. Two-tier scoring: explicit priority first (P0-P3), then weighted position/dependents/affinity score. Routes to brainstorming (no spec) or autopilot (spec exists).
  - **Assignment with affinity** — Assignee, Priority, and External-ID fields on roadmap features. Assignment history section in roadmap.md enables affinity-based routing. Reassignment produces audit trail (unassigned + assigned records).
  - **New types** — `Priority`, `AssignmentRecord`, `ExternalTicket`, `ExternalTicketState`, `SyncResult`, `TrackerSyncConfig` in @harness-engineering/types.
  - **Config schema** — `TrackerConfigSchema` and `RoadmapConfigSchema` added to `HarnessConfigSchema` for validated tracker configuration.

### Patch Changes

- Updated dependencies
  - @harness-engineering/types@0.7.0
  - @harness-engineering/graph@0.3.5

## 0.16.0

### Minor Changes

- Multi-platform MCP expansion, security hardening, and release readiness fixes

  **@harness-engineering/cli (minor):**
  - Multi-platform MCP support: add Codex CLI and Cursor to `harness setup-mcp`, `harness setup`, and slash command generation
  - Cursor tool picker with `--pick` and `--yes` flags using `@clack/prompts` for interactive tool selection
  - TOML MCP entry writer for Codex `.codex/config.toml` integration
  - Sentinel prompt injection defense hooks (`sentinel-pre`, `sentinel-post`) added to hook profiles
  - `--tools` variadic option for `harness mcp` command
  - Fix lint errors in hooks (no-misleading-character-class, unused imports, `any` types)
  - Fix cost-tracker hook field naming (snake_case → camelCase alignment)
  - Fix test gaps: doctor MCP mock, usage fetch mock, profiles/integration hook counts

  **@harness-engineering/core (minor):**
  - Usage module: Claude Code JSONL parser (`parseCCRecords`), daily and session aggregation
  - Security scanner: session-scoped taint state management, `SEC-DEF-*` insecure-defaults rules, `SEC-EDGE-*` sharp-edges rules
  - Security: false-positive verification gate replacing suppression checks, `parseHarnessIgnore` helper
  - Fix lint: eslint-disable for intentional zero-width character regex in injection patterns

  **@harness-engineering/types (minor):**
  - Add `DailyUsage`, `SessionUsage`, `UsageRecord`, and `ModelPricing` types for cost tracking
  - Export aggregate types from types barrel

  **@harness-engineering/orchestrator (patch):**
  - Integrate sentinel config scanning into dispatch pipeline
  - Fix conditional spread for optional line property

### Patch Changes

- Updated dependencies
  - @harness-engineering/types@0.6.0
  - @harness-engineering/graph@0.3.4

## 0.15.0

### Minor Changes

- **Code navigation module** — AST-powered outline extraction, cross-file symbol search, and bounded unfold with tree-sitter parser cache. New `code_outline`, `code_search`, and `code_unfold` MCP tools.
- **Structured event log** — JSONL append-only event timeline with content-hash deduplication, integrated into `gather_context`.
- **Learnings enhancements** — Hash-based content deduplication for `appendLearning`, frontmatter annotations with hash and tags, progressive disclosure via `loadIndexEntries` and depth parameter, session learning promotion with `promoteSessionLearnings` and `countLearningEntries`.
- **Extended security scanner** — 18 new rules: 7 agent-config rules (SEC-AGT-001–007), 5 MCP rules (SEC-MCP-001–005), 6 secret detection rules (SEC-SEC-006–011). New `agent-config` and `mcp` security categories. `fileGlob` filtering for targeted rule application in `scanFile`.
- **Progressive disclosure in `gather_context`** — New `depth` parameter for layered context retrieval.

### Patch Changes

- Fix O(1) dedup and remove redundant I/O in events and learnings
- Fix `scanContent` docs, AGT-007 confidence, and regex precision in security scanner
- Fix promoted count and deduplicate budgeted learnings
- Add idempotency guard to `promoteSessionLearnings`
- Fix roadmap sync guard with directional protection and auto-sync
- Updated dependencies
  - @harness-engineering/types@0.5.0

## 0.14.0

### Minor Changes

- **Evidence gate for code review** — Coverage checking and uncited finding tagging in the review pipeline.
  - `tagUncitedFindings()` tags review findings lacking file:line evidence citations
  - `EvidenceCoverageReport` type with per-finding citation status
  - Coverage reporting integrated into output formatters
  - Pipeline orchestrator wired to run evidence gate after validation phase
- **Session section state management** — Read, append, status update, and archive operations for session-scoped accumulative state sections.
  - `readSessionSection()`, `appendSessionSection()`, `updateSessionSectionStatus()`
  - Session archival with date-suffixed directory move
  - Session state file and archive directory constants
  - Barrel file exports for session section and archive functions

### Patch Changes

- Fix evidence gate regex to support `@` in scoped package paths (e.g., `@org/package`)
- Fix `exactOptionalPropertyTypes` compliance in review conditional spread
- Fix cross-device session archive with copy+remove fallback
- Reduce cyclomatic complexity across check orchestrator and tool modules
- Fix CI check warnings for entry points and doc coverage
- Updated dependencies
  - @harness-engineering/types@0.4.0

## 0.13.1

### Patch Changes

- **Check orchestrator refactor** — Extracted 8 handler functions (`runValidateCheck`, `runDepsCheck`, `runDocsCheck`, `runEntropyCheck`, `runSecurityCheck`, `runPerfCheck`, `runPhaseGateCheck`, `runArchCheck`) from `runSingleCheck` switch statement, reducing cyclomatic complexity from 63 to ~10 per function.
- **VERSION constant fix** — Updated deprecated `VERSION` export from 0.11.0 to 0.13.0.
- **Cross-platform path normalization** — `path.relative()` outputs in architecture collectors, constraint validators, doc coverage, context generators, entropy detectors, and review scoper normalized to POSIX separators. New `toPosix()` helper in `fs-utils`.
- **`fs-utils` enhancement** — Added `toPosix()` for consistent cross-platform path separators.

## 0.13.0

### Minor Changes

- Efficient Context Pipeline: session-scoped state, token-budgeted learnings, session summaries, and learnings pruning
  - **Session-scoped state**: All state files (state.json, handoff.json, learnings.md, failures.md) can now be scoped to a session directory under `.harness/sessions/<slug>/`, enabling parallel Claude Code windows without conflicts
  - **Session resolver**: `resolveSessionDir()` and `updateSessionIndex()` for session directory management with path traversal protection
  - **Token-budgeted learnings**: `loadBudgetedLearnings()` with two-tier loading (session first, global second), recency sorting, relevance scoring, and configurable token budget
  - **Session summaries**: `writeSessionSummary()`, `loadSessionSummary()`, `listActiveSessions()` for lightweight cold-start context (~200 tokens)
  - **Learnings pruning**: `analyzeLearningPatterns()` groups entries by skill/outcome tags, `pruneLearnings()` archives old entries to `.harness/learnings-archive/{YYYY-MM}.md` keeping 20 most recent, `archiveLearnings()` for manual archival
  - **Roadmap parser fix**: Parser now accepts both `### Feature: X` and `### X` format, serializer outputs format matching actual roadmap files
  - All core state functions (`loadState`, `saveState`, `appendLearning`, `loadRelevantLearnings`, `appendFailure`, `loadFailures`, `saveHandoff`, `loadHandoff`) accept optional `session` parameter
  - `gather_context` threads session parameter to all core calls

### Patch Changes

- Fix circular dependency in entropy types module
- Fix `estimateTokens` usage in budget enforcement loop

## 0.12.0

### Minor Changes

- Add constraint sharing support and blueprint fixes
  - `removeContributions` function for lockfile-driven rule removal during constraint uninstall
  - Export `removeContributions` from sharing module index
  - Fix blueprint quiz generation that failed with mock LLM service
  - Fix content-pipeline test imports

## 0.11.0

### Minor Changes

- # Orchestrator Release & Workspace Hardening

  ## New Features
  - **Orchestrator Daemon**: Implemented a long-lived daemon for autonomous agent lifecycle management.
    - Pure state machine core for deterministic dispatch and reconciliation.
    - Multi-tracker support (Roadmap adapter implemented).
    - Isolated per-issue workspaces with deterministic path resolution.
    - Ink-based TUI and HTTP API for real-time observability.
  - **Harness Docs Pipeline**: Sequential pipeline for documentation health (drift detection, coverage audit, and auto-alignment).

  ## Improvements
  - **Documentation Coverage**: Increased project-wide documentation coverage to **84%**.
    - Comprehensive JSDoc/TSDoc for core APIs.
    - New Orchestrator Guide and API Reference.
    - Unified Source Map reference for all packages.
  - **Workspace Stability**: Resolved all pending lint errors and type mismatches in core packages.
  - **Graceful Shutdown**: Added signal handling and centralized resource cleanup for the orchestrator daemon.
  - **Hardened Security**: Restricted orchestrator HTTP API to localhost.

### Patch Changes

- Updated dependencies
  - @harness-engineering/types@0.3.0
  - @harness-engineering/graph@0.3.2

## 0.10.1

### Patch Changes

- Invalidate state cache on write to prevent stale hits in CI

## 0.10.0

### Minor Changes

- **GraphStore singleton cache** with mtime-based invalidation and pending-promise dedup for concurrent access (LRU cap: 8 entries)
- **Learnings/failures index cache** with mtime invalidation and LRU eviction in state-manager
- **Parallelized CI checks** — `check-orchestrator` runs validate first, then 6 remaining checks via `Promise.all`
- **Parallelized mechanical checks** — docs and security checks run in parallel with explicit findings-merge pattern

### Patch Changes

- Resolve stale `VERSION` constant (was `0.8.0`, should be `1.8.1`) causing incorrect update notifications
- Deprecate core `VERSION` export — consumers should read from `@harness-engineering/cli/package.json`

## 0.9.0

### Minor Changes

- **Review pipeline** — full 7-phase code review system
  - Mechanical checks with `runMechanicalChecks()` and `ExclusionSet` for file+line range matching
  - Context scoping with graph-aware and heuristic fallback change-type detection
  - Fan-out orchestrator with parallel agent dispatch (architecture, security, bug detection, compliance agents)
  - `ReviewFinding`, `ModelTierConfig`, and `ReviewAgentDescriptor` types
  - Validation and deduplication phases with security field preservation
  - Model tier resolver with provider defaults via `resolveModelTier()`
  - Eligibility gate for CI mode
  - Output formatters for terminal, GitHub comment, and summary
  - Assessment logic with exit code mapping
  - `runPipeline()` orchestrator for the complete 7-phase review pipeline
  - `PipelineContext`, `PipelineFlags`, and `PipelineResult` types
- **Roadmap module** — parse, serialize, and sync project roadmaps
  - `parseRoadmap()` with frontmatter and feature parsing
  - `serializeRoadmap()` with round-trip fidelity
  - `syncRoadmap()` with state inference logic
- **Update checker** — background update check system
  - `UpdateCheckState` type, `isUpdateCheckEnabled`, `shouldRunCheck`
  - `readCheckState` with graceful error handling
  - `spawnBackgroundCheck` with detached child process
  - `getUpdateNotification` with semver comparison
- **Entropy enhancements** — new fix types and cleanup finding classifier
  - Dead export, commented-out code, orphaned dependency, and forbidden import replacement fix creators
  - `CleanupFinding` classifier with hotspot downgrade and dedup
  - Expanded `FixType` union and `CleanupFinding` schema
- **Config schema additions**
  - `updateCheckInterval` in `HarnessConfigSchema`
  - `review.model_tiers` in `HarnessConfigSchema`
- **Transition system** — add `requiresConfirmation` and `summary` to `TransitionSchema`
- **Constraints** — add `ForbiddenImportRule` type with alternative field
- **Security** — add `harness-ignore` inline suppression for false positives
- Re-export interaction module from core index

### Patch Changes

- Fix `exactOptionalPropertyTypes` for suggestion field in `mergeFindings`
- Fix security agent strings from triggering SEC-INJ-001 scan
- Enforce path sanitization across all MCP tools and harden crypto
- Address code review findings for fan-out agents, context scoping, and review pipeline
- Resolve TypeScript strict-mode errors and platform parity gaps
- Updated dependencies
  - @harness-engineering/types@0.2.0

## 0.8.0

### Minor Changes

- Graph-enhanced context assembly (Phase 4)
  - `contextBudget()`: optional graph-density-aware token allocation
  - `contextFilter()`: optional graph-driven phase filtering
  - `generateAgentsMap()`: optional graph-topology generation
  - `checkDocCoverage()`: optional graph-based coverage analysis
  - Deprecation warnings on `validateAgentsMap()` and `validateKnowledgeMap()`
- Graph-enhanced entropy detection (Phase 5)
  - `EntropyAnalyzer.analyze()`: optional graph mode skips snapshot rebuild
  - `detectDocDrift()`: optional graph-based stale edge detection
  - `detectDeadCode()`: optional graph-based reachability analysis
- Graph-enhanced constraint checking (Phase 6)
  - `buildDependencyGraph()`: optional graph data bypasses file parsing
  - `validateDependencies()`: optional graph data skips parser health check and file globbing
  - `detectCircularDepsInFiles()`: optional graph data skips file parsing
  - New `GraphDependencyData` type in constraints
- Graph-enhanced feedback system (Phase 7)
  - `analyzeDiff()`: optional graph impact data for test coverage and scope analysis
  - `ChecklistBuilder.withHarnessChecks()`: optional graph data replaces placeholder harness checks
  - `createSelfReview()`: optional graph data passthrough to builder and analyzer
  - New `GraphImpactData` and `GraphHarnessCheckData` types

### Patch Changes

- Move `EntropyError` definition to `shared/errors.ts` to break circular import
- All graph enhancements use optional trailing parameters — existing behavior unchanged when not provided

## 0.7.0

### Minor Changes

- Add CI/CD integration commands and documentation
  - New `harness ci check` command: runs all harness checks (validate, deps, docs, entropy, phase-gate) with structured JSON output and meaningful exit codes
  - New `harness ci init` command: generates CI config for GitHub Actions, GitLab CI, or a generic shell script
  - New CI types: `CICheckReport`, `CICheckName`, `CIPlatform`, and related interfaces
  - Core `runCIChecks` orchestrator composing existing validation into a single CI entrypoint
  - 4 documentation guides: automation overview, CI/CD validation, issue tracker integration, headless agents
  - 6 copy-paste recipes: GitHub Actions, GitLab CI, shell script, webhook handler, Jira rules, headless agent action

### Patch Changes

- Updated dependencies
  - @harness-engineering/types@0.1.0

## 0.6.0

### Minor Changes

- dc88a2e: Codebase hardening: normalize package scripts, deduplicate Result type, tighten API surface, expand test coverage, and fix documentation drift.

  **Breaking (core):** Removed 6 internal helpers from the entropy barrel export: `resolveEntryPoints`, `parseDocumentationFile`, `findPossibleMatches`, `levenshteinDistance`, `buildReachabilityMap`, `checkConfigPattern`. These were implementation details not used by any downstream package. If you imported them directly from `@harness-engineering/core`, import from the specific detector file instead (e.g., `@harness-engineering/core/src/entropy/detectors/drift`).

  **core:** `Result<T,E>` is now re-exported from `@harness-engineering/types` instead of being defined separately. No consumer-facing change.

  **All packages:** Normalized scripts (consistent `test`, `test:watch`, `lint`, `typecheck`, `clean`). Added mcp-server to root tsconfig references.

  **mcp-server:** Fixed 5 `no-explicit-any` lint errors in architecture, feedback, and validate tools.

  **Test coverage:** Added 96 new tests across 13 new test files (types, cli subcommands, mcp-server tools).

  **Documentation:** Rewrote cli.md and configuration.md to match actual implementation. Fixed 10 inaccuracies in AGENTS.md.

### Patch Changes

- Updated dependencies [dc88a2e]
  - @harness-engineering/types@0.0.1

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-03-12

### Added

- **Entropy Management Module** - Tools for detecting and fixing codebase entropy
  - `EntropyAnalyzer` - Main orchestrator for entropy analysis
  - `buildSnapshot()` - Build CodebaseSnapshot for efficient multi-pass analysis
  - `detectDocDrift()` - Documentation drift detection (API signatures, examples, structure)
  - `detectDeadCode()` - Dead code detection (files, exports, unused imports)
  - `detectPatternViolations()` - Pattern violation detection (config-based)
  - `createFixes()` - Generate safe, auto-applicable fixes
  - `applyFixes()` - Apply fixes with backup support
  - `generateSuggestions()` - Generate suggestions for manual fixes
  - `validatePatternConfig()` - Zod schema validation for pattern configs
- Levenshtein distance fuzzy matching for drift detection
- BFS reachability analysis for dead code detection
- Minimatch-based glob pattern matching

### Changed

- Updated VERSION to 0.4.0

## [0.3.0] - 2026-03-12

### Added

- **Architectural Constraints Module** - Tools for enforcing layered architecture
  - `defineLayer()` - Create layer definitions with dependency rules
  - `validateDependencies()` - Validate imports respect layer boundaries
  - `detectCircularDeps()` - Detect cycles using Tarjan's SCC algorithm
  - `detectCircularDepsInFiles()` - Standalone cycle detection from files
  - `createBoundaryValidator()` - Create Zod-based boundary validators
  - `validateBoundaries()` - Validate multiple boundaries at once
- **Parser Abstraction Layer** - Reusable AST parsing infrastructure
  - `TypeScriptParser` - Full AST parsing for TypeScript files
  - `LanguageParser` interface for multi-language support
  - Import/export extraction with type-only import detection
- Parser health checks with configurable fallback behavior

### Changed

- Updated VERSION to 0.3.0

## [0.2.0] - 2026-03-12

### Added

- **Context Engineering Module** - Tools for AGENTS.md validation and generation
  - `validateAgentsMap()` - Parse and validate AGENTS.md structure
  - `checkDocCoverage()` - Analyze documentation coverage for code files
  - `validateKnowledgeMap()` - Check integrity of all documentation links
  - `generateAgentsMap()` - Auto-generate AGENTS.md from project structure
  - `extractMarkdownLinks()` - Extract markdown links from content
  - `extractSections()` - Extract sections from markdown content
- Required sections validation for harness-engineering projects
- Documentation gap identification with importance levels
- Broken link detection with fix suggestions

### Changed

- Updated VERSION to 0.2.0

## [0.1.0] - 2026-03-12

### Added

- Core validation framework with extensible validator architecture
- Schema-based validation with Zod integration
- Composite validation with sequential and parallel execution
- Rule-based validation system
- File pattern matching with glob support
- Configuration validation
- Type definitions for all exports
- Comprehensive unit test coverage (>80%)
- ESM and CommonJS build outputs
- TypeScript type declarations

### Changed

- N/A (Initial release)

### Deprecated

- N/A

### Removed

- N/A

### Fixed

- N/A

### Security

- N/A

[0.4.0]: https://github.com/Intense-Visions/harness-engineering/releases/tag/@harness-engineering/core@0.4.0
[0.3.0]: https://github.com/Intense-Visions/harness-engineering/releases/tag/@harness-engineering/core@0.3.0
[0.2.0]: https://github.com/Intense-Visions/harness-engineering/releases/tag/@harness-engineering/core@0.2.0
[0.1.0]: https://github.com/Intense-Visions/harness-engineering/releases/tag/@harness-engineering/core@0.1.0
