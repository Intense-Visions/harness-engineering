---
number: 0129
title: Split the audit-exceptions posture — fail open on an absent register, stay fail closed on a lapsed entry
date: 2026-09-24
status: proposed
tier: medium
source: 'decision-blocked issue #2203'
---

## Context

### This is a re-decision, not a green-field choice

`docs/changes/audit-exceptions-enforcement/proposal.md` already decided this posture deliberately, for issue #1324, and shipped it. Its `## Decisions made` section states the rule verbatim (`proposal.md:33-35`):

> **Missing/invalid/lapsed expiry all fail.** Treating a missing `expires` as lapsed (rather than "no expiry = forever") is the whole point of the issue — it makes the safe default _fail closed_.

and its closing assumption (`proposal.md:129`):

> Gate is blocking on PRs (the issue's intent: advisories must be _enforced_).

That proposal explicitly declined to write a decision record — `proposal.md:101-102`: "**Architectural Decisions:** None rise to a standalone ADR (small governance change)." **This record is therefore the first ADR to govern that surface**, and it revisits a documented choice against evidence that did not exist when the choice was made. It is not a decision taken in a vacuum, and the prior author's reasoning is treated as correct for the case it addressed.

### The mechanism as it stands at `b62f51d71863`

`.github/workflows/audit-exceptions.yml` is PR-triggered — `on: pull_request` / `branches: [main]` (`:13-15`) — so its blast radius is **every open PR**, not `main`. Its single job step is blocking (`:40-43`):

```yaml
# Blocking: an uncovered or lapsed advisory fails the PR. The script runs
# `pnpm audit --json` itself and exits non-zero on any failure.
- name: Reconcile auditExceptions
  run: node scripts/audit-exceptions.mjs
```

The string `continue-on-error` occurs exactly once in the file, on `:8`, inside the header comment that says the job deliberately has none. Verified: `grep -n 'continue-on-error' .github/workflows/audit-exceptions.yml` → one hit, line 8.

`scripts/audit-exceptions.mjs` reconciles every active advisory against the `auditExceptions` register in the root `package.json`. Two failure classes, both exit 1:

- **uncovered** — an active advisory with no register entry at all (`:122-130`)
- **expired** — a covering entry that is past its `expires`, or has a missing/invalid/non-object one (`:131-139`, via `lapseReason` at `:77-95`)

Register entries matching no active advisory are warnings, never failures (`:143-151`) — a rule the prior proposal set deliberately (`proposal.md:41-42`: "An entry that no longer matches any active advisory is stale hygiene, not a security regression").

### The register does not exist, and that is the healthy steady state

Verified at the pinned base:

```
$ git show b62f51d71863:package.json | python3 -c "import json,sys;print(json.load(sys.stdin).get('auditExceptions','ABSENT'))"
ABSENT
```

The key is not merely empty — it is absent. And it is absent **because the gate worked**. Commit `53791aa33` (2026-08-30, "chore(deps): clear all Dependabot alerts + keep pnpm overrides in package.json") removed all five entries, its own body recording: "removed the 5 now-stale auditExceptions entries (advisories genuinely fixed)". Under the proposal's own stale-entry rule, removing them was correct hygiene.

This is the load-bearing observation the prior decision could not have made: **a repo with no outstanding deferrals has no register**. Zero entries is not a misconfiguration to be repaired — it is what success looks like. The gate's pass/fail is therefore decided entirely by whether any advisory happens to be active at that moment, a condition nothing in this repo controls and nothing in this repo schedules.

### It has already fired once, for real

#2087 records the instance: GHSA-4r6h-5v86-94p3 (liquidjs, high) went active on 2026-09-08 and immediately turned the `Reconcile audit exceptions` check red on every open PR, for a reason unrelated to any of their diffs. It was cleared by PR #2105 (`security(deps): clear all eight active audit advisories`, merge commit `1f365ad71`), which moved the lockfile forward. **The instance was resolved; the mechanism was not touched.** The register is still absent, the job is still blocking, so the next advisory published against any transitive dependency reproduces the outage identically.

### The script cannot currently tell the two cases apart

This is decisive for what the decision costs to implement. The absent/empty distinction is destroyed twice, in two independent places:

- `scripts/audit-exceptions.mjs:188-192` — `loadRegister` returns `pkg.auditExceptions || {}`. An absent key and a present-but-empty `{}` both become `{}`.
- `scripts/audit-exceptions.mjs:115-116` — `reconcile` re-applies the same coercion: `const reg = register && typeof register === 'object' ? register : {}`.

Downstream of either, the register's provenance is unrecoverable. `reconcile` receives a bare map and has no parameter through which the caller could say "this register was never declared". The behaviour is also **pinned by a passing unit test**: `tests/scripts/audit-exceptions.test.mjs:26-36` asserts that `activeAdvisoryIds: ['GHSA-aaaa-bbbb-cccc']` against `register: {}` yields `ok === false` with a single `uncovered` failure. Implementing this decision therefore requires a tri-state the code does not have today, and requires amending that test — it is not a one-line flag flip.

### No compensating control exists inside the repo

Checked first-party, not assumed:

- **No `.github/dependabot.yml`.** `find .github -iname '*dependabot*'` returns nothing; `.github/` contains only `ISSUE_TEMPLATE`, `PULL_REQUEST_TEMPLATE.md`, and `workflows`. GitHub-native Dependabot **alerts** are evidently enabled at the repository-settings level — commit `53791aa33`'s subject is "clear all Dependabot alerts" — but that surface lives outside the repo tree, is not PR-visible, and is not declared by any file here.
- **No other workflow audits dependencies.** `grep -rln 'pnpm audit\|npm audit\|audit --json' .github/workflows/ scripts/ package.json` matches exactly two paths: `.github/workflows/audit-exceptions.yml` and `scripts/audit-exceptions.mjs`. Across all 23 workflows, no second job runs an audit.
- **`required-review.yml` does not supply one.** Its header (`:15` of `pr-advisory-checks.yml`) names `supply-chain-audit` as needing that workflow, but `required-review.yml` contains no audit, security, or supply-chain step — and the whole job is `continue-on-error: true` (`:36`) regardless.

So `audit-exceptions.yml` is the **only** dependency-audit gate the repository declares. That fact cuts both ways and is stated here because it is the strongest argument against this decision, not around it.

### One severity correction, stated honestly

The repository ruleset (id `14799222`, "Main branch protection") carries `deletion`, `non_fast_forward`, and `pull_request` (1 required approving review) rules — and **no `required_status_checks` rule at all**. A red `Reconcile audit exceptions` check therefore does not hard-block a merge at the ruleset level. #2203's framing of "gates unrelated PRs" is right in practice and slightly overstated in mechanism: the check turns the PR red, which defeats the all-green ship bar this repo's review and fleet automation both key on, but it is not a server-side merge block. The blast radius is a repo-wide loss of signal, not a repo-wide lock.

### The repo already holds the principle this decision applies

ADR `0096-fleet-bootstrapping-whole-set-honesty.md` clause 1 states it directly (`:19-26`, `:47-54`): "Empty and absent look identical downstream but mean opposite things"; "'Empty' is a fact about the project ... 'absent' is a fact about the setup". 0096 is itself still `status: proposed`, so it is cited as an existing articulation of the principle rather than as a ratified constraint this record inherits. The `auditExceptions` register is the same failure shape in a different subsystem: absent and empty are collapsed, and the collapse is read as the more alarming of the two meanings.

## Decision

**Split the posture of the `audit-exceptions` gate along the absent-register / lapsed-entry boundary. Fail OPEN when the register is absent or empty — report, do not block. Stay fail CLOSED when a covering entry has lapsed or is invalid.**

Concretely:

1. **An active advisory with no register entry, where the register is absent or empty, is REPORTED, not failed.** The job prints the full advisory list — id, severity, module, exactly as `main()` already does at `scripts/audit-exceptions.mjs:219-224` — and exits 0. The check goes green with a visible report rather than red with an unrelated cause.

2. **A lapsed, missing-expiry, invalid-expiry, or non-object entry still FAILS the PR.** The `expired` failure path (`scripts/audit-exceptions.mjs:131-139`, `lapseReason` at `:77-95`) is unchanged in both behaviour and severity. This is the clause that carries the prior decision's actual intent forward intact: **a deferral you took must not silently become permanent.** Every line of the #1324 proposal's reasoning about `expires` — "Treating a missing `expires` as lapsed ... makes the safe default _fail closed_" — survives this record verbatim and unqualified.

3. **An active advisory with no entry, where the register is NON-empty, still FAILS.** This is the seam that makes the split coherent rather than arbitrary. A non-empty register is positive evidence that someone is actively triaging advisories; an uncovered advisory arriving alongside curated entries is a genuine triage gap, and the maintainer is demonstrably present to close it. An absent register carries no such evidence — it is the resting state of a repo with nothing deferred. The register's **existence**, not its contents, is the signal that a human is on the other end of the gate.

4. **Stale entries keep warning, never failing.** Unchanged from the prior decision (`scripts/audit-exceptions.mjs:143-151`). Preserving this is what makes clause 3 safe: a maintainer who clears the last advisory can delete the last entry without the gate punishing them, and the register returns to absent — the state clause 1 now handles gracefully instead of converting into an outage.

### What this requires of the script

The decision cannot be implemented as configuration. It requires a code change with a specific shape:

- `loadRegister` (`scripts/audit-exceptions.mjs:188-192`) must stop collapsing absent into `{}`. It must return the register **and** whether the `auditExceptions` key was declared — e.g. `{ register, declared }` — using `Object.prototype.hasOwnProperty.call(pkg, 'auditExceptions')`, not truthiness, so a declared-but-empty `{}` is distinguishable from an absent key if that distinction is later wanted.
- `reconcile` (`:115`) must accept that provenance as an explicit argument (e.g. `registerDeclared`) rather than re-deriving it from the map's shape, and must not re-coerce it away at `:116`. It must classify an uncovered advisory as a **failure** when the register is non-empty and as a **report-only finding** when it is absent or empty. The pure-function boundary the prior proposal established (`proposal.md:46-47`) is preserved: the caller owns the IO, the function owns the rule.
- `main` must exit 0 when the only findings are report-only, while still printing them prominently. The `pnpm audit` unparseable-output path (`:174-186`, `:198-204`) stays fail-closed — an audit that could not run is not an audit that found nothing.
- `tests/scripts/audit-exceptions.test.mjs:26-36` ("uncovered active advisory fails", with `register: {}`) must be amended, since it pins exactly the behaviour this decision changes. It should be split into two tests: uncovered-with-absent-register → ok with a report-only finding; uncovered-with-non-empty-register → fail. The nine other tests in that file are untouched.

### What this decision does not do

This is a **decision record, not an executed change**. Accepting it authorizes the script and test changes above and alters no behaviour on its own. It does not add a register to `package.json`, does not edit the workflow (the split lives in the script's exit code, not in a `continue-on-error`), and does not touch `pnpm audit` invocation or any other gate.

### Why this does not overturn the prior intent

The #1324 proposal's target was named precisely in its own title and overview: a **time-boxed deferral silently becoming a permanent exemption**. Every mechanism it built serves that target — required `expires`, missing-expiry-as-lapsed, inclusive-day expiry, the reconcile gate. All of it is retained here, at full severity.

The case this decision changes is a different one the proposal never addressed, because it could not: **an advisory with no entry at all, when the register does not exist.** That is not a deferral going stale; it is an unscheduled external publication event — a third party's disclosure timing — converted into a repo-wide PR outage. The proposal's own success criterion (`proposal.md:107-109`) assumed "all 5 active advisories covered and unexpired", i.e. a populated register. It was written for a repo state that commit `53791aa33` subsequently and correctly dissolved. This record decides the state the proposal did not contemplate, and leaves the state it did contemplate exactly as it left it.

## Consequences

### Positive

- **Removes a latent repo-wide CI outage with an external, unscheduled trigger.** The #2087 instance is not hypothetical and is not rare: it is reproduced by any advisory published against any transitive dependency, on someone else's schedule. Under this decision that event produces a report, not a red check on every open PR.
- **Preserves the whole of the #1324 intent.** The expiry machinery — the actual subject of that issue and the entirety of its proposal's reasoning — is unchanged in behaviour and severity. A deferral still cannot silently become permanent.
- **Makes the healthy steady state passable.** A repo with zero outstanding deferrals currently has an absent register and so is one third-party disclosure away from red. After this, zero deferrals is a green, reportable state — which is what it always should have meant.
- **Keeps the gate sharp exactly where a human is demonstrably present.** Clause 3 means a maintainer who is actively curating the register still gets a hard stop on an uncovered advisory. Strictness is retained where there is someone to act on it.
- **Applies a principle the repo already articulated** (ADR 0096 clause 1, absent ≠ empty) rather than inventing a bespoke carve-out for this one gate.

### Negative

- **A genuinely new, uncovered advisory will no longer block a PR.** This is the real cost and it is not softened here: when the register is absent — which is its normal state — a newly published high-severity advisory against a production dependency produces a green check with a printed report. If nobody reads the report, nobody is stopped. The #2087 advisory (liquidjs, high) would, under this decision, not have redded anything.
- **The repo's only declared dependency-audit gate becomes non-blocking in its most common configuration.** Verified above: no `.github/dependabot.yml`, no second audit workflow, no supply-chain step in `required-review.yml`. There is no in-repo compensating control, and this record does not invent one. What partially compensates is (a) the report surface — the job still runs `pnpm audit` on every PR and prints every active advisory with severity and module, so the information is produced and visible rather than suppressed; (b) the lapsed-entry path staying fail-closed, so the register keeps its teeth once anything is actually deferred; (c) GitHub-native Dependabot alerts, which are demonstrably enabled at the repository-settings level (commit `53791aa33`) but are **not** a PR-visible gate and are **not** declared by any file in this repo. (a) and (c) are notification surfaces, not gates. That is a real reduction in enforced coverage, accepted knowingly.
- **The posture becomes state-dependent and therefore harder to reason about.** "Does this gate block?" now answers "it depends on whether `package.json` declares `auditExceptions`". A contributor reading the workflow alone cannot tell. Mitigation: the script must print which posture it took and why on every run, so the answer appears in the job log rather than requiring a reader to reconstruct it.
- **A perverse incentive exists at the seam.** Deleting the last register entry moves the repo from fail-closed-on-uncovered to fail-open-on-uncovered. Nothing prevents someone from clearing the register to quiet a red check. Mitigation: the stale-entry warning already names every removable entry explicitly (`:143-151`), so such a deletion is visible in the log of the PR that makes it; and the negative above — that nobody may read the report — applies to this mitigation too.
- **Implementation is not a flag flip.** Two coercion sites, one function signature, and one existing passing unit test must change. The decision's implementation cost is small but non-zero, and the test amendment must be deliberate rather than incidental.

### Neutral

- **The workflow file is unchanged.** The split lives in the script's exit code. `audit-exceptions.yml` keeps having no `continue-on-error`, which remains correct: when the script does fail, that failure should still be fatal.
- **Reversibility is high.** Reverting to uniform fail-closed is deleting the `registerDeclared` branch and restoring one test. No data migration, no corpus to unwind.
- **The ruleset is untouched and remains without a `required_status_checks` rule**, so the practical merge mechanics of a red check are the same before and after this record; only the frequency of an unrelated red changes.
- **No `auditExceptions` register is created by this decision.** The repo continues with an absent register until something is actually deferred, at which point the entry-shape and expiry rules of the #1324 proposal apply unchanged.
- **The #1324 proposal document is not edited or retracted.** It remains the accurate record of why the expiry machinery exists; this ADR is the record that narrows one of its clauses.

## Assumptions made

Recommended-option defaults taken while drafting, per the family's front-load / park-unforeseen interaction model (ADR 0088):

1. **Option A1 was not re-litigated.** The human chose the split posture at CONFIRM before drafting began; A2/A3/A4 are recorded below as alternatives for the record only.
2. **Absent and empty are treated identically (both fail open).** The decision distinguishes _non-empty_ from _absent-or-empty_, not absent from empty. Rationale: a declared-but-empty `{}` carries no more triage evidence than an absent key, and treating them differently would make `"auditExceptions": {}` a load-bearing incantation. Clause "What this requires of the script" nonetheless preserves the distinction in the data (`hasOwnProperty`, not truthiness) so a future record could split them without re-plumbing.
3. **Uncovered-with-non-empty-register stays fail-closed** (Decision clause 3). This was not specified in the fork as posed and is the recommended default taken; it is what makes the split a principled boundary rather than a blanket softening. A human may downgrade it at sign-off to fail-open-on-uncovered-always, which would make the split purely lapsed-vs-everything.
4. **The report-only path exits 0 rather than emitting a GitHub Actions annotation or `::warning`.** Taken as the minimal change; adding annotations is a strictly additive follow-up and does not need this record.
5. **The unparseable-`pnpm audit` path stays fail-closed** (`scripts/audit-exceptions.mjs:174-186`). Unaddressed by the fork; leaving it unchanged is the conservative default, and it is a different failure class — a tool that did not run, not an advisory that was not covered.
6. **No compensating control is proposed here.** Adding Dependabot config, a scheduled audit on `main`, or a non-blocking advisory job are all plausible follow-ups, but each is a separate decision with its own trade-offs, and inventing one inside this record would overstate what is actually being authorized.
7. **`supersedes` was deliberately left unset.** The #1324 proposal is not an ADR, so there is no record to supersede; and this decision narrows one clause of it rather than replacing it. The relationship is stated in prose instead.
8. **Frontmatter `number: 129` follows the dispatch brief verbatim**, which specified it as a MUST. Every sibling record in this directory uses the four-digit zero-padded form (`number: 0127`, `number: 0128`), per `docs/knowledge/decisions/README.md:33-38`. Flagged for normalization at sign-off rather than silently diverging from the brief.
9. **Advisor discover/analyse/propose artifacts were kept out of the commit**, per this lane's decision-record-only scope; the durable form of the proposal is the alternatives recorded below.

## Alternatives Considered

### A2 — Populate an `auditExceptions` register and keep the gate uniformly blocking (#2203 option 1)

Add entries covering the currently active advisories with justifications and `expires` dates, restoring the state the #1324 proposal assumed, and leave the posture untouched.

**Rejected.** It repairs the instance, not the mechanism — the same repair PR #2105 already performed once. The register's contents are a function of which advisories happen to be active, so the moment a dependency upgrade clears them, correct stale-entry hygiene (`proposal.md:41-42`, `scripts/audit-exceptions.mjs:143-151`) empties the register again and the repo returns to exactly today's state. Commit `53791aa33` is the proof that this cycle already completed once. It would also require pre-writing entries for advisories that do not yet exist, which is not possible.

### A3 — Make the whole reconciliation non-blocking / advisory (#2203 option 2)

Add `continue-on-error: true` to the job step, or have the script always exit 0 and report.

**Rejected.** It discards the #1324 intent wholesale. The expiry machinery — the actual subject of that issue — becomes decorative again, which is the precise condition the proposal was written to end ("The register is read by **nothing** ... a time-boxed deferral silently becomes a permanent exemption", `proposal.md:9-15`). A3 costs strictly more security than A1 and buys nothing A1 does not: both eliminate the unrelated-red blast radius, but only A1 keeps the deferral-expiry guarantee. The repo would also join `pr-advisory-checks.yml` in having every dependency signal be advisory, with no gate anywhere.

### A4 — Ratify fail-closed-on-any-advisory as intended; the register's absence is the bug (#2203 option 3)

Declare the current posture correct and treat the absent register as the defect to fix, making A2 the standing remediation.

**Rejected.** It requires believing that an absent register is an error state, and the evidence says the opposite: commit `53791aa33` removed the last five entries _because the advisories were genuinely fixed_, under a hygiene rule the same proposal established. A repo with nothing deferred correctly has no register. A4 would make a repository's healthiest possible dependency state — zero outstanding deferrals — permanently one third-party disclosure away from a repo-wide red, with no action any maintainer here can take in advance to prevent it. It ratifies a gate whose pass/fail is controlled by a condition outside the repository entirely.

## References

- Decision-blocked issue: **#2203** — "audit-exceptions is a blocking gate with an empty register".
- Recorded instance: **#2087** (closed) — GHSA-4r6h-5v86-94p3 (liquidjs, high) went active 2026-09-08 and redded the blocking check on every open PR.
- Instance resolution: **PR #2105** (merged, `1f365ad71`) — "security(deps): clear all eight active audit advisories". Cleared the advisories; did not touch the mechanism.
- Originating issue for the gate: **#1324** — enforce the `auditExceptions` register so time-boxed deferrals cannot silently become permanent exemptions.
- Prior decision this record narrows: [`docs/changes/audit-exceptions-enforcement/proposal.md`](../../changes/audit-exceptions-enforcement/proposal.md) — `## Decisions made` (`:27-51`), success criteria (`:105-112`), assumptions (`:123-129`). Not an ADR; this record is the first to govern the surface.
- Gate workflow: `.github/workflows/audit-exceptions.yml` — trigger `:13-15`, blocking step `:40-43`, no-`continue-on-error` note `:8`.
- Reconcile script: `scripts/audit-exceptions.mjs` — `loadRegister` `:188-192`, `reconcile` `:115-154`, uncovered path `:122-130`, lapsed path `:131-139`, `lapseReason` `:77-95`, stale warnings `:143-151`, `main` exit paths `:194-249`.
- Test pinning the behaviour that changes: `tests/scripts/audit-exceptions.test.mjs:26-36`.
- Register removal commit: `53791aa33` (2026-08-30) — "chore(deps): clear all Dependabot alerts + keep pnpm overrides in package.json", removing the five then-stale entries.
- Absent-vs-empty precedent: [`0096-fleet-bootstrapping-whole-set-honesty.md`](0096-fleet-bootstrapping-whole-set-honesty.md) clause 1 (`:19-26`, `:47-54`) — still `status: proposed`, cited as articulation of the principle, not as an inherited constraint.
- Family policy: [`0088-front-load-park-unforeseen-interaction-model.md`](0088-front-load-park-unforeseen-interaction-model.md).
- Absence of compensating controls, verified first-party: no `.github/dependabot.yml`; `grep -rln 'pnpm audit\|npm audit\|audit --json' .github/workflows/ scripts/ package.json` matches only `audit-exceptions.yml` and `audit-exceptions.mjs`; `.github/workflows/required-review.yml` has no audit step and is `continue-on-error: true` (`:36`).
- Repository ruleset `14799222` ("Main branch protection") — `deletion`, `non_fast_forward`, `pull_request` (1 approval); **no `required_status_checks` rule**.
