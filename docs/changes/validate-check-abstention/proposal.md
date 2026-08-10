# validate-check-abstention — a check that could not run must never report as passed

**Status:** Draft · **Tier:** Small-Medium · **Type:** bug fix (CLI validation contract)
**Keywords:** validate, roadmap-health, abstention, zero-denominator, exit-code, silent-skip, parse-failure, aggregate-drift, false-green, completeness

## Overview

`harness validate` prints `v validation passed` and exits `0` when `docs/roadmap.md`
exists but fails to parse. The `roadmapHealth` check is guarded by
`if (parsed.ok)` with no `else`, so on a parse failure the check never runs,
`result.checks.roadmapHealth` is never assigned, `result.valid` is never touched,
and the parse error — which names the offending section — is discarded
[evidence: `packages/cli/src/commands/validate.ts:298-318`].

The result is inverted severity. A roadmap broken badly enough that the parser
rejects it validates clean, while a _less_ broken roadmap that parses and trips a
health rule fails. The check that polices roadmap health disappears exactly when
the roadmap is worst, and it takes RMH001–RMH005 with it in one silent stroke
[evidence: `packages/core/src/roadmap/health.ts:77-82`].

The same swallow exists one check earlier. The aggregate-drift doctor passes
`regenerated.ok ? regenerated.value : null` into `checkRoadmapAggregateDrift`,
which returns `{ applicable: false }` when regeneration was not possible; the
caller's `else` branch then sets `result.checks.roadmapAggregateDrift = true`
[evidence: `packages/cli/src/commands/validate.ts:267-290` (block opens at `:267`;
the `regenerated.ok ? … : null` collapse is at `:277`, the `else` at `:288-290`),
`packages/core/src/validation/roadmap-aggregate-drift.ts:59-68`]. A shard set so
malformed it cannot be regenerated reports the freshness check as **passed**. The
helper's own doc comment defends this by saying "other validation surfaces the
underlying problem" — but the only other validation that would have is
`roadmapHealth`, which swallows too. Both fire together on the same broken input,
and together they produce a fully green report over an unreadable roadmap.

The root defect is not a missing `else`. It is that `harness validate` has only
two outcomes — passed and failed — for three possible states: **checked and
healthy**, **checked and unhealthy**, and **could not check**. With no third
outcome, "could not check" has to be encoded as one of the other two, and the code
picked the wrong one.

### Goals

- Make "could not check" a first-class, unmissable outcome of `harness validate`,
  distinct from both "passed" and "failed" in the exit code, the human-readable
  output, and the JSON payload.
- Never again report `validation passed` over a roadmap the parser rejected —
  from `harness validate` itself. Scope note: in _this_ repo `harness validate` is
  invoked only by three persona workflows that swallow non-zero
  (`… validate || echo "::warning::…(non-blocking)"` at
  `.github/workflows/persona-{documentation-maintainer,architecture-enforcer,task-executor}.yml`),
  and the blocking gates (`.github/workflows/harness.yml`, `.husky/pre-commit`) run
  `harness ci check`, whose `validate` category calls only `validateAgentsMap`
  [evidence: `packages/core/src/ci/check-orchestrator.ts:128-155`]. So this change
  fixes the command's own contract and every adopter that gates on it; it does not,
  by itself, add a blocking roadmap signal to this repo's CI. Wiring roadmap checks
  into `ci check` is separate work.
- Surface the discarded parse error verbatim — it already names the offending
  section and is the single most useful diagnostic available at that point.
- Close the identical swallow in the aggregate-drift doctor with the same
  mechanism, so the two checks that fail together also _report_ together.

### Non-goals (YAGNI)

- Making the existing advisory findings blocking. RMH002 (unactionable planned
  row) is a `warning` and must stay non-blocking; this repo carries dozens of them
  on `main` [evidence: `packages/cli/tests/commands/validate.roadmap-health.test.ts:74-99`
  asserts `valid: true` at `:94` for an RMH002-only roadmap — that test must keep
  passing unchanged].
