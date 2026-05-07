# @harness-engineering/cli

## 2.2.1

### Patch Changes

- d83e162: fix(hooks): block-no-verify only matches argv-token flags, not substrings (#285)

  The block-no-verify PreToolUse hook previously did a naive substring test for
  `--no-verify` against the entire Bash command, so it blocked commits whose
  message body, heredoc, or shell comment merely _mentioned_ the flag. The
  detector now strips quoted strings, heredoc bodies, and shell comments before
  testing, and matches `--no-verify` and `git commit -n` only when they appear
  as standalone argv tokens.

## 2.2.0

### Minor Changes

- d77d0f4: feat: distribute harness as the `harness-claude` Claude Code marketplace plugin

  Replaces #267, which shipped a Claude-only marketplace plugin under the name `harness` with a partial component surface (skills + MCP only). This change:
  1. **Renames** the plugin to `harness-claude` and reframes the marketplace listing so the name no longer implies tool-agnostic coverage. Sibling plugins for Cursor, Gemini CLI, and Codex are planned as follow-up PRs (`harness-cursor`, `harness-gemini`, `harness-codex`); OpenCode is covered by extending `harness setup`.
  2. **Adds persona subagents.** New `scripts/generate-plugin-agents.mjs` runs `harness generate-agent-definitions --platforms claude-code` and writes 12 rendered subagent files (`harness-architecture-enforcer.md`, `harness-code-reviewer.md`, …) to `.claude-plugin/agents/`. The plugin manifest references this directory via the `agents` field.
  3. **Adds lifecycle hooks.** New `scripts/generate-plugin-hooks.mjs` writes `.claude-plugin/hooks.json` with the `standard` profile (block-no-verify, protect-config, quality-gate, pre-compact-state, adoption-tracker, telemetry-reporter), pointing at `${CLAUDE_PLUGIN_ROOT}/.harness/hooks/<name>.js` so the scripts already shipped at `.harness/hooks/` (per #270) execute against the user's project at install time.
  4. **Consolidates plugin distribution artifacts under `.claude-plugin/`.** Slash commands moved from `commands/` (repo root) to `.claude-plugin/commands/`. Subagents moved from `agents/agents/claude-code/` to `.claude-plugin/agents/`. Frees the repo-root `commands/` slot for the future `harness-gemini` extension (Gemini uses TOML in its own `commands/` and would otherwise collide).
  5. **Adds drift guards.** Each generator gains a `--check` mode that runs the generator into a staging dir, diffs the result against the committed artifact, and exits non-zero on drift. `pnpm generate:plugin:check` chains all three. CI (`.github/workflows/ci.yml`) runs this check on every PR — no more silent drift between `agents/skills/claude-code/` and the plugin's slash command/subagent set.
  6. **Switches generators from `dist/bin/harness.js` to `tsx packages/cli/src/bin/harness.ts`.** Plugin maintenance no longer requires `pnpm build` first. `tsx` is added as a root devDependency.
  7. **Extends `initialize-harness-project` skill with Phase 5 (INSTRUMENT) and Phase 6 (FINALIZE).** The skill now closes the bootstrap parity gap that plugin install does not cover — knowledge graph (`harness scan`), architecture baseline (`harness check-arch --update-baseline`), performance baseline (`harness check-perf`), telemetry identity (`harness telemetry identify`), legacy layout migration (`harness migrate --dry-run`), and Tier-0 MCP integrations (`harness integrations add context7|sequential-thinking|playwright`). Includes a "Plugin-only callout" telling the model to prefix CLI invocations with `npx @harness-engineering/cli` when no global binary is on PATH, plus a worked example showing a full plugin-only bootstrap.

  **Plugin manifest now exposes:**

  | Field        | Path                          | Components                     |
  | ------------ | ----------------------------- | ------------------------------ |
  | `skills`     | `./agents/skills/claude-code` | All harness skills             |
  | `commands`   | `./.claude-plugin/commands/`  | 37 `/harness:*` slash commands |
  | `agents`     | `./.claude-plugin/agents/`    | 12 persona subagents           |
  | `hooks`      | `./.claude-plugin/hooks.json` | Standard hook profile          |
  | `mcpServers` | inline                        | `harness` MCP server via `npx` |

  **Out of scope (tracked as follow-up issues):**
  - `harness-cursor`, `harness-gemini`, `harness-codex` sibling plugins.
  - OpenCode integration via extended `harness setup`.
  - Consolidation of `agents/skills/{claude-code,codex,cursor,gemini-cli}/` — these are already hard-linked to a single inode (no actual duplication on disk), so this becomes a presentation/discovery refactor rather than a data-layer one.

- af02d63: feat: ship `harness-codex` marketplace plugin (PR-D in the marketplace stack)

  Final entry in the multi-tool marketplace stack: `harness-codex` for Codex
  CLI. Sibling to `harness-claude` (#284), `harness-cursor` (#288), and
  `harness-gemini` (#290).

  **The thinnest plugin of the four.** Codex's plugin spec
  (`developers.openai.com/codex/plugins/build`) only defines `skills`,
  `mcpServers`, `apps`, and `hooks` fields — no slash-command surface, no
  agents field. So `harness-codex` ships exactly what Codex actually
  consumes:
  - **`.codex-plugin/plugin.json`** — manifest pointing at
    `./agents/skills/codex` for skills and wiring the harness MCP server.
  - **`.codex-plugin/marketplace.json`** — marketplace entry with
    `policy.installation: AVAILABLE`, `category: Productivity`.
  - No `commands/`, no `agents/`, no `hooks.json` — see "Out of scope" below.

  **Generator changes:**
  - **`generate-plugin.mjs --target codex`** is a no-op by design (manifest
    is hand-maintained, no auto-generated artifacts). Wired into
    `pnpm generate:plugin:{codex,all,check}` so CI's drift guard covers all
    four targets uniformly even though codex has nothing to drift from.
  - **`plugin-config.mjs`** gained a `generateCommands` flag (alongside
    `generateAgents` and `generateHooks` from PR-C) so the generator can
    short-circuit each artifact type independently. Existing entries
    (claude, cursor, gemini) set `generateCommands: true`; codex sets all
    three to `false`.

  **Out of scope (intentional):**
  - **No slash commands.** Codex's plugin spec doesn't define a commands
    surface — Codex picks up skills directly via the manifest's `skills`
    field and surfaces them via the `$skill` invocation syntax.
  - **No persona subagents.** Like Gemini, Codex plugins have no agents
    field. Persona behavior remains reachable via `harness.run_persona`
    exposed by the MCP server.
  - **No lifecycle hooks.** Codex's plugin spec mentions a `hooks` field
    but the schema (event names, command resolution, env vars) is not
    documented yet. Deferred until the spec stabilizes — when it does,
    set `generateHooks: true` for codex and the existing generator will
    produce `.codex-plugin/hooks.json` from the same `STANDARD_HOOKS` list
    the other plugins use.

  **Stack complete:**

  | Tool        | Plugin           | Surface                                          |
  | ----------- | ---------------- | ------------------------------------------------ |
  | Claude Code | `harness-claude` | skills + commands + agents + hooks + MCP         |
  | Cursor      | `harness-cursor` | skills + commands + agents + hooks + rules + MCP |
  | Gemini CLI  | `harness-gemini` | commands + GEMINI.md context + MCP               |
  | Codex CLI   | `harness-codex`  | skills + MCP                                     |

  The follow-up — OpenCode integration via extending `harness setup` (PR-E)
  — remains tracked as a separate issue. OpenCode auto-discovers
  `.claude/skills/`, so the work there is mostly an MCP target wire-up, not
  a new manifest.

- c0b9d38: feat: ship `harness-cursor` marketplace plugin (PR-B in the marketplace stack)

  Sibling plugin to `harness-claude` (#284) for Cursor's marketplace. Same
  component surface — skills, `/harness:*` slash commands, persona subagents,
  lifecycle hooks, MCP server — plus 4 curated project rules that fire as
  `alwaysApply` in every Cursor session.

  **New surface:**
  - **`.cursor-plugin/plugin.json` + `.cursor-plugin/marketplace.json`** —
    Cursor marketplace manifest, mirrors the Claude plugin shape.
  - **`.cursor-plugin/{commands,agents,hooks.json,rules}/`** — auto-generated
    artifacts under the same path convention as `.claude-plugin/`.
  - **4 hand-written Cursor rules** (`.mdc` files in `.cursor-plugin/rules/`):
    - `validate-before-commit` — run `harness validate` before any commit.
    - `respect-architecture` — stay within layer boundaries declared in
      `harness.config.json`; no `// harness-ignore` to suppress violations.
    - `use-harness-skills` — prefer `/harness:*` skills over freelancing for
      common tasks; surface explicit skip reasons.
    - `respect-hooks` — never propose `--no-verify` or hook-bypass workarounds;
      fix the underlying issue or update calibration.

  **CLI changes:**
  - **`renderCursorAgent`** (`packages/cli/src/agent-definitions/render-cursor.ts`)
    — new renderer for Cursor subagent markdown (frontmatter `name` +
    `description`, no `tools` field). Wired into `getRenderer` in
    `generate-agent-definitions.ts`. `resolveOutputDir` simplified to take any
    `Platform` (was hardcoded for claude-code/gemini-cli only).
  - **`renderCursorCommand`** (`packages/cli/src/slash-commands/render-cursor-command.ts`)
    — new renderer for Cursor plugin slash commands (frontmatter `name` +
    `description`, body uses `<context>`/`<objective>`/`<execution_context>`/
    `<process>` blocks). Distinct from the existing `renderCursor`, which still
    serves `harness setup`'s `~/.cursor/rules/` flow.
  - **`harness generate-slash-commands --cursor-mode <rules|commands>`** — new
    flag (default `rules` for backward compatibility) selects between the two
    Cursor renderers.

  **Generator consolidation:**
  - **`scripts/generate-plugin.mjs --target <claude|cursor> [--check]`** —
    single parameterized generator replaces the three Claude-specific scripts
    from PR-A (`generate-plugin-{commands,agents,hooks}.mjs`). All three
    artifacts produced per target. Per-target config (plugin dir, slash command
    platform, agent platform, hooks command template) lives in
    `scripts/lib/plugin-config.mjs`.
  - **`pnpm generate:plugin:check`** chains both targets; CI runs it on every PR.
  - Per-target `pnpm generate:plugin:claude` and `pnpm generate:plugin:cursor`
    for partial regeneration.

  **Cursor-specific notes:**
  - Cursor's hook `command` paths use relative form (`./.harness/hooks/<name>.js`)
    rather than the `${CLAUDE_PLUGIN_ROOT}` env var. Cursor doesn't document an
    equivalent env var, but their hook docs show relative paths resolve to the
    plugin install dir.
  - Cursor distinguishes `commands` (slash) from `rules` (always-apply guidance)
    in the plugin manifest. The harness plugin uses both.

  **Out of scope (tracked as follow-up issues):**
  - `harness-gemini` (PR-C) and `harness-codex` (PR-D) sibling plugins.
  - Cursor's `harness-cursor:harness` natural-language router command appears
    in `.cursor-plugin/commands/harness.md` rather than as a parent-level
    command (Cursor's slash-commands generator doesn't special-case
    `command_name` the way Claude/Gemini do). Functional but slightly noisy in
    the command list. Optional cleanup.

- 38d2d84: feat: ship `harness-gemini` marketplace extension (PR-C in the marketplace stack)

  Sibling extension to `harness-claude` (#284) and `harness-cursor` (#288) for
  Gemini CLI's extension marketplace. Same MCP and slash-command surface, but
  scoped to what Gemini extensions actually support.

  **New surface:**
  - **`.gemini-extension/gemini-extension.json` + `marketplace.json`** —
    Gemini extension manifest with `mcpServers` and `contextFileName`. Mirrors
    the marketplace manifest shape used by the Claude and Cursor siblings.
  - **`.gemini-extension/GEMINI.md`** — context document loaded automatically
    when the extension activates. Documents the persona table, the skill
    surface, and how to invoke `/harness:*` commands. Stands in for the
    native subagent and hooks fields that Gemini extensions don't have.
  - **`.gemini-extension/commands/*.toml`** (37 files) — auto-generated TOML
    slash commands. Same set the Claude and Cursor plugins ship.

  **CLI changes:**
  - **`generate-plugin.mjs`** now accepts `--target gemini`. Per-target
    config in `scripts/lib/plugin-config.mjs` gained three flags so the
    generator can be honest about each tool's actual surface:
    - `commandExt` — `.md` for Claude/Cursor, `.toml` for Gemini. Diff and
      prettier formatting branch on this. (Prettier doesn't format TOML, so
      the gemini path skips prettier.)
    - `generateAgents` — `false` for Gemini (no native subagents field). The
      generator skips the agent-rendering step entirely instead of writing
      dead-end files no platform reads.
    - `generateHooks` — `false` for Gemini (no native hooks field).
  - **`pnpm generate:plugin:gemini`** + **`generate:plugin:all`** /
    **`generate:plugin:check`** include the gemini target. CI runs the
    combined check on every PR.

  **Scope differences from Claude/Cursor siblings:**

  Gemini extensions only support commands + MCP servers + a context document.
  Two surfaces present in the Claude and Cursor plugins are intentionally
  out of scope here:
  - **No persona subagents.** Gemini extensions don't have an agents field.
    Persona behavior is documented in GEMINI.md and exposed through
    `/harness:*` commands and `harness.run_persona` (MCP).
  - **No lifecycle hooks.** Gemini extensions don't support hooks. Users
    wire `harness validate` / `harness check-arch` into CI manually, the
    same way they would without the extension.

  **Out of scope (tracked as follow-up):**
  - `harness-codex` (PR-D) sibling extension.
  - OpenCode integration via extending `harness setup` (PR-E). OpenCode
    auto-discovers `.claude/skills/`, so the work there is mostly an MCP
    target wire-up, not a new manifest.

- 11a5912: feat: integrate OpenCode in `harness setup` (PR-E in the marketplace stack)

  Adds OpenCode as the fifth supported AI client in `harness setup`. Unlike
  the four marketplace plugins (PR-A through PR-D), OpenCode joins via the
  existing `harness setup` flow rather than its own marketplace manifest —
  OpenCode plugins are JS/TS code, not declarative manifests, and OpenCode
  auto-discovers `.claude/skills/` so it shares Claude's skill tree without
  any plugin-side wiring.

  **What ships:**
  - **`harness setup` detects `~/.config/opencode/`** as a new client marker
    and writes the harness MCP server to `./opencode.json` in the project
    root. Skipped (with a friendly warning) when neither the global config
    dir nor a project-local `opencode.json` is present.
  - **`harness setup-mcp --client opencode`** wires up the MCP server
    standalone for users who want fine-grained control.
  - **Tier-0 MCP integrations parity** — context7, sequential-thinking, and
    playwright are written to `opencode.json` alongside `.mcp.json` and
    `.gemini/settings.json`, mirroring the existing Gemini parity block.

  **OpenCode's MCP shape differs from the others:**

  OpenCode uses `mcp` (not `mcpServers`) at the top level, and each entry
  uses `type: "local"`, a single combined `command` array (executable +
  args), `enabled`, and `environment`. The new `writeOpencodeMcpEntry`
  helper translates the standard `{command, args?, env?}` shape into
  OpenCode's wire format.

  **Test coverage:**
  - 6 new tests in `setup-mcp.test.ts` covering the OpenCode branch
    (configure, skip-if-configured, all-clients, key preservation).
  - 6 new tests in `integrations/config.test.ts` covering the
    `writeOpencodeMcpEntry` translation (mcp field, command array,
    environment translation, top-level field preservation, mcp entry
    preservation).
  - 3 new tests in `setup.test.ts` covering Tier-0 OpenCode parity
    (project-local marker, global marker, neither-present negative).

  **Stack complete:**

  | Tool         | Integration                                  | Status         |
  | ------------ | -------------------------------------------- | -------------- |
  | Claude Code  | `harness-claude` marketplace plugin          | shipped (#284) |
  | Cursor       | `harness-cursor` marketplace plugin          | shipped (#288) |
  | Gemini CLI   | `harness-gemini` marketplace extension       | shipped (#290) |
  | Codex CLI    | `harness-codex` marketplace plugin           | shipped (#291) |
  | **OpenCode** | **via `harness setup` (no plugin manifest)** | **this PR**    |

  **README updates:**
  - Quick Start now lists Gemini CLI and Codex CLI marketplace plugins as
    shipped (they were "coming" before PR-C/PR-D landed) and adds an
    OpenCode bullet pointing to the npm path.
  - Plugin-vs-npm parity table replaces the outdated "Gemini CLI / Codex /
    OpenCode integration ❌ (sibling plugins coming)" row with two rows
    reflecting current state — Gemini/Codex shipped via plugins, OpenCode
    via `harness setup`.
  - MCP config table gains an OpenCode row showing the project-local
    `opencode.json` path.

## 2.1.1

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

- Updated dependencies [ba8da2e]
- Updated dependencies [54d9494]
- Updated dependencies [a1df67e]
  - @harness-engineering/core@0.23.8
  - @harness-engineering/dashboard@0.5.2
  - @harness-engineering/orchestrator@0.3.2

## 2.1.0

### Minor Changes

- fix(ingest, graph): resolve `harness ingest` OOM/recursion crashes (#274) and `loadGraph` V8 string-cap crashes (#276) on real-world monorepos.

  **`@harness-engineering/graph`:**
  - Issue #274 — recursive walker with a 22-entry inline if-chain skip list crashed with `Maximum call stack size exceeded` or heap-OOM on monorepos with populated build caches. The skip list missed `.turbo`, `.vite`, `.cache`, `.docusaurus`, `.wrangler`, `.svelte-kit`, `.parcel-cache`, `storybook-static`, `playwright-report`, `test-results`, `.pytest_cache`, `.pnpm-store`, `.nuxt`, and AI agent sandbox dirs (`.claude`, `.cursor`, `.codex`, `.gemini`, `.aider`). The `.claude/worktrees/` omission alone could multiply walker workload by 50× on heavy users of Claude Code's worktree feature.
  - New shared `DEFAULT_SKIP_DIRS` constant (60+ entries) at `packages/graph/src/ingest/skip-dirs.ts`, exported from the package barrel along with `resolveSkipDirs`. Covers VCS, package managers, JS/TS framework caches, test/coverage outputs, Python virtualenvs and bytecode, JVM build outputs, IDE metadata, and AI agent sandboxes.
  - `CodeIngestor.findSourceFiles` rewritten as an iterative BFS walker — no more recursion, bounded by frontier size rather than path depth.
  - New `CodeIngestorOptions` constructor parameter: `skipDirs` (replace defaults), `additionalSkipDirs` (extend defaults), `excludePatterns` (minimatch globs), `respectGitignore` (default-on, supports the common `.gitignore` subset; negation is dropped silently).
  - Issue #276 — `loadGraph` slurped `graph.json` into one V8 string and crashed with `RangeError: Invalid string length` on graphs > ~512 MB. Production monorepos with thousands of source files hit this easily.
  - On-disk schema bumped v1 → v2: `graph.json` is now NDJSON, one record per line with a `kind` discriminator (`"node"` or `"edge"`). Reader uses `readline` so peak string size is bounded by the largest single record. Old v1 graphs trigger the existing `schema_mismatch` path → automatic rebuild on next scan.
  - New `loadGraphMetadata` helper (exported) reads only `metadata.json`. New `nodesByType` field on `GraphMetadata` enables a fast-path for summary callers that never touch `graph.json`.
  - `RangeError: Invalid string length` now wraps into an actionable error pointing at the offending file and likely cause.

  **`@harness-engineering/cli`:**
  - New `ingest` config block on `HarnessConfigSchema` mirroring `CodeIngestorOptions`. Use `additionalSkipDirs` to extend the comprehensive defaults without replacing them, `excludePatterns` for glob-based exclusions, and `respectGitignore: false` to opt out of `.gitignore` honoring.
  - `harness scan` and `harness ingest --source code` load the `ingest` block via best-effort `loadIngestOptions` — if `harness.config.json` is missing or malformed, falls back to defaults silently.
  - `harness graph status` now reads only `metadata.json` (via `loadGraphMetadata`) and returns instantly with full per-type node breakdown, even on multi-GB graphs that previously failed to load.
  - `harness graph status` reports a clear `schema_mismatch` message instead of an opaque parse error when the graph was written by an older schema version.
  - The CLI's MCP `glob-helper` now imports the shared `DEFAULT_SKIP_DIRS` so the MCP file walker and the graph ingester can no longer drift.

  **Documentation:**
  - `docs/reference/configuration.md` — new `ingest` section documenting `skipDirs`, `additionalSkipDirs`, `excludePatterns`, `respectGitignore`, the comprehensive default list, and a worked example.

  **Tests:**
  - New `packages/graph/tests/ingest/CodeIngestor-skip-dirs.test.ts` — asserts default coverage of `.claude`/`.vite`/`.turbo`/etc., custom `additionalSkipDirs`/`skipDirs`/`excludePatterns` work, `.gitignore` is honored, iterative walker handles deeply nested directories.
  - New `packages/graph/tests/store/Serializer.test.ts` — asserts NDJSON line shape, save/load roundtrip preserves nodes and edges, metadata fast-path returns counts without reading `graph.json`, schema-mismatch on legacy v1 files, large-graph (5K nodes + 5K edges) streams cleanly.
  - Existing `packages/cli/tests/commands/graph.test.ts` updated to assert the v2 NDJSON shape.

### Patch Changes

- Updated dependencies
  - @harness-engineering/graph@0.8.0
  - @harness-engineering/core@0.23.7
  - @harness-engineering/dashboard@0.5.1
  - @harness-engineering/intelligence@0.2.1
  - @harness-engineering/orchestrator@0.3.1

## 2.0.0

### Patch Changes

- Updated dependencies [8825aee]
- Updated dependencies [8825aee]
  - @harness-engineering/orchestrator@0.3.0
  - @harness-engineering/dashboard@0.5.0
  - @harness-engineering/types@0.11.0
  - @harness-engineering/intelligence@0.2.0
  - @harness-engineering/core@0.23.6

## 1.28.1

### Patch Changes

- Updated dependencies [18412eb]
  - @harness-engineering/graph@0.7.1
  - @harness-engineering/core@0.23.5
  - @harness-engineering/dashboard@0.4.1
  - @harness-engineering/intelligence@0.1.5
  - @harness-engineering/orchestrator@0.2.17

## 1.28.0

### Minor Changes

- 3bfe4e4: feat(config): add `design.enabled` tri-state config field for design-system opt-in/decline.
  - New `design.enabled?: boolean` field on `DesignConfigSchema`. Tri-state runtime semantics:
    - `true` — design system enabled; `harness-design-system` fires on `on_new_feature`.
    - `false` — explicitly declined; skill skips with a permanent-decline log line.
    - absent — undecided; skill surfaces a gentle prompt.
  - `.superRefine()` ensures `design.platforms` is a non-empty `('web' | 'mobile')[]` whenever `design.enabled === true`.
  - `initialize-harness-project` Phase 3 step 5b now records the choice via `emit_interaction` (yes / no / not sure) for non-test-suite projects; Phase 4 step 4 promotes the roadmap nudge to an active question and auto-adds a `Set up design system` planned roadmap entry when both answers are yes.
  - 6-variant fixture matrix and a yes/yes end-to-end test cover all answer combinations.

  Spec: `docs/changes/init-design-roadmap-config/proposal.md`. Verification report: `docs/changes/init-design-roadmap-config/verification/2026-05-03-phase5-report.md`.

- 3bfe4e4: feat(cli): add `harness migrate` command for legacy artifact layout.

  Migrates pre-co-location project artifacts (`.harness/architecture/`, `docs/plans/`, etc.) into the canonical layout. Supports `--dry-run` to preview the migration plan, interactive orphan bucketing, and a `--non-interactive` mode for CI use.

  Subsequent refactor pass hardened the implementation:
  - Replaced shell-string `git mv` with `execFileSync` (no shell metacharacter interpolation surface).
  - Tightened filename-prefix matching to require a word boundary (so plan `authhelper-plan` no longer falsely maps to topic `auth`).
  - Switched `runMigrate` return type to `Promise<Result<MigrationResult, CLIError>>` matching the convention used by `runCleanupSessions` and the rest of the CLI commands.
  - Resolves `harness.config.json` relative to the migrate cwd; warns explicitly on parse failure rather than silently falling back.
  - Skips the interactive orphan prompt during `--dry-run`.

- 3bfe4e4: feat: configurable domain inference for the knowledge pipeline.

  **`@harness-engineering/graph`:**
  - New shared helper `inferDomain(node, options)` at `packages/graph/src/ingest/domain-inference.ts`. Exported from the package barrel along with `DomainInferenceOptions`, `DEFAULT_PATTERNS`, `DEFAULT_BLOCKLIST`.
  - Built-in patterns cover common monorepo conventions: `packages/<dir>`, `apps/<dir>`, `services/<dir>`, `src/<dir>`, `lib/<dir>`.
  - Reserved blocklist prevents misclassification of infrastructure paths: `node_modules`, `.harness`, `dist`, `build`, `.git`, `coverage`, `.next`, `.turbo`, `.cache`, `out`, `tmp`.
  - Generic first-segment fallback after blocklist filter; preserves existing `KnowledgeLinker` connector-source branch and the `metadata.domain` highest-precedence behavior.
  - Refinements: code-extension allowlist (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`) so directories with dots in names like `foo.bar/` retain their full segment; symmetric blocklist returns `'unknown'` when a pattern captures a blocklisted segment instead of bleeding into the generic fallback.
  - Wired into `KnowledgeStagingAggregator`, `CoverageScorer`, and `KnowledgeDocMaterializer`. Each gains an optional `inferenceOptions: DomainInferenceOptions = {}` constructor parameter — back-compat preserved for single-arg construction.
  - `KnowledgePipelineRunner` accepts `inferenceOptions` on its per-run options and threads to all four construction sites.
  - Test coverage: 19 unit tests for the helper + 11 wiring/integration tests across consumer classes + 3 end-to-end fixture tests.

  **`@harness-engineering/cli`:**
  - New optional config: `knowledge.domainPatterns: string[]` and `knowledge.domainBlocklist: string[]` on `HarnessConfigSchema`. Pattern format is the literal `prefix/<dir>` (regex `^[\w.-]+\/<dir>$`); blocklist entries are non-empty strings. Both default to `[]` and **extend** the built-in defaults rather than replacing them.
  - `harness knowledge-pipeline` reads both fields via `resolveConfig()` and maps them to the runner's `inferenceOptions.extraPatterns` / `extraBlocklist`.
  - 22 schema validation tests covering valid populated / valid empty / valid absent / invalid pattern / invalid blocklist element / default-propagation cases.

  **Documentation:**
  - `docs/reference/configuration.md` — new `knowledge` section documenting both fields, the built-in defaults, the precedence order, both refinements, and a worked `agents/<dir>` example.
  - `docs/knowledge/graph/node-edge-taxonomy.md` — new "Domain Inference" section with a 6-row precedence-walkthrough table.
  - `agents/skills/claude-code/harness-knowledge-pipeline/SKILL.md` — one-line note in EXTRACT phase pointing at the config override.

  **Known follow-up:** Phase 6 verification showed the real-repo `unknown` bucket did not close as projected on this monorepo (helper + wiring + integration test all pass independently, but the production pipeline runtime path appears to lose `node.path` between extraction and aggregation). The diagnostic is filed as `Diagnose pipeline node-path loss for domain inference` on the roadmap.

  Spec: `docs/changes/knowledge-domain-classifier/proposal.md`. Verification report: `docs/changes/knowledge-domain-classifier/verification/2026-05-03-phase6-report.md`.

### Patch Changes

- 3bfe4e4: fix(roadmap): unblock dependents when blocker is marked done.

  Previously, marking a blocker feature as `done` left its dependents in the `blocked` state until manually updated. The roadmap now propagates done-status to dependents, transitioning them back to `planned` (or whatever their pre-block status was) when the blocker is resolved.

- Updated dependencies [3bfe4e4]
- Updated dependencies [3bfe4e4]
  - @harness-engineering/dashboard@0.4.0
  - @harness-engineering/graph@0.7.0
  - @harness-engineering/core@0.23.4
  - @harness-engineering/intelligence@0.1.4
  - @harness-engineering/orchestrator@0.2.16

## 1.27.1

### Patch Changes

- Updated dependencies
  - @harness-engineering/dashboard@0.3.0

## 1.27.0

### Minor Changes

- Knowledge document materialization pipeline

  **@harness-engineering/graph:**
  - Add KnowledgeDocMaterializer that generates markdown knowledge docs from graph gap analysis
  - Wire KnowledgeDocMaterializer into pipeline convergence loop
  - Pass store to generateGapReport for differential gap analysis
  - Add materialization field to KnowledgePipelineResult
  - Fix filePath normalization to forward slashes for Windows compatibility
  - Fix conditional spread for exactOptionalPropertyTypes compatibility
  - Address review findings in knowledge pipeline
  - Add integration tests for pipeline materialization

  **@harness-engineering/cli:**
  - Display differential gaps and materialization results in knowledge-pipeline output

  **@harness-engineering/dashboard:**
  - Add knowledge pipeline to skill registry

### Patch Changes

- Updated dependencies
  - @harness-engineering/graph@0.6.0
  - @harness-engineering/dashboard@0.2.2
  - @harness-engineering/core@0.23.3
  - @harness-engineering/orchestrator@0.2.15

## 1.26.1

### Patch Changes

- Updated dependencies [e3dc2e7]
  - @harness-engineering/orchestrator@0.2.14
  - @harness-engineering/dashboard@0.2.1

## 1.26.0

### Minor Changes

- f62d6ab: Knowledge pipeline (Phases 4-5)

  **@harness-engineering/graph:**
  - Add KnowledgePipelineRunner with 4-phase convergence loop for end-to-end knowledge extraction
  - Complete Phase 4 knowledge pipeline with D2/PlantUML parsers, staging aggregator, and CLI integration
  - Add Phase 5 Visual & Advanced pipeline capabilities
  - Add DiagramParseResult types and MermaidParser for diagram-to-graph ingestion
  - Add StructuralDriftDetector with deterministic classification
  - Add ContentCondenser with passthrough and truncation tiers
  - Add KnowledgeLinker with heuristic pattern registry, clustering, staged output, and deduplication
  - Add code signal extractors for business knowledge extraction
  - Add business knowledge foundation with `business_fact` node type and `maxContentLength` config field
  - Add `execution_outcome` node type and `outcome_of` edge type

  **@harness-engineering/cli:**
  - Add Phase 5 Visual & Advanced pipeline capabilities
  - Add business-signals source to graph ingest

### Patch Changes

- f62d6ab: Resolve CLI typecheck errors for optional intelligence import and fix formatting failures
- f62d6ab: Supply chain audit — fix HIGH vulnerability, bump dependencies, migrate openai to v6
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
  - @harness-engineering/graph@0.5.0
  - @harness-engineering/dashboard@0.2.0
  - @harness-engineering/orchestrator@0.2.13
  - @harness-engineering/linter-gen@0.1.7
  - @harness-engineering/core@0.23.2
  - @harness-engineering/types@0.10.1

## 1.25.7

### Patch Changes

- f0a7cdd: fix(init): skip project scaffolding for pre-existing projects (#235)

  `harness init` no longer creates scaffold files (pom.xml, App.java, etc.) when the target directory already contains a project. Detects existing projects by checking for common build/config markers and only writes harness config files.

## Unreleased

### Fixed

- fix(init): skip project scaffolding for pre-existing projects ([#235](https://github.com/Intense-Visions/harness-engineering/issues/235))

  `harness init --language java` (and the MCP `init_project` tool) no longer creates scaffold files (pom.xml, App.java, checkstyle.xml, etc.) when the target directory already contains a project. Added `isExistingProject()` detection that checks for 13 common build/config markers (build.gradle, package.json, go.mod, pyproject.toml, Cargo.toml, etc.). When an existing project is detected, only harness infrastructure files (harness.config.json, AGENTS.md) are written. Also added build.gradle/build.gradle.kts to `NON_JSON_PACKAGE_CONFIGS`. Use `--force` to override.

## 1.25.6

### Patch Changes

- 528a72f: Fix two root causes preventing PostHog telemetry data collection

  **CLI command telemetry:**
  Commander.js `preAction` hook used `thisCommand` (root program) instead of `actionCommand` (the actual subcommand). `resolveCommandName` always returned `""`, silently skipping adoption record writes. Fixed by using the correct `actionCommand` parameter.

  **Skill invocation telemetry:**
  `emitEvent()` was implemented but never called from production code. Wired event emission into MCP tool handlers (`manage_state`, `emit_interaction`, `run_skill`) so the adoption-tracker Stop hook has events to process. Added new `event-emitter.ts` module with `emitSkillEvent` for phase transitions, gate results, handoffs, and errors.

- Updated dependencies
  - @harness-engineering/dashboard@0.1.8

## 1.25.5

### Patch Changes

- fix(ci): cross-platform CI fixes for Windows test timeouts and coverage scripts
- fix(cli): prevent `--global` from orphaning core harness slash commands

  `harness generate-slash-commands --global` and `harness update` (global) no longer remove core harness commands when run from a project with installed third-party skills.

- fix(telemetry): use `distinct_id` (snake_case) for PostHog batch API

  PostHog requires `distinct_id` but the code sent `distinctId` (camelCase), causing all telemetry events to be silently rejected with HTTP 400. Added identity fallbacks from `harness.config.json` name and `git config user.name`. Added `harness telemetry test` command for verifying PostHog connectivity.

- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @harness-engineering/core@0.23.0
  - @harness-engineering/types@0.10.0
  - @harness-engineering/orchestrator@0.2.11
  - @harness-engineering/dashboard@0.1.7

## 1.25.4

### Patch Changes

- ad48d91: Fix orchestrator state reconciliation, stale worktree reuse, and dashboard production proxy

  **@harness-engineering/orchestrator:**
  - Reconcile completed/claimed state against roadmap on each tick: completed entries are released after a grace period when they reappear as active candidates, and orphaned claims are released when escalated issues leave active candidates
  - Always recreate worktrees from latest base ref on dispatch instead of reusing stale worktrees from before an orchestrator restart
  - Add `analyses/`, `interactions/`, `workspaces/` to `.harness/.gitignore` template so orchestrator runtime directories are never committed

  **@harness-engineering/dashboard:**
  - Proxy orchestrator API and WebSocket in production mode (`harness dashboard run`), not just in Vite dev server — fixes dashboard failing to connect to orchestrator in production
  - Fix CORS to allow non-loopback HOST bindings

  **@harness-engineering/cli:**
  - Add `--orchestrator-url` flag to `harness dashboard` command for configuring the orchestrator proxy target

- Updated dependencies [ad48d91]
  - @harness-engineering/orchestrator@0.2.10
  - @harness-engineering/dashboard@0.1.6

## 1.25.3

### Patch Changes

- 1d0fdd8: Rename orchestrator config file from WORKFLOW.md to harness.orchestrator.md. The CLI default for `--workflow` now points to `harness.orchestrator.md`.
- Updated dependencies [1d0fdd8]
  - @harness-engineering/orchestrator@0.2.9

## 1.25.2

### Patch Changes

- 2911ef5: Fix telemetry pipeline and hook path resolution
  - Fix identity field lowercasing in telemetry wizard: project name, team, and alias now preserve original casing
  - Add `hooks/` and `security/` to `.harness/.gitignore` template so generated artifacts are never committed
  - Add CLI command telemetry: every `harness` CLI invocation writes an adoption record to `adoption.jsonl`, flushed to PostHog on the next invocation
  - Fix hook path resolution: use `git rev-parse --show-toplevel` so hooks resolve correctly when Claude Code CWD is a subdirectory
  - Untrack `.harness/security/timeline.json` (runtime artifact committed before gitignore rule existed)

## 1.25.1

### Patch Changes

- 370cefb: Fix hook refresh failure after global install. `resolveHookSourceDir()` path resolution failed in bundled dist layout, and `copy-assets.mjs` was not copying hook scripts to `dist/hooks/`.

## 1.25.0

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

- Updated dependencies [f1bc300]
- Updated dependencies
  - @harness-engineering/core@0.22.0
  - @harness-engineering/orchestrator@0.2.8
  - @harness-engineering/dashboard@0.1.5

## 1.24.3

### Patch Changes

- 46999c5: Fix `harness dashboard` returning 404 on all routes by serving built client static files from the Hono API server with SPA fallback.
- 802a1dd: Fix `search_skills` returning irrelevant results and compaction destroying skill content.
  - Index all non-internal skills regardless of tier so the router can discover Tier 1/2 skills
  - Add minimum score threshold (0.25) to filter noise from incidental substring matches
  - Fix `resultToMcpResponse` double-wrapping strings with `JSON.stringify`, which collapsed newlines and caused truncation to drop all content
  - Truncate long lines to fit budget instead of silently skipping them; cap marker cost at 50% of budget
  - Exempt 12 tools from lossy truncation (run_skill, emit_interaction, manage_state, etc.) — use structural-only compaction for tools whose output must arrive complete

- Updated dependencies [46999c5]
- Updated dependencies [802a1dd]
  - @harness-engineering/dashboard@0.1.4
  - @harness-engineering/core@0.21.4
  - @harness-engineering/orchestrator@0.2.7

## 1.24.1

### Patch Changes

- 5bbad27: Fix `harness update` to check all installed packages for updates, not just CLI. Adds `--force` and `--regenerate` flags.

## 1.24.0

### Minor Changes

- Skill dispatcher enhancements, knowledge skill infrastructure, and structural improvements
  - Add `related_skills` traversal and knowledge auto-injection (cap N=3) to skill dispatcher
  - Add `paths` glob dimension to skill scoring (0.20 weight)
  - Add NL router skill with `command_name` override
  - Add `--skills-dir`, bulk install, global skills, and GitHub source to install command
  - Replicate knowledge skills across gemini-cli, cursor, and codex platforms
  - Add `return` after `process.exit()` calls for TypeScript control-flow correctness
  - Replace `!!` with `Boolean()` for explicit boolean coercion in integrations list
  - Reduce Tier 2 structural complexity across CLI commands

### Patch Changes

- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @harness-engineering/core@0.21.2
  - @harness-engineering/graph@0.4.2
  - @harness-engineering/linter-gen@0.1.6
  - @harness-engineering/orchestrator@0.2.6
  - @harness-engineering/types@0.9.1

## 1.23.2

### Patch Changes

- Reduce cyclomatic complexity in `traceability` command
- Updated dependencies
  - @harness-engineering/core@0.21.1 — fix blocked status corruption in external sync

## 1.23.1

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.21.0 — roadmap sync: remove auto-assignee, add title-based dedup, single fetch per cycle

## 1.23.0

### Minor Changes

- Add `assignee` field to `manage_roadmap update` action

  The `update` action now accepts an `assignee` parameter that delegates to `assignFeature()` for proper assignment history tracking (new assignment and reassignment with unassigned + assigned records). Because `update` is a mutating action, `triggerExternalSync` fires automatically — fixing the bug where the roadmap pilot skill bypassed sync by calling `assignFeature()` directly.

## 1.22.0

### Minor Changes

- Predictive architecture failure analysis, spec-to-implementation traceability, architecture decay timeline, and skill recommendation engine

## 1.21.0

### Minor Changes

- Return readable markdown from emit_interaction instead of JSON blob

  Split the single JSON content item into dual items: rendered markdown first (audience: user+assistant) and metadata JSON second (audience: assistant), with MCP audience annotations. This makes emit_interaction output readable on Gemini CLI and other clients that display raw MCP tool responses.

### Patch Changes

- Fix search_skills to find skills by name and description, not just keywords

## 1.20.1

### Patch Changes

- Fix injection scanner false positives on trusted MCP tool output

  The sentinel injection guard was scanning output from all MCP tools, including harness-internal tools like `run_skill` and `gather_context` that return project documentation and state. Skill docs containing legitimate patterns (e.g., `<context>` XML tags, "auto-approve" feature descriptions) triggered INJ-CTX-003 and INJ-PERM-003, tainting the session and blocking git operations.

  Added `trustedOutputTools` option to the injection guard middleware. All harness MCP tools are marked as trusted (opt-in), skipping output scanning while preserving input scanning. New tools default to untrusted.

## 1.20.0

### Minor Changes

- Load project `.env` for external sync — The MCP server's `triggerExternalSync` now loads `.env` from the project root when `GITHUB_TOKEN` is not already in the environment, fixing token discovery when the MCP server's working directory differs from the project.

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.19.0 — GitHub sync assignee push and auto-population

## 1.19.0

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.18.0 — GitHub milestone sync, feature type labels, rate limit retry

## 1.18.0

### Minor Changes

- Environment configuration via `.env` file
  - **dotenv support** — Added `dotenv` as a runtime dependency. Both CLI entry points (`harness`, `harness-mcp`) now load `.env` from the working directory at startup via `import 'dotenv/config'`.
  - **`.env.example`** — New file at repo root documenting all known environment variables: API keys (GITHUB_TOKEN, CONFLUENCE_API_KEY, CONFLUENCE_BASE_URL, JIRA_API_KEY, JIRA_BASE_URL, SLACK_API_KEY), integrations (PERPLEXITY_API_KEY), feature flags (HARNESS_NO_UPDATE_CHECK, CI), and server config (PORT).
  - **`.gitignore` hardening** — Broadened env file patterns from `.env` / `.env*.local` to `.env*` with `!.env.example` exception, catching all variants (`.env.production`, `.env.staging`, etc.).

## 1.17.0

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
  - @harness-engineering/core@0.17.0
  - @harness-engineering/graph@0.3.5
  - @harness-engineering/orchestrator@0.2.5

## 1.16.0

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
  - @harness-engineering/core@0.16.0
  - @harness-engineering/types@0.6.0
  - @harness-engineering/orchestrator@0.2.4
  - @harness-engineering/graph@0.3.4

## 1.15.0

### Minor Changes

- **Hooks system** — 6 hook scripts (`block-no-verify`, `cost-tracker`, `pre-compact-state`, `protect-config`, `quality-gate`, `profiles`) with profile tiers (minimal/standard/strict). CLI commands `hooks init`, `hooks list`, `hooks remove` for managing Claude Code hooks via `settings.json` merge.
- **Code navigation MCP tools** — Register `code_outline`, `code_search`, and `code_unfold` tools in the MCP server, powered by the new core code-nav module.
- **Event timeline in `gather_context`** — Structured event log integration for richer context assembly.
- **Learnings progressive disclosure** — Depth parameter in `gather_context` and `loadBudgetedLearnings` for layered context retrieval. Frontmatter annotations and index entry extraction.
- **Onboarding funnel** — `harness setup` command, `doctor` health check, and first-run welcome experience.
- **Session learning promotion** — Autopilot DONE state promotes session learnings and suggests pruning.

### Patch Changes

- Fix shell injection and `-n` flag bypass in hook scripts
- Fix `execFileSync` consistency and MCP-003 wildcard in security/hooks
- Fix stale scripts, malformed settings, and fallback error in hooks CLI
- Fix roadmap sync guard with directional protection
- Updated dependencies
  - @harness-engineering/core@0.15.0
  - @harness-engineering/types@0.5.0

## 1.14.0

### Minor Changes

- **Multi-language template system** — 5 language bases (Python, Go, Rust, Java, TypeScript) and 10 framework overlays (FastAPI, Django, Gin, Axum, Spring Boot, Next.js, React Vite, Express, NestJS). Language-aware resolution in `TemplateEngine` with `detectFramework()` auto-detection.
- **`--language` flag** — Explicit language selection for `harness init` with conflict validation against detected framework.
- **Framework conventions** — `harness init` appends framework-specific conventions to existing AGENTS.md and persists tooling/framework metadata in `harness.config.json`.
- **Session sections in `manage_state`** — New session section actions (read, append, status update) with schema-validated definitions.
- **Session section retrieval in `gather_context`** — New `sessions` include key for loading session section data.
- **MCP `init_project` enhancements** — Accepts `language` parameter and persists tooling metadata.

### Patch Changes

- Fix `detectFramework` file descriptor leak with try/finally guard
- Fix enum constraints on session section and status MCP schema properties
- Reduce cyclomatic complexity across template and tool modules
- Updated dependencies
  - @harness-engineering/core@0.14.0
  - @harness-engineering/types@0.4.0

## 1.13.1

### Patch Changes

- **Graph tools decomposition** — Split `graph.ts` (821 lines) into 9 focused modules under `tools/graph/`: `query-graph`, `search-similar`, `find-context-for`, `get-relationships`, `get-impact`, `ingest-source`, `detect-anomalies`, `ask-graph`, and shared utilities.
- **Roadmap handler refactor** — Extracted 6 action handlers from `handleManageRoadmap` into standalone functions with shared `RoadmapDeps` interface.
- **Three-tier skill loading** — New `search_skills` MCP tool (46 total). Skill dispatcher with tier-based loading, index builder, and stack profile detection.
- **`check_docs` docsDir fix** — `check_docs` MCP tool and `harness add` command now honor the `docsDir` config field.
- **Cross-platform path fix** — `path.relative()` outputs normalized to POSIX separators across glob helper and path utilities.
- **Gather-context fix** — Resolved `exactOptionalPropertyTypes` error in gather-context tool.
- MCP tool count test assertions updated from 45 to 46.
- Updated dependencies
  - @harness-engineering/core@0.13.1
  - @harness-engineering/orchestrator@0.2.3

## 1.13.0

### Minor Changes

- Efficient Context Pipeline: session support in MCP tools, learnings prune command, roadmap parser fix
  - **`harness learnings prune`**: New CLI command that analyzes global learnings for recurring patterns, presents improvement proposals, and archives old entries keeping 20 most recent
  - **`gather_context` session support**: Added `session` and `learningsBudget` parameters for session-scoped context loading with token-budgeted learnings
  - **`manage_state` session support**: All 7 actions (show, learn, failure, archive, reset, save-handoff, load-handoff) now accept `session` parameter for session-scoped state
  - **`emit_interaction` session support**: Handoff writes respect session scoping when `session` parameter is provided
  - **Roadmap parser fix**: `manage_roadmap` no longer clobbers the roadmap file — parser accepts both `### Feature: X` and `### X` formats, serializer outputs format matching actual roadmap

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.13.0
  - @harness-engineering/types@0.3.1

## 1.12.0

### Minor Changes

- Add constraint sharing commands and private registry support
  - `harness install-constraints` — install shared constraint bundles with conflict detection, dry-run mode, and `--force-local`/`--force-package` resolution
  - `harness uninstall-constraints` — remove contributed rules using lockfile-driven tracking
  - `harness install --from` — install skills from local paths (directories or tarballs)
  - `harness install --registry` / `harness search --registry` / `harness publish --registry` — private registry support with `.npmrc` token reading
  - Upgrade detection in `install-constraints` (uninstall old version before installing new)
  - Fix `exactOptionalPropertyTypes` violation in install command

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.12.0
  - @harness-engineering/orchestrator@0.2.1

## 1.11.0

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
  - @harness-engineering/orchestrator@0.2.0
  - @harness-engineering/core@0.11.0
  - @harness-engineering/types@0.3.0
  - @harness-engineering/graph@0.3.2
  - @harness-engineering/linter-gen@0.1.3

## 1.10.0

### Minor Changes

- **Merge `@harness-engineering/mcp-server` into CLI** — the MCP server (42 tools, 8 resources) now ships as part of the CLI package. Installing `@harness-engineering/cli` provides both `harness` and `harness-mcp` binaries.
  - Move source to `packages/cli/src/mcp/` (server, tools, resources, utils)
  - Move tests to `packages/cli/tests/mcp/` (37 test files, 889 tests)
  - Add `harness mcp` subcommand and `harness-mcp` bin entry
  - Add `@modelcontextprotocol/sdk` as dependency (externalized in tsup)
  - Re-export `createHarnessServer`, `startServer`, `getToolDefinitions` from CLI index
  - `@harness-engineering/mcp-server` is now deprecated
- Add lint check to `assess_project` tool with enforcement in execution skill
- Embed automatic roadmap sync into pipeline skills
- Update `release-readiness` skill to use `assess_project` with lint

### Patch Changes

- Replace `no-explicit-any` casts with typed interfaces in `gather-context`
- Unify `paths.ts` with `findUpFrom` + `process.cwd()` fallback
- Updated dependencies
  - @harness-engineering/core@0.10.1
  - @harness-engineering/graph@0.3.1

## 1.9.0

### Minor Changes

- Pick up composite MCP tools (`gather_context`, `assess_project`, `review_changes`), agent workflow acceleration, and `detect_anomalies` tool via updated mcp-server

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.10.0
  - @harness-engineering/graph@0.3.0

## 1.8.0

### Minor Changes

- Upgrade `review` command with `--comment`, `--ci`, `--deep`, and `--no-mechanical` flags for the unified 7-phase review pipeline
- Add update-check hooks with startup background check and notification helpers
- Read `updateCheckInterval` from project config in update-check hooks
- Add `parseConventionalMarkdown` utility for interaction surface patterns

### Patch Changes

- Resolve TypeScript strict-mode errors and platform parity gaps
- Updated dependencies
  - @harness-engineering/core@0.9.0
  - @harness-engineering/types@0.2.0

## 1.7.0

### Minor Changes

- Remove `harness-mcp` binary from CLI package to break cyclic dependency with `@harness-engineering/mcp-server`. The `harness-mcp` binary is now provided exclusively by `@harness-engineering/mcp-server`. Users who install the CLI globally should also install `npm install -g @harness-engineering/mcp-server` for MCP server support.
- Remove `@harness-engineering/mcp-server` from production dependencies

### Patch Changes

- Align dependency versions across workspace: `@types/node` ^22, `vitest` ^4, `minimatch` ^10, `typescript` ^5.3.3

## 1.6.2

### Patch Changes

- Bundle workspace packages into CLI dist so global install works without sibling packages

## 1.6.1

### Patch Changes

- Updated dependencies
  - @harness-engineering/graph@0.2.1

## 1.6.0

### Minor Changes

- Add agent definition generator for persona-based routing
- Add 5 new graph-powered skills: harness-impact-analysis, harness-dependency-health, harness-hotspot-detector, harness-test-advisor, harness-knowledge-mapper
- Add 2 new personas: Graph Maintainer, Codebase Health Analyst
- Update all 12 Tier-1/Tier-2 skill SKILL.md files with graph-aware context gathering notes
- Add graph refresh steps to 8 code-modifying skills
- Add platform parity lint rule (platform-parity.test.ts) ensuring claude-code and gemini-cli skills stay in sync
- Update 3 existing personas with graph skill references

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.8.0
  - @harness-engineering/graph@0.2.0

## 1.5.0

### Minor Changes

- Discover project-local skills in `generate-slash-commands` by default instead of only finding built-in global skills
  - New `--include-global` flag merges built-in skills alongside project skills
  - Project skills take precedence over global skills on name collision
  - Falls back to global skills when run outside a project (backward compatible)
  - Helpful message when no skills are found with guidance on `--include-global` and `create-skill`
- Export `SkillSource` type from package index

### Patch Changes

- Fix `create-skill` to scaffold with both `claude-code` and `gemini-cli` platforms by default

## 1.4.0

### Patch Changes

- Fix `update` command to use `@latest` per package instead of a single version

## 1.3.0

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
  - @harness-engineering/core@0.7.0

## 1.2.2

### Patch Changes

- Fix slash command descriptions not appearing in Claude Code by moving YAML frontmatter to line 1

## 1.2.1

### Patch Changes

- dc88a2e: Codebase hardening: normalize package scripts, deduplicate Result type, tighten API surface, expand test coverage, and fix documentation drift.

  **Breaking (core):** Removed 6 internal helpers from the entropy barrel export: `resolveEntryPoints`, `parseDocumentationFile`, `findPossibleMatches`, `levenshteinDistance`, `buildReachabilityMap`, `checkConfigPattern`. These were implementation details not used by any downstream package. If you imported them directly from `@harness-engineering/core`, import from the specific detector file instead (e.g., `@harness-engineering/core/src/entropy/detectors/drift`).

  **core:** `Result<T,E>` is now re-exported from `@harness-engineering/types` instead of being defined separately. No consumer-facing change.

  **All packages:** Normalized scripts (consistent `test`, `test:watch`, `lint`, `typecheck`, `clean`). Added mcp-server to root tsconfig references.

  **mcp-server:** Fixed 5 `no-explicit-any` lint errors in architecture, feedback, and validate tools.

  **Test coverage:** Added 96 new tests across 13 new test files (types, cli subcommands, mcp-server tools).

  **Documentation:** Rewrote cli.md and configuration.md to match actual implementation. Fixed 10 inaccuracies in AGENTS.md.

- Updated dependencies [dc88a2e]
  - @harness-engineering/core@0.6.0

## 1.1.1

### Patch Changes

- Fix setup-mcp to write Claude Code config to .mcp.json (not .claude/settings.json), add Gemini trusted folder support, fix package name to @harness-engineering/mcp-server, and export CLI functions for MCP server integration.

## 1.1.0

### Minor Changes

- Add setup-mcp command and auto-configure MCP server during init for Claude Code and Gemini CLI

## 1.0.2

### Patch Changes

- Bundle agents (skills + personas) into dist for global install support

## 1.0.1

### Patch Changes

- Bundle templates into dist for global install support
