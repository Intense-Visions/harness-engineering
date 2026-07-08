---
number: 0061
title: LMLM as a standalone package with a native TS ranking port
date: 2026-07-08
status: accepted
tier: large
source: docs/changes/local-model-lifecycle-manager/proposal.md
---

## Context

The Local Model Lifecycle Manager (LMLM) shipped its foundational phases (0-3)
before the ADR practice was in place, so the two load-bearing structural
decisions from that period — where the code lives and how the ranking algorithm
is realized (decision **D3**) — were never captured. The later phases produced
ADRs 0058 (discriminated `ProposalSchema`), 0059 (background scheduler + silent
drift reconciliation), and 0060 (operator surfaces + dispatch-safe eviction), but
those all assume the package boundary and algorithm-port decisions already exist.
This ADR backfills them.

Three consumers need the ranking + pool logic: the `LocalModelResolver` (to derive
its candidate list from pool state), the `harness models` CLI, and the dashboard
`/s/local-models` panel. That fan-out argues against burying the logic inside the
orchestrator daemon. Separately, the reference algorithm (`whichllm`) is written in
Python and expects a `uv` runtime — an unacceptable dependency to introduce into a
TypeScript monorepo whose value proposition is unattended, no-babysitting operation.

## Decision

- **Standalone package.** LMLM lives in a standalone `@harness-engineering/local-models`
  package, not as an orchestrator-internal module. This keeps a clean layer boundary
  and makes the ranker reusable from the CLI, the dashboard, and any future standalone
  consumer without pulling in the daemon.
- **Native TS port, not a wrapper.** The `whichllm`-style algorithm — hardware
  detection, VRAM math, speed estimation, evidence grading, and recency-weighted
  ranking — is a **native TypeScript port**, not a subprocess wrapper around the
  Python tool. No Python/`uv` runtime dependency is introduced.
- **`ModelRecommender` interface.** A `ModelRecommender` interface fronts the native
  implementation so a future ranking engine can be swapped in without touching the
  callers.
- **Live-first, snapshot-fallback data.** The live HuggingFace API keeps ranking data
  fresh; a frozen `snapshot.json` is the offline fallback so the ranker remains
  deterministic and testable when the network is unavailable.

## Consequences

- The ranker is reusable from the CLI, the dashboard, and potential standalone use,
  with a clean layer boundary that does not couple ranking to the daemon lifecycle.
- The ranker is independently testable via parity fixtures
  (`packages/local-models/tests/ranker/parity/`), which pin the native port's output
  against the reference algorithm.
- No Python or `uv` runtime dependency enters the monorepo; unattended freshness is
  preserved.
- The algorithm needs tuning only when genuinely new hardware/quantization categories
  emerge (new GPU families, new quant formats) — routine model churn does not require
  code changes.

## Alternatives rejected

- **Orchestrator-internal module.** Couples the ranker to the daemon lifecycle and
  makes it non-reusable from the CLI and dashboard. Rejected.
- **`whichllm` subprocess wrapper.** Introduces a Python/`uv` runtime dependency and
  breaks unattended freshness (subprocess spawn + interpreter startup on every
  refresh, plus a second toolchain to install and keep current). Rejected.

## See also

- [ADR 0058: Generalize SkillProposalSchema into a discriminated ProposalSchema](./0058-generalize-skill-proposal-into-discriminated-proposal.md)
- [ADR 0059: Background refresh scheduler and silent drift reconciliation](./0059-background-scheduler-and-silent-drift-reconciliation.md)
- [ADR 0060: LMLM operator surfaces and dispatch-safe eviction](./0060-lmlm-operator-surfaces-and-dispatch-safe-eviction.md)
- [Local Model Lifecycle](../orchestrator/local-model-lifecycle.md) — the domain knowledge doc.