- Migrating the three design audits (`componentAnatomy`, `driftDetection`,
  `brandCompliance`) onto the new mechanism. Their `catch` blocks already report
  the skip as a visible warning — they are degraded-but-not-silent by deliberate
  design [evidence: `packages/cli/src/commands/validate.ts:355-364`, `403-410`,
  `447-454`]. The distinction that keeps them out of scope is _what is being
  caught_: those blocks catch an arbitrary thrown exception from the audit engine —
  a defect in the **checker** — whereas `parseRoadmap` and `regenerate` return a
  typed `Err` describing **the input they could not consume**. Abstention is the
  right response to unusable input; a crashing checker is a different failure that
  warrants its own treatment. Migrating them is also a much wider blast radius
  (any transient audit crash would turn a green build non-green). Recorded as a
  future consideration.
- Fixing the `validate_project` MCP tool. It is an **independent reimplementation**
  that never calls `runValidate` — it checks config, file structure, and AGENTS.md
  only, and touches neither `roadmapHealth` nor `roadmapAggregateDrift`
  [evidence: `packages/cli/src/mcp/tools/validate.ts:17-115`]. **Residual risk,
  named:** `assess_project({ checks: ["validate"] })` derives `passed` from that
  tool [evidence: `packages/cli/src/mcp/tools/assess-project.ts:154-163`], so the
  agent-facing surface keeps reporting green over an unparseable roadmap after this
  ships. Converging the MCP tool onto `runValidate` is a larger change (a different
  result shape with its own consumers) and is deliberately deferred; the skill prose
  that reads the check is corrected here instead (see Integration Points).
- Repairing, auto-fixing, or migrating a malformed roadmap. `validate` reports.
- Changing what `parseRoadmap` accepts.
- Treating an **absent** `docs/roadmap.md` as a problem. File-less mode and
  uninitialized projects legitimately have no roadmap; that silent skip is correct
  and stays [evidence: `validate.roadmap-health.test.ts:36-44`].

## Decisions made

### D1 — "Could not check" gets its own exit code: `ExitCode.ZERO_DENOMINATOR` (3)

|          | A) Reuse `VALIDATION_FAILED` (1)          | B) `ZERO_DENOMINATOR` (3)                                                  | C) New code (4)                        |
| -------- | ----------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------- |
| **Pros** | Zero risk to `exit != 0` consumers        | Already defined with exactly this meaning; no new **exit-code** vocabulary | Bespoke naming                         |
| **Cons** | Only 2 codes for 3 states — mandate unmet | Consumers matching `exit == 1` exactly see 3 instead                       | Adds a code where a fitting one exists |
| **Risk** | Low                                       | Low                                                                        | Low                                    |

**Chosen: B.** `ExitCode.ZERO_DENOMINATOR` is already defined in this codebase and
documented as: _"The command ran but examined NOTHING — a zero denominator.
Distinct from SUCCESS (it did not verify anything) and from ERROR (nothing
malfunctioned). A gate that matched, compared, or fetched zero items has
abstained, not passed, and must never read as green."_
[evidence: `packages/cli/src/utils/errors.ts:11-19`]. That is a verbatim
description of this bug, and `harness roadmap sync`, `check-docs`,
`check-deployment`, and `review-ci` already use it. The contract is already
recorded as an accepted decision
[evidence: `docs/knowledge/decisions/0086-enforcing-deploy-gate-exit-contract-and-rollback-seam.md:47-49`],
so this change **applies** an existing ADR rather than establishing a new one.
Reusing it keeps one exit-code vocabulary for abstention across the CLI instead of
minting a second.

The claim is narrow: at the _payload_ level this change does add shape — four
commands already model abstention as a flat `scannedNothing: boolean`
[evidence: `packages/cli/src/commands/check-security.ts:39,133-138`,
`packages/cli/src/commands/check-docs.ts:33,94-106`], whereas `validate` needs a
per-check ledger because it runs many checks and any one of them can abstain
independently. Same exit-code vocabulary, richer payload — deliberately.

