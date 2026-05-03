# Configurable Domain Inference for the Knowledge Pipeline

**Keywords:** domain-inference, knowledge-pipeline, classifier, configurable-patterns, blocklist, harness-config, KnowledgeStagingAggregator

## Overview

`harness knowledge-pipeline` produces a per-domain coverage report that depends on classifying each extracted entry into a domain. Two issues currently block accurate classification:

1. **The aggregator never infers domain from path.** `packages/graph/src/ingest/KnowledgeStagingAggregator.ts:163` reads `node.metadata?.domain` and falls back to the literal string `'unknown'`. No path-based inference runs at this point.
2. **Existing path inferrer isn't shared.** `packages/graph/src/ingest/KnowledgeDocMaterializer.ts:144-168` has a working `inferDomain` function (covers `packages/<name>` and `src/<name>` patterns), but it's a private method on a single class.

**Result on this repo:** 7,500 of 7,621 extracted entries land in the `unknown` domain, dragging the overall coverage grade to F (14/100) and obscuring real per-domain gaps.

### Goal

Ship a domain inferrer that:

- Works out-of-the-box for common monorepo conventions (`packages/`, `apps/`, `services/`, `src/`, `lib/` with `<name>` segment).
- Refuses to misclassify infrastructure paths (`node_modules`, `.harness`, `dist`, `build`, etc.) via a reserved blocklist.
- Falls back to first non-blocklisted path segment for anything else.
- Allows per-project customization via `harness.config.json` without requiring a code change downstream.

### Out of Scope

- Content-based or ML-based domain classification (path-only is sufficient for the gap).
- Cross-project domain registries or shared taxonomies.
- Re-extraction of historical entries (the next pipeline run reclassifies all of them via the new inferrer; no migration needed).
- Changing how the `unknown` bucket is _displayed_ in reports (the bucket simply shrinks).

## Decisions

| #   | Decision                                                                                                                                                                         | Rationale                                                                                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Extract `inferDomain` to a shared helper at `packages/graph/src/ingest/domain-inference.ts`                                                                                      | Currently a private method on `KnowledgeDocMaterializer`. Shared helper is the canonical fix for the "two callers, one logic" problem. Both `KnowledgeStagingAggregator` and `CoverageScorer` need it.            |
| D2  | Wire the helper into `KnowledgeStagingAggregator.ts:163` and `CoverageScorer.ts:68`                                                                                              | Both currently fall back to `'unknown'` (or similar fallback) on missing `metadata.domain`. The aggregator drives the gap report; the scorer drives the per-domain coverage grade. Both need the same inference.  |
| D3  | Default patterns: `packages/<name>/`, `apps/<name>/`, `services/<name>/`, `src/<name>/`, `lib/<name>/`                                                                           | Covers the common monorepo conventions across npm, pnpm-workspace, Nx, Turborepo, and Yarn-workspace setups. `<name>` is the second path segment.                                                                 |
| D4  | Reserved blocklist: `node_modules`, `.harness`, `dist`, `build`, `.git`, `coverage`, `.next`, `.turbo`, `.cache`, `out`, `tmp`                                                   | Prevents the generic fallback from producing garbage domains like `node_modules` or `.harness`. List is built-in; users can extend it via config.                                                                 |
| D5  | Generic fallback: first non-blocklisted path segment                                                                                                                             | After default patterns and blocklist, if path has any usable first segment, use it. Catches `agents/skills/foo.ts` → `agents`, `examples/task-api/...` → `examples`, etc.                                         |
| D6  | Final fallback: `'unknown'` (only when path is empty/null/blocklisted-only)                                                                                                      | Preserves backward-compatible behavior when nothing can be inferred. Existing report format keeps an `unknown` row when applicable, just much smaller.                                                            |
| D7  | Config schema: `knowledge.domainPatterns: string[]` and `knowledge.domainBlocklist: string[]` in `harness.config.json`                                                           | Patterns are project-specific; blocklist is project-extensible. Both are optional arrays that _extend_ the built-in defaults rather than replace them (keeps defaults working when config is partial).            |
| D8  | Pattern syntax: `<prefix>/<dir>` where `<dir>` becomes the domain                                                                                                                | Simple. No glob/regex initially. If `agents/skills/foo` should map to `skills` instead of `agents`, the user adds `agents/<dir>` (extracts the `<dir>` segment after `agents/`). YAGNI on more-flexible syntaxes. |
| D9  | Precedence: `metadata.domain` (explicit) > config patterns > built-in patterns > generic fallback > `'unknown'`                                                                  | Explicit metadata always wins. Config layered before built-ins so user can override default behavior for their layout.                                                                                            |
| D10 | `KnowledgeDocMaterializer.inferDomain` keeps its existing connector-source branch (`'knowledge-linker' / 'connector'` → connector name or `'general'`); branch moves into helper | Branch is specific to KnowledgeLinker-produced facts that have no `path`. Move it into the shared helper too — it's general-purpose.                                                                              |

