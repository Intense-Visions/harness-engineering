---
number: 0115
title: Enforce "shipped artifacts must not cite internal issue numbers" via a lightweight lint
date: 2026-08-30
status: accepted
tier: small
source: 'parked decision issue #1269'
---

## Context

Issue #1253 fixed a real defect: `MonolithStore.write` ended a user-facing error with
`See issue #839.`, a string that ships inside the published `@harness-engineering/core`
package. An adopter who trips the guard was directed to an issue number in _this_
repository — which they cannot read, and which is closed anyway. That one-line fix has
already landed: `packages/core/src/roadmap/store/monolith-store.ts` (the refusal at
~L189-196) now ends with "…or remove the unmodeled content, then retry." — the
`See issue #839.` reference is gone.

That leaves the second, genuinely open ask #1253 raised and #1269 parked: is the
_general_ rule — "shipped artifacts (error strings compiled into published packages,
CLI output, MCP tool descriptions, skill bodies) must not cite this repo's issue or PR
numbers, because they execute in adopter projects where those numbers are meaningless"
— worth standing enforcement, and if so in what form?

The sweep that would justify the rule came back nearly empty. Grepping `packages/*/src`
for `issue #` / `PR #` in non-comment, user-facing string literals yields **three**
sites, and after ask 1 landed only one is a live judgment call:

- `packages/core/src/roadmap/store/monolith-store.ts` — the original defect, **already
  fixed** under ask 1. No longer a violation.
- A test assertion — **not shipped**; runs only in CI, never reaches an adopter.
- `packages/cli/src/copy-craft/catalog/rubrics/why-not-what.ts:9` — ships `see issue
#482` inside the `COPY-R008` rubric `description`, as the _illustrative example_ of a
  comment that "carries WHY." Here the issue number is arguably the point of the example,
  not an accidental leak.

So the standing population is one deliberate, defensible example — not a live defect.
Against that near-empty count sits the real asymmetry: the class is cheap to
reintroduce silently, and its blast radius is user-facing output in a _published_
package. This repo also already maintains adjacent string-hygiene gates: brand
forbidden-phrases (`packages/cli/src/brand/rules/forbidden-phrases-rule.ts`,
surfaced through `audit-brand`) and the shipped semantic-vocabulary CI gate from #605,
plus a `harness ci check` command (`packages/cli/src/commands/ci/check.ts`) that already
runs baseline-relative security/docs checks. Enforcement machinery of exactly this shape
exists; the question is whether this rule earns a slot in it.

## Decision

Enforce the rule with a **lightweight lint** — a targeted check that flags internal
`issue #<n>` / `PR #<n>` references reaching **user-facing / shipped strings**, wired
into the existing `harness ci check` surface (or generated via `generate_linter`)
alongside the security/docs checks it already runs. Concretely:

- **Scope to shipped surfaces only.** Match string literals in shipped code paths —
  error messages, CLI output, MCP tool descriptions, skill bodies — not code comments
  (comments are maintainer-facing and legitimately cite issues; see the six comment
  references the sweep found, e.g. `provider.ts`, `update.ts`, all valid) and not test
  files.
- **Encode the illustrative-example allowance on day one.** The rubric-catalog case
  (`why-not-what.ts`) is the proof that a naive rule would false-positive immediately.
  Allow an explicit exception for illustrative/example contexts — catalog rubric
  bodies, fixtures, and docs samples — via a path/context allowlist, so the one
  standing "violation" is recorded as intentional rather than suppressed ad hoc.
- **Non-blocking to start, baseline-relative.** Mirror the existing check semantics:
  only _new_ occurrences fail; the current sweep is clean once the example is allowlisted,
  so the baseline starts empty and the gate simply holds the line.

