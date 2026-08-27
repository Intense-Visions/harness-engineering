---
number: 0108
title: Serve-time source-hash gate as the sole, LLM-free correctness authority
date: 2026-08-27
status: accepted
tier: medium
source: docs/changes/compiled-comprehension-substrate/proposal.md
---

## Context

A comprehension unit is only trustworthy relative to the exact source revision it
was compiled against. The moment a module's source drifts from the unit — a member
file edited, added, or removed — the unit's summary, invariants, interface
contract, and dependency slice may all be wrong. Serving a stale unit is worse
than serving nothing: it silently feeds a leaf a confident but false understanding
of code it will reason about. So the substrate needed one unambiguous answer to
"is this unit safe to serve _right now_?"

Two properties constrained that answer:

1. **It must not depend on any credential.** The substrate's whole reach argument
   is "no API token and no LLM required for correctness, push, or CI." If the
   correctness check needed a model, it would fail in CI, in headless runs, and for
   every adopter with no provider configured — exactly the environments where a
   silent-staleness bug would do the most damage.
2. **It must catch membership deltas, not just content edits.** An earlier, weaker
   provenance scheme (the 32-bit truncated `ingestUtils.ts` hash, explicitly "not
   for security") could miss a newly-added file in a directory, leaving a unit that
   describes a module that no longer matches its own membership.

There are several places a unit can be served — `gather_context`,
`get_comprehension`, and the orchestrator's dispatch pre-warm — so the check also
had to be a single shared spine, not re-implemented (and drifting) per call site.

## Decision

**Make a serve-time source-hash gate the sole correctness authority for the
substrate, and make it entirely LLM-free.** Every serve path funnels through one
`serveGate`:

1. **Re-enumerate** the module directory's _current_ membership (the set of source
   file paths), fresh at serve time.
2. **Recompute `sourceHash`** as a full **SHA-256** over that membership
   concatenated with the sorted member-file contents — full-length digest, never
   the truncated ingest helper. Including membership in the hash means an added or
   removed file changes the hash, so a membership delta is a mismatch (closing the
   newly-added-file staleness gap).
3. **Compare** to the unit's stored `sourceHash`. On **mismatch** the unit is
   _source-stale_ → **do not serve it**; return raw-source fallback plus a recompile
   signal. On match, serve.

The gate performs only directory enumeration, hashing, and comparison — **no LLM,
no credential, ever** — so it holds identically in CI, headless, and interactive
runs.

Two freshness concepts are deliberately named apart to keep the gate unambiguous:

- **source-stale** — hash mismatch; the _whole_ unit is untrustworthy and the gate
  refuses it.
- **`semantic: absent`** — a hash-_fresh_ unit whose advisory semantic half was
  never generated (static-only). The gate serves its exact static sections; only
  the advisory prose is missing.

This defines the **degradation ladder**: _full_ (fresh unit, semantic + static
served) → _static-only_ (fresh unit, `semantic: absent` — exact contract + slice
served, no prose) → _source-fallback_ (source-stale or no unit — raw source plus a
recompile signal served). Each rung is safe: the gate never serves anything that
does not match current source.

The gate guarantees a served unit _matches its source_, **not** that its prose is
_correct_. Summary and invariants are LLM-generated and only shape-validated (Zod),
so they are framed as **advisory** in the served rendering; the load-bearing
interface-contract and dependency-slice sections are static (AST-exact). Semantic
_accuracy_ is an advisory-quality property, explicitly **not** part of the gate.

## Consequences

- **No silent staleness (SC2).** Because every serve path shares the one gate, a
  unit whose stored hash ≠ current source is never served on any path; the caller
  gets source fallback + a recompile signal. Enforced by unit + integration tests.
- **The no-credential invariant is real (SC4).** With the provider resolving to
  `null`, the full path — compile (static-only), serve-gate, `--check`, CI — passes
  with zero API token and no LLM. Correctness is decoupled from any model, so it
  cannot degrade when a credential is absent.
- **Membership changes cannot evade the gate.** Hashing the enumerated membership
  (not just file contents) means adding or deleting a directory member flips the
  hash, so the stale unit is refused — the class of bug the truncated ingest hash
  allowed is closed by construction.
- **Correctness and freshness-of-prose are separated.** A hash-fresh-but-subtly-wrong
  summary can still be served (the gate does not judge truth); this is bounded by
  keeping the load-bearing sections static, framing prose as advisory, and
  committing units as reviewable markdown (ADR 0107) so a wrong summary shows up in
  a diff. The correctness _invariant_ stays hash-based and LLM-free; prose accuracy
  is a separate, advisory concern.
- **One spine, many callers.** Centralizing the check in `serveGate` means new serve
  paths inherit correctness for free and cannot drift into a private, weaker check.
