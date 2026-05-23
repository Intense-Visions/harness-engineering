## 2026-05-23: Architecture constraints discovered while spec'ing + scaffolding design-pipeline sub-projects #2 + #6

Three load-bearing facts about this codebase that the design-pipeline specs assumed wrong:

1. **`harness:autopilot` cannot run from inside a subagent.** Autopilot's whole architecture is `subagent_type` dispatch to harness-planner / harness-task-executor / harness-verifier / harness-code-reviewer. Spawned background agents do not have the Task tool — they hit autopilot's "Iron Law: delegates, never reimplements" gate at INIT and stop. Autopilot must run from the *primary* Claude Code session (the one with Agent/Task access). Two parallel autopilots = me alternating dispatches from the primary session, not two background agents running autopilots.

2. **Skills are markdown-only and live at `agents/skills/<platform>/<name>/`, NOT `packages/cli/src/skills/<name>/src/`.** The `packages/cli/src/skill/` (singular) directory holds the skill SUBSYSTEM (dispatcher, schema, recommender). Individual skills are `SKILL.md` + `skill.yaml` only. Code that a skill INVOKES lives in conventional homes: MCP tools at `packages/cli/src/mcp/tools/`, graph adapters at `packages/graph/src/constraints/`, shared catalog data at `agents/skills/shared/design-knowledge/`. New specs should reflect this; existing design-pipeline specs got the layout wrong and need a path-correction amendment (see `docs/changes/design-pipeline/AMENDMENTS.md`).

3. **`packages/cli/src/skills/` does not exist.** When a plan or spec references that path, treat it as a red flag for the architecture mismatch in #2 above. Both planner agents that authored plans for design-pipeline #2 and #6 flagged this as concern #1 and built in escalation tasks.

## 2026-05-06: Graph ingest robustness — issues #274 + #276

Two independent crash modes on real-world monorepos, both fixed in this pass:

- **#274 (recursion / OOM)**: `CodeIngestor.findSourceFiles` shipped a 22-entry inline if-chain skip list and missed every modern JS-monorepo cache (`.turbo`, `.vite`, `.cache`, `.docusaurus`, `.wrangler`, `.svelte-kit`, `storybook-static`, etc.) plus AI agent sandbox dirs (`.claude`, `.cursor`, `.codex`). On heavy users, `.claude/worktrees/` (Claude Code's worktree clones) alone multiplied walker workload 50×. The walker was also recursive — one stack frame per directory level. Fix: extracted `DEFAULT_SKIP_DIRS` to a shared constant (60+ entries), rewrote the walker as iterative BFS, added `CodeIngestorOptions` for `skipDirs` / `additionalSkipDirs` / `excludePatterns` / `respectGitignore`, plumbed an `ingest` block through `harness.config.json` → `runScan` / `runIngest`.

- **#276 (V8 string-cap)**: `loadGraph` slurped `graph.json` into one string via `readFile` then `JSON.parse`. V8 hard-caps single strings at ~512 MB; production graphs exceed it. Fix: bumped on-disk schema v1 → v2 with NDJSON format (one record per line, `kind` discriminator), streaming reader via `readline`, `loadGraphMetadata` fast-path so `harness graph status` works on multi-GB graphs without ever opening `graph.json`. Old v1 graphs trigger the existing `schema_mismatch` path → automatic rebuild on next scan.

Lessons:

- For library packages, hand-roll a tiny `.gitignore` parser instead of pulling in the `ignore` package — the common subset (blank, comment, anchored, dir-only, glob) is ~25 lines; negation is the only feature worth deferring.
- Schema migrations are nearly free here because `GraphStore.load` already returns false on `schema_mismatch` and warns the caller to rerun scan. Bumping the version is cheaper than building a migration shim.
- When extracting sub-schemas from `HarnessConfigSchema`, give them their own files — the cli's command-test mocks of `@harness-engineering/graph` are incomplete by convention, and any transitive import dragged in by the schema breaks them.
- JSDoc inside TypeScript files cannot contain literal `**/` — the embedded `*/` ends the comment block and corrupts the parse. Keep glob examples in markdown docs, not JSDoc.

## 2026-04-23: Phase 5 Visual & Advanced — Cross-Layer Interface Re-declaration

When the `graph` package needs to accept an `AnalysisProvider` (from `intelligence`), re-declare a minimal interface locally rather than importing across layers. The `graph` → `intelligence` dependency would violate the layer architecture. The `ImageAnalysisExtractor` declares its own `AnalysisProvider` interface with matching shape, and callers (CLI, pipeline) inject the concrete provider.

## 2026-04-22: Default Directory Ignores for Code Scanning

When implementing directory traversal for code scanning/ingestion, ensure default ignore lists include common build output, dependency, and tool directories for all supported languages and ecosystems:

- **Node.js**: `node_modules`, `dist`, `.next`, `.turbo`
- **Java/Maven/Gradle**: `target`, `build`, `.gradle`, `.gradle-home`
- **Python**: `__pycache__`, `.venv`, `venv`
- **Go/PHP/Ruby/Elixir**: `vendor`, `deps`, `_build`
- **C#**: `bin`, `obj`
- **Rust**: `target`
- **Git**: `.git` (Crucial to avoid scanning internal git objects)
- **Tools**: `.vscode`, `.idea`, `.harness`
- **Test Artifacts**: `coverage`, `.nyc_output`
