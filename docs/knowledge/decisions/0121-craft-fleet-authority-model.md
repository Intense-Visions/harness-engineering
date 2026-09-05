---
number: 0121
title: The craft-fleet ceiling-queue authority model
date: 2026-09-05
status: proposed
tier: large
source: docs/changes/craft-fleet/proposal.md
---

## Context

**This ADR is a retrospective backfill.** `craft-fleet` is already shipped
(`agents/skills/claude-code/craft-fleet/SKILL.md`). Nothing here proposes new behavior; it records
a decision already taken and in force, so that the authority model is citable and supersedable
rather than reachable only by reading skill prose.

The `-fleet` family keeps one ADR per member authority model — the land-stage merge gate
(ADR 0089), the decide-stage sign-off gate (ADR 0090), the conductor-tier model (ADR 0091).
`craft-fleet` shipped without one. Its own proposal said so deliberately: "**Architectural
Decisions** — None new," on the reasoning that the cited-and-net-better bar and the
elevation-eligibility table "constrain this member's verification only, not the family contract or
the craft catalogs — so they warrant no standalone ADR" (evidence:
`docs/changes/craft-fleet/proposal.md:135`). That reasoning is sound about _scope_ and wrong about
_record_: a member-local discipline is still the thing a future maintainer must not casually
loosen, and the three siblings set the expectation that each member's authority model is written
down where it can be argued with. This record closes that gap.

What makes `craft-fleet` need its own model rather than inheriting a sibling's. Every other
quality-queue member acts on findings a machine can prove — `cleanup-fleet` on rule-based entropy,
`bug-fleet` behind a reproduction bar, `test-fleet` on coverage. `craft-fleet`'s queue is the
output of eleven `-craft` skills, which are **advisory by design**: they emit judgment carrying a
visible confidence axis precisely because their findings are not binary (evidence:
`agents/skills/claude-code/craft-fleet/SKILL.md:49`). A fleet built on advisory judgment faces two
risks no sibling faces in the same form:

1. **The agent applies its own taste.** There is no detector to stay red and no reproduction to
   fail, so nothing mechanical distinguishes "the craft skill asked for this" from "the
   orchestrator thought this read better." Confident prose explaining why a rewrite is better reads
   exactly like confident prose explaining why a rewrite that is worse is better (evidence:
   `SKILL.md:49`).
2. **An accepted elevation makes things worse.** Quality changes have no failing assertion to
   catch a regression in taste; a rewrite that trades one flaw for another looks like progress in
   the diff.

A third constraint sharpens both: the only available oracle for "is this now better?" is another
LLM call, and it is non-deterministic — two runs over identical code can disagree, so a single run
can both falsely reject a good elevation and falsely accept a bad one (evidence: `SKILL.md:199`).

The question this ADR answers is therefore: **on what authority does an autonomous sweep of
subjective judgment rewrite a line of shipped code, and where does that authority stop?**

### Assumptions made

- This is a **retrospective backfill of shipped behavior**, written after the fact. Where the
  shipped `SKILL.md` and the source proposal could diverge, the shipped skill is authoritative and
  is what is recorded. They were compared decision by decision for this record and were found to
  agree on every load-bearing claim; the shipped skill additionally carries the canonical
  `FleetHandoffRecord` worker envelope (`SKILL.md:187`), which post-dates the proposal and belongs
  to the family contract rather than to this member's authority model.
- `status: proposed`. This record was drafted autonomously and is not accepted; acceptance is a
  human act, per ADR 0090.
- Recording a shipped decision does not re-open it. Anything below that a maintainer wants to
  change is a supersession, not an edit.

## Decision

`craft-fleet` adopts a **cited-and-net-better ceiling-queue authority model**: the fleet holds no
authority of its own, only authority delegated by a craft catalog's finding and validated by a
re-critique. It is the ceiling-queue complement to the land-stage merge gate (ADR 0089) and the
decide-stage sign-off gate (ADR 0090), and it consumes the craft output vocabulary of ADR 0019
without extending it.

1. **The Iron Law is CITED-AND-NET-BETTER.** "No line is rewritten without a cited craft finding
   (a `runId` + `rubricId` + location from an actual craft-skill run), and nothing is emitted that
   a re-critique does not show as net better" (evidence: `SKILL.md:47`). A changed location that
   maps to no finding is **the orchestrator's own taste and is rejected, however good it looks**
   (evidence: `SKILL.md:193`). The cite is the ceiling analogue of `bug-fleet`'s reproduction: the
   one piece of evidence that cannot be produced by asserting it. Because craft skills report a
   `runId` once per run and a `rubricId` per finding, a cite is **composed** — the run's `runId`
   paired with that finding's `rubricId` and location — rather than read off the finding alone
   (evidence: `SKILL.md:72`). The corollary is part of the law: **a quiet target is a valid,
   valuable result** (evidence: `SKILL.md:53`), which makes the pressure to manufacture an
   elevation so a sweep does not look wasted explicit and rejectable.

