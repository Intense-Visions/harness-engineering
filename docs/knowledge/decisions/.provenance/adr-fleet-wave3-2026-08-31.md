# adr-fleet run provenance — fleet-command Wave 3 (DECIDE), 2026-08-31

Conductor lane: `adr-fleet`, concurrency 1, worktree-isolated off `origin/main`
@ `767f073b7`. Ran the real five-phase SELECT → CONFIRM → DISPATCH → VERIFY → REPORT.

## Queue (6 routed by issue-fleet intake) + #1441

| Issue | SELECT verdict                                                                                                                             | Action                                                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| #1320 | novel architectural decision                                                                                                               | **DRAFT ADR 0117** (proposed)                          |
| #1316 | novel architectural decision                                                                                                               | **DRAFT ADR 0118** (proposed)                          |
| #1313 | genuine but coupled to proposed ADR 0093                                                                                                   | **FOLD into 0093** (fidelity:sampled) + accept 0093    |
| #1322 | already-decided (ADR 0112, accepted, source cites #1322)                                                                                   | **CLOSE** with citation                                |
| #1268 | already-decided (ADR 0114, accepted, source cites #1268)                                                                                   | **CLOSE** with citation                                |
| #1269 | already-decided (ADR 0115, accepted, source cites #1269)                                                                                   | **CLOSE** with citation                                |
| #1441 | NOT architectural — mechanical data cleanup under existing policy (ADR 0022 + #1323 validator + `.harness/decisions/number-baseline.json`) | **RE-ROUTE to build (roadmap-fleet)** — no ADR drafted |

## CONFIRM (Phase 2) — human-approved

Human approved the batch; fork **F1** answered = FOLD #1313 into ADR 0093 (add the
fidelity/sampled third member class), then set 0093 `status: accepted`. Concurrency 1
(fixed by conductor global-pool allocation).

## Number pre-allocation & collision guard

`origin/main` max ADR = 0116 (fetched fresh; verified no local lag). Next free = 0117,
0118 — assigned to #1320, #1316. No collision on origin/main (guard against the PR #1737
0110-collision trap). ADRs authored **directly** in canonical format (frontmatter +
Context/Decision/Consequences) — NOT via `manage_adr action:create`, which silently drops
the `decision` field this session.

## Artifacts carried by this branch

- `docs/knowledge/decisions/0117-ci-trust-fork-scoped-to-verify-dependency-set.md` — `status: proposed`
- `docs/knowledge/decisions/0118-pr-fleet-depth-tiebreak-never-shed-lander.md` — `status: proposed`
- `docs/knowledge/decisions/0093-fleet-scheduling-depth-lossy-key.md` — amended (`proposed` → `accepted`, folds #1313)

## Never-auto-accept posture

- 0117 and 0118 are **proposed** — they await the human's terminal sign-off pass; the fleet
  did NOT flip them to accepted.
- 0093 is flipped to **accepted** ONLY because the human's F1 answer at CONFIRM explicitly
  authorized it (fold + accept). The fleet is the executor of that authorization, not its
  originator.

## Assumptions made (recommended-option defaults)

- 0117: ambiguous-check fallback = keep firing the trust fork but **label** it (#1320 middle
  option); VERIFY dependency set = per-OS build/test + enforce/harness gates.
- 0118: `mergeStateStatus`/`reviewDecision` SELECT read scoped OUT of the ADR as a build
  follow-up (SELECT enhancement, not a scheduling-rule decision).
- 0093 fold: adopted #1313's "sampled probe" option; rejected its participation / opt-in-only
  alternatives (documented in Alternatives Considered).
