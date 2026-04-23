# Plan: Code Signal Extractors

**Date:** 2026-04-22 | **Spec:** docs/changes/code-signal-extractors/proposal.md | **Tasks:** 12 | **Time:** ~50 min

## Goal

When this plan is complete, `harness ingest --source business-signals` extracts business knowledge from source code (test descriptions, enum/constants, validation rules, API paths) across 6 languages, writes JSONL to `.harness/knowledge/extracted/`, creates provisional graph nodes, and handles stale detection on re-extraction. The MCP `ingest_source` tool accepts `'business-signals'` with identical behavior.

## Observable Truths

1. `harness ingest --source business-signals` writes 4 JSONL files to `.harness/knowledge/extracted/`
2. Each JSONL line is a valid `ExtractionRecord` with all required fields
3. After extraction, `business_rule`, `business_term`, `business_process` graph nodes exist with `metadata.source === 'code-extractor'`
4. Each graph node has a `governs` or `documents` edge to its source `file` node
5. Each extractor produces extractions from TS/JS, Python, Go, Rust, and Java fixtures
6. Running extraction twice on unchanged code produces identical JSONL and no duplicate nodes
7. Removing a signal from source and re-extracting marks the node `metadata.stale: true`
8. `harness ingest --all` includes business-signals extraction
9. `ingest_source` MCP tool accepts `'business-signals'`
10. Existing ingest sources continue unchanged

## Uncertainties

- [ASSUMPTION] `findNodes` filters by `type` only. Stale detection will iterate business-type nodes and filter `metadata.source === 'code-extractor'` in code.
- [DEFERRABLE] Exact confidence thresholds — using values from approved spec.
- [ASSUMPTION] Language detection reimplemented in runner (trivial extension mapping), not shared from CodeIngestor (private method).

## File Map

```
CREATE packages/graph/src/ingest/extractors/types.ts
CREATE packages/graph/src/ingest/extractors/ExtractionRunner.ts
CREATE packages/graph/src/ingest/extractors/TestDescriptionExtractor.ts
CREATE packages/graph/src/ingest/extractors/EnumConstantExtractor.ts
CREATE packages/graph/src/ingest/extractors/ValidationRuleExtractor.ts
CREATE packages/graph/src/ingest/extractors/ApiPathExtractor.ts
CREATE packages/graph/src/ingest/extractors/index.ts
CREATE packages/graph/__fixtures__/extractor-project/ (16 multi-language fixture files)
CREATE packages/graph/tests/ingest/extractors/ExtractionRunner.test.ts
CREATE packages/graph/tests/ingest/extractors/TestDescriptionExtractor.test.ts
CREATE packages/graph/tests/ingest/extractors/EnumConstantExtractor.test.ts
CREATE packages/graph/tests/ingest/extractors/ValidationRuleExtractor.test.ts
CREATE packages/graph/tests/ingest/extractors/ApiPathExtractor.test.ts
MODIFY packages/graph/src/index.ts (add extractor exports)
MODIFY packages/cli/src/commands/graph/ingest.ts (add 'business-signals' case)
MODIFY packages/cli/src/mcp/tools/graph/ingest-source.ts (add 'business-signals' to enum + handler)
```

## Tasks

### Task 1: Foundation types (`extractors/types.ts`)

**Files:** `packages/graph/src/ingest/extractors/types.ts`

Create the `Language` type, `ExtractionRecord` interface, and `SignalExtractor` interface exactly as specified in the proposal.

**Test:** `npx vitest run packages/graph/tests/ingest/extractors/types.test.ts` — import types, validate ExtractionRecord shape with a sample object.

**Commit:** `feat(graph): add code signal extractor types`

---

### Task 2: Test fixtures (multi-language)

**Files:** Create `packages/graph/__fixtures__/extractor-project/` with fixture files covering all 4 extractor categories across all 6 languages.

Required fixtures:

- `auth.test.ts` — TypeScript tests with `describe`/`it`/`test`
- `auth_test.py` — Python tests with `def test_*` and docstrings
- `auth_test.go` — Go tests with `func Test*` and `t.Run()`
- `auth_test.rs` — Rust tests with `#[test]` and doc comments
- `AuthTest.java` — Java tests with `@Test` and `@DisplayName`
- `enums.ts` — TypeScript enums and `as const`
- `enums.py` — Python Enum subclasses
- `enums.go` — Go iota const blocks
- `enums.rs` — Rust enums
- `Enums.java` — Java enums
- `validators.ts` — Zod schemas
- `validators.py` — Pydantic models
- `validators.go` — Go struct tags with validate
- `validators.rs` — Rust validate derive macros
- `Validators.java` — Java Bean Validation annotations
- `routes.ts` — Express/Hono route definitions
- `routes.py` — FastAPI/Flask decorators
- `routes.go` — Go HTTP handler registrations
- `routes.rs` — Actix/Axum route macros
- `Routes.java` — Spring `@GetMapping`/`@PostMapping`