2. **The elevate / file / route boundary is mechanical, per finding, never per feeling.** Every
   survivor is routed "on the finding's own axes plus a surface rule, never on how bad the finding
   feels" (evidence: `SKILL.md:82`). `elevate` requires **all** of: `confidence: high`; confined to
   one target and behavior-preserving; no public-API, observable-contract, or exported-identifier
   change; no cross-module reach; and a surface on the elevation-eligible list for its domain
   (`SKILL.md:83`). `file` is everything else above the floor — any structural change, any
   contract-touching change, any `medium`- or `low`-confidence finding, and every finding in a
   file-only domain (`SKILL.md:84`).

   **Routing reads a finding; the targets are then re-formed by verdict.** A `(scope, domain)` pair
   whose findings split across verdicts never becomes a mixed target: it yields at most one
   `elevate` target and at most one `file` item for that same scope and domain, each carrying only
   its own findings, with routed findings leaving the pair entirely (evidence: `SKILL.md:87`). That
   re-forming is what makes every downstream unit unambiguous — DISPATCH runs over one `elevate`
   target's findings plural, VERIFY assigns exactly one verdict per emitted item, and the caps
   count **emitted items, never findings**.

3. **Elevation eligibility requires a surface the test suite guards — four of eleven domains
   qualify.** The whole safety envelope of the elevation pipeline is the test suite plus
   `harness check-deps`; those are what make "behavior-preserving" a checkable claim rather than an
   assertion. That yields **one rule, not eleven judgment calls**: a surface is elevation-eligible
   only if it lives inside source the test suite exercises (evidence: `SKILL.md:161`). Only
   `naming-craft`, `code-craft`, `copy-craft`, and `test-craft` clear the bar; the other seven are
   **file-only and never produce an elevation** (evidence: `SKILL.md:238`, table at
   `SKILL.md:163-173`). Each exclusion has a stated reason rather than caution in general:
   - **Prose domains** (`docs-craft`, `knowledge-craft`, `spec-craft`) are cut deliberately — no
     skill in the toolset applies prose-quality edits under a safety envelope, so elevating prose
     means free-hand rewriting text with no mechanical check that it did not make things worse.
     A ratified ADR is additionally out of bounds on its own terms: it is a historical record, not
     a document to be improved, and editing one rewrites the past.
   - **`api-craft` and `cli-ergonomics-craft`** critique published contracts by definition, so
     renaming a flag or an endpoint is a breaking change wearing a quality argument.
   - **`security-craft` is never auto-applied**, because a wrong "improvement" to security posture
     is worse than the mediocrity it replaced, and posture is exactly the kind of judgment whose
     failure mode is silent.
   - **`harness-design-craft` has no reachable write path** — its polish phase never modifies
     source, and the rule-based drift-remediation path consumes findings carrying no craft `runId`
     or `rubricId`, so wiring it in would require inventing the finding translation the Iron Law
     exists to forbid (evidence: `SKILL.md:181`).

   Two narrowings within the eligible four carry general force. **Routing follows the surface, not
   the skill that surfaced the finding**: an error message is the same bytes whether `copy-craft`
   or `cli-ergonomics-craft` found it, so it is filed either way, leaving only genuinely internal
   prose — code comments and internal log lines — eligible (evidence: `SKILL.md:183`). And
   **`test-craft`'s narrowing breaks a circularity**: the pipeline proves behavior preservation
   _with_ the suite, so test elevation requires every assertion expression **byte-identical**, the
   passing-test count unchanged, and the passing test-ID set differing only by the renames the
   elevation itself applied. Sharpening an assertion changes what is asserted — a real improvement,
   and a `file` (evidence: `SKILL.md:185`).

