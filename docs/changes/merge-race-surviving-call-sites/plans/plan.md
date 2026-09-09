# Plan — the `gh pr merge --auto` merge race at the call sites PR #2048 did not reach (cicd-fleet)

Trace of the `harness-workflow-audit` run (inventory → mechanical → judgment → report) and the
remediation it produced, executed autonomously in a cicd-fleet remediation lane.

Scope (two surviving call sites):

- `.github/workflows/release.yml`, job `release`, step `Promote golden build reference state`
- `.github/workflows/roadmap-auto-done.yml`, job `auto-done`, step `Commit and push the shard flip`

Pinned base SHA: `738b296c0a50cb9890474124d466f38903e468e2`.

## Provenance

PR #2048 (`65b475bb004a4b40af3dde4f824404768d39a01e`) fixed this defect in `ci.yml`'s
`refresh-baselines` job. Its diagnosis is reproduced below **as re-verified against the pinned
base**, not taken on faith. It fixed exactly one of the three call sites that carry the shape.

## Root cause (re-verified, not inherited)

`gh pr merge --auto` only _queues_ a merge when something is still pending. When nothing is
pending it attempts an **immediate** merge, and an immediate merge against a base that has moved
is rejected with:

```
GraphQL: Base branch was modified. Review and try the merge again. (mergePullRequest)
```

Under `bash -e` that exits the step non-zero.

**Verification performed in this lane** (`gh api repos/Intense-Visions/harness-engineering/...`):

| Claim                               | Check                      | Result                                                   |
| ----------------------------------- | -------------------------- | -------------------------------------------------------- |
| no `required_status_checks` rule    | `rulesets/14799222`        | rules are `deletion`, `non_fast_forward`, `pull_request` |
| one approving review required       | same                       | `required_approving_review_count: 1`                     |
| no classic branch protection either | `branches/main/protection` | `404 Branch not protected`                               |

So the single merge requirement is one approval, and at both call sites the PAT satisfies it
**inline on the line immediately above the merge**. There is nothing left for `--auto` to wait on.

Both surviving sites carry the identical five-line shape:

```
gh pr create → assert-diff-scope.mjs (fail-closed scope guard) → PAT self-approval → gh pr merge --auto
```

## Observed-vs-latent — stated plainly

`ci.yml`'s site had **three reproduced red runs** (34227768312, 34042737396, 34042651655).
These two sites do **not**. Evidence gathered in this lane:

- `release.yml`: last 30 runs contain no `failure`. The 8 most recent historical failures
  (33965602127, 33809503957, 33807408589, 33448269864, 33130776331, 32903965243, 32182980972, 31314325630) failed in `ci-gate: Run pnpm typecheck` or `docker / smoke-test`, **not** in the
  promotion step.
- `roadmap-auto-done.yml`: last 40 runs contain no `failure`; the most recent historical failure
  (32992087338, 2026-08-26) failed in `Reconcile auto-done`, **not** at the merge.

