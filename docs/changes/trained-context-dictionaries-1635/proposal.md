# Trained context dictionaries — a verified codebook for recurring knowledge (#1635)

> Stage: harness-brainstorming → scoped spec. Route: feature.
> Scope confirmed by human: **trainer + membership scorer + governed codebook, report-only.**

## Problem

Recurring-knowledge retransmission is the second-largest pure-waste token
component after cache misses, and unlike caching it pays off even across
sessions and consumers that share no cache. A large fraction of every assembled
prompt is recurring knowledge — conventions, schemas, standing instructions,
architectural facts — re-sent verbatim thousands of times.

Zstd's largest wins on small documents come from a _trained dictionary_: learn
the corpus's recurring substrings once, then encode every new document against
the dictionary. Linguistics arrives at the same design independently — every
co-located team develops jargon precisely because it compresses communication —
with the known failure mode that jargon _drifts_.

## Scope (this slice)

**In:** mine the corpus of past assembled contexts, score candidate terms by
`frequency × length` against an amortization threshold, and emit a **governed,
versioned candidate codebook** — each term bound to a verified definition with a
version, deterministic expansion, and a version bump whenever a definition
changes. Membership is decided by measurement (a term enters when
`frequency × length` crosses the threshold, leaves when usage decays). Produce
the codebook + membership report only.

**Deferred (out):** wiring handle-substitution into the serving/assembly path.
Nothing about how context is served changes in this slice. The fork
"report-only vs wire-substitution" is **answered: report-only** and is not
re-opened.

## Design decisions

- **D1 — Term identity is a stable label; the definition may drift.** A term is
  keyed by a stable concept label (a knowledge identifier), from which its handle
  is derived deterministically. The handle survives definition drift; the
  _version_ moves. When a source has no stable key, the adapter sets
  `label = text` (text-as-label) so identical spans still group — the general
  recurring-substring case.

- **D2 — Amortization is `frequency × length`, with a net-saving guard.**
  Verbatim re-transmission costs `frequency × length` characters; binding to a
  handle costs `length` once plus `handleCost` per use. A term is admitted only
  when it clears the entry threshold (expressed in `frequency × length`, the
  quantity #1635 names) **and** the net saving
  `frequency × (length − handleCost) − length` is positive. `frequency` is
  _document frequency_ (distinct documents), so a span repeated within one
  document does not inflate the case.

- **D3 — Governance: version bump on definition change, prior versions
  retained.** Reconciling a prior codebook against freshly-mined bindings mints
  new terms at v1, keeps the version when the definition hash is unchanged, and
  bumps + archives the prior `(definition, version)` when it changes. A consumer
  that pinned `handle@version` can still expand the exact old text — no consumer
  silently holds a stale meaning. A stale-reference audit classifies pins as
  `unknown-handle` / `unknown-version` / `superseded`.

- **D4 — Membership by measurement with hysteresis.** Entry threshold >
  retirement threshold, so a term hovering at the boundary does not thrash. A
  previously-live label that decays out of the mining window retires
  automatically and moves to history. No hand-curated allow/deny list anywhere in
  the path.

- **D5 — Pure core + IO-injected adapter.** The mining / codebook / membership /
  report logic is pure and IO-free (`packages/core/src/dictionary`). The corpus
  source (comprehension units on disk) and codebook persistence live in the CLI
  (`harness context-dictionary`), mirroring the metabolism (#1628) and
  refinement-demand (#1632) seams.

## Acceptance criteria

- On the corpus, dictionary substitution yields a measured token reduction, and
  the projection is a paired comparison (verbatim baseline vs codebook). Because
  substitution is deferred, task-outcome degradation is zero by construction
  (nothing served changes). _Proven: `report.test.ts` AC1 + the live
  `harness context-dictionary report` over this repo's 702-unit corpus →
  ~73.8% projected reduction._
- A changed definition never silently changes an old context's meaning — version
  pinning proven in fixtures. _Proven: `codebook.test.ts` / `report.test.ts` AC2._
- Entry/exit is fully driven by measured usage across a soak — no hand-curated
  membership. _Proven: `report.test.ts` AC3 (multi-window soak)._

## Dogfooding

The first dictionary is trained on this repo's own committed comprehension
corpus (`.harness/comprehension/**`, 702 units): `harness context-dictionary
report`. Genuinely recurring spans (import statements across 130 modules,
standard invariants) surface at the top of the codebook.