4. **A noise floor bounds the tail; a hard cap is the guard that actually holds.** The floor drops,
   counts, and never files or elevates any finding whose `impact` is `small` **and** which is
   additionally either `tier: aspirational` **or** `confidence: low` — `small` ∧ (`aspirational` ∨
   `low`), grouped explicitly so it cannot be misread as (`small` ∧ `aspirational`) ∨ `low`
   (evidence: `SKILL.md:78`). Caps are hard and default to **20 filed items and 20 elevation PRs**
   per batch, enforced after ranking, keeping the highest tier × impact and shedding the rest **as
   over-cap, reported with its count** (evidence: `SKILL.md:89`).

   The model is explicit that **the cap, not the floor, is the real guard**: filing opens a
   tracking issue per item, so an uncapped sweep is a tracker flood no five-cell floor rule can
   prevent, because the surviving `medium`-confidence middle of the distribution is large and
   legitimately routes to `file`. "Claiming it prevents backlog spam would be overselling a
   five-cell rule against a twenty-seven-cell distribution" (evidence: `SKILL.md:91`). Both the
   floor and the caps are re-tunable exactly once, at CONFIRM.

5. **`route` is park-and-hand-back, not a new mechanism — and security is withheld, never filed.**
   A finding that is really a correctness defect or a genuine security vulnerability is neither
   elevated nor filed by this fleet; it is parked and surfaced for the human to place (evidence:
   `SKILL.md:85`). A correctness candidate is handed back as a seed candidate for the correctness
   queue, because proving a defect requires a reproduction this member has no machinery for. A
   genuine vulnerability goes **privately to the human and is never opened as a public item**:
   filing a security finding publicly _is_ disclosure, and this fleet has no disclosure machinery,
   no severity rating, and no embargo (evidence: `SKILL.md:222`). Ordinary `security-craft` posture
   findings that are not vulnerabilities take the `file` path like any other file-only domain.

6. **Verification is three independent proofs plus all-OS CI, never a self-report — and the oracle
   is treated as non-deterministic.** Per elevation: **critique provenance** (every changed
   location maps to a real cited finding), **elevation provenance** (the step-granular
   `harness-refactoring` commit trail), and **net-improvement** (the cited findings resolved with
   no new finding at equal-or-higher tier, `foundational` > `polish` > `aspirational`). Because a
   re-critique is an LLM call, net-improvement runs under a **two-run protocol biased conservative
   on both sides** (evidence: `SKILL.md:199`): a cited finding counts as resolved only if absent
   from **both** runs; a new equal-or-higher-tier finding blocks if it appears in **either**; two
   runs that disagree leave the elevation unproven and the item **downgrades to `file`** rather
   than being discarded — the critique remains valid, only the autonomous rewrite is withheld. A
   re-critique that could not run at all is **rejected for want of proof and retried once**, which
   is deliberately a different outcome from disagreement: it produced no reading to re-examine.

   **VERIFY owns both runs; the DISPATCH subagent runs none** (evidence: `SKILL.md:252`). A
   subagent that re-critiques its own branch and reports the outcome is a self-report, which the
   family invariant never accepts. Concentrating both runs in VERIFY keeps the total at two _and_
   makes them independent, satisfying the cost rationale and the invariant with one choice.

   **The `file` tier is verified to its own, narrower standard.** A filing has no branch, commit
   trail, re-critique, or CI, so `verified-filing` requires exactly two things — critique
   provenance, and the cross-check that the target is still not already addressed by an open
   elevation PR or existing item. An item failing either is **rejected rather than filed**
   (evidence: `SKILL.md:212`). Scoping the checks this way is what keeps the verdict meaningful
   rather than vacuous.

7. **Ranking composes ADR 0019's axes and must not re-collapse them.** Ordering is tier × impact
   using `harness-roadmap-pilot`-style impact scoring; `confidence` is the **routing** axis and is
   deliberately **not** folded into the score (evidence: `SKILL.md:93`). ADR 0019 exists because
   collapsing these axes destroys the information a reviewer needs to prioritize, so a fleet that
   invented a second severity vocabulary would be re-collapsing them and would drift from the
   catalogs it consumes.

The terminal act follows from the model rather than extending it: verified elevations become PRs
batched **one per (target, craft domain)** — never one per finding, never mixed across domains, so
the reviewer faces one kind of taste question at a time — and verified filings become roadmap items
carrying their cite, rubric, and location. The fleet never merges.

## Consequences

- **Positive:** the fleet holds no authority of its own — every rewrite traces to a craft catalog's
  finding and to a re-critique that saw it resolved, so an autonomous sweep of subjective judgment
  cannot become a churn engine driven by an agent's taste; the elevate/file boundary is checkable
  by reading a finding's axes and its surface rather than by re-litigating a judgment call, which
  makes it auditable and makes disagreements about it concrete; deliberately erring small (four
  eligible domains, internal-facing prose only, byte-identical assertions) means the autonomous
  half of the output is the half that is cheapest to be wrong about, while the valuable-but-unsafe
  half is preserved as filed work rather than lost; the two-run protocol makes an inconclusive
  oracle cost the batch a filed item instead of a bad merge; and the human's attention is spent
  once at CONFIRM on a taste-calibration sample and once on a homogeneous review batch.