**This fix is therefore preventive, justified by structural identity with a reproduced defect —
not by a reproduction at these two sites.** Both PR-fallback paths landed on 2026-08-09
(`a05b6de4d`, extending #749's pattern), so the exposure window is short and the burst traffic
that produced ci.yml's three reds is recent. Anyone reading this should not believe these two
sites have failed in production; they have not, yet.

One inherited premise **corrected**: #2048 says a red job "fires the Main Health Alarm".
`main-health.yml` watches `workflows: [CI]` only, so a red **Release** or **Roadmap Auto-Done**
run does _not_ fire the alarm. The redness is still real and still lands on the default branch;
it is simply quieter, which arguably makes it worse.

## Audit findings (harness-workflow-audit, scoped to the two steps)

```
WORKFLOW AUDIT: harness-engineering — release.yml + roadmap-auto-done.yml (merge-race scope)
Workflows in tree: 22   Findings (in scope): 2 error, 2 warning, 1 info
Gates that never fire: none in scope
Documented-but-unwired gates: none in scope
```

### [ERROR] pushback-race — `.github/workflows/release.yml:176` (pre-fix line)

`gh pr merge "$PR_URL" --auto --squash --delete-branch` is the terminal command of a `bash -e`
step, with no retry and no tolerance for a concurrently-advancing base. **Effect:** a race on a
bookkeeping promotion fails a Release run whose packages have _already published_ — the worst
possible signal, because the failure implies the publish failed when it did not.

**Patch:** applied — bounded retry with re-derivation, then leave-open abstain (below).

### [ERROR] pushback-race — `.github/workflows/roadmap-auto-done.yml:214` (pre-fix line)

Same call, same shape. **Effect:** a red run on the default branch for a race that loses no work.

**Patch:** applied — bounded retry with re-derivation, then leave-open abstain (below).

### [WARNING] pushback-clobber — `.github/workflows/roadmap-auto-done.yml:196` (pre-fix line)

Pre-existing, and the reason the ci.yml idiom **cannot be copied blindly**. The PR-fallback branch
was built with `git checkout "$OURS" -- $ROADMAP_PATHS` onto a freshly-fetched base: a _wholesale
snapshot copy_ of our `docs/roadmap.d/` over a base that may have advanced. `docs/roadmap.d/` is a
shared, additively-edited shard tree, so this **reverts any row another commit flipped in between**.
A retry loop that re-derives this way would run that clobber up to three more times against
successively newer tips, converting a latent hazard into a likely one.

**Patch:** applied — the re-derive now re-runs the reconciler instead (below).

### [WARNING] concurrency-cancellation — `.github/workflows/release.yml:7-9` — **NOT PATCHED**

`concurrency: group: ${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: false`.
18 of the last 30 Release runs concluded `cancelled` (GitHub keeps at most one _pending_ run per
group, so a third arrival cancels the previously-pending one). The same pattern gives
`roadmap-auto-done.yml` cancelled runs, and there it can drop a roadmap flip outright.

**Deliberately out of scope and NOT changed.** The per-SHA remedy applied elsewhere (#1867/#2049)
is arguably _wrong_ for a publish path: it would permit concurrent `npm publish` runs and git-tag
races. This is a genuine unresolved design fork parked for a human. Recorded here so the next
reader does not mistake its absence for an oversight.

### [INFO] injection-hygiene — `.github/workflows/roadmap-auto-done.yml`

`${{ github.event.pull_request.number }}` is interpolated into `run:` in three places. It is an
integer, so this is not exploitable; left as-is to keep the diff scoped. The new closing-refs
value is passed as `env:` data (`CLOSING_REFS` / `FALLBACK_REFS`) rather than interpolated.

## Remediation, per site

Both sites gain the three functions the ci.yml idiom is built from — `rebuild_branch_on_base`,
`approve_pr`, and an abstain — plus `for attempt in 1 2 3` around the merge, with the re-derived
branch force-pushed to the **same** PR (never a second one) and `approve_pr` re-run after every
force-push (a force-push can dismiss the inline approval applied to the previous head).

`--auto` is retained at both sites so the jobs still behave correctly if `required_status_checks`
is ever added. **Neither site's `assert-diff-scope.mjs` guard was weakened or removed**, and
**no merge is silenced with `|| true`**.

### Question 1 — is re-deriving on a fresh tip safe?

| Site                    | Payload                                  | Can it conflict?                                                            | Is it idempotent?                                                                  | Verdict                                                            |
| ----------------------- | ---------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `release.yml`           | `.harness/golden/manifest.json`          | No — single file, written wholesale by `golden-build promote`               | Yes — the snapshot is of an already-published tree and does not depend on the base | **Wholesale re-apply is safe** (ci.yml's property genuinely holds) |
| `roadmap-auto-done.yml` | roadmap shard flip + generated aggregate | Wholesale copy cannot _conflict_, but it **reverts** concurrent shard edits | The _reconciler_ is idempotent; the snapshot copy is not                           | **Wholesale re-apply is NOT safe; re-run the reconciler instead**  |

**`release.yml`:** ci.yml's justification transfers intact. The manifest is written wholesale, and
this step is the file's only writer — serialized by the Release workflow's own concurrency group,
so no concurrent run can be promoting a different manifest. Re-applying "ours" onto a newer base
can neither conflict nor revert a concurrent writer. `git checkout "$OURS" -- "$MANIFEST"` is kept.

**`roadmap-auto-done.yml`:** ci.yml's justification does **not** transfer, per the
pushback-clobber finding above. The re-derive now re-runs
`harness roadmap reconcile --from-refs "$REFS"` (plus `roadmap regen` when sharded) against the
fresh base. That is safe because `--from-refs` is documented and implemented as a **pure, offline**
operation (`packages/cli/src/commands/roadmap/reconcile.ts:111` — "NO network call: `--from-refs`
carries each closing issue's own `owner/repo`"): it flips exactly the rows whose External-ID
matches and is a no-op on rows already `done`. Re-running it against a newer base yields the same
logical mutation while touching nobody else's rows. The refs reach the script as `env:` data.

_This also removes the pre-existing clobber on the very first branch build_, since both the initial
build and the retries now go through the one `rebuild_branch_on_base` function.

### Question 2 — what should exhaustion do?

`ci.yml` **closes** its superseded PR and exits 0. That is correct there for two reasons, and
**neither reason holds at either site here**:

1. `.harness/**/baselines.json` carries a `merge=ours` driver (`.gitattributes`), so landing a
   stale refresh would **revert** main's newer baselines — the PR is actively dangerous, not
   merely stale.
2. The very next merge to main regenerates a fresh one, so closing loses nothing.

| Site                    | Dangerous to land late?                                                                                                                                                                        | Regenerated automatically?                                                                    | Exhaustion behaviour chosen             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------- |
| `release.yml`           | No — `.gitattributes` gives `.harness/golden/manifest.json` no merge driver; it merges normally                                                                                                | Only by the **next publish**, which may be days away                                          | **Leave OPEN + `::warning::` + exit 0** |
| `roadmap-auto-done.yml` | No — the shards under `docs/roadmap.d/` carry no merge driver; `docs/roadmap.md` does carry `merge=ours`, but it is a **generated** aggregate rebuilt by `roadmap regen` / the post-merge hook | No — the flip derives from one merge event that has already passed; nothing in CI re-fires it | **Leave OPEN + `::warning::` + exit 0** |

Both payloads carry **unique work that nothing regenerates**, so closing would silently drop it.
The conservative answer applies at both sites. `exit 0` is used because a lost merge race must not
red the default branch (release.yml additionally must not report a successful publish as a failed
release). This is a **visible abstain, not a swallowed failure**: a `::warning::` annotation, a
comment on the PR, and a still-open, already-approved PR a human can merge in one click.

**One narrow exception, at both sites:** if `rebuild_branch_on_base` returns non-zero mid-retry,
the base provably already carries the payload and the PR is an empty no-op. Closing an empty PR
discards nothing, so that path closes with a `::notice::`. The abstain function itself never
closes — asserted by test.

## Regression tests

New file `tests/scripts/workflow-merge-race.test.mjs` (8 tests), **not** an addition to
`tests/scripts/baseline-gating.test.mjs`. Justification: that file is documented end to end as the
#671 baseline-jitter / refresh-race suite, and neither workflow here touches a baseline. The CI
step "Baseline-gating regression test" runs `node --test 'tests/scripts/*.test.mjs'` — a directory
glob — so a sibling file is CI-wired with **no workflow change**.

Both steps already contained an unrelated `for attempt in 1 2 3` loop around their _direct push_
before this fix, so "a bounded loop exists somewhere in the step" would have been a vacuous
assertion. Every assertion is anchored to the merge call itself.

### Pre-fix red proof (performed, not assumed)

Workflow edits stashed (`git stash push -- .github/workflows/release.yml
.github/workflows/roadmap-auto-done.yml`), leaving the two files byte-identical to the pinned base,
then `node --test tests/scripts/workflow-merge-race.test.mjs`:

| Test                                                                  | Pre-fix | First failing assertion                                                   |
| --------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------- |
| release/golden-promote: bounded retry that re-derives                 | ✖ FAIL  | the merge must be attempted inside the bounded retry, not once and bare   |
| release/golden-promote: exhaustion abstains visibly and exits clean   | ✖ FAIL  | exhaustion must route through a named abstain                             |
| release/golden-promote: not neutralised, guard gates every approval   | ✖ FAIL  | the fail-closed scope guard must live inside the re-runnable approval     |
| roadmap-auto-done: bounded retry that re-derives                      | ✖ FAIL  | the merge must be attempted inside the bounded retry, not once and bare   |
| roadmap-auto-done: exhaustion abstains visibly and exits clean        | ✖ FAIL  | exhaustion must route through a named abstain                             |
| roadmap-auto-done: not neutralised, guard gates every approval        | ✖ FAIL  | the fail-closed scope guard must live inside the re-runnable approval     |
| roadmap-auto-done: re-derive re-runs the reconciler, no snapshot copy | ✖ FAIL  | the re-derive must re-run the reconciler against the fresh base           |
| release/golden-promote: re-derive is a wholesale manifest re-apply    | ✖ FAIL  | the golden manifest re-derive must re-apply our snapshot on the fresh tip |

8/8 red pre-fix, 8/8 green post-fix; the whole `tests/scripts/` suite is 90/90 green.

**Honest caveat about assertion granularity.** `node:test` aborts a test at its first failing
assertion, so what is proven above is that every _test_ fails pre-fix. Two individual assertions
inside those tests are **guard-rails that would pass pre-fix by construction** and exist only to
prevent a future weakening:

- `doesNotMatch(/gh pr merge[^\n]*\|\|\s*true/)` — no `|| true` today, at either site
- `doesNotMatch(BARE_MERGE)` — vacuously true only once the bare form is gone

Every other assertion is genuinely fix-specific. The same caveat applies to #2048's third test
(`refresh-baselines: the merge is not neutralised and the #531 scope guard survives`), whose two
assertions both held before that fix — so `65b475bb0`'s claim that "all three fail against the
pre-fix workflow" is, strictly read, an overstatement for that one test. Recorded here rather than
repeated silently.

## Not changed

- Any `concurrency:` block (see the parked finding above).
- `ci.yml` — already fixed by #2048.
- `holiday-confidence-track.yml:231`, the **fourth** bare `gh pr merge --auto` in the tree. It was
  not in this item's scope and is not covered by these tests. It is the workflow #2048 credits as
  the origin of the `for attempt in 1 2 3` idiom, and its ledger payload has its own re-derive
  and exhaustion questions to answer. **Filed as a follow-up rather than silently included.**
- Either site's `assert-diff-scope.mjs` scope guard — retained verbatim, now inside `approve_pr`
  so it re-runs before every re-approval.

## Assumptions made

1. **The two sites' merge requirements are the same as ci.yml's.** Verified against ruleset
   14799222 as of this lane's run; if a `required_status_checks` rule is added later, `--auto`
   reverts to genuine queuing and the retry loop becomes dead code that costs nothing.
2. **`BASELINE_AUTOAPPROVE_PAT` remains valid for repeat approvals within one run.** The retry
   re-approves up to three times; `gh pr review --approve` on an already-approved head is accepted
   by GitHub as a new review. Not exercised end-to-end here — there is no way to run these steps
   outside a real Release / merge event.
3. **`packages/cli/dist/bin/harness.js` survives `git checkout -B` inside the job.** `dist/` is
   gitignored, and the same invocation already runs earlier in the same job after `pnpm build`.
4. **Exactly one of `CLOSING_REFS` / `FALLBACK_REFS` is non-empty** whenever the commit step runs —
   the step's `if:` is the same disjunction. An explicit `::error::` guard fails loudly rather than
   guessing if that ever drifts.
5. **`sleep 5` between attempts is adequate.** Copied unchanged from ci.yml; not independently
   tuned.
6. **No end-to-end execution.** These are workflow files; the remediation is verified by text
   assertions, YAML parse, and `bash -n` over every `run:` block, not by a live race.
