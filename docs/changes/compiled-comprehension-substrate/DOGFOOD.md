# Dogfood measurement — Compiled Comprehension Substrate

This document defines the method for validating **Success Criterion 1** (replay
reduction, issue AC1) and captures an illustrative per-serve savings sample from
`harness comprehend --stats` toward **SC6** (adopter-facing value).

It is deliberately honest about scope: the full A/B replay validation is a
**follow-up** requiring an LLM budget and a curated corpus. This phase ships (a) the
measurement instrument (`--stats`, verified working below) and (b) the validation
_method_ so the follow-up can be run mechanically.

---

## SC1 — replay-reduction validation method (follow-up A/B)

> **SC1:** On a fixed dogfood corpus of N≥20 completed fleet-leaf tasks replayed
> with and without the substrate served, **median cache-read tokens per task drop by
> ≥25%**, while **task success does not regress** — success held constant by the
> existing post-execution `outcome_eval` pass rate over the same corpus.

### Corpus

- **N ≥ 20 completed fleet-leaf tasks**, drawn from real merged work (leaves whose
  edited region and blast-radius modules are known). Prefer leaves that _understand_
  several modules they do not _edit_ — that is where served comprehension displaces
  raw-source reads. Freeze the corpus (task id, base commit, prompt) so both arms
  replay identical inputs.

### Two arms, one variable

Replay each task twice against the same base commit, toggling **only** the
`comprehension` constituent:

| Arm           | `gather_context` comprehension constituent | Comprehension units present                                   |
| ------------- | ------------------------------------------ | ------------------------------------------------------------- |
| **baseline**  | disabled                                   | ignored                                                       |
| **substrate** | enabled (default)                          | `harness comprehend --all` first, so units are fresh + served |

Everything else — model, prompt template, tool set, temperature — is held constant.

### Metrics

1. **Primary (SC1):** median **cache-read tokens per task**. Requirement:
   `median(substrate) ≤ 0.75 × median(baseline)` (a ≥25% drop). The 25% target is a
   binary floor; the theoretical ceiling is far higher given the ~298:1 replay ratio
   this feature targets.
2. **Guardrail (SC1):** **`outcome_eval` pass rate** over the corpus.
   Requirement: `passRate(substrate) ≥ passRate(baseline)` — no success regression.

Report both as a table (baseline vs substrate, per-task and median) plus the two
pass rates. The measurement reads cache-read tokens from the replay's own token
accounting; it does **not** depend on harness-internal telemetry (SC6).

### Why this is a follow-up

The A/B run requires: a curated N≥20 corpus, a semantic (LLM) backfill of the
touched packages (`harness comprehend --all` with a provider — an LLM budget), and
two full replay passes. That cost is out of scope for the docs/measurement phase and
is tracked as a separate rollout. The instrument it depends on (`--stats`) and the
correctness spine (serve-time hash gate) are already shipped and verified.

---

## SC6 — illustrative `--stats` sample (captured)

`harness comprehend --stats` reports the served-unit token estimate versus the
raw-source token estimate for the modules with fresh units, **token-free** and
without any harness-internal telemetry. Below is a real sample captured on this
worktree (Node 22).

### Repo-wide, static-only units

Generated with `harness comprehend --all --static` (no LLM, no credential — the
static-only floor), then measured:

```
$ harness comprehend --stats
695 fresh unit(s): raw≈5211929 tok, served≈182771 tok, saved≈5029158 tok (96.5%).
```

### Representative single package (`packages/core/src`: comprehension + roadmap subtrees)

```
$ harness comprehend --stats
7 fresh unit(s): raw≈94747 tok, served≈2915 tok, saved≈91832 tok (96.5–96.9%).
```

### Reading the sample honestly

- These are **static-only** units (interface contract + dependency slice; no semantic
  prose), so they are the **floor** of the served form — the semantic half adds a
  small, token-capped summary/invariants block, so a full unit is somewhat larger but
  still far below raw source.
- `--stats` measures **per-serve document size** (served-unit tokens vs raw-source
  tokens), not end-to-end cache-read reduction across a task. It is the SC6
  adopter-facing instrument; SC1's cache-read A/B is the end-to-end proof and remains
  the follow-up above.
- Even at the static-only floor the served form is ~30× smaller than raw source,
  which is directionally consistent with SC1's ≥25% cache-read floor being easily
  clearable once the substrate is served across a leaf's blast radius.
- `harness comprehend --check` was run alongside and reported all units source-fresh
  (exit 0) — the hash gate agrees the sampled units are serveable.

---

## Status summary

| Item                                             | Status                                    |
| ------------------------------------------------ | ----------------------------------------- |
| `harness comprehend --stats` instrument (SC6)    | ✅ shipped, verified (samples above)      |
| Serve-time hash gate / `--check` (SC2, SC4)      | ✅ shipped                                |
| `.harness/comprehension/` committed + trackable  | ✅ un-ignore added; 1 demo unit committed |
| Full semantic backfill of this repo              | ⏭️ follow-up (needs LLM budget)           |
| SC1 A/B replay validation (≥25% cache-read drop) | ⏭️ follow-up (needs corpus + LLM budget)  |
