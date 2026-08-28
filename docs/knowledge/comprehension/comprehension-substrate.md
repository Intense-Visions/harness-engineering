---
type: business_concept
domain: comprehension
tags:
  [comprehension, context-replay, source-hash, degradation-ladder, gather-context, knowledge-graph]
---

# The Compiled Comprehension Substrate

The **comprehension substrate** is a persistent, incrementally-maintained
per-module understanding layer that is compiled once, recompiled only for the
modules whose source changed, versioned alongside the code, and served to agents
as their **primary** context in place of re-reading raw source.

Its purpose is to attack the dominant cost term in agent operation: **context
replay, not generation**. An agent that must _understand_ a module it will not
_edit_ should read a small compiled unit, not re-derive that understanding from raw
source on every run.

## The comprehension unit

One markdown file per module, tree-mirrored under `.harness/comprehension/`, named
`_module.md`. A unit has four sections plus provenance frontmatter:

| Section                | Source     | Nature                                |
| ---------------------- | ---------- | ------------------------------------- |
| **Summary**            | LLM        | Prose orientation (advisory)          |
| **Invariants**         | LLM        | List of module invariants (advisory)  |
| **Interface Contract** | static AST | Exported symbols + signatures (exact) |
| **Dependency Slice**   | static AST | Imports out / importers in (exact)    |

Frontmatter carries `schemaVersion`, `module`, `sourceHash`, `compiledAt`,
`compiler` versions, resolved `model`, a `semantic: present | absent` flag, and the
`members` list. Prose lives in the body for clean git diffs; provenance lives in
frontmatter for fast parse. See [source-hash.ts](../../../packages/core/src/comprehension/source-hash.ts),
[serialize.ts](../../../packages/core/src/comprehension/serialize.ts),
[render.ts](../../../packages/core/src/comprehension/render.ts), and
[types.ts](../../../packages/core/src/comprehension/types.ts).

## Module = source directory

The shard tree mirrors the source tree. The public surface anchors on the
language's barrel (`index.ts` / `__init__.py` / `mod.rs` / package exports),
degrading to all top-level definitions when no barrel is present. Static extraction
is a pluggable, language-aware adapter ([static-extractor.ts](../../../packages/cli/src/comprehension/static-extractor.ts));
an unsupported language yields a semantic-only unit rather than faked static
sections.

## Static feeds semantic

The compiler is a **hybrid** ([compile.ts](../../../packages/core/src/comprehension/compile.ts),
[compile-run.ts](../../../packages/cli/src/comprehension/compile-run.ts)):

1. **Static AST extraction** produces the interface contract + dependency slice —
   exact, always fresh, effectively free (no LLM).
2. **The semantic half** ([generate-semantic.ts](../../../packages/cli/src/comprehension/generate-semantic.ts))
   feeds _that static contract + dependency slice + a bounded source digest_ — not
   the full raw source — to the backend to produce summary + invariants. Input
   tokens are bounded by the module's public surface, not its file length, so
   recompile cost per module stays bounded regardless of size.

Semantic generation runs under bounded concurrency with a per-run token budget; when
the budget is exhausted it fails loud and leaves the remaining modules
`semantic: absent`, never silently partial.

## The serve-time hash gate (correctness spine)

Every serve path funnels through one gate ([serve-gate.ts](../../../packages/core/src/comprehension/serve-gate.ts)):
re-enumerate the module directory's current membership, recompute a full SHA-256
`sourceHash` over membership + member contents, and refuse to serve on mismatch
(returning raw-source fallback + a recompile signal). The gate does only
enumeration, hashing, and comparison — **no LLM, no credential** — so correctness
holds identically in CI, headless, and interactive runs. Because the hash covers
membership, a newly-added or removed file cannot silently evade the gate. This is
the sole correctness authority (see ADR 0108).

### The degradation ladder

- **full** — hash-fresh unit, semantic + static served.
- **static-only** — hash-fresh unit whose semantic half was never generated
  (`semantic: absent`); the exact static sections are served, no prose.
- **source-fallback** — source-stale or no unit; raw source is served plus a
  recompile signal.

Every rung is safe: nothing that fails to match current source is ever served.
Two freshness concepts are named apart on purpose: _source-stale_ (hash mismatch —
whole unit refused) versus `semantic: absent` (hash-fresh, static-only).

## Truth vs freshness

The gate guarantees a served unit _matches its source_, not that its prose is
_correct_. The load-bearing sections (interface contract, dependency slice) are
static and AST-exact; summary and invariants are LLM-generated, shape-validated by
Zod, and framed as **advisory** — a leaf treats them as orientation and always reads
raw source for the region it actually edits. Because units are committed markdown, a
wrong summary shows up in a diff and can be corrected like any other doc.

## Relationship to the knowledge graph

Comprehension and the knowledge graph share the **same directory-as-module
boundary** — the graph already creates `module` nodes at directory granularity — but
they play different roles:

|               | Knowledge graph                | Comprehension substrate                            |
| ------------- | ------------------------------ | -------------------------------------------------- |
| **Role**      | Reference agents may consult   | Working substrate served as primary context        |
| **Content**   | Nodes, edges, business facts   | Summary + invariants + contract + slice per module |
| **Freshness** | Rebuilt on scan                | Serve-time hash gate; recompiled diff-scoped       |
| **Storage**   | `.harness/graph/` (gitignored) | `.harness/comprehension/` (committed, ADR 0107)    |

The overlap is **intentional and additive**: comprehension does not replace the
graph's module nodes, it enriches the same boundary with a committed,
served-as-primary comprehension unit the graph does not have. Neither reads from nor
writes to the other, so they evolve independently.

## How units are served

- **`gather_context`** gains a default-on `comprehension` constituent returning
  fresh units as the primary context block (graph/source as fallback).
- **`get_comprehension({ module, forceRecompile? })`** implements leaf-demand
  recompilation on a hash-miss.
- **Orchestrator pre-warm** computes a leaf's blast-radius modules at dispatch and
  pre-warms their units into the stage prompt.

## The no-credential invariant

Correctness, `git push`, and CI **never** require an LLM or an API token. The
serve-time gate, `harness comprehend --check` (token-free freshness), the pre-commit
static hook ([hook.ts](../../../packages/cli/src/comprehension/hook.ts)), and the CI
backstop all run credential-free. Only the _advisory_ semantic half calls a backend,
resolved via the precedence chain Anthropic key → local `/v1` → `claude`-CLI
subscription → null (ADR 0106); when it resolves `null`, units are emitted
static-only and everything still passes.

## Related

- ADR 0106 — `claude`-CLI fallback in the analysis-provider resolver (D8)
- ADR 0107 — Comprehension as a committed, git-versioned substrate (D2)
- ADR 0108 — Serve-time source-hash gate as the sole, LLM-free correctness authority (D7)
- [Configuration reference](../../reference/configuration.md) — the `comprehension` config block
