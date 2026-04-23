# Code Signal Extractors — Business Knowledge from Source Code

## Overview

Phase 2 of the Business Knowledge System (ADR: `.harness/architecture/business-knowledge-system/ADR-001.md`). Four pluggable extractors mine business-relevant signals from source code — test descriptions, enum/constant vocabularies, validation rules, and API route definitions — across all 6 supported languages (TypeScript, JavaScript, Python, Go, Rust, Java). Each extractor independently scans files, writes structured JSONL to `.harness/knowledge/extracted/`, and creates provisional graph nodes for immediate queryability. A shared `ExtractionRunner` handles file walking, language detection, JSONL persistence, graph node creation, and stable-ID diffing with stale marking.

### Goals

1. Extract business knowledge embedded in code patterns that humans write but never explicitly document
2. Make extracted knowledge immediately available to skills via graph queries (`ask_graph`, `gather_context`)
3. Produce auditable JSONL output compatible with the Phase 4 knowledge pipeline's promotion flow
4. Support all 6 CodeIngestor languages with uniform coverage across all 4 extractors
5. Integrate into the existing `harness ingest` pipeline as a new `business-signals` source type

### Non-Goals

- KnowledgeLinker post-processing (Phase 3)
- Knowledge pipeline / drift detection convergence loop (Phase 4)
- LLM-assisted extraction or semantic analysis — extractors are purely pattern-based
- Diagram-as-code parsing (Phase 4)

## Decisions

| Decision          | Choice                                | Rationale                                                                                                               |
| ----------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Parsing strategy  | File-first                            | Extractors independently scan files rather than querying graph. Self-contained, testable, works without prior ingestion |
| Language scope    | All 6 (TS/JS, Python, Go, Rust, Java) | Full parity with CodeIngestor from day one                                                                              |
| Coverage model    | Uniform                               | Every extractor covers every language, using confidence scores to signal extraction depth                               |
| Output model      | JSONL + graph nodes                   | JSONL for audit trail and promotion flow; provisional graph nodes for immediate skill queryability                      |
| Trigger mechanism | New `business-signals` ingest source  | Follows existing pattern, included in `harness ingest --all` automatically                                              |
| Re-extraction     | Stable-ID diff                        | Deterministic IDs survive re-runs; removed signals marked stale, not deleted                                            |
| Architecture      | Pluggable extractor registry          | `SignalExtractor` interface with shared `ExtractionRunner`; each extractor independently testable                       |

## Technical Design

### Extractor Interface

```typescript
// packages/graph/src/ingest/extractors/types.ts

type Language = 'typescript' | 'javascript' | 'python' | 'go' | 'rust' | 'java';

interface ExtractionRecord {
  id: string; // deterministic: extracted:<extractor>:<sha256(filePath+':'+patternKey)>
  extractor: string; // 'test-descriptions' | 'enum-constants' | 'validation-rules' | 'api-paths'
  language: Language;
  filePath: string; // relative to project root
  line: number; // start line of the extracted pattern
  nodeType: NodeType; // which business_* node type this maps to
  name: string; // human-readable label for the extracted fact
  content: string; // the raw extracted text
  confidence: number; // 0.0-1.0
  metadata: Record<string, unknown>; // extractor-specific fields
}

interface SignalExtractor {
  readonly name: string;
  readonly supportedExtensions: readonly string[];
  extract(content: string, filePath: string, language: Language): ExtractionRecord[];
}
```

### Four Extractors

#### TestDescriptionExtractor

Extracts human-written test descriptions that encode business rules in natural language.

| Language              | Patterns                                                                   | Example                                        |
| --------------------- | -------------------------------------------------------------------------- | ---------------------------------------------- |
| TypeScript/JavaScript | `describe()`, `it()`, `test()` string arguments (vitest, jest, mocha)      | `it('should reject expired tokens')`           |
| Python                | `def test_*` function names + docstrings, `pytest.mark.parametrize` labels | `def test_expired_token_rejected():`           |
| Go                    | `func Test*` function names + `t.Run()` subtests, `//` doc comments        | `t.Run("rejects expired tokens", ...)`         |
| Rust                  | `#[test]` function names + `///` doc comments, `#[rstest]` case labels     | `fn test_reject_expired_token()`               |
| Java                  | `@Test` method names + `@DisplayName` annotations, JUnit 5 nested classes  | `@DisplayName("should reject expired tokens")` |

Maps to: `business_rule` nodes. Confidence: 0.7 (structured test with description string) to 0.5 (bare function name only).

#### EnumConstantExtractor

Extracts domain vocabulary from enumeration and constant definitions.

