---
title: Senior-Engineer Accountability Surface for PR Push
status: draft
milestone: v5.0 — Article-Framing Docs & Personas
priority: P0
external-id: github:Intense-Visions/harness-engineering#569
keywords: pre-merge-brief, senior-accountability, review-ci, curated-signals, outcome-eval, sticky-comment, dogfood
---

# Senior-Engineer Accountability Surface for PR Push

## Overview

The person accountable for a change is the human who clicks **merge**, not the
agent that wrote it. "The Tests We Skipped" companion article states it plainly:
_"the person who writes the code is the person who pushes it to production. Full
stop."_ In the agent-shipping flow the agent writes and the senior engineer
pushes — accountability does not transfer to the agent, it stays with the human
who clicks merge.

The harness today runs many gears _at_ the agent, but produces no
**senior-facing** surface that answers, at merge time, _"you are pushing this —
here's what deserves your eyes."_ The multi-persona review already runs on every
PR (`.github/workflows/required-review.yml`) and can even post its verdict
(`review-ci --comment`, `packages/cli/src/commands/review-ci.ts:246`), but that
comment is only the _review verdict_ — not a consolidated accountability brief.

This feature adds `harness:pre-merge-brief`: a composer that consolidates the
diff summary, the multi-persona review verdict, the outcome-eval result (when
available), a signal-status snapshot, and an explicit "worth your eyes" section
into one sticky PR comment — the harness pointed _at the human_ for once. It
closes the "harness for the human too" mandate: the same gear that protects the
agent also protects the senior who is accountable.

## Goals

**In scope:**

1. A `harness pre-merge-brief` CLI command that composes a brief from artifacts
   that already exist — the `review-ci --json` verdict, graph `execution_outcome`
   nodes, a fresh curated-signal snapshot, and `git diff --stat` — and posts a
   single **sticky** PR comment via `gh` (upsert by marker).
2. A `harness:pre-merge-brief` skill wrapping the command (`on_pr` + `manual`).
3. Extraction of `gatherSignals` + the signal registry into a new shared package
   so the command computes signals without the CLI depending on the dashboard app.
4. Dogfood: a `continue-on-error` step in `required-review.yml` that runs the
   brief after the existing `review-ci` run, reusing its JSON artifact; add
   `pull-requests: write` to that job.
5. Every section degrades independently to an explicit "unavailable" line so a
   partially-configured adopter still gets a useful brief.

**Non-goals (YAGNI):**

- The acknowledgment / merge gate (deliverable (c) in the roadmap summary). The
  roadmap itself calls it "optional"; it needs an ack-observing webhook plus a
  branch-protection change and is its own spec. Tracked as a follow-up row.
- The adopter `.hbs` template + `.ruleset.json` graduation. Shipped dogfood-first
  (the same rollout `required-review` used); tracked as a follow-up row.
- Full extraction of every signal provider into core — the extraction moves the
  self-contained `signals/` subtree only.
- Re-running or modifying the review itself. The brief **consumes** `review-ci`
  output; it never re-runs the review or duplicates review logic.

## Decisions made

- **D1 — Composer, not extension.** `pre-merge-brief` is a new orchestrator that
  _composes_ `review-ci` output + signals + outcome-eval, rather than bloating
  `review-ci`'s comment body. Keeps the review gate single-purpose and lets each
  input degrade independently. (Rejected: extend `buildReviewBody`; regenerate
  everything standalone — the latter creates two sources of review truth that
  drift.)
- **D2 — Signal status snapshot, not per-PR delta.** The five curated signals are
  30-day _trend_ metrics (`docs/standard/signals.md`); a per-PR delta is
  meaningless for three of the five and expensive in CI. The brief renders each
  signal's current value + warn/alert state, labeled **"Signal status"** to stay
  honest. It answers the senior's real question: _"is the codebase already red as
  I merge this?"_
- **D3 — Defer the acknowledgment gate.** Ship the brief non-blocking first,
  matching `required-review.yml`'s own "wire non-blocking first, promote to
  required only after it bakes" precedent. The gate becomes trivial later because
  the brief it acks already exists.
- **D4 — Reuse `required-review.yml` + sticky-upsert comment.** The expensive part
  (the LLM multi-persona review) already runs there; a separate workflow would
  double LLM cost and latency. The brief reuses that run's JSON artifact. Delivery
  is a single sticky comment upserted by marker, not a new comment per push.
- **D5 — Dogfood-only v1.** The brief's Markdown format will shift once seniors
  read a few; locking adopters into an early format is churn. Ship the dogfood
  workflow now; graduate to the adopter template + ruleset as a tracked follow-up.
- **D6 — Extract the `signals/` subtree to a shared package (surgical).** D2's
  snapshot only has teeth if signals are _fresh in CI_, which rules out reading
  the stale/absent persisted `.harness/signals/timeline.json`. The CLI must not
  depend on the dashboard app (dashboard is a leaf, not a library). The `signals/`
  subtree is fully self-contained (verified: zero imports reaching up out of it;
  only external deps are `@harness-engineering/graph`, node built-ins, and zod),
  so relocating it is a mechanical move, not a refactor.

## Technical design

### New package `@harness-engineering/signals` (D6)

