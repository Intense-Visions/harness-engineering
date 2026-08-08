---
number: 0086
title: Acquire canary results from its documented on-disk artifact, inside the same adapter boundary
date: 2026-08-07
status: accepted
tier: medium
source: docs/changes/canary-results-ingest/proposal.md
---

## Context

ADR-0039 established the pattern for integrating a foreign-ecosystem tool (canary):
a total, gracefully-degrading adapter confined to a single boundary module, invoked
for its deterministic `--json` output through an injectable `execFile` seam, zod-validated,
and reachable by skills only through a thin MCP tool. Every capability wired to date
(`probe`, `recommendFramework`, `reviewTest`, and the sibling `listFrameworks`) is a CLI
subcommand that emits JSON on stdout.

Consuming canary's **structured run history** (to feed the knowledge graph and outcome-eval)
does not fit that mold. Canary persists run history as NDJSON at a documented, stable path
(`test-results/reports/history-v2.jsonl`), but its documented CLI surface exposes **no**
stable history/timeline verb that emits run records as JSON — timeline querying lives in an
internal module, not a contracted command. Execing a non-existent verb would be brittle;
the documented artifact is the actual stable contract.

## Decision

Extend the ADR-0039 boundary from "exec-only" to "exec **or** documented-artifact read".
The adapter gains a second injectable acquisition seam — a `CanaryReader`
(`(filePath) => Promise<string>`, default `fs.readFile`) beside the existing `CanaryExec` —
and a `readRunHistory()` method that reads the documented NDJSON store, `safeParse`s each
line against a permissive zod schema, drops only individual malformed lines, and returns the
valid `RunRecord[]` (or `[]` on any failure). All the ADR-0039 invariants are preserved:

1. **Single boundary.** All canary coupling — exec and file-format — stays in the one adapter module (boundary test enforced).
2. **Total + gracefully degrading.** Missing file, unreadable file, or all-malformed lines degrade to `[]`; the method never throws.
3. **Structured contract, validated.** Records are zod-validated with a permissive schema so a single unmodeled field never discards a whole record.
4. **Injectable seam.** The reader is injected exactly like the exec seam, so the degrade taxonomy is unit-testable without a real canary install.
5. **Skills reach it via a thin MCP tool** (`canary_run_history`) — never a direct file read.
6. **Downstream consumers stay decoupled.** The graph ingestor takes plain records (no canary import); the CLI layer is the only place that reads via the adapter, keeping `@harness-engineering/graph` free of any canary dependency.

## Consequences

- **Positive:** the acquisition mechanism tracks canary's _actual_ stable contract (a file) instead of a fictional CLI verb; the boundary generalizes to any future tool whose stable interface is an artifact rather than a subcommand; graceful degradation and the one-boundary invariant are unchanged.
- **Negative / tradeoffs:** the adapter now couples to canary's on-disk file layout and NDJSON record shape (contained by the permissive zod schema and a pinned contract note); the remote (Supabase) store is deliberately out of scope in v1 — local NDJSON only.
- **Scope guard:** only run history (`RunRecord`/`TestResult`) is read. Per-test OTel traces (`canary-instrument run.json`) are a distinct producer and are not in scope here.