## Technical Design

### Files Modified / Created

| Action     | File                                                      | Change                                                                               |
| ---------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Create** | `packages/graph/src/ingest/domain-inference.ts`           | New shared helper module exporting `inferDomain(node, options)` and supporting types |
| **Create** | `packages/graph/tests/ingest/domain-inference.test.ts`    | Unit tests for the helper                                                            |
| **Modify** | `packages/graph/src/ingest/KnowledgeDocMaterializer.ts`   | Replace private `inferDomain` method with call to shared helper                      |
| **Modify** | `packages/graph/src/ingest/KnowledgeStagingAggregator.ts` | Replace `'unknown'` fallback at line 163 with shared helper call                     |
| **Modify** | `packages/graph/src/ingest/CoverageScorer.ts`             | Replace `fallback(node)` call at line 68 with shared helper                          |
| **Modify** | `packages/cli/src/config/schema.ts`                       | Add `knowledge.domainPatterns` and `knowledge.domainBlocklist` fields                |
| **Modify** | `packages/cli/tests/config/*.test.ts`                     | Schema validation tests                                                              |
| **Modify** | `packages/graph/src/index.ts` (barrel)                    | Export `inferDomain` for downstream consumers                                        |

### Shared Helper API

```ts
// packages/graph/src/ingest/domain-inference.ts

export interface DomainInferenceOptions {
  /** Additional patterns beyond the built-in defaults. Format: 'prefix/<dir>'. */
  extraPatterns?: readonly string[];
  /** Additional blocklisted segments beyond the built-in defaults. */
  extraBlocklist?: readonly string[];
}

const DEFAULT_PATTERNS: readonly string[] = [
  'packages/<dir>',
  'apps/<dir>',
  'services/<dir>',
  'src/<dir>',
  'lib/<dir>',
];

const DEFAULT_BLOCKLIST: ReadonlySet<string> = new Set([
  'node_modules',
  '.harness',
  'dist',
  'build',
  '.git',
  'coverage',
  '.next',
  '.turbo',
  '.cache',
  'out',
  'tmp',
]);

/**
 * Infer the domain for a graph node.
 *
 * Precedence:
 *   1. node.metadata.domain (explicit, highest)
 *   2. Config-provided patterns (extraPatterns)
 *   3. Built-in patterns (DEFAULT_PATTERNS)
 *   4. Generic first-segment fallback (after blocklist filter)
 *   5. KnowledgeLinker connector source (when path is null)
 *   6. 'unknown' (only when nothing else applies)
 */
export function inferDomain(
  node: { path?: string; metadata?: Record<string, unknown> },
  options: DomainInferenceOptions = {}
): string;
```

`matchPattern(path, pattern)` is an internal helper that captures the `<dir>` segment after a prefix match. Pattern format `'prefix/<dir>'` enforces single-segment prefix; multi-segment is a future revision if needed.

### Schema Additions