Verified before choosing B: no consumer in this repo matches `harness validate`'s
exit code exactly. The three persona workflows use `|| echo ::warning::`, the
dashboard action route derives `ok: code === 0`
[evidence: `packages/dashboard/src/server/routes/actions.ts:189`], and the
documented scripting pattern is `if [ $? -ne 0 ]`
[evidence: `docs/reference/cli.md` "Exit Codes"]. Residual risk is adopter CI that
matches `== 1` exactly — and such a consumer was previously being handed `0` in
this scenario, which is strictly worse.

The three states therefore map: **checked and healthy → 0**, **checked and
unhealthy → 1**, **could not check → 3**. Every non-green state stays non-zero, so
no `set -e` or `if ! cmd` gate changes verdict; only a consumer matching `1`
_exactly_ is affected, and such a consumer was previously being told `0` in this
scenario, which is strictly worse.

### D2 — Abstention outranks failure in the exit code

When a run has both real error findings and an abstained check, the exit code is
`3`, not `1`.

Rationale: exit `1` carries an implicit claim — _"here is the complete list of what
is wrong."_ That claim is false when a check could not run, and a user who fixes
every reported error will still be flying blind on the roadmap. Exit `3` says the
report itself is incomplete, which is the strictly more important message and the
one that must not be masked. Both codes are non-zero, so precedence cannot flip
any gate from red to green — it only changes which non-green signal the caller
sees. The findings that would have driven exit `1` are still printed in full.

### D3 — Abstentions are recorded in a dedicated ledger, not pushed into `issues`

|          | A) Push an `error`-severity issue (as the bug report suggests)                                                         | B) Dedicated `unavailableChecks` ledger                     |
| -------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Pros** | One list for consumers to read; smallest diff                                                                          | Abstention cannot be filtered away; counts stay honest      |
| **Cons** | `--severity error` semantics let it be reasoned about as a finding; inflates the `(N issues)` count with a non-finding | Consumers reading only `issues` need to learn one new field |
| **Risk** | Medium — see below                                                                                                     | Low                                                         |

**Chosen: B.** The decisive argument is `--severity`. That flag filters
`result.issues` and then recomputes `result.valid = filtered.length === 0`
[evidence: `packages/cli/src/commands/validate.ts:488-495`]. If an abstention
were an ordinary issue, `--severity error` would be a _filter that can hide the
fact that a check did not run_ — reintroducing the same false green through a
different door. A dedicated ledger is structurally unfilterable.

Secondary argument: an abstention is not a finding _about the project's health_,
it is a fact _about the report's completeness_. Keeping it out of `issues` keeps
the `x Validation failed (N issues)` count meaning what it says.

