# Remove Premature Deprecation Warnings from Context Validators

**Keywords:** validation, deprecation, agents-map, knowledge-map, graph, console-warn

## Overview

`validateAgentsMap()` and `validateKnowledgeMap()` in `packages/core` emit `console.warn` deprecation notices directing users to `Assembler.checkCoverage()` from `@harness-engineering/graph`. However, `checkCoverage()` checks code-node documentation coverage (graph edges), while the core functions check AGENTS.md structural integrity (required sections + broken file links). They are complementary, not replacements.

The warnings are premature and misleading. This change removes them.

## Decisions

| Decision                                     | Rationale                                                                                                                                           |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remove warnings, don't replace the functions | The core functions do useful, distinct work that `checkCoverage()` does not replicate                                                               |
| No API changes                               | The functions' signatures and return types remain identical                                                                                         |
| No graph integration in core validators      | The CLI already handles graph-optional enrichment where needed (`docs.ts`). Lifting that pattern into core is a separate enhancement if ever needed |

## Technical Design

### Files Changed

1. **`packages/core/src/context/agents-map.ts`** — Remove `console.warn(...)` from `validateAgentsMap()` (line 156-158)
2. **`packages/core/src/context/knowledge-map.ts`** — Remove `console.warn(...)` from `validateKnowledgeMap()` (line 34-36)
3. **Tests** — Update any test assertions that expect the deprecation warnings

### What Stays the Same

- Both functions' return types (`Result<AgentMapValidation, ContextError>` and `Result<IntegrityReport, ContextError>`)
- All 6 call sites (CLI validate, CLI check-docs, MCP validate_project, MCP check_docs, check-orchestrator, mechanical-checks)
- `Assembler.checkCoverage()` in `@harness-engineering/graph` (untouched)
- The CLI's existing graph-optional enrichment pattern in `docs.ts` (untouched)

## Success Criteria

1. `harness validate` runs without deprecation warnings in stderr
2. All existing tests pass
3. No functional behavior changes to either function's return values

## Implementation Order

1. Remove the 3 `console.warn` calls
2. Update tests
3. Verify with `harness validate`