Each fixture should contain 3-5 extractable patterns per category for comprehensive coverage.

**Test:** Verify files exist and are syntactically representative (no compilation needed — regex-based extraction).

**Commit:** `test(graph): add multi-language extractor fixtures`

---

### Task 3: ExtractionRunner core (file walking, language detection, JSONL write)

**Files:** `packages/graph/src/ingest/extractors/ExtractionRunner.ts`, `packages/graph/tests/ingest/extractors/ExtractionRunner.test.ts`

Implement:

- `findSourceFiles(dir)` — recursive walk, skip `node_modules`/`dist`/`target`/`build`/`.git`/etc. (same skip list as CodeIngestor)
- `detectLanguage(filePath)` — extension to Language mapping
- `writeJsonl(records, outputDir, extractorName)` — write JSONL file
- `run(projectDir, store, outputDir)` — orchestrate: walk files, dispatch to extractors, write JSONL, persist to graph, return IngestResult
- Constructor takes `SignalExtractor[]` registry

**Test:** ExtractionRunner finds files in fixture dir, detects languages correctly, writes JSONL to temp dir.

**Commit:** `feat(graph): add ExtractionRunner with file walking and JSONL output`

---

### Task 4: ExtractionRunner graph persistence and stale detection

**Files:** `packages/graph/src/ingest/extractors/ExtractionRunner.ts` (extend), `packages/graph/tests/ingest/extractors/ExtractionRunner.test.ts` (extend)

Implement:

- `persistToGraph(records, store)` — create `business_*` nodes with `metadata.source: 'code-extractor'`, `metadata.extractor`, `metadata.confidence`, and `governs`/`documents` edges to source `file` nodes
- `markStale(store, currentIds)` — find existing extractor nodes (`metadata.source === 'code-extractor'`), compare IDs, set `metadata.stale: true` and `metadata.staleAt` on missing nodes
- Stable ID generation: `extracted:<extractor>:<sha256(filePath + ':' + patternKey)>` using `hash()` from ingestUtils

**Test:** Persist records to GraphStore, verify nodes/edges created. Remove a record, re-run, verify stale marking.

**Commit:** `feat(graph): add graph persistence and stale detection to ExtractionRunner`

---

### Task 5: TestDescriptionExtractor

**Files:** `packages/graph/src/ingest/extractors/TestDescriptionExtractor.ts`, `packages/graph/tests/ingest/extractors/TestDescriptionExtractor.test.ts`

Implement regex patterns for all 6 languages:

- **TS/JS:** `describe('...')`, `it('...')`, `test('...')`
- **Python:** `def test_*` names + docstrings, `pytest.mark.parametrize`
- **Go:** `func Test*` names + `t.Run("...")` subtests
- **Rust:** `#[test] fn test_*` names + `///` doc comments
- **Java:** `@Test` methods + `@DisplayName("...")`

Maps to `business_rule` nodes. Confidence: 0.7 (structured test with description string), 0.5 (bare function name).

**Test:** Extract from each language fixture, verify correct records with expected names, confidence, nodeType.

**Commit:** `feat(graph): add TestDescriptionExtractor for 6 languages`

---

### Task 6: EnumConstantExtractor

**Files:** `packages/graph/src/ingest/extractors/EnumConstantExtractor.ts`, `packages/graph/tests/ingest/extractors/EnumConstantExtractor.test.ts`

Implement regex patterns for all 6 languages:

- **TypeScript:** `enum` declarations, `as const` objects, union types
- **JavaScript:** `Object.freeze({})`, `const` with UPPER_CASE keys
- **Python:** `Enum`/`StrEnum`/`IntEnum` subclasses, `Literal` types
- **Go:** `iota` const blocks, typed const groups
- **Rust:** `enum` declarations (unit + data variants)
- **Java:** `enum` classes

Maps to `business_term` nodes. Confidence: 0.8 (named enum), 0.6 (unnamed const group).

**Test:** Extract from each language fixture, verify correct records.

**Commit:** `feat(graph): add EnumConstantExtractor for 6 languages`

---

### Task 7: ValidationRuleExtractor

**Files:** `packages/graph/src/ingest/extractors/ValidationRuleExtractor.ts`, `packages/graph/tests/ingest/extractors/ValidationRuleExtractor.test.ts`

Implement regex patterns for all 6 languages:

- **TS/JS:** Zod `.string()`, `.min()`, `.regex()`, `.email()` chains; Joi/Yup schemas
- **Python:** Pydantic `BaseModel` fields with `Field()` constraints, `@validator`
- **Go:** struct tags `validate:"required,min=1,email"`
- **Rust:** `#[validate]` derive macros, `#[garde]` attributes
- **Java:** `@NotNull`, `@Size`, `@Pattern`, `@Min`, `@Max`, `@Email`

