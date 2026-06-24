---
type: business_concept
domain: core
tags: [review, ci, required-review, verdict, runner-contract, multi-client]
---

# CI Review Contract

The `harness review-ci` gate normalizes every review runner — heterogeneous agent
CLIs and a local model endpoint — into one validated verdict, so merge-gating logic
never special-cases a client. Lives in `packages/core/src/review/ci/`.

## CiReviewVerdict

A versioned Zod schema (`schemaVersion: 1`) and the single normalization target:

- `runner` — `claude | gemini | antigravity | codex | cursor | local | floor-only`
- `ranLlmTier` — whether the LLM tier executed (vs floor-only)
- `assessment` — `approve | comment | request-changes`
- `findings` — reuses the core `ReviewFinding` shape
- `blockingFindings`, `exitCode`, `skipped`/`skipReason`

A `superRefine` enforces that `blockingFindings` is a subset of `findings`, all
blocking findings are `critical`, and `assessment`/`exitCode` are consistent. The
gate therefore trusts any verdict that validates — including model-authored output
from the `local` runner.

## Two-kind runner-preset registry

Presets are a discriminated union on `kind`:

- **`agent-cli`** — `{ secretEnvVar, headlessInvocation, verdictParser, supported }`.
  The orchestrator spawns the CLI (diff on STDIN) and parses its envelope. Envelopes
  differ: claude wraps the verdict in a transcript `.result` string; codex in a JSONL
  `agent_message.text`; antigravity (`agy --print`) emits it as plain-text JSON.
- **`endpoint`** — `{ endpointEnvVar, modelEnvVar, invoke, verdictParser, supported }`.
  The `local` runner does a single LLM-judgment pass over an openai-compatible
  endpoint; `invoke` is an injected seam (core must not import the provider).

Adding a runner is one registry entry plus tests — no orchestrator or template change.
A preset is `supported: true` only after verification against the real CLI; cursor and
the superseded gemini ship `supported: false` with a reason.

See also: [[code-review-pipeline]] (the heuristic floor this wraps),
[[tiered-review-degradation]], [[required-check-binding]]. Decisions: ADR 0040, 0041.