| Language   | Patterns                                                           | Example                                                |
| ---------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| TypeScript | `enum` declarations, `as const` objects, union types               | `enum OrderStatus { PENDING, FULFILLED }`              |
| JavaScript | `Object.freeze({})` patterns, `const` objects with UPPER_CASE keys | `const STATUS = Object.freeze({ PENDING: 'pending' })` |
| Python     | `Enum` subclasses, `Literal` type annotations, `IntEnum`/`StrEnum` | `class OrderStatus(StrEnum):`                          |
| Go         | `iota` const blocks, typed const groups                            | `const ( Pending Status = iota; Fulfilled )`           |
| Rust       | `enum` declarations (unit variants and data variants)              | `enum OrderStatus { Pending, Fulfilled }`              |
| Java       | `enum` classes with constants                                      | `enum OrderStatus { PENDING, FULFILLED }`              |

Maps to: `business_term` nodes. Confidence: 0.8 (named enum with members) to 0.6 (unnamed const group).

#### ValidationRuleExtractor

Extracts business constraints encoded in validation schemas and decorators.

| Language              | Patterns                                                                        | Example                                     |
| --------------------- | ------------------------------------------------------------------------------- | ------------------------------------------- |
| TypeScript/JavaScript | Zod schemas (`.string()`, `.min()`, `.regex()`), Joi schemas, Yup schemas       | `z.string().email().min(5)`                 |
| Python                | Pydantic `BaseModel` fields with `Field()` constraints, `@validator` decorators | `amount: Decimal = Field(gt=0, le=1000000)` |
| Go                    | Struct tags with `validate:"required,min=1"` (go-playground/validator)          | `` `validate:"required,email"` ``           |
| Rust                  | `#[validate]` derive macros, `#[garde]` attribute macros                        | `#[validate(length(min = 1, max = 255))]`   |
| Java                  | Bean Validation: `@NotNull`, `@Size`, `@Pattern`, `@Min`, `@Max`, `@Email`      | `@Size(min = 1, max = 255) String name`     |

Maps to: `business_rule` nodes. Confidence: 0.8 (explicit schema with named constraints) to 0.5 (simple required field).

#### ApiPathExtractor

Extracts domain model from route definitions revealing the API surface.

| Language              | Patterns                                                                              | Example                               |
| --------------------- | ------------------------------------------------------------------------------------- | ------------------------------------- |
| TypeScript/JavaScript | Express `app.get()`, Hono `app.get()`, Fastify `fastify.route()`, Next.js file routes | `app.get('/api/orders/:id', handler)` |
| Python                | FastAPI `@app.get()` decorators, Flask `@app.route()`, Django `path()` in urlpatterns | `@app.get("/orders/{order_id}")`      |
| Go                    | `http.HandleFunc()`, Gin `r.GET()`, Echo `e.GET()`, Chi `r.Get()`                     | `r.GET("/orders/:id", getOrder)`      |
| Rust                  | Actix `#[get()]` macros, Axum `Router::new().route()`                                 | `#[get("/orders/{id}")]`              |
| Java                  | Spring `@GetMapping`, `@PostMapping`, `@RequestMapping`, JAX-RS `@Path`               | `@GetMapping("/orders/{id}")`         |

Maps to: `business_process` nodes. Confidence: 0.9 (annotated route with HTTP method + path) to 0.6 (dynamic route registration).

### ExtractionRunner

```
packages/graph/src/ingest/extractors/
  types.ts                        — SignalExtractor interface, ExtractionRecord, Language
  ExtractionRunner.ts             — Shared infrastructure
  TestDescriptionExtractor.ts     — Test description patterns
  EnumConstantExtractor.ts        — Enum/constant patterns
  ValidationRuleExtractor.ts      — Validation rule patterns
  ApiPathExtractor.ts             — API path patterns
  index.ts                        — Registry: exports all extractors + runner
```

`ExtractionRunner` responsibilities:

1. **Walk** — Recursively walk project directory, respecting `.gitignore` and `node_modules`/`vendor`/`target`/`build` exclusions
2. **Detect** — Map file extensions to `Language` (`.ts`/`.tsx` → typescript, `.py` → python, `.go` → go, `.rs` → rust, `.java` → java)
3. **Dispatch** — For each file, run all registered extractors whose `supportedExtensions` match
4. **Write JSONL** — One file per extractor in `.harness/knowledge/extracted/<extractor-name>.jsonl`
5. **Graph persist** — Create/update `business_*` graph nodes with `metadata.source: 'code-extractor'` and `governs`/`documents` edges to the source `file` node
6. **Stable diff** — Load existing extracted nodes from graph (by `metadata.source === 'code-extractor'`), compare IDs, mark missing as `metadata.stale: true` with `metadata.staleAt: <ISO timestamp>`
7. **Return** — Aggregate `IngestResult` across all extractors