- **Negative / tradeoffs:** the elevation surface is small by construction — seven of eleven craft
  domains can never produce a PR, so most of what the sweep finds arrives as filed work the human
  must still schedule, and `craft-fleet` will look low-yield next to siblings whose findings are
  machine-provable; the cite requirement forbids composing rule-based remediation paths (the design
  drift codemods being the concrete case) that would otherwise be safe, because their findings
  carry no craft `runId`; two re-critique runs per elevation plus an eleven-skill SELECT sweep is a
  real per-batch LLM cost, and two runs rather than three is an accepted cost call rather than the
  most conservative protocol available; the hard caps mean a genuinely large ceiling debt is
  surfaced only 20 items at a time, deliberately, with the remainder reported as over-cap; and
  routed security findings leave the fleet's accounting entirely, so they are only as durable as
  the human's handling of a private hand-back.
- **Neutral:** the model constrains this member's verification only. It does not extend the family
  contract, does not alter the craft catalogs, and adds no vocabulary to ADR 0019 — which is why
  the source proposal judged no ADR necessary, and why this backfill changes no behavior.
- **Reversibility:** high for the tuning, low for the law. The noise floor, the caps, the
  concurrency governor, and the domain selection are per-batch settings a human re-tunes at
  CONFIRM. The eligibility table is skill prose: adding a domain is a prose change, though it
  should not be made without a safety envelope that makes "behavior-preserving" checkable for that
  surface. The Iron Law and the never-self-report and never-publish-a-vulnerability invariants are
  the load-bearing parts; relaxing any of them would supersede this ADR rather than amend it.

## Alternatives Considered

- **Let the fleet act on its own taste — apply what the orchestrator judges to be an improvement,
  using the craft skills as inspiration rather than as authority.** Rejected — this is the failure
  mode the member exists to avoid. Craft skills are advisory by design, so a fleet that converts
  advice into authority has invented an authority nobody granted it. Without a cite there is no
  mechanical difference between a good rewrite and a confident bad one, and the attractive failure
  is precisely the improvement nobody asked for. The cite requirement is what makes "the craft
  skill asked for this" a checkable claim rather than an assertion.
- **Route per target rather than per finding.** Rejected — a `(scope, domain)` pair's findings
  routinely split across verdicts, so a per-target rule forces a single verdict onto a mixed bag:
  either a structural finding rides along inside an elevation, or a safe bounded finding is
  demoted because it shared a target with one that was not. Routing per finding and then
  re-forming targets by verdict yields at most one `elevate` target and at most one `file` item per
  scope-and-domain, each carrying only its own findings, which is what makes the downstream unit
  unambiguous and lets the caps count emitted items honestly.
- **Route on severity — how bad the finding is — rather than on axes plus a surface rule.**
  Rejected — "this one is serious enough to fix automatically" is the taste judgment the Iron Law
  removes, re-entering through the routing door. It also re-collapses ADR 0019's axes into the
  single severity scale that ADR exists to replace.
- **A noise floor alone, with no hard cap.** Rejected — filing goes through `manage_roadmap`, which
  opens a tracking issue per item, so an uncapped sweep is a tracker flood. The floor is a
  five-cell rule against a twenty-seven-cell distribution and cannot reach the large
  `medium`-confidence middle that legitimately routes to `file`. Keeping the floor _and_ naming the
  cap as the real guard is deliberate: claiming the floor prevents backlog spam would be overselling
  it, and a member that quietly over-claims its own safety mechanism is the harder failure to catch.
- **A hard cap alone, with no noise floor.** Rejected as wasteful rather than unsafe — the floor
  removes the obvious tail cheaply before ranking, so the cap spends its twenty slots on findings
  worth ranking instead of on `small` ∧ `aspirational` observations.
- **Route security findings by filing them into the tracker (route-and-file) rather than parking
  them.** Rejected — filing a security finding publicly _is_ disclosure. This fleet has no
  disclosure machinery, no severity rating, and no embargo, so the only responsible routing is to
  withhold: hand the vulnerability to the human privately and never open a public item. Making
  `route` park-and-hand-back rather than a redirect into another queue also keeps it from becoming
  a third emission mechanism the fleet would then have to verify.
- **Elevate prose domains (`docs-craft`, `knowledge-craft`, `spec-craft`) — prose looks like the
  safest thing in a repository to change.** Rejected — it is the opposite. No skill in the toolset
  applies prose-quality edits under a safety envelope, so elevating prose means free-hand rewriting
  with no mechanical check that it did not make things worse. A ratified ADR is additionally out of
  bounds on its own terms: it is the record of a decision, and editing one rewrites the past.