A lint is chosen over the cheaper options because the current cost is trivial — the
codebase is already clean (~zero live violations after ask 1), so the lint is pure
regression insurance with no cleanup debt. A tracking issue alone documents the norm but
rots and enforces nothing; "do nothing" lets an easy-to-reintroduce, user-facing defect
recur silently in a published package. The one-time cost is real (the exception list is
the hard part), but encoding it once is cheaper than re-litigating each reintroduction.

**Assumptions made:** Following the `adr-fleet` recommended-default, this draft assumes
the human wants standing enforcement rather than a bare tracking issue or nothing, and
that a purpose-built lint is preferred over folding the check into #605's
semantic-vocabulary gate (kept below as a live alternative — #605 targets deprecated
_terms_, a different match shape from _issue-number references_, so co-locating them may
strain one rule's config). If the human prefers the lower-ceremony "tracking issue only"
or the consolidation into #605, this ADR should be revised, not accepted as-is.

## Consequences

- **Positive:** an easy-to-reintroduce, user-facing defect in published packages is
  caught mechanically at ~zero standing cost; the norm is enforced, not just documented;
  the check lives beside sibling string-hygiene gates operators already understand.
- **Negative / tradeoffs:** upfront cost to author the lint and, harder, to define and
  maintain the illustrative-example allowlist; a heuristic string-literal matcher will
  need tuning to avoid flagging maintainer-facing comments or example bodies; the rule
  guards a class whose live population is currently zero, so its value is entirely
  preventive and unprovable until a second violation is caught.
- **Reversibility:** high — the lint is additive config/code. If it proves noisy or the
  class never recurs, it can be downgraded to advisory or removed, leaving only the
  (clean) codebase behind.

## Alternatives Considered

- **(a) Do nothing — the sweep is empty, revisit if a second violation appears.**
  Rejected. It is the cheapest option and defensible given the population of one, but it
  leaves a user-facing, silently-reintroducible defect class in _published_ packages with
  no guard; the next leak ships to adopters before anyone notices.
- **(b) File a tracking issue for the rule, no enforcement.** Rejected as the primary
  choice. It documents the norm at zero cost but enforces nothing and rots — a parked
  norm with no gate is indistinguishable from (a) six months on. Acceptable only as a
  fallback if the human judges a lint over-engineered for a population of one.
- **(c) Add a lightweight, scoped lint with an example-context allowance.** **Chosen** —
  see Decision.
- **(d) Fold the rule into #605's semantic-vocabulary CI gate rather than standing it up
  separately.** Live alternative, not chosen. #605 already ships and provides real gate
  machinery, so reusing it avoids a second standalone check. But its match shape targets
  deprecated/renamed _terms_ in skills/docs, whereas this rule targets numeric
  issue/PR _references_ in code string literals across a broader surface; co-locating two
  differently-shaped matchers in one gate risks muddying both configs. Preferred only if
  the team wants to minimize the number of distinct gates.

## References

- Issue #1269 — the parked decision: does the general rule earn a tracking issue, a
  lint, or nothing? Sweep found three references; one live judgment call after ask 1.
- Issue #1253 — the originating defect (`See issue #839.` in shipped `core` error) plus
  the general-rule ask; issue #839 is closed. Ask 1 fixed; ask 2 parked as #1269.
- Issue #605 — the shipped Semantic-Vocabulary CI gate, the adjacent enforcement this
  rule could fold into (alternative d).
- `packages/core/src/roadmap/store/monolith-store.ts` (~L189-196) — the refusal error,
  now free of the internal issue reference (ask 1 landed).
- `packages/cli/src/copy-craft/catalog/rubrics/why-not-what.ts:9` — the `COPY-R008`
  rubric shipping `see issue #482` as a deliberate illustrative example; the case the
  lint's exception list must accommodate on day one.
- `packages/cli/src/brand/rules/forbidden-phrases-rule.ts` and
  `packages/cli/src/commands/ci/check.ts` — existing string-hygiene / baseline-relative
  check machinery the lint would extend rather than reinvent.
