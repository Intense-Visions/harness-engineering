# Plan — Graph edge provenance enum (#1511)

Pipeline trace: brainstorming → autopilot (plan → execute → verify → review).
Source: ADR 0104 (`docs/architecture/graphify-adoption/`) — highest-leverage,
smallest-surface item.

## Brainstorming (framing)

Graph edges already carry an optional `confidence?: number` for Fusion-Layer
edges but nothing records _how_ an edge came to exist. Adapters downstream of
the graph cannot tell a relationship read directly from source (an AST-explicit
construct) from one a resolver or heuristic derived. The smallest change that
unlocks that distinction is a provenance enum on the edge, set at ingest time.

Options considered:

1. **String-literal union `provenance?` on `GraphEdge`, mirroring `confidence?`**
   — additive, back-compatible, zero store changes because the store and NDJSON
   serializer round-trip whole edge objects. **Chosen.**
2. Encode provenance inside `metadata`. Rejected: untyped, invisible to the zod
   schema, and every adapter would hand-parse a magic key.
3. A separate provenance node/edge overlay. Rejected: large surface, violates the
   "smallest-surface" goal of the ADR item.

## Planning (task breakdown)

- **T1 — Type + schema.** Add `EDGE_PROVENANCES` const tuple
  (`EXTRACTED | INFERRED | AMBIGUOUS`), an `EdgeProvenance` type, an optional
  `provenance?` field on `GraphEdge`, and `provenance: z.enum(...).optional()` on
  `GraphEdgeSchema`. Export the new symbols from the package barrel.
- **T2 — Set provenance at ingest.**
  - `CodeIngestor`: `contains` edges (function/class/interface/method/variable)
    are AST-explicit → `EXTRACTED`. `imports` edges resolve a target file id via
    `resolveImportPath` → `INFERRED`. `calls` edges use a regex name-matching
    heuristic → `INFERRED`. `verified_by` edges come from an explicit `@req`
    annotation → `EXTRACTED`.
  - `TopologicalLinker`: module `contains` edges are grouped from directory
    structure, not from any source construct → `INFERRED`.
- **T3 — Tests.** Schema back-compat + enum validation
  (`tests/types/edge-provenance.test.ts`); ingest-time provenance assignment and
  store round-trip (`tests/ingest/edge-provenance.test.ts`).

## Execution

Implemented T1–T3. No `GraphStore`/`Serializer` changes needed: both copy whole
edge objects (`{ ...edge }`) and the NDJSON serializer `JSON.stringify`s the whole
edge, so `provenance` flows through into every adapter automatically. `AMBIGUOUS`
is defined and schema-accepted; it is the documented value for an origin that is
neither AST-explicit nor resolver-derived — no current ingest site produces such
an edge, so none is hard-coded, but the value is reserved and validated.

## Verify

- `@harness-engineering/graph` full suite: 990 tests green (incl. 10 new).
- `graph` typecheck: clean.
- CLI built before commit (pre-commit architecture hook runs against dist).

## Review

Surface is additive and optional; existing edges without `provenance` still
validate and round-trip. No behavioral change to traversal, pruning, or scoring.