```jsonc
// harness.config.json (relevant slice)
{
  "knowledge": {
    "domainPatterns": ["agents/<dir>"], // optional, extends defaults
    "domainBlocklist": ["scratch", "fixtures"], // optional, extends defaults
  },
}
```

```ts
// packages/cli/src/config/schema.ts
export const KnowledgeConfigSchema = z.object({
  // ...existing fields
  domainPatterns: z
    .array(z.string().regex(/^[\w.-]+\/<dir>$/))
    .optional()
    .default([]),
  domainBlocklist: z.array(z.string().min(1)).optional().default([]),
});
```

Pattern regex `^[\w.-]+\/<dir>$` enforces the `prefix/<dir>` format with a single-segment prefix only.

### Wiring at Call Sites

```ts
// KnowledgeStagingAggregator.ts (around line 163)
// Before:  const domain = (node.metadata?.domain as string) ?? 'unknown';
// After:   const domain = inferDomain(node, this.inferenceOptions);

// CoverageScorer.ts (around line 68)
// Before:  const domain = (node.metadata.domain as string) ?? fallback(node);
// After:   const domain = inferDomain(node, options);

// KnowledgeDocMaterializer.ts:144-168 — replace method body:
inferDomain(node: GraphNode): string | null {
  const result = inferDomain(node, this.inferenceOptions);
  return result === 'unknown' ? null : result;
}
```

`KnowledgeDocMaterializer.inferDomain` returns `null` instead of `'unknown'` because callers like `processNode` already special-case `null` → `'no_domain'` reason.

### Config Plumbing

- `KnowledgePipelineRunner` reads `knowledge.domainPatterns` and `knowledge.domainBlocklist` from `harness.config.json` at startup.
- Passes them to `KnowledgeStagingAggregator`, `CoverageScorer`, and `KnowledgeDocMaterializer` constructors as `inferenceOptions`.
- Standalone callers (tests, scripts) pass `{}` or the desired override. Defaults preserve back-compat.

### Backward Compatibility

- Nodes with explicit `metadata.domain` continue to classify as before (highest precedence).
- Existing extracted JSONL files don't need migration — they're re-classified on next pipeline run.
- `'unknown'` bucket still exists in the report; it just shrinks.
- No CLI breaking changes.
- No graph schema changes.

## Integration Points

### Entry Points

- **No new entry points.** No new CLI commands, MCP tools, slash commands, or skills.
- **Modified internals:**
  - `inferDomain` becomes a public export of `@harness-engineering/graph`.
  - `KnowledgeStagingAggregator`, `CoverageScorer`, and `KnowledgePipelineRunner` constructors accept an optional `inferenceOptions` parameter.
  - `harness.config.json` schema gains two optional fields under `knowledge`.

### Registrations Required

- **Barrel export:** `packages/graph/src/index.ts` exports `inferDomain` and `DomainInferenceOptions`. Verify regeneration if barrel is auto-generated.
- **Config schema validation:** new fields reachable from `resolveConfig` → `loadConfig` → `HarnessConfigSchema.safeParse` (same chain validated for `design.enabled` in init-design-roadmap-config Phase 1).
- **No new skill registration.**
- **No `depends_on` updates.**

### Documentation Updates

- `docs/reference/configuration.md` — Document new `knowledge.domainPatterns` and `knowledge.domainBlocklist` fields with example.
- `docs/knowledge/graph/node-edge-taxonomy.md` — Add a "Domain Inference" section documenting precedence order.
- `docs/reference/api/graph.md` — Auto-regenerated via existing API surface index; new `domain-inference.ts` appears automatically.
- Optional: `agents/skills/claude-code/harness-knowledge-pipeline/SKILL.md` — One-line note in EXTRACT phase about path-based inference.
- `AGENTS.md` — No update needed.

### Architectural Decisions

- **No ADR required.** This is a refinement of an existing classifier, not a new architectural pattern.

### Knowledge Impact

