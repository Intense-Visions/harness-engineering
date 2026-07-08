---
number: 0062
title: Pool-bounded autonomy with Ollama-first installation
date: 2026-07-08
status: accepted
tier: large
source: docs/changes/local-model-lifecycle-manager/proposal.md
---

## Context

Like ADR 0061, this ADR backfills foundational Phase 0-3 decisions that predate the
ADR practice: **D1** (how much autonomy LMLM is granted) and **D4** (how models are
actually installed and swapped). Neither was captured as an ADR at the time.

LMLM's value is unattended operation — but "unattended" cannot mean "downloads
arbitrary models from HuggingFace without operator consent." There is a trust line,
and the design has to place authority explicitly on one side of it. Separately, to
install, swap, and delete models without a human at the keyboard, LMLM needs a
scriptable backend API; among local-model backends, only Ollama's REST API is stable
and safe to drive unattended today.

## Decision

- **Pool-bounded autonomy (D1).** The operator pre-approves a **disk budget** plus a
  set of **allowed HuggingFace orgs/families once**. Within that pool boundary, the
  orchestrator auto-pulls, swaps, and evicts models freely. Approval is granted
  **per-pool, not per-model** — the operator authorizes the envelope, not each
  individual download. Changes that add, swap, or evict pool members still flow
  through the hermes-phase-4 review queue as proposals with a single approve/reject,
  so the operator retains a veto without having to originate each action.
- **Ollama-first install (D4).** Install, swap, and delete are first-class via the
  Ollama REST API (`/api/pull`, `/api/delete`, `/api/tags`, `/api/show`). LM Studio,
  vLLM, and llama.cpp are **advisory only** — LMLM surfaces a copy-paste command but
  performs no automated mutation. In all cases the orchestrator **never starts or
  supervises the backend server**; it drives an already-running Ollama and treats the
  server lifecycle as the operator's responsibility.

## Consequences

- Maximum "just works" behavior, with authority made explicit at exactly one
  boundary: the disk budget + org/family allowlist. Nothing crosses that line
  autonomously.
- The explicit-approval invariant is preserved: an approved repo A is never silently
  swapped for a different repo B — a swap is a distinct proposal requiring its own
  approval (cross-reference D13 / [ADR 0060](./0060-lmlm-operator-surfaces-and-dispatch-safe-eviction.md)
  stale-target handling).
- Matches the existing "the orchestrator does not manage the model server" invariant
  from the multi-backend routing work.
- Non-Ollama users still get hardware-aware recommendations; they simply run the
  advisory command themselves rather than having an install happen underneath them.

## Alternatives rejected

- **Per-model approval.** Defeats the point of autonomy and reintroduces the operator
  toil LMLM exists to remove — every routine model refresh would need a human. Rejected
  in favor of per-pool authorization + a proposal veto.
- **Multi-backend auto-install in v1.** No local-model backend beyond Ollama exposes a
  stable, scriptable install/delete API safe to drive unattended today. Auto-driving
  LM Studio / vLLM / llama.cpp would mean fragile UI automation or unsupported
  internals. Rejected; those backends are advisory in v1.

## See also

- [ADR 0058: Generalize SkillProposalSchema into a discriminated ProposalSchema](./0058-generalize-skill-proposal-into-discriminated-proposal.md)
- [ADR 0059: Background refresh scheduler and silent drift reconciliation](./0059-background-scheduler-and-silent-drift-reconciliation.md)
- [ADR 0060: LMLM operator surfaces and dispatch-safe eviction](./0060-lmlm-operator-surfaces-and-dispatch-safe-eviction.md)
- [ADR 0061: LMLM as a standalone package with a native TS ranking port](./0061-lmlm-package-boundary-and-native-ranking-port.md)
- [Local Model Lifecycle](../orchestrator/local-model-lifecycle.md) — the domain knowledge doc.
- [Local Model Lifecycle Manager (Operator Guide)](../../guides/local-model-lifecycle.md) — enabling, pool setup, and known limitations.