The bug report framed the issue-push as its **minimum** bar ("at minimum, the skip
must be reported rather than silent — a check that did not run must never present
as a check that passed"). This design clears that bar by a wider margin: the
abstention is non-zero-exit, unfilterable, and rendered in its own output section.

### D4 — `checks.<name>` stays an honest tri-state; the ledger disambiguates

`ValidateResult.checks.<name>` keeps its existing shape: `true` = ran and passed,
`false` = ran and failed, `undefined` = did not run. A parse failure therefore
leaves `checks.roadmapHealth` **`undefined`** — because it genuinely did not run —
rather than setting it to `false`, which would be the lie that it ran and found
problems.

That leaves `undefined` shared between "not applicable" (no roadmap file) and
"could not run" (roadmap file unreadable). `unavailableChecks` is exactly the
disambiguator: an entry present ⇒ could-not-run; absent ⇒ not applicable. A
consumer answering "did roadmap health actually get verified?" reads
`checks.roadmapHealth === true`, which is now true only when the check really ran
and passed.

### D5 — Scope the ledger to the two silent roadmap swallows

`roadmapHealth` (parse failure) and `roadmapAggregateDrift` (regeneration failure)
are the two sites where an abstention is _currently invisible_. They are also
causally linked — the same malformed roadmap trips both — so fixing one and not
the other would leave a green half-report over the same broken input. Every other
`Result`-guarded check in `validate.ts` already has an `else` branch that reports
[evidence: `validate.ts:117-129`, `135-151`, `159-172`, `176-190`, `194-205`,
`209-224`, `244-255`].

Two adjacent weak spots are noted and deliberately left alone: `fileStructure` is
hardcoded to `true` pending conventions support [evidence: `validate.ts:153-155`],
and the merge-driver doctor silently treats a `git config` failure as "unconfigured"
[evidence: `validate.ts:231`, `241-243`]. Both are the same defect _family_; neither
is roadmap-related and each carries its own design question, so folding them in here
would broaden the change past its bug.

**Accepted risk on `roadmapAggregateDrift`.** `regenerate()` returns `Err` for
unreadable/mis-slugged/duplicate shards, and this repo has 149 of them
[evidence: `packages/core/src/roadmap/store/shard-store.ts:59-63`, `78-82`,
`90-92`]. A genuinely transient read failure on any one shard would move
`harness validate` from `0` to `3`. That is accepted: the outcome is
correct-but-noisy (the freshness comparison really did not happen), it is non-zero
rather than green, and a re-run clears it. This does **not** contradict the design-audit
non-goal above — the distinction there is checker-crash vs unusable-input, not
transient vs deterministic.

### D6 — No roadmap-row promotion for this change

The brainstorming skill's Phase-4 step 7 promotes a roadmap row; no row exists for
this item, and the `not-found` path calls `manage_roadmap add`, which auto-creates
a **new** GitHub tracking issue. This item is already tracked by an existing issue,
so `add` would produce a duplicate. Promotion is skipped deliberately; the tracking
issue in the PR description is the record. Recorded as an assumption in the PR.

## Technical design

### Data model (`packages/cli/src/commands/validate.ts`)

```ts
/** One check that could not run — the report is incomplete, not clean. */
interface UnavailableCheck {
  /** The check key that abstained, matching a `checks` field name. */
  check: string;
  /** The input the check could not consume, when file-scoped. */
  file?: string;
  /** Why it could not run — carries the underlying error verbatim. */
  reason: string;
  /** What the operator should do about it. */
  suggestion?: string;
}

interface ValidateResult {
  valid: boolean;
  /** False when at least one check could not run. `valid` alone is not trustworthy when this is false. */
  complete: boolean;
  checks: { ... };            // unchanged
  issues: [ ... ];            // unchanged
  unavailableChecks: UnavailableCheck[];   // always present; empty on a complete run
  agentConfigs?: AgentConfigValidation;
}
```

`complete` is derived (`unavailableChecks.length === 0`) and set once at the end of
`runValidate`, immediately after the `--severity` filter block, so the filter can
never influence it.

### Behavior

`roadmapHealth`, malformed roadmap — replaces the missing `else`:

```ts
} else {
  result.unavailableChecks.push({
    check: 'roadmapHealth',
    file: 'docs/roadmap.md',
    reason: `docs/roadmap.md could not be parsed, so roadmap health rules (RMH001-RMH005) did not run: ${parsed.error.message}`,
    suggestion: 'Fix the reported section in docs/roadmap.md (or its docs/roadmap.d/ shard) and re-run `harness validate`.',
  });
}
```

`roadmapAggregateDrift`, unregenerable shards — splits the current binary `else`
into "fresh" and "could not compare":

```ts
if (!regenerated.ok) {
  result.unavailableChecks.push({
    check: 'roadmapAggregateDrift',
    file: 'docs/roadmap.d',
    reason: `docs/roadmap.d/ could not be regenerated, so aggregate freshness was not compared: ${regenerated.error.message}`,
    suggestion: 'Fix the reported shard under docs/roadmap.d/, then run `harness roadmap regen`.',
  });
} else if (drift.applicable && drift.stale) { ... } else { result.checks.roadmapAggregateDrift = true; }
```

`checks.roadmapAggregateDrift` is left `undefined` in the abstention branch, per D4.

### Exit code (`runValidateAction`)

```ts
const exitCode = !result.value.complete
  ? ExitCode.ZERO_DENOMINATOR // could not check — outranks failure (D2)
  : result.value.valid
    ? ExitCode.SUCCESS
    : ExitCode.VALIDATION_FAILED;
process.exit(exitCode);
```

### Human-readable output (`OutputFormatter.formatValidation`)

`ValidationResult` gains an optional `unavailableChecks` field; when it is absent
or empty, rendering is byte-identical to today (every existing caller and test is
unaffected). When it is non-empty, TEXT/VERBOSE mode renders a dedicated section
_before_ the issues, and the headline states incompleteness rather than a verdict:

```
! Validation incomplete - 1 check could not run

  Checks that could not run:
  * roadmapHealth (docs/roadmap.md)
    docs/roadmap.md could not be parsed, so roadmap health rules (RMH001-RMH005)
    did not run: Feature "Ship it" has invalid status: "cancelled". Valid
    statuses: backlog, planned, in-progress, blocked, done

  A check that could not run is not a check that passed. This report is incomplete.
```

When a run is **both** incomplete and failing, both headlines print, incomplete
first:

```
! Validation incomplete (1 check could not run)

  Checks that could not run:
  * roadmapHealth (docs/roadmap.md)
    ...

  A check that could not run is not a check that passed - this report is
  incomplete.

x Validation failed (3 issues)

  * src/index.ts
    ...
```

The incomplete headline leads because it qualifies the failure list beneath it; no
diagnostic from a check that _did_ run is lost. `suggestion` is shown only in
VERBOSE, matching how `appendIssueLines` already treats issue suggestions.

QUIET mode needs one extra care: it currently returns `''` immediately when
`valid` is true [evidence: `packages/cli/src/output/formatter.ts:99-102`], and the
dominant abstention case _is_ `valid: true` — so a naive change would print nothing
and exit 3. The early return is therefore gated on the ledger being empty as well;
when it is non-empty, QUIET prints one `<file>: <reason>` line per abstention ahead
of the issue lines. JSON mode is unchanged in shape beyond the two additive fields.

The call site must actually pass the ledger: `emitValidateOutput` builds the
formatter payload as a closed literal
[evidence: `packages/cli/src/commands/validate.ts:587` pre-change], so without
threading `unavailableChecks` through, `formatValidation` would always take the
byte-identical path and the CLI would exit `3` while printing `validation passed` —
strictly worse than the bug. This wiring is an explicit implementation step.

The "checked and healthy" rendering (`v validation passed`) is left untouched by
design — its _meaning_ is what changes. It can now only be printed when every
applicable check actually ran, which was not true before this change.

## Integration points

- **Entry Points** — `harness validate` (CLI exit code and TEXT/VERBOSE/QUIET/JSON
  output); `runValidate()` (exported, but with no production consumer outside
  `validate.ts` itself — every other call site is a test);
  `OutputFormatter.formatValidation` (9 call sites, all passing fresh object
  literals, so an optional field is source-compatible with all of them). The
  `validate_project` MCP tool is explicitly **not** an entry point for this change —
  it never calls `runValidate` (see Non-goals).
- **Registrations Required** — None. No new command, flag, skill, or export; the
  two new `ValidateResult` fields are additive and `UnavailableCheck` is local to
  the CLI package (mirrored as an optional field on the formatter's
  `ValidationResult`, which is not exported, so it is added in place).
- **Documentation Updates** — `docs/reference/cli.md` (hand-maintained; **not**
  `docs/reference/cli-commands.md`, which is auto-generated and whose hand-editing
  is blocked by `pnpm run generate-docs --check` in `.husky/pre-push`): repair the
  global `## Exit Codes` table, which today lists only 0/1/2 and already omits 3
  despite four commands using it, and add a per-command exit-code note under
  `### harness validate`. Correct the one skill instruction that reads the check as
  a two-state boolean — `agents/skills/claude-code/harness-roadmap/SKILL.md`
  Phase 4 says "confirm the `roadmapHealth` check passes", which an agent seeing
  `undefined` would read as "not failing"; that is exactly the hazard D4 closes. A
  patch changeset records the exit-code addition for adopters.
- **Architectural Decisions** — None new. D1 **applies** the already-accepted
  ZERO_DENOMINATOR exit contract
  (`docs/knowledge/decisions/0086-enforcing-deploy-gate-exit-contract-and-rollback-seam.md`)
  to a second command rather than establishing a new one.
- **Knowledge Impact** — Reinforces the existing "abstention is not success"
  concept already carried by `ExitCode.ZERO_DENOMINATOR`, extending it from
  `roadmap sync` to `validate`.

## Success criteria

Each is observable and testable via `runValidate()` plus the CLI action.

1. **SC1** — When `docs/roadmap.md` exists and `parseRoadmap` returns `Err`,
   `runValidate` returns `complete: false` with exactly one `unavailableChecks`
   entry for `roadmapHealth`, whose `reason` contains the parser's own message
   verbatim, and `checks.roadmapHealth` is `undefined`.
2. **SC2** — In that same scenario the CLI exits `3`, and stdout contains
   `Validation incomplete` and does **not** contain `validation passed`.
3. **SC3** — When the roadmap parses and only RMH002 warnings are found,
   `valid` stays `true`, `complete` stays `true`, `unavailableChecks` is empty, and
   the exit code is `0` — existing advisory noise is not made blocking.
4. **SC4** — When the roadmap parses and an RMH003 error is found, `valid` is
   `false`, `complete` is `true`, and the exit code is `1` — checked-and-unhealthy
   is still distinct from could-not-check.
5. **SC5** — When `docs/roadmap.md` is absent, `checks.roadmapHealth` is
   `undefined`, `unavailableChecks` is empty, and `complete` is `true` — the
   legitimate silent skip is preserved.
6. **SC6** — In sharded mode with shards that cannot be regenerated,
   `unavailableChecks` carries a `roadmapAggregateDrift` entry and
   `checks.roadmapAggregateDrift` is `undefined` (previously `true`).
7. **SC7** — A run with both an abstention and an error-severity finding exits `3`
   while still printing every finding (D2 precedence, no diagnostic lost).
8. **SC8** — `--severity error` cannot empty `unavailableChecks`, and the exit code
   stays `3` when a check abstained (abstention is unfilterable).
9. **SC9** — `formatValidation` output is byte-identical to today for every result
   with no `unavailableChecks` — including QUIET+valid still returning exactly `''`
   — so no existing snapshot or assertion changes.
10. **SC10** — In QUIET mode a `valid: true` run with a non-empty ledger prints one
    `<file>: <reason>` line per abstention rather than the empty string.
11. **SC11** — A run that is both incomplete and failing prints both the
    `Validation incomplete` and `Validation failed (N issues)` headlines, incomplete
    first, with every finding still listed.
12. **SC12** — `emitValidateOutput` passes `unavailableChecks` to the formatter, so
    the CLI never exits `3` while printing `validation passed`.

## Implementation order

1. **Ledger + contract.** Add `UnavailableCheck`, `unavailableChecks`, and
   `complete` to `ValidateResult`; initialize the array; derive `complete` after
   the `--severity` block. (SC8's invariant is established here.)
2. **Close the two swallows.** Add the `roadmapHealth` `else` branch and split the
   `roadmapAggregateDrift` branch. (SC1, SC6)
3. **Exit-code mapping** in `runValidateAction` with D2 precedence. (SC2, SC4, SC7)
4. **Renderer.** Optional `unavailableChecks` on the formatter's `ValidationResult`;
   incomplete headline + "Checks that could not run" section; both-headlines case;
   QUIET line form gated on a non-empty ledger; **and the `emitValidateOutput`
   wiring that hands the ledger to the formatter**. (SC2, SC9, SC10, SC11, SC12)
5. **Tests.** Extend `validate.roadmap-health.test.ts` with the abstention cases,
   add a CLI-level exit-code suite, and add formatter cases; assert the RMH002
   non-blocking case is untouched. (SC1–SC12)
6. **Docs + changeset.** Repair the global exit-code table in `docs/reference/cli.md`,
   add the per-command note, correct the roadmap SKILL.md instruction, patch
   changeset.