- The `unknown` domain bucket shrinks substantially (~7,500 → small handful on this repo).
- Per-domain coverage grades become meaningful (currently artificially low because most entries land in `unknown`).
- Graph queries by domain (`ask_graph` / `query_graph`) become more useful — filtering by `metadata.domain === 'cli'` returns the real cli set.
- No new domain concepts, patterns, or relationships in the knowledge graph.
- Existing extracted entries reclassify on next pipeline run; no migration script needed.

## Success Criteria

### Behavioral

1. `inferDomain({ path: 'packages/cli/src/foo.ts' })` returns `'cli'`.
2. `inferDomain({ path: 'apps/web/src/index.tsx' })` returns `'web'`.
3. `inferDomain({ path: 'services/api/handler.ts' })` returns `'api'`.
4. `inferDomain({ path: 'src/utils/foo.ts' })` returns `'utils'`.
5. `inferDomain({ path: 'lib/parser.ts' })` returns `'parser'`.
6. `inferDomain({ path: 'agents/skills/foo.ts' }, { extraPatterns: ['agents/<dir>'] })` returns `'skills'` (config wins over generic fallback).
7. `inferDomain({ path: 'agents/skills/foo.ts' })` (no config) returns `'agents'` (generic first-segment fallback).
8. `inferDomain({ path: 'node_modules/foo/index.js' })` returns `'unknown'` (blocklisted, no further match).
9. `inferDomain({ path: '.harness/extracted/x.jsonl' })` returns `'unknown'`.
10. `inferDomain({ metadata: { domain: 'explicit' }, path: 'packages/cli/foo.ts' })` returns `'explicit'` (metadata wins).
11. `inferDomain({ metadata: { source: 'knowledge-linker', connectorName: 'jira' } })` returns `'jira'`.
12. `inferDomain({ metadata: { source: 'knowledge-linker' } })` returns `'general'` (path-less linker fact, no connector).
13. `inferDomain({ metadata: { domain: 'foo' } })` returns `'foo'` even with missing path.
14. `inferDomain({ path: 'unknown-dir/foo.ts' })` returns `'unknown-dir'` (generic fallback for unrecognized but non-blocklisted top-level).

### Aggregator Integration

15. After `harness knowledge-pipeline` on this repo with no config changes, `.harness/knowledge/gaps.md` shows the `unknown` row drop from 7,500 to <100 entries.
16. Per-domain coverage grade for `cli`, `core`, `graph`, `orchestrator`, `dashboard`, `intelligence` rises by at least one letter grade each.
17. `KnowledgeStagingAggregator.generateGapReport()` no longer emits `'unknown'` as the dominant domain on a typical monorepo.

### Configuration

18. `harness.config.json` accepts `knowledge.domainPatterns: ["agents/<dir>"]` without schema-validation errors.
19. `harness.config.json` accepts `knowledge.domainBlocklist: ["scratch", "fixtures"]` without schema-validation errors.
20. Malformed pattern (e.g., `"agents"` without `<dir>`) fails schema validation with a clear error message.
21. Empty/missing `knowledge.domainPatterns` / `knowledge.domainBlocklist` fall back to defaults — backward compatible.
22. Pattern in config takes precedence over a generic-fallback match for the same path.

### Backward Compatibility

23. Existing graph nodes with `metadata.domain` continue to classify as before.
24. Existing extracted JSONL files don't require migration; next pipeline run reclassifies via the new inferrer.
25. `KnowledgeDocMaterializer.inferDomain` continues to return `null` for unmappable paths.
26. Programmatic callers of `KnowledgeStagingAggregator` constructor without `inferenceOptions` continue to work (defaults to `{}`).

### Validation

27. `harness validate` passes after the change.
28. `harness check-deps` passes (no new layer/import-direction violations).
29. Full `pnpm --filter @harness-engineering/graph test` suite passes including new domain-inference tests.
30. Full `pnpm --filter @harness-engineering/cli test` suite passes (no regressions in config-schema tests).
31. Re-running `harness knowledge-pipeline` produces an observable diff between pre- and post-change `gaps.md`.

## Implementation Order

### Phase 1: Shared helper

