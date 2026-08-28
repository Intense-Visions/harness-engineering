---
number: 0107
title: Comprehension as a committed, git-versioned substrate distinct from the knowledge graph
date: 2026-08-27
status: accepted
tier: medium
source: docs/changes/compiled-comprehension-substrate/proposal.md
---

## Context

The compiled-comprehension substrate maintains a per-module comprehension layer —
summary, invariants, interface contract, and dependency slice — recompiled only
for the modules whose source changed, and served to fleet leaves as their
**primary** context in place of re-reading raw source. Two questions had to be
settled before the compiler could be built: **where these units live** and **how
they relate to the knowledge graph**, which already models the same
directory-as-module boundary.

The substrate's core promise is "versioned alongside the code." A unit is only
trustworthy relative to a specific source revision (its `sourceHash` is computed
over that revision's directory membership + member contents — see ADR 0108), so
the unit and the code it describes must move together through history. An
ephemeral cache cannot deliver that: a checkout of an old commit would get a
comprehension unit compiled against a newer (or missing) source, and a fresh
worktree would start cold, forcing an LLM warm-up run before any leaf could be
served — precisely the per-run re-derivation cost this feature exists to remove.

Separately, the graph already creates `module` nodes at directory granularity
(`TopologicalLinker.ts` creates them; `Assembler.ts` consumes them for density
and ranking). It would have been tempting to fold comprehension into those nodes
and avoid a second artifact on the same boundary.

## Decision

**Store comprehension units as committed, git-versioned markdown files, tree-mirrored
under `.harness/comprehension/`, one `_module.md` per source directory — a substrate
deliberately distinct from, and overlapping-not-replacing, the knowledge graph.**

1. **Storage location + un-ignore.** Units live at
   `.harness/comprehension/<module-path>/_module.md`, mirroring the source tree.
   The subtree is made git-trackable by a `.gitignore` un-ignore that mirrors the
   existing `!**/.harness/security/timeline.json` precedent (in both the root
   `.gitignore` and `.harness/.gitignore`), so the units stay committed even if a
   broader `.harness/` ignore is later introduced by an adopter template.
   Adopters who prefer disposable units set `comprehension.storage: "cache"`
   (git-ignored) and regenerate rather than review.

2. **Markdown + YAML frontmatter, not JSON.** Structured provenance
   (`schemaVersion`, `module`, `sourceHash`, `compiledAt`, `compiler`, `model`,
   `semantic`, `members`) lives in frontmatter for fast parse; the prose sections
   (Summary, Invariants) and the fenced static sections (Interface Contract,
   Dependency Slice) live in the body. Markdown gives clean line-level git diffs
   on prose — a JSON shard would collapse a multi-line summary to one escaped
   line, making review and drift-spotting impractical — and is read natively by
   models, which is ~15–30% cheaper in tokens than pretty-JSON when served.

3. **Module = source directory.** The shard tree mirrors the source tree; the
   public surface anchors on the language's barrel (`index.ts` / `__init__.py` /
   `mod.rs` / package exports), degrading to all top-level definitions.

4. **Overlap with the graph is intentional — enrich, do not replace.**
   Comprehension reuses the graph's directory-as-module granularity but adds a
   _committed, served-as-primary_ summary/contract/invariant/slice unit the graph
   does not have. The graph remains a **reference** agents may consult on demand;
   comprehension is the **working substrate served first**. The two are different
   roles on the same boundary, not duplicate stores to be reconciled.

## Consequences

- **A checkout gets matching comprehension for free.** Because units are committed,
  any revision's checkout carries comprehension compiled against that revision, and
  a fresh worktree needs no LLM warm-up before leaves can be served — the substrate
  is durable across clones and time, satisfying "versioned alongside the code."
- **Semantic prose becomes reviewable.** A committed markdown unit surfaces a wrong
  or drifted summary in a normal diff, where it can be corrected like any other doc.
  This is the review affordance that bounds the advisory-accuracy risk (the hash
  gate of ADR 0108 guarantees source-match, not prose-truth).
- **Committed generated files add review noise.** Mitigated by keeping units small
  and tree-local, regenerating only on `sourceHash` change (fresh units never
  re-run, so no churn), and offering the `storage: "cache"` opt-out.
- **A one-time backfill cost exists.** Populating units across every package is a
  bounded, opt-in `harness comprehend --all` run; the static floor is free (no
  LLM), and after backfill recompilation is diff-scoped. **Full semantic backfill
  of this repository is a deliberate follow-up rollout requiring an LLM budget** —
  this feature ships the mechanism and the un-ignore, not the populated tree. (A
  single representative static-only unit is committed as a demonstration.)
- **No graph migration or reconciliation is required.** Comprehension is additive:
  it neither reads from nor writes to the graph's `module` nodes, so the graph
  subsystem is untouched and the two artifacts can evolve independently on the same
  directory boundary.