### JSONL Output Format

Each line in a `.jsonl` file is one `ExtractionRecord` serialized as JSON:

```json
{
  "id": "extracted:test-descriptions:a1b2c3",
  "extractor": "test-descriptions",
  "language": "typescript",
  "filePath": "src/auth/auth.service.test.ts",
  "line": 42,
  "nodeType": "business_rule",
  "name": "should reject expired tokens",
  "content": "describe('AuthService') > it('should reject expired tokens')",
  "confidence": 0.7,
  "metadata": { "suite": "AuthService", "framework": "vitest" }
}
```

### Graph Node Mapping

| Extractor         | Node Type          | Edge Type   | Edge Target        |
| ----------------- | ------------------ | ----------- | ------------------ |
| test-descriptions | `business_rule`    | `governs`   | source `file` node |
| enum-constants    | `business_term`    | `documents` | source `file` node |
| validation-rules  | `business_rule`    | `governs`   | source `file` node |
| api-paths         | `business_process` | `documents` | source `file` node |

All nodes include:

- `metadata.source: 'code-extractor'` — distinguishes from human-authored knowledge
- `metadata.extractor: '<extractor-name>'` — identifies which extractor produced the node
- `metadata.confidence: <0.0-1.0>` — extraction pattern strength

### Stable ID Generation

IDs are deterministic to survive re-extraction:

```
extracted:<extractor>:<sha256(filePath + ':' + patternKey)>
```

Where `patternKey` is extractor-specific:

- **test-descriptions:** full nested path (`describe > describe > it` chain)
- **enum-constants:** enum name + member name
- **validation-rules:** schema variable name or decorator target
- **api-paths:** HTTP method + path pattern

### Integration Points

| Component     | File                                                | Change                                                                                |
| ------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Ingest CLI    | `packages/cli/src/commands/graph/ingest.ts`         | Add `'business-signals'` to source options, instantiate `ExtractionRunner`            |
| Ingest MCP    | `packages/cli/src/mcp/tools/graph/ingest-source.ts` | Add `'business-signals'` to source enum, wire `ExtractionRunner`                      |
| Graph exports | `packages/graph/src/index.ts`                       | Export `ExtractionRunner`, `SignalExtractor`, `ExtractionRecord`                      |
| Graph types   | `packages/graph/src/types.ts`                       | No changes — existing `business_*` node types and `governs`/`documents` edges suffice |

## Success Criteria

1. **All 4 extractors produce valid JSONL** — Running `harness ingest --source business-signals` on a multi-language project writes 4 JSONL files to `.harness/knowledge/extracted/`, each containing well-formed `ExtractionRecord` entries
2. **Graph nodes created** — After extraction, `business_rule`, `business_term`, and `business_process` nodes with `metadata.source === 'code-extractor'` exist in the graph and are queryable via `ask_graph` and `gather_context`
3. **All 6 languages covered** — Each extractor produces at least one extraction from TS/JS, Python, Go, Rust, and Java fixture files
4. **Confidence scores assigned** — Every extracted record has a `confidence` value between 0.0 and 1.0 reflecting extraction pattern strength
5. **Stable IDs** — Running extraction twice on unchanged code produces identical JSONL output and does not create duplicate graph nodes
6. **Stale detection** — Removing a test/enum/validator/route from source code and re-running extraction marks the corresponding graph node as `metadata.stale: true` without deleting it
7. **Included in `--all`** — `harness ingest --all` runs code signal extraction alongside existing sources
8. **MCP parity** — `ingest_source` MCP tool accepts `'business-signals'` and produces the same result as the CLI
9. **No regression** — Existing ingest sources (code, knowledge, git, etc.) continue to function unchanged
10. **Performance** — Extraction completes in under 10 seconds on a 10,000-file project

## Implementation Order

### Wave 1: Foundation

- `SignalExtractor` interface, `ExtractionRecord` type, `Language` type in `extractors/types.ts`
- `ExtractionRunner` with file walking, language detection, JSONL writing, graph persistence, stable-ID diff
- Wire into `ingest.ts` CLI and `ingest-source.ts` MCP as `'business-signals'`

### Wave 2: Extractors (parallelizable)

- `TestDescriptionExtractor` — all 6 languages
- `EnumConstantExtractor` — all 6 languages
- `ValidationRuleExtractor` — all 6 languages
- `ApiPathExtractor` — all 6 languages

### Wave 3: Integration & Polish

- End-to-end tests with multi-language fixture projects
- Stale detection verification
- Performance benchmarks on large codebases
- Graph query integration tests (verify `ask_graph` and `gather_context` surface extracted nodes)