<!-- complexity: low -->

1. Create `packages/graph/src/ingest/domain-inference.ts` with `inferDomain` function, `DomainInferenceOptions` type, `DEFAULT_PATTERNS`, `DEFAULT_BLOCKLIST`, and `matchPattern` helper.
2. Create `packages/graph/tests/ingest/domain-inference.test.ts` with TDD-first tests covering all 14 behavioral criteria.
3. Export `inferDomain` and `DomainInferenceOptions` from `packages/graph/src/index.ts`.
4. Verify `pnpm --filter @harness-engineering/graph test -- domain-inference` passes 14/14.

### Phase 2: Wire into existing call sites

<!-- complexity: low -->

5. Refactor `KnowledgeDocMaterializer.ts:144-168` — replace private `inferDomain` body with shared helper. Preserve `null`-on-`'unknown'` contract.
6. Refactor `KnowledgeStagingAggregator.ts:163` — replace `'unknown'` fallback with `inferDomain(node, this.inferenceOptions)`.
7. Refactor `CoverageScorer.ts:68` — replace `fallback(node)` with shared helper. Deprecate the legacy `fallback` parameter.
8. Add optional `inferenceOptions` constructor parameter to all three classes (default `{}`).
9. Update existing tests if any hardcoded `'unknown'` for previously-unclassifiable paths.
10. Verify `pnpm --filter @harness-engineering/graph test` full suite passes.

### Phase 3: Config schema

<!-- complexity: low -->

11. Add `knowledge.domainPatterns` and `knowledge.domainBlocklist` fields to `packages/cli/src/config/schema.ts`. Both `z.array(z.string()).optional().default([])`.
12. Add pattern-format regex validation: `^[\w.-]+\/<dir>$`.
13. Add tests in `packages/cli/tests/config/` covering valid, invalid, optional, and default cases.
14. Verify `harness validate` accepts both populated and absent `knowledge.*` config slices.

### Phase 4: Config plumbing

<!-- complexity: medium -->

15. Update `KnowledgePipelineRunner` to read `knowledge.domainPatterns` and `knowledge.domainBlocklist` at startup.
16. Pass resolved options through to `KnowledgeStagingAggregator`, `CoverageScorer`, and `KnowledgeDocMaterializer` constructors.
17. Verify the full pipeline still runs with no config (defaults work) and with config (overrides take precedence).
18. Add an integration test invoking the pipeline against a fixture with `knowledge.domainPatterns: ["agents/<dir>"]` and asserting `agents/skills/foo` classifies as `skills`.

### Phase 5: Documentation

<!-- complexity: low -->

19. Update `docs/reference/configuration.md` with new fields and example.
20. Add a "Domain Inference" section to `docs/knowledge/graph/node-edge-taxonomy.md` documenting precedence.
21. Optionally add a one-line note in `agents/skills/claude-code/harness-knowledge-pipeline/SKILL.md` EXTRACT phase.

### Phase 6: Verification

<!-- complexity: medium -->

22. Run `harness knowledge-pipeline` on this repo with no config — capture before/after diff in `.harness/knowledge/gaps.md`. Verify `unknown` drops from 7,500 to <100.
23. Run `harness knowledge-pipeline --coverage` — verify per-domain grades for `cli`, `core`, `graph`, `orchestrator`, `dashboard`, `intelligence` rise by at least one letter grade.
24. Run `harness validate`, `harness check-deps`, `harness check-docs` — all must pass.
25. Run full graph + cli test suites — no regressions.
26. Verification-only: temporarily add `knowledge.domainPatterns: ["agents/<dir>"]` to this repo's `harness.config.json`, re-run pipeline, verify `agents/skills/foo` reclassifies as `skills`. Then revert.

### Sequencing

- Phases 1 → 2 → 3 → 4 are hard order.
- Phase 5 (docs) can run in parallel with Phase 4 once Phase 3 is done.
- Phase 6 must run last — integration verification.
- Phase 4's integration test (step 18) is the meaningful end-to-end gate.
