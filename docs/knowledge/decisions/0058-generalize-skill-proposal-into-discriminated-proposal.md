---
number: 0058
title: Generalize SkillProposalSchema into a discriminated ProposalSchema
date: 2026-07-07
status: accepted
tier: large
source: docs/changes/local-model-lifecycle-manager/proposal.md
---

## Context

The hermes-phase-4 review queue was built around a **closed** skill-proposal shape:
`SkillProposalSchema` carried a top-level `kind: 'new-skill' | 'refinement'` discriminator
and a skill-only `content` block, and every consumer — the core store, the orchestrator
gate/promote/events/routes, the CLI, and the dashboard — narrowed on that `kind` field.

The Local Model Lifecycle Manager (LMLM, Phase 5) needs to route **model** add/swap/evict
suggestions through the _same_ review queue: the same file-backed store, the same
approve/reject lifecycle, the same notification fan-out. With the closed schema the only
options were (a) stand up a parallel queue for model proposals — duplicating the store,
routes, events, and dashboard panel — or (b) widen the schema so one queue carries both
kinds. Duplication (a) was rejected: it doubles the surface that has to stay in lockstep
and fractures the "one low-pressure review queue" invariant hermes-phase-4 established.

The constraint that made this delicate: the **N3 gate** — the existing
`packages/types/tests/proposals.test.ts` must pass byte-unchanged, and the runtime skill
flow must not regress. A flat widened enum (`kind: 'new-skill' | 'refinement' | 'model'`)
was considered and rejected — it conflates "what kind of proposal" with "what kind of
skill change", forces every skill consumer to re-handle a `'model'` case inline, and gives
the model variant no place to hang its own content/status shape.

## Decision

Generalize `SkillProposalSchema` into a **discriminated `ProposalSchema`** in
`@harness-engineering/types`:

- **Outer discriminator** `kind: 'skill' | 'model'` (`ProposalTypeSchema`).
- The **skill variant** carries `kind: 'skill'` plus `skillKind: 'new-skill' | 'refinement'`
  — the old top-level `kind` value is renamed to the nested `skillKind`. The prior enum is
  retained as a deprecated `ProposalKindSchema` alias so the emit path
  (`EmitSkillProposalInput.kind`) is unchanged.
- The **model variant** carries `kind: 'model'` plus a strict `model` content object
  (`ModelProposalContentSchema`: `action`, `target`, `replaces?`, `scoreDelta`,
  `justification`, `diskImpactGb`) and its own `ModelProposalStatusSchema` that adds the
  terminal `failed_target_missing` status (D13/F11 stale-target cancellation).
- `ProposalSchema = z.preprocess(migrateProposalRecord, discriminatedUnion(...))`, with the
  skill cross-field checks applied at the union via `superRefine`. Members stay plain
  `ZodObject`s so `discriminatedUnion` accepts them.

**Read-migration.** Legacy on-disk records lack the outer `kind` and hold the skill-change
value in the top-level `kind`. `migrateProposalRecord` maps
`{ kind: 'new-skill' | 'refinement', … }` → `{ kind: 'skill', skillKind: <old>, … }`. It runs
inside the schema's `preprocess`, so every read through `getProposal` (the single store
read chokepoint) transparently upgrades old records — no migration script, no on-disk
rewrite.

**Event-payload stability.** The `proposal.*` bus events keep a `kind` field whose value is
the `skillKind` (`emitProposal*` sets `kind: proposal.skillKind`), so the notification
envelope and every event/summary assertion stay unchanged.

## Consequences

- **One queue, two kinds.** Model proposals reuse the store, the approve/reject route
  (now kind-aware), the events, and the dashboard queue without a parallel stack. Approve
  dispatches skill → promote-to-catalog, model → installer + `PoolManager` handler.
- **Backward-compatible reads.** Pre-Phase-5 records round-trip through the migration; a
  golden legacy-record test in the core store proves it.
- **N3 held.** `types/tests/proposals.test.ts` is byte-unchanged (new migration/model tests
  live in a separate `proposals-migration.test.ts`); consumer tests took only mechanical
  `.kind` → `.skillKind` renames with no count or behavior change.
- **Consumers narrow on the outer `kind`.** Skill-only code paths guard `kind === 'skill'`
  and return 422/`throw` for model records where a skill was assumed (gate, promote, edit).
- **Unlocks future kinds.** A `config` or `plan-refinement` proposal is now an additive
  union member, not a second queue.
- **One sharp edge.** Core `updateProposal`'s patch type is
  `Partial<SkillProposal> & Partial<ModelProposalRecord>`, whose intersected `status` field
  statically excludes model-only statuses like `failed_target_missing`; the runtime parses
  through `ProposalSchema` (the model variant accepts it), so the model handler casts the
  patch at the call site. A follow-up could give `updateProposal` a kind-aware patch type.

## Alternatives rejected

- **Flat widened enum** (`kind: 'new-skill' | 'refinement' | 'model'`). Conflates proposal
  kind with skill-change kind, gives the model variant no content home, and forces inline
  `'model'` handling in every skill consumer.
- **Parallel model-proposal queue.** Duplicates store/routes/events/dashboard and breaks the
  single-review-queue invariant.

## See also

- Spec: `docs/changes/local-model-lifecycle-manager/proposal.md` (Phase 5; Soundness
  Reconciliation 2026-07-07 D11; D13, F6, F7, F11).
- `docs/knowledge/orchestrator/local-model-lifecycle.md` — the `Model Proposal` concept.
- ADR 0003 — local model resolution strategy (the resolver the pool feeds).