- **Wire `harness-design-craft` elevations through the existing design-drift codemod path.**
  Rejected — that path consumes `DRIFT-*` findings from a rule-based detector, which carry no craft
  `runId` or `rubricId`. Bridging it would require inventing exactly the finding translation the
  Iron Law exists to forbid. Recorded here because it is the most tempting composition available
  and the reason against it is a property of the cite, not of the codemod.
- **Prove net improvement with a single re-critique run.** Rejected — one LLM call falsely accepts
  as readily as it falsely rejects, so a single run gives the fleet a confident answer with no
  claim on being the right one. Two runs biased conservative on both sides — resolved only if
  absent from both, blocked if a regression appears in either — is the cheapest protocol that
  makes the oracle's non-determinism visible rather than hidden.
- **Three runs with a consistency requirement, mirroring `bug-fleet`'s reproduction protocol.**
  Rejected on cost — craft skills bill per LLM call and this member runs eleven of them across a
  repository. Two runs are safe enough because the fallback is a downgrade, not a merge: an
  inconclusive oracle costs the batch a filed item, never a bad change. This is the most likely
  place a future revision would spend more, and it would supersede this ADR.
- **Have the DISPATCH subagent run its own re-critique and report the result.** Rejected — that is
  a self-report, which the family invariant never accepts; the orchestrator would be reading a
  claim rather than checking a proof. Having both parties re-run would satisfy the invariant at
  four runs per item. Concentrating both runs in VERIFY keeps the total at two _and_ makes them
  independent, so the cost argument and the invariant are satisfied by one choice rather than
  traded against each other.
- **Discard an elevation whose two re-critique runs disagree.** Rejected — the disagreement
  concerns the rewrite, not the critique. The original finding came from a real run at a real
  location and is still worth acting on, so the item downgrades to `file` carrying its cite.
  Nothing is lost but the autonomous rewrite.
- **One PR per finding, or one PR for the whole batch.** Rejected in both directions — forty naming
  fixes as forty PRs is a denial-of-service on review, and forty mixed fixes in one PR forces the
  reviewer to switch judgment modes line by line. One PR per `(target, craft domain)` gives the
  reviewer one kind of taste question at a time over one coherent scope, which is the only shape in
  which bulk taste review is tractable.
- **Record no ADR at all, as the source proposal concluded.** Rejected by this backfill. The
  proposal was right that the model constrains this member only and extends no family contract —
  which is why this record changes no behavior. It was wrong that scope settles the question: the
  three sibling members each have an authority-model ADR, and the parts most in need of a durable,
  argued record are exactly the ones a future maintainer would otherwise loosen as "just skill
  prose."

## References

- Source proposal: `docs/changes/craft-fleet/proposal.md` (the "Decisions made" section this record
  backfills; `:135` is the "Architectural Decisions — None new" judgment it revisits).
- First instance: `agents/skills/claude-code/craft-fleet/SKILL.md` (Iron Law `:47`; SELECT floor,
  cross-check, routing and caps `:78-93`; elevation eligibility `:159-185`; VERIFY's three proofs
  and the two-run protocol `:189-212`; park-and-hand-back `:222`).
- Consumes: [`0019-3-axis-craft-output-model.md`](0019-3-axis-craft-output-model.md) — the
  tier × impact × confidence finding vocabulary this member ranks on and must not re-collapse.
- Companion: [`0087-subagent-fanout-vs-workflow-primitive.md`](0087-subagent-fanout-vs-workflow-primitive.md) — the execution architecture the fan-out runs on.
- Companion: [`0088-front-load-park-unforeseen-interaction-model.md`](0088-front-load-park-unforeseen-interaction-model.md) — the interaction model the taste-calibration CONFIRM round extends.
- Sibling: [`0089-pr-fleet-land-stage-human-merge-gate.md`](0089-pr-fleet-land-stage-human-merge-gate.md) — the land-stage authority model.
- Sibling: [`0090-adr-fleet-decide-stage-batch-signoff.md`](0090-adr-fleet-decide-stage-batch-signoff.md) — the decide-stage authority model, and the source of this record's own `proposed` status.
- Sibling: [`0091-fleet-command-conductor-tier-authority-model.md`](0091-fleet-command-conductor-tier-authority-model.md) — the conductor-tier authority model.
- Family overview: `docs/reference/fleet-family.md` (the `-fleet` spine, its invariants, and the canonical handoff record).
- ADR convention: `docs/knowledge/decisions/README.md` (frontmatter, numbering, status vocabulary).
