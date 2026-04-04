# Spec-to-Implementation Traceability

**Keywords:** traceability, requirements, coverage-matrix, graph-edges, phase-gates, EARS, testing

## Overview

Requirement-to-code-to-test mapping via the knowledge graph. Adds `requirement` as a first-class graph node type, three new edge types (`requires`, `verified_by`, `tested_by`), a `RequirementIngestor` that extracts requirements from spec Observable Truths and Success Criteria sections, and a coverage matrix showing which spec requirements have corresponding code and tests.

### Goals

1. Every spec requirement is a graph node with edges to the code that implements it and the tests that verify it
2. Coverage matrix answers: "Which requirements have code? Which have tests? Which have neither?"
3. Hybrid test linking — inferred matches (convention-based, low confidence) and explicit matches (`@req` annotations, high confidence)
4. Traceability surfaced as CLI command (`harness traceability`), MCP tool (`check_traceability`), and CI check (severity: `warning` by default)
5. Builds on the graph so `get_impact`, `ask_graph`, and Architecture Decay Timeline inherit requirement awareness automatically

### Out of Scope

- EARS grammar parser with formal validation (future — can layer on as a lint)
- Spec-to-Code Semantic Verification via Claude API (downstream feature, issue #89)
- Test assertion semantic analysis (also #89)
- Behavioral matching beyond keyword/annotation linking

## Decisions

| #   | Decision                                                                                     | Rationale                                                                                      |
| --- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| D1  | Pragmatic requirement extraction from numbered Observable Truths / Success Criteria sections | Works with existing specs immediately; strict EARS validation layered as optional lint later   |
| D2  | Hybrid test linking — convention-based baseline + `@req` annotation override                 | Zero-friction start with precision opt-in; confidence column makes tradeoff transparent        |
| D3  | CLI + MCP + CI check surfaces                                                                | Matches every other harness concern; CI starts as `warning`, promotable to `error`             |
| D4  | Graph-first approach — requirements as first-class nodes                                     | Single source of truth; integrates with `get_impact`, `ask_graph`, Architecture Decay Timeline |
| D5  | `RequirementIngestor` follows existing ingestor pattern                                      | Consistent with `KnowledgeIngestor`, `CodeIngestor`; no new ingestion paradigm                 |
| D6  | Inferred edges carry `confidence` metadata to distinguish from explicit edges                | Human triage can prioritize low-confidence gaps                                                |

## Technical Design

### 1. Graph Schema Additions

**New node type** in `packages/graph/src/types.ts`:

```typescript
// Add to NODE_TYPES array, under Knowledge section:
'requirement',
```

**New edge types** in `packages/graph/src/types.ts`:

```typescript
// Add to EDGE_TYPES array, under Knowledge relationships:
'requires',      // requirement → code (this requirement needs this code)
'verified_by',   // requirement → test_result/file (this requirement is verified by this test)
'tested_by',     // code → test_result/file (this code is tested by this test)
```

**Requirement node structure:**

```typescript
{
  id: 'req:<spec-hash>:<index>',        // e.g., 'req:abc123:3'
  type: 'requirement',
  name: 'When loadGraphStore is called twice, the system shall return the cached instance',
  path: 'docs/changes/feature-x/proposal.md',
  location: { fileId: 'file:docs/changes/feature-x/proposal.md', startLine: 42, endLine: 42 },
  metadata: {
    specPath: 'docs/changes/feature-x/proposal.md',
    index: 3,                            // Position in the numbered list
    section: 'Observable Truths',        // Which section it came from
    rawText: '3. When loadGraphStore...',
    earsPattern: 'event-driven',         // Optional: detected EARS pattern type
    featureName: 'feature-x',           // Extracted from spec path
  }
}
```

**Edge metadata for confidence:**

```typescript
// Inferred (convention-based) edge:
{ from: 'req:abc123:3', to: 'file:tests/feature-x.test.ts', type: 'verified_by',
  confidence: 0.6, metadata: { method: 'convention', matchReason: 'path-pattern' } }

// Explicit (@req annotation) edge:
{ from: 'req:abc123:3', to: 'file:tests/feature-x.test.ts', type: 'verified_by',
  confidence: 1.0, metadata: { method: 'annotation', tag: '@req feature-x#3' } }
```

### 2. RequirementIngestor

New file: `packages/graph/src/ingest/RequirementIngestor.ts`

Follows the same pattern as `KnowledgeIngestor` (constructor takes `GraphStore`, returns `IngestResult`).

**Extraction algorithm:**

1. Scan `docs/changes/*/proposal.md` for spec files
2. For each spec, find sections matching: `Observable Truths`, `Success Criteria`, `Acceptance Criteria`
3. Extract numbered items (regex: `/^\s*(\d+)\.\s+(.+)$/gm`)
4. Create one `requirement` node per item
5. Link requirement → spec document via `specifies` edge (reuses existing edge type)
6. Run convention-based linking to find related code and test files

**Convention-based linking rules:**

| Rule            | From                                             | To                            | Edge          | Confidence |
| --------------- | ------------------------------------------------ | ----------------------------- | ------------- | ---------- |
| Path pattern    | `req:*` from `docs/changes/<feature>/*`          | `file:packages/*/<feature>*`  | `requires`    | 0.5        |
| Path pattern    | `req:*` from `docs/changes/<feature>/*`          | `file:**/tests/**/<feature>*` | `verified_by` | 0.5        |
| Keyword overlap | `req:*` with name containing function/class name | matching code node            | `requires`    | 0.6        |
| Keyword overlap | `req:*` with name containing test description    | matching test file            | `verified_by` | 0.6        |
| Plan file map   | `req:*` linked via plan's File Map section       | files listed in plan          | `requires`    | 0.7        |

**`@req` annotation parsing** (in `CodeIngestor` extension):

```typescript
// Regex for test files: // @req <spec-feature>#<index>
const REQ_TAG = /\/\/\s*@req\s+([\w-]+)#(\d+)/g;
```

When found in a test file, creates `verified_by` edge with `confidence: 1.0`.

### 3. Traceability Query Module

New file: `packages/graph/src/query/Traceability.ts`

```typescript
interface TraceabilityResult {
  readonly specPath: string;
  readonly featureName: string;
  readonly requirements: readonly RequirementCoverage[];
  readonly summary: {
    readonly total: number;
    readonly withCode: number; // Has at least one `requires` edge to code
    readonly withTests: number; // Has at least one `verified_by` edge to test
    readonly fullyTraced: number; // Has both code and test edges
    readonly untraceable: number; // Has neither
    readonly coveragePercent: number;
  };
}

interface RequirementCoverage {
  readonly requirementId: string;
  readonly requirementName: string;
  readonly index: number;
  readonly codeFiles: readonly TracedFile[]; // via `requires` edges
  readonly testFiles: readonly TracedFile[]; // via `verified_by` edges
  readonly status: 'full' | 'code-only' | 'test-only' | 'none';
  readonly maxConfidence: number; // Highest confidence across all edges
}

interface TracedFile {
  readonly path: string;
  readonly confidence: number;
  readonly method: 'convention' | 'annotation' | 'plan-file-map';
}
```

**Query algorithm:**

1. Find all `requirement` nodes (optionally filtered by spec path or feature name)
2. For each requirement, traverse outbound `requires` edges → collect code files
3. For each requirement, traverse outbound `verified_by` edges → collect test files
4. Compute coverage status and summary statistics
5. Return structured result

### 4. CLI Command

New command: `harness traceability`

```
harness traceability [--spec <path>] [--feature <name>] [--json] [--verbose]
```

**Default output (compact):**

```
Spec-to-Implementation Traceability

  docs/changes/feature-x/proposal.md (8 requirements)

  #   Requirement                          Code  Tests  Confidence  Status
  1.  When loadGraphStore is called...     2     1      explicit    ✓ full
  2.  When graph.json mtime changes...     1     1      inferred    ✓ full
  3.  The cache shall be invalidated...    1     0      inferred    ◐ code-only
  4.  Error handling shall return...       0     0      —           ✗ none

  Coverage: 50% fully traced (2/4), 75% with code (3/4), 50% with tests (2/4)
```

**`--verbose`:** Shows file paths and confidence scores per requirement.
**`--json`:** Returns `TraceabilityResult` as JSON.

### 5. MCP Tool

New tool: `check_traceability`

```typescript
{
  name: 'check_traceability',
  description: 'Check requirement-to-code-to-test traceability for a spec or all specs',
  input: {
    path: string,              // Project root
    spec?: string,             // Optional: specific spec file path
    feature?: string,          // Optional: feature name filter
    mode?: 'summary' | 'detailed',
  }
}
```

Returns the same `TraceabilityResult` structure, formatted for agent consumption.

### 6. CI Check Integration

Add `'traceability'` to `CICheckName` in `packages/types/src/index.ts`:

```typescript
export type CICheckName =
  | 'validate'
  | 'deps'
  | 'docs'
  | 'entropy'
  | 'security'
  | 'perf'
  | 'phase-gate'
  | 'arch'
  | 'traceability'; // NEW
```

Add check runner in `packages/core/src/ci/check-orchestrator.ts`:

- Default severity: `warning` (non-blocking)
- Configurable threshold: minimum coverage percentage (default: 0%, meaning any coverage is fine)
- Teams can promote to `error` and set threshold (e.g., 80%) in `harness.config.json`

**Config schema addition:**

```typescript
traceability: {
  enabled: true,
  severity: 'warning',        // 'warning' | 'error'
  minCoverage: 0,             // 0-100, minimum % fully traced
  includeSpecs: ['docs/changes/*/proposal.md'],
  excludeSpecs: [],
}
```

### 7. Enhanced Phase Gate Content Validation

Extend `check-phase-gate` to optionally validate spec content, not just file existence:

- When `contentValidation: true` in phase gate config, parse the spec file and verify it has an Observable Truths / Success Criteria section with numbered requirements
- This is a lightweight addition — the heavy traceability logic lives in the dedicated module

### File Layout

```
packages/graph/src/types.ts                          MODIFY  — add requirement node type, 3 edge types
packages/graph/src/ingest/RequirementIngestor.ts     CREATE  — requirement extraction from specs
packages/graph/src/ingest/RequirementIngestor.test.ts CREATE — unit tests
packages/graph/src/query/Traceability.ts             CREATE  — coverage matrix query module
packages/graph/src/query/Traceability.test.ts        CREATE  — unit tests
packages/graph/src/index.ts                          MODIFY  — export new modules
packages/types/src/index.ts                          MODIFY  — add 'traceability' to CICheckName
packages/core/src/ci/check-orchestrator.ts           MODIFY  — add traceability check runner
packages/cli/src/commands/traceability.ts            CREATE  — CLI command
packages/cli/src/mcp/tools/traceability.ts           CREATE  — MCP tool
packages/cli/src/config/schema.ts                    MODIFY  — traceability config schema
packages/cli/src/commands/check-phase-gate.ts        MODIFY  — optional content validation
packages/graph/src/ingest/CodeIngestor.ts            MODIFY  — @req annotation parsing
```

## Success Criteria

1. When a spec at `docs/changes/<feature>/proposal.md` contains an Observable Truths section with numbered items, the system shall create one `requirement` graph node per item after ingestion
2. When a requirement node exists, the system shall create `requires` edges to code files via convention-based path matching and plan file map correlation
3. When a test file contains a `// @req <feature>#<index>` annotation, the system shall create a `verified_by` edge with confidence 1.0 from the matching requirement to that test file
4. When no `@req` annotation exists, the system shall create inferred `verified_by` edges via convention-based path matching with confidence 0.5-0.7
5. When `harness traceability` is run, the system shall display a coverage matrix showing each requirement's code coverage, test coverage, confidence level, and status (full/code-only/test-only/none)
6. When `check_traceability` MCP tool is invoked, the system shall return a structured `TraceabilityResult` with per-requirement coverage and summary statistics
7. When `harness ci check` is run, the system shall include a `traceability` check with default severity `warning`
8. When `get_impact` is called on a requirement node, the system shall traverse `requires` and `verified_by` edges to show affected code and tests
9. When `ask_graph` receives a query like "what requirements does feature X have?", the system shall resolve requirement nodes and return coverage information
10. When phase gate config includes `contentValidation: true`, the system shall verify that the mapped spec file contains a numbered requirements section

## Implementation Order

1. **Graph schema** — Add `requirement` node type, `requires`/`verified_by`/`tested_by` edge types to `packages/graph/src/types.ts`
2. **RequirementIngestor** — Extract requirements from specs, create nodes and convention-based edges
3. **@req annotation parsing** — Extend `CodeIngestor` to detect annotations and create explicit edges
4. **Traceability query module** — Coverage matrix computation from graph traversal
5. **CLI command** — `harness traceability` with compact/verbose/json output
6. **MCP tool** — `check_traceability` for agent consumption
7. **CI check integration** — Add `traceability` to CI check orchestrator
8. **Phase gate content validation** — Optional content validation in `check-phase-gate`
