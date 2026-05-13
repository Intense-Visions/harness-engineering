---
'@harness-engineering/graph': minor
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

fix(graph/ingest): materialize general Markdown as `document` nodes (#302); consolidate skip-dir usage across walkers and glob excludes

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