Relocate the self-contained `packages/dashboard/src/server/signals/` subtree —
`providers/*`, `registry.ts`, `shared.ts`, `command-runner.ts`,
`timeline-store.ts`, `types.ts` — into a new leaf package. The dashboard
re-imports `gatherSignals` / `signalRegistry` from it; observable behavior is
unchanged and guarded by the existing dashboard signal tests.

- Public entry: `gatherSignals(ctx): Promise<SignalResult[]>` and `signalRegistry`.
- Dependencies: `@harness-engineering/graph` only (plus node built-ins, zod).
- No `@harness-engineering/dashboard` import is introduced into the CLI.

### New command `packages/cli/src/commands/pre-merge-brief.ts`

Registered in `packages/cli/src/commands/_registry.ts`. Mirrors `review-ci`'s
pure-render + injected-seam structure so the core is unit-testable and contains
no `process.exit`.

**Inputs (each optional; each missing input degrades to an "unavailable" section):**

1. **Review verdict** — `--from <path>` reads the `CiReviewResult` JSON that
   `review-ci --json <path>` already emits. The type is reused verbatim; the
   review is never re-run.
2. **Signals** — `gatherSignals()` from the new package; render the five cards'
   current value + threshold state (D2).
3. **Outcome-eval** — query graph `execution_outcome` nodes for the head commit;
   absent pre-merge → "not yet evaluated."
4. **Diff summary** — `git diff --stat <base>...HEAD`.

**`buildBriefBody(inputs): string`** — pure, unit-testable (like
`buildReviewBody`). Sections: header (with hidden marker
`<!-- harness:pre-merge-brief -->`), diff summary, review verdict, **Signal
status**, outcome-eval, and a derived **"👀 Worth your eyes"** section =
(blocking findings) ∪ (signals in warn/alert) ∪ (unmet outcome criteria).

**`postBrief` seam** — sticky upsert (D4): list PR comments via `gh api`, find the
one containing the marker; `PATCH` it if present, else `gh pr comment
--body-file -`. Injected as a seam (like `PostReview`) so delivery is tested with
a fake poster.

### Skill

`agents/skills/claude-code/pre-merge-brief/SKILL.md` + `skill.yaml` (tier 2,
triggers `on_pr` + `manual`, platforms: all four clients) wrapping the command.

### Dogfood workflow

In `.github/workflows/required-review.yml`, after the existing `review-ci` step:
add `--json /tmp/review.json` to that run, then a `continue-on-error` step
running `harness pre-merge-brief --from /tmp/review.json --comment`. Add
`permissions: pull-requests: write` (the workflow's own comment already
anticipates this). A brief failure must never flip the review gate's status.

## Integration points

- **Entry Points:** new CLI command `harness pre-merge-brief`; new skill
  `harness:pre-merge-brief`; new package `@harness-engineering/signals`; new step
  in `required-review.yml`.
- **Registrations Required:** command in `_registry.ts`; skill in the skill index
  - tier assignment + slash-command regeneration; new package added to
    `pnpm-workspace.yaml`, tsconfig project references, and the dashboard's
    `package.json` dependency list; barrel export for the signals package.
- **Documentation Updates:** AGENTS.md (new command + skill); `docs/standard/signals.md`
  (signals now live in a shared package); regenerated skills catalog.
- **Architectural Decisions:** **D1** (composer-not-extension — sets the precedent
  for how future senior-facing "surface" features compose existing gears rather
  than extending them) and **D6** (signals extraction + the CLI-must-not-depend-on-dashboard
  dependency rule) each warrant a standalone ADR.
- **Knowledge Impact:** concept "senior accountability surface"; the composition
  relationship `pre-merge-brief → (review-ci, signals, outcome-eval)`; the
  dependency rule that the CLI never imports the dashboard app.

## Success criteria

1. `harness pre-merge-brief --from <fixture.json>` renders a Markdown brief with
   all six sections; `buildBriefBody` is covered by pure unit tests.
2. Each input missing → its section renders an explicit "unavailable / not
   configured" line and the command still succeeds (degradation tests per input).
3. `--comment` upserts: a second run on the same PR updates the marked comment
   rather than posting a new one (verified with a fake `postBrief` seam).
4. "👀 Worth your eyes" contains exactly the union of blocking findings,
   warn/alert signals, and unmet outcome criteria (derivation test).
5. `@harness-engineering/signals` is extracted; the dashboard signal panel's
   behavior is unchanged (existing dashboard signal tests stay green); no
   CLI→dashboard import exists (architecture check passes).
6. `required-review.yml` posts a brief on this repo's PRs, non-blocking
   (`continue-on-error`); the review gate's pass/fail status is unaffected when
   the brief step fails.
7. Follow-up roadmap rows exist for the acknowledgment gate (D3) and the adopter
   template + ruleset graduation (D5).

## Implementation order

1. **Extract `@harness-engineering/signals`** — relocate the subtree, rewire the
   dashboard's imports, keep dashboard tests green. Independently mergeable.
2. **`pre-merge-brief` command** — pure `buildBriefBody` + the input readers +
   the `postBrief` upsert seam + tests.
3. **Skill + registration** — SKILL.md, skill.yaml, index/tier, slash-command
   regeneration.
4. **Dogfood wiring** — the `required-review.yml` step + `pull-requests: write`;
   verify on a live PR.
5. **Docs + ADRs + follow-up roadmap rows** (D3, D5).
