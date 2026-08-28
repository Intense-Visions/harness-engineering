# Compiled Comprehension Substrate

> Compile per-module comprehension once, incrementally, and serve it to agents as
> primary context — so understanding stops being re-derived from raw source on
> every run.

**Status:** Draft (awaiting approval)
**Issue:** [#1558](https://github.com/Intense-Visions/harness-engineering/issues/1558)
**Milestone:** Parallel Execution & State · **Priority:** P1
**Keywords:** comprehension-substrate, context-replay, per-module, source-hash-provenance, git-diff-invalidation, gather_context, hybrid-compiler, shard-store, leaf-demand-recompilation, context-budget

---

## Overview & Goals

The dominant cost term in measured agent operation is **context replay, not
generation**: one operator's local usage shows cache-read tokens at ~298× output
tokens across 698 sessions. What that volume buys, over and over, is the same
thing — an agent re-reading source to re-derive an understanding some previous
agent already held and discarded.

This feature builds the compiler analogy properly: a **persistent,
incrementally-maintained per-module comprehension layer** — summaries, interface
contracts, invariants, and dependency slices — recompiled only for the modules
whose source changed (the git diff is the invalidation signal), versioned
alongside the code, and served to fleet leaves as their **primary** context, with
raw source as the fallback for the region actually under edit.

### Goals

1. Cut per-leaf context replay by serving small compiled units in place of raw
   source for the modules a leaf must _understand_ but not _edit_.
2. Keep the substrate correct: a source-hash-stale unit is **never served
   silently** — staleness is caught by hash comparison, not by trust.
3. Recompile incrementally — cost proportional to diff size, not repo size.
4. Work for **every adopter**: any language, any backend, and — critically — with
   **no API token and no LLM required for correctness, push, or CI**.

### Non-goals

- Replacing the knowledge graph. Comprehension is a distinct _working substrate_
  served as primary context; the graph remains a _reference_ agents may consult.
- Comprehending non-source assets (configs, docs, binaries).
- Cross-repository comprehension.
- A bespoke interactive "author the summary in chat" flow — one programmatic
  mechanism (`AnalysisProvider`) covers every execution context (§ Technical
  design → Semantic generation).

### Strategy grounding

Advances the **Upstream grounding** track (`STRATEGY.md#tracks` — "make the
strategic and knowledge substrate durable enough that downstream skills ground
reliably instead of starting cold each invocation"). Comprehension is the
missing durable layer between raw source and the graph. It also directly serves
the strategy's cost thesis: it "attacks the largest single line item in the token
economics, and it compounds — every other item gets cheaper when comprehension
stops being re-purchased per run."

---

## Decisions made

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                 | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Hybrid compiler.** Static AST extraction produces interface contracts + dependency slices (exact, always fresh, ~free); a backend-routed LLM produces summary + invariants (semantic, hard-cached, hash-gated).                                                                                                                                                                                                        | The four unit kinds split cleanly along cost/exactness lines, and keeping the cheap half free is what makes "recompile cost ∝ diff size" achievable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D2  | **Committed, sharded, markdown.** Units live at `.harness/comprehension/<module-path>/_module.md`, git-committed via a `.gitignore` un-ignore (precedent: `!**/.harness/security/timeline.json`).                                                                                                                                                                                                                        | Only a committed artifact satisfies "versioned alongside the code" — a checkout of a commit gets matching comprehension; a fresh worktree needs no LLM warm-up. Markdown+frontmatter gives clean line-level diffs on prose (a JSON shard would collapse a summary to one escaped line). Configurable to `cache` (gitignored) for adopters who prefer it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D3  | **Module = source directory.** The shard tree mirrors the source tree; the public surface is anchored on the language's barrel (`index.ts` / `__init__.py` / `mod.rs` / package exports), degrading to all top-level definitions.                                                                                                                                                                                        | Directories are the universal unit devs navigate and how cohesion clusters. The graph already models directory-as-module (`TopologicalLinker.ts:41` creates `module` nodes; `Assembler.ts:179,265` consumes them for density/ranking) — comprehension **reuses that same directory granularity** but adds a _committed, per-module comprehension artifact_ the graph does not have. The overlap is intentional: comprehension does not replace the graph's module nodes, it enriches the same boundary with a served-as-primary summary/contract/invariant/slice unit.                                                                                                                                                                                                                                                                                              |
| D4  | **Full pipeline.** CLI + pre-push **static-only** recompile-and-stage + non-blocking CI backstop + `gather_context` serving + orchestrator dispatch pre-warm + leaf-demand recompilation + #1524 budget wiring.                                                                                                                                                                                                          | The value compounds only when the substrate is actually served and kept fresh end-to-end. Pre-push stays static-only so no LLM ever sits on the `git push` critical path (§ Technical design → Execution across contexts).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D5  | **Core stays IO/provider-injected.** Compiler orchestration, store, provenance, and invalidation live in `@harness-engineering/core` with `extractStatic` and `generateSemantic` **injected**; the CLI/MCP layer wires the concrete graph AST extractor and the concrete `AnalysisProvider`.                                                                                                                             | Sidesteps the core→graph layering question, keeps core pure and unit-testable, and mirrors the roadmap store's IO-injection discipline.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D6  | **Serve pull-primary + push-prewarm.** `gather_context` returns fresh units as the _primary_ context block (graph/source fallback); the orchestrator additionally pre-warms the leaf's blast-radius modules into the stage prompt.                                                                                                                                                                                       | Pull matches today's `local-stage-prompt.ts` architecture (the leaf already calls `gather_context`); push guarantees the substrate is actually primary without hard-coupling the compiler to dispatch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| D7  | **Serve-time hash gate is the sole correctness authority — and it is LLM-free.** Every serve path recomputes the module's `sourceHash` and refuses to serve on mismatch.                                                                                                                                                                                                                                                 | "Stale is worse than no summary." Correctness must not depend on any credential, so it can hold in CI and for adopters with no model configured.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D8  | **Add a `claude`-CLI fallback to the MCP-side analysis-provider resolver**, and route comprehension through it. The unified env-precedence chain is **Anthropic key → local `/v1` → `claude`-CLI subscription → null** — `claude`-CLI is appended _after_ the existing steps so it only fills the previously-`null` gap; every environment that resolves a provider today resolves the _same_ provider after the change. | Today the MCP resolver (`resolveAnalysisProvider`, used by `acceptance_eval`/`outcome_eval`) is Anthropic-key-or-local only — a Claude subscription user with no `ANTHROPIC_API_KEY` and no local endpoint gets an inert/advisory verdict even though a usable `claude`-CLI backend exists. Note the orchestrator's `buildAnalysisProvider` is a _type-dispatched_ selector (picks one backend by `def.type`, with a key→CLI fallback only inside the `anthropic` case), **not** a precedence chain — so this is a strictly-additive extension of the MCP env-precedence resolver, not a merge of the two shapes. Appending `claude`-CLI last preserves fully-local-first behavior ([[fully-local-cannot-be-autopilot]]) and makes comprehension's "no API token" real for subscription adopters. This change is separable and lands as its own commit + ADR (N-1). |

---

## Technical design

### The comprehension unit

One markdown file per module, tree-mirrored under `.harness/comprehension/`:

```
.harness/comprehension/packages/core/src/roadmap/_module.md
---
schemaVersion: 1
module: packages/core/src/roadmap
sourceHash: <full sha256 over current directory membership + sorted member-file contents>
compiledAt: <iso8601>
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: <resolved model id | null>
semantic: present          # present | absent (absent ⇒ static-only unit; no semantic sections)
members: [parse.ts, serialize.ts, heading.ts, ...]
---
## Summary               ← LLM (prose, token-capped)
## Invariants            ← LLM (list)
## Interface Contract    ← static (exported symbols + signatures, fenced)
## Dependency Slice      ← static (imports out / importers in, fenced)
```

- **On-disk format:** markdown + YAML frontmatter, parsed with `gray-matter`
  (already a `core` dependency, `packages/core/package.json:62`) and serialized
  via the roadmap store's `yaml-scalar.ts` helper. Prose lives in the body for
  clean git diffs; structured provenance lives in frontmatter for fast parse.
- **Served (wire) format:** the body sections rendered to compact markdown, with
  provenance collapsed to a single source-hash line. Markdown is ~15–30% cheaper
  in tokens than pretty-JSON and is read natively by models. Store once, render
  to serve.

### Store & compiler (`packages/core/src/comprehension/`)

- `ComprehensionStore` mirrors `packages/core/src/roadmap/store/shard-store.ts`,
  using an injected `ShardIO` (`node-io.ts` pattern): `read(module)`,
  `write(unit)`, `list()`, `path(module)`.
- `compileModule(module, sourceFiles, { extractStatic, generateSemantic })`:
  1. Compute `sourceHash` as a **full SHA-256** over the current directory
     membership (the enumerated set of source file paths) concatenated with the
     sorted member-file contents. Full-length digest, not the 32-bit truncated
     `ingestUtils.ts:9` helper (that one is explicitly "not for security" and is
     too weak for the sole correctness authority). Including membership in the
     hash means an added or removed file in the directory changes the hash — so a
     membership delta is a mismatch (closes the newly-added-file staleness gap).
  2. `extractStatic(sourceFiles)` → interface contract + dependency slice
     (always recomputed; cheap).
  3. If a provider is available: `generateSemantic(...)` → summary + invariants;
     else emit the unit with `semantic: absent`.
- **`extractStatic` is a pluggable, language-aware adapter.** The CLI wires an
  adapter built on the graph's `CodeIngestor` AST layer for supported languages;
  an unsupported language yields a **semantic-only** unit (the static sections
  are omitted, never faked). Public surface anchors on the language's barrel when
  present, else all top-level definitions.

### Semantic generation

`generateSemantic` is backed by the existing `AnalysisProvider.analyze<T>()` seam
(`packages/intelligence/src/analysis-provider/interface.ts:50`) — the same
mechanism `acceptance_eval` and `outcome_eval` use.

- **Structured output:** a Zod `responseSchema` for `{ summary: string,
invariants: string[] }`, validated at the seam (authority-in-TS pattern — the
  unit shape is never trusted raw from the model).
- **Input bounding (primary efficiency lever):** the prompt is fed the _static
  interface contract + dependency slice + a bounded source digest_, **not** the
  full raw source. The static half feeds the semantic half, so input tokens are
  bounded by the module's public surface, not its size — recompile cost per
  module stays bounded regardless of file length.
- **Cost levers already in `AnalysisRequest`:** `disableThinking: true`
  (structured extraction needs no chain-of-thought; honored natively by Ollama's
  `think:false`, ignored safely elsewhere), a tight `maxTokens`, and a default
  **cheap/fast model tier** (comprehension summarizes, it does not reason).
- **Budget:** `analyze()` returns `tokenUsage`; the compiler enforces a per-run
  token budget from it, running modules under **bounded concurrency** and, when
  the budget is exhausted, **failing loud** — remaining modules are left
  `semantic: absent`, never silently partial.
- **Provider resolution (D8):** the resolver resolves in precedence Anthropic key
  → local `/v1` → **`claude`-CLI subscription (no API key)** → null. The
  `claude`-CLI step is appended last, so a fully-local environment
  (`HARNESS_ANALYSIS_BASE_URL` set) still resolves to the local provider exactly
  as it does today — `claude`-CLI only fills the previously-`null` gap. When the
  chain resolves `null`, `generateSemantic` returns null and the unit is emitted
  static-only + `semantic: absent`. Never throws, never blocks.

#### Execution across contexts

One mechanism covers every context:

| Context                                                           | Semantic generation                                                 | Notes                                                                                                              |
| ----------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Pre-push hook**                                                 | **Static-only — never calls an LLM**                                | Recomputes static units + `sourceHash` and stages them (free, fast, cannot stall `git push`); semantic is deferred |
| Explicit `harness comprehend`                                     | Whatever resolves (key/local/subscription)                          | Dev-initiated; where the semantic half is actually (re)generated                                                   |
| CI                                                                | Static/hash verification only by default                            | Optional token-gated refresh job, opt-in                                                                           |
| **Interactive Claude Code** (`get_comprehension` force-recompile) | `ClaudeCliAnalysisProvider` (nested `claude --print --json-schema`) | **No API key** (subscription auth); returns `usage` for budgeting; fires only on a hash-miss                       |

**Why pre-push is static-only:** running an LLM inside `git push` would put a
same-pool, potentially slow/hung nested `claude --print` on the push critical path
(cf. the pre-push gate gauntlet + stage-deadline history). Static extraction is
free and fast, so pre-push keeps the _static_ half fresh with the source change
and stages it; the semantic half is (re)generated out-of-band by an explicit
`harness comprehend`, a leaf-demand recompilation, or the opt-in CI refresh. Until
then the unit's `semantic: absent`/source-stale state simply serves the static
half — correctness is preserved either way.

**Interactive-session caveat (designed for):** nested `claude --print` calls draw
on the _same subscription / rate-limit pool_ as the live session, so the
interactive path is cost-disciplined by construction — cheap model tier,
diff-scoped, bounded concurrency, per-run budget, and a **reentrancy guard** (a
comprehend subprocess must not itself trigger comprehension). Leaf-demand
recompilation fires only on a hash-miss, so mid-session cost is bounded.

### Invalidation (incremental)

`deriveChangedSurface` (merge-base diff, `packages/cli/src/commands/validate-scope.ts:110`,
merged as #1583) yields the changed files; the compiler maps each to its owning
module (directory) and recompiles **only those modules**. The changed-module set
equals the recompiled set — the tested contract behind "cost ∝ diff size".

### Serving

- **`gather_context`** gains a default-on `comprehension` constituent that returns
  fresh units as the **primary** context block, with the current graph packing
  (`packages/cli/src/mcp/tools/gather-context.ts:256-303`) and raw source as
  fallback.
  The stage prompt template (`packages/orchestrator/src/workflow/local-stage-prompt.ts`)
  is updated: "comprehension units are your primary understanding — read raw
  source only for your edit region."
- **Orchestrator pre-warm:** at dispatch, the orchestrator computes the leaf's
  blast-radius modules and pre-warms their units into the prompt.
- **`get_comprehension({ module, forceRecompile? })`** MCP tool implements
  leaf-demand recompilation.
- **Budget (#1524, hard dependency).** Issue #1524 (context-replay budget per
  fleet leaf) defines the `LeafContextEstimate` / `ContextBudget` shapes in
  `@harness-engineering/types`. The compiled substrate is what makes leaves fit
  under the per-leaf budget #1524 enforces: this feature's phase-5 wiring
  populates the estimate's per-source token counts from served comprehension
  units and lowers the estimate versus raw source. The wiring is **live in the
  production dispatch consult**: the orchestrator resolves each candidate leaf's
  served-comprehension attribution before the tick (gated on a configured
  `agent.contextBudget`, cheap-early-out when no `.harness/comprehension` tree
  exists) and threads it, per issue, onto the tick event; the pure dispatch
  reducer passes that attribution into `assertIssueWithinContextBudget` so an
  over-budget-on-raw leaf is measured against the compact served units it will
  actually receive. Because served tokens only ADD to the floor, the attribution
  can never under-count and wrongly pass an over-budget leaf; a leaf with no fresh
  units falls back to the floor-only estimate (byte-identical to #1524). **This
  wiring cannot land until #1524 merges** (the type is on
  `feat/context-replay-budget-per-leaf-1524`, not yet on `main`); until then
  phases 1–4 stand alone and the budget integration is deferred, not blocking.

### The serve-time hash gate (correctness spine)

Every serve path — `gather_context`, `get_comprehension`, orchestrator pre-warm —
funnels through a single gate: **re-enumerate the module directory's current
membership**, recompute `sourceHash` over that membership + current member
contents, and if it ≠ the unit's stored hash (whether because a file's contents
changed **or** because a file was added/removed), the unit is **source-stale** →
**do not serve it** — return raw-source fallback plus a recompile signal. Because
the hash covers membership, a newly-added file cannot silently evade the gate. The
gate performs only directory enumeration, hashing, and comparison, so it requires
**no LLM and no credential** and holds identically in CI, headless, and
interactive runs.

Two orthogonal freshness concepts, deliberately named apart to avoid confusion:
_source-stale_ (hash mismatch — the whole unit is untrustworthy, gate refuses it)
versus `semantic: absent` (a hash-fresh unit whose semantic half was never
generated — the gate serves its static sections).

### Truth vs freshness: the semantic half is advisory

The hash gate guarantees a served unit _matches its source_, not that its prose is
_correct_: the summary and invariants are LLM-generated, and the Zod schema
validates their shape, not their truth. A hash-fresh but subtly-wrong summary
would be served with full trust and committed for future agents. This is bounded
by design, not left implicit:

- **The load-bearing half is static.** Interface contract and dependency slice are
  extracted from the AST — exact by construction. Agents rely on those for
  structural facts.
- **Summary + invariants are framed as advisory** in the served rendering (a leaf
  treats them as orientation, and always reads raw source for the region it
  edits — the summary is never the substrate for a _change_, only for
  _understanding_ the surrounding blast radius).
- **Committed semantic prose is reviewable.** Because units are committed markdown
  (D2), a wrong summary shows up in a diff and can be corrected like any other
  doc; `storage: "cache"` adopters regenerate rather than review.

The correctness _invariant_ remains hash-based and LLM-free (D7); semantic
_accuracy_ is an advisory-quality property, explicitly not part of the gate.

---

## Integration Points

### Entry Points

- `harness comprehend [--changed | --all | --check | --stats]` CLI command.
- `get_comprehension` MCP tool (leaf-demand recompilation).
- New `comprehension` constituent in the `gather_context` MCP tool.
- Pre-push hook step (recompile changed modules, stage the shards).
- Orchestrator dispatch pre-warm.
- New `@harness-engineering/core` barrel exports (`ComprehensionStore`,
  `compileModule`, unit types).

### Registrations Required

- Core barrel allowlist entry in `scripts/generate-core-barrel.mjs` (new exports
  are a silent no-op without it).
- MCP tool registration for `get_comprehension` and the `gather_context`
  `comprehension` include.
- `.gitignore` un-ignore for `.harness/comprehension/` (mirrors the
  `!**/.harness/security/timeline.json` precedent) — gated to the `committed`
  storage mode.
- `harness.config.json` schema addition (see Config surface).

### Documentation Updates

- AGENTS.md — the comprehension substrate and the no-credential invariant.
- CLI reference regeneration (`pnpm run generate-docs`) for `harness comprehend`.
- Config docs for the new `comprehension` block.
- A `docs/knowledge/` entry describing the substrate concept and its relationship
  to the knowledge graph.

### Architectural Decisions (ADRs)

- **D2 — Comprehension as a committed, git-versioned substrate distinct from the
  knowledge graph.** Warrants an ADR: it establishes a new committed-artifact
  location, an un-ignore, and versioning semantics.
- **D8 — Unify the AnalysisProvider resolvers.** Warrants an ADR: it changes the
  degradation behavior of existing `acceptance_eval`/`outcome_eval` tools for
  subscription users.
- **D7 — Serve-time hash gate as the sole (LLM-free) correctness authority.**
  Warrants an ADR: it defines where comprehension correctness is enforced and why
  it must not depend on a credential.

### Knowledge Impact

New concepts to enter the graph: _comprehension unit_, _source-hash provenance_,
_static-feeds-semantic compilation_, _degradation ladder (full → static-only →
source-fallback)_.

---

## Success Criteria

Each is observable and testable.

1. **Replay reduction (issue AC1).** On a fixed dogfood corpus of N≥20 completed
   fleet-leaf tasks replayed with and without the substrate served, **median
   cache-read tokens per task drop by ≥25%**, while **task success does not
   regress** — "success" held constant by the existing post-execution
   `outcome_eval` pass rate over the same corpus (the with-substrate run's pass
   rate is ≥ the baseline's). Baseline = the same corpus with the `comprehension`
   constituent disabled. Reported by the dogfood measurement + `harness comprehend
--stats`. (The 25% target is a floor to make the criterion binary; the
   theoretical ceiling is far higher given the 298:1 replay ratio.)
2. **No silent staleness (issue AC2).** Given a unit whose stored `sourceHash` ≠
   current source, no serve path returns the unit; it returns source fallback +
   a recompile signal. Unit + integration test.
3. **Incremental cost (issue AC3).** For a diff touching modules S, the set of
   recompiled modules equals S (not the repo). Test asserts changed-set ==
   recompiled-set.
4. **No-credential invariant.** With the provider resolving to `null`, the full
   path — compile (static-only), serve-time gate, `--check`, CI — passes with
   **zero API token and no LLM**. Test runs the gate path against a null
   provider and asserts all-green + static-only units.
5. **Backend coverage.** Semantic generation resolves a provider via each of:
   Anthropic key, `claude`-CLI subscription, and local `/v1`. Unified-resolver
   test.
6. **Adopter-facing value.** `harness comprehend --stats` reports served-unit
   vs raw-source token savings without relying on harness-internal telemetry.

---

## Implementation Order

1. **Core compiler + store** (IO/provider-injected): unit model, markdown +
   frontmatter (de)serialization, `sourceHash`, `extractStatic` interface,
   `ComprehensionStore`. Pure, fully unit-tested, no LLM. _(SC: foundation.)_
2. **Serve-time hash gate + `gather_context` constituent** — the correctness
   spine, LLM-free. _(SC2, SC4.)_
3. **Append `claude`-CLI to the analysis-provider resolver (own commit + ADR) +
   wire `generateSemantic`** — static-feeds-semantic input bounding, budget via
   `tokenUsage`. _(SC5, D8, N-1.)_
4. **Invalidation + CLI** — `deriveChangedSurface` → changed modules;
   `harness comprehend` incl. `--check`/`--stats`. _(SC3, SC6.)_
5. **Full pipeline** — pre-push **static-only** recompile-and-stage, non-blocking
   CI backstop, orchestrator dispatch pre-warm, `get_comprehension` leaf-demand
   tool, and (once #1524 has merged) budget wiring. _(SC1, D4, D6.)_
6. **Docs, ADRs, config schema, dogfood measurement.** _(SC1 report.)_

Phases 1–2 deliver a correct, LLM-free vertical slice; phases 3+ layer enrichment
and reach on top without weakening the correctness guarantee.

---

## Config surface (`harness.config.json`)

```jsonc
{
  "comprehension": {
    "storage": "committed", // "committed" (default) | "cache" (gitignored)
    "semantic": true, // false ⇒ static-only, never calls an LLM
    "model": null, // override; default is a cheap/fast tier
    "maxTokensPerRun": 200000, // per-run budget; fail-loud when exhausted
    "concurrency": 4, // bounded semantic-generation concurrency
    "ci": "verify", // "verify" (static/hash, non-blocking) | "refresh" (opt-in, token-gated) | "off"
  },
}
```

All knobs default to sane, adopter-safe values; the substrate delivers value with
zero configuration and never requires a credential in its default posture.

---

## Risks & mitigations

| Risk                                                           | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM summary quality/drift causes committed-file churn          | Regenerate only on `sourceHash` change (fresh units never re-run); `disableThinking` + low `maxTokens` for output stability.                                                                                                                                                                                                                                                                                         |
| One-time backfill cost across all packages                     | Diff-scoped after backfill; backfill is a bounded, opt-in `--all` run; static floor is free.                                                                                                                                                                                                                                                                                                                         |
| `extractStatic` language coverage gaps                         | Semantic-only units for unsupported languages (never faked static sections); adapters added incrementally.                                                                                                                                                                                                                                                                                                           |
| Nested `claude` calls burn interactive rate limit              | Cheap tier + diff-scoped + bounded concurrency + per-run budget + reentrancy guard.                                                                                                                                                                                                                                                                                                                                  |
| Committed generated files add review noise                     | `storage: "cache"` opt-out; units are small and tree-local.                                                                                                                                                                                                                                                                                                                                                          |
| Adding `claude`-CLI to the resolver changes eval-tool behavior | The `claude`-CLI step is appended **last** in the precedence chain (after Anthropic key and local `/v1`), so every environment that resolves a provider today resolves the _same_ one after the change — `claude`-CLI only fills the previously-`null` gap. Fully-local-first is preserved. Covered by an ADR + a test asserting each existing environment's resolution is unchanged. Lands as its own commit (N-1). |