Maps to `business_rule` nodes. Confidence: 0.8 (explicit schema), 0.5 (simple required).

**Test:** Extract from each language fixture, verify correct records.

**Commit:** `feat(graph): add ValidationRuleExtractor for 6 languages`

---

### Task 8: ApiPathExtractor

**Files:** `packages/graph/src/ingest/extractors/ApiPathExtractor.ts`, `packages/graph/tests/ingest/extractors/ApiPathExtractor.test.ts`

Implement regex patterns for all 6 languages:

- **TS/JS:** Express `app.get()`, Hono `app.get()`, Fastify `fastify.route()`
- **Python:** FastAPI `@app.get()`, Flask `@app.route()`, Django `path()`
- **Go:** `http.HandleFunc()`, Gin `r.GET()`, Echo `e.GET()`, Chi `r.Get()`
- **Rust:** Actix `#[get()]` macros, Axum `Router::new().route()`
- **Java:** Spring `@GetMapping`, `@PostMapping`, `@RequestMapping`, JAX-RS `@Path`

Maps to `business_process` nodes. Confidence: 0.9 (annotated route), 0.6 (dynamic registration).

**Test:** Extract from each language fixture, verify correct records.

**Commit:** `feat(graph): add ApiPathExtractor for 6 languages`

---

### Task 9: Extractor index and graph package exports

**Files:** `packages/graph/src/ingest/extractors/index.ts`, `packages/graph/src/index.ts`

Create `extractors/index.ts`:

- Export all 4 extractors, ExtractionRunner, types
- Export `ALL_EXTRACTORS` array with all 4 instantiated
- Export a convenience `createExtractionRunner()` factory

Add to `packages/graph/src/index.ts`:

- Export `ExtractionRunner`, `SignalExtractor`, `ExtractionRecord`, `ALL_EXTRACTORS`, `createExtractionRunner`

**Test:** Import from `@harness-engineering/graph` in existing test, verify exports resolve.

**Commit:** `feat(graph): export code signal extractors from graph package`

---

### Task 10: CLI integration

**Files:** `packages/cli/src/commands/graph/ingest.ts`

Add `'business-signals'` to the ingest command:

- Add case in `switch(source)` that instantiates `ExtractionRunner` via `createExtractionRunner()`, calls `run(projectPath, store, extractedDir)`
- Add to `--all` flow after knowledge ingestion
- Update error message to list `business-signals` as available source
- Update `--source` option description

**Test:** Build succeeds, `harness ingest --source business-signals` runs on fixture project.

**Commit:** `feat(cli): wire business-signals source into ingest command`

---

### Task 11: MCP integration

**Files:** `packages/cli/src/mcp/tools/graph/ingest-source.ts`

Add `'business-signals'` to MCP tool:

- Add to `source` enum array: `['code', 'knowledge', 'git', 'business-signals', 'all']`
- Add handler block: if source is `'business-signals'` or `'all'`, run `ExtractionRunner`
- Import `createExtractionRunner` from `@harness-engineering/graph`

**Test:** TypeScript compiles, MCP schema includes `business-signals`.

**Commit:** `feat(cli): wire business-signals into MCP ingest_source tool`

---

### Task 12: End-to-end integration test

**Files:** `packages/graph/tests/ingest/extractors/integration.test.ts`

Full pipeline test:

1. Create ExtractionRunner with all 4 extractors
2. Run on `__fixtures__/extractor-project/`
3. Verify 4 JSONL files written with correct records
4. Verify graph nodes created with correct types and metadata
5. Verify edges to source file nodes
6. Re-run on same files — verify no duplicates
7. Modify fixture (remove one pattern), re-run — verify stale marking
8. Verify each extractor produced results from each language

**Test:** `npx vitest run packages/graph/tests/ingest/extractors/integration.test.ts`

**Commit:** `test(graph): add end-to-end integration test for code signal extractors`

---

## Task Sequence

```
Task 1: types.ts (no deps)
Task 2: fixtures (no deps)
  ↓
Task 3: ExtractionRunner core (depends: 1)
Task 4: ExtractionRunner stale (depends: 3)
  ↓
Tasks 5-8: Four extractors (depend: 1, 2 — parallelizable with each other)
  ↓
Task 9: Index + exports (depends: 3, 4, 5-8)
Task 10: CLI integration (depends: 9)
Task 11: MCP integration (depends: 9)
  ↓
Task 12: E2E test (depends: all above)
```

**Parallel opportunities:** Tasks 5, 6, 7, 8 are independent and parallelizable. Tasks 10 and 11 are independent and parallelizable.
