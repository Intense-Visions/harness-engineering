---
number: 0130
title: Release keeps its per-ref serialising concurrency group; `cancelled` is documented as expected group eviction
date: 2026-09-24
status: proposed
tier: small
source: 'parked fork — issue #2068'
---

## Context

`.github/workflows/release.yml` is the publish path: a `push` to `main`
(`release.yml:3-5`) runs a `ci-gate` job (`:19`), then a `release` job (`:41`,
`needs: ci-gate` at `:42`) that publishes to npm, then a `docker` job
(`:264-271`) that publishes container images. It carries

```yaml
# .github/workflows/release.yml:7-9
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: false
```

**Verified first-party at base `b62f51d71863bbb5f45a5b666cd23d16925924f7`:** the
block at `:7-9` is exactly as quoted, and the trigger at `:3-5` is `push:
branches: [main]` with no `pull_request` arm. On a push to trunk `github.ref` is
`refs/heads/main` for every commit, so every main commit lands in one group.

`cicd-fleet` (wave-0 CI trust gate, `fleet-command` run 2026-09-08) was briefed
to treat this as the same defect as #1867 and apply the same per-SHA remedy.
Issue #2068 records that the investigation **refuted that brief**, and this ADR
is the parked fork it left for a human. The refutation is re-verified here rather
than restated.

### What the `cancelled` runs actually are

**The mechanism is different from #1867.** That defect was
`cancel-in-progress: **true**` — a merge actively killed the _running_
verification of the previous commit, destroying real work. `release.yml:9` is
`false`. Nothing running is ever interrupted here.

**The cancelled runs never started.** GitHub holds at most one _pending_ run per
concurrency group; a third arrival evicts the queued one. Confirmed directly via
`gh api repos/:owner/:repo/actions/runs/<id>/jobs`, which reports
`total_count = 0` for every cancelled run checked — the three named in #2068
(`34271753931`, and `34271712964` / `34271676458` by the same measurement) and
the three in the current window (`35893940894`, `35043806268`, `35043566350`).
Zero job records means no runner was ever allocated: the run was evicted from the
queue, not killed mid-flight.

**No publish is lost.** Each run checks out its own SHA; `changesets/action@v1`
(`:70`) with `publish: pnpm release` (`:72`) consumes whatever changesets are
present in the tree it checked out. An evicted run's changesets are picked up by
the next run that does execute. The **newest** commit of a burst is never evicted
by a later arrival, so it always survives. Re-confirmed on a burst #2068 never
saw: 2026-09-23 17:11, `a966085de` success → `ecca8f710` **cancelled** →
`4ef72cb82` success at 17:13. Newest survived.

### A correction to #2068's headline measurement

#2068 measured **18 of the last 30** `release.yml` runs as `cancelled`, at base
`738b296c0a50cb9890474124d466f38903e468e2` on 2026-09-08. **Re-measured at this
ADR's pinned base on 2026-09-24, the last 30 runs contain 3 cancelled**
(`35893940894`, `35043806268`, `35043566350`) — a 10% rate, not 60%.

The 18/30 figure was not wrong; it was a window dominated by that day's
fleet merge bursts, and the window has since moved past them. The correct
reading is that **the eviction rate is burst-conditional, not a standing
property**: it approaches zero in ordinary weeks and spikes during a fleet's
merge burst. This materially _weakens_ the case for spending machinery on the
noise (option B2 below) and _strengthens_ the case for documenting it, because
the thing a future reader will encounter is an occasional unexplained
`cancelled` rather than a permanently red-looking board.

### Correction to two stale line citations

Both are cited wrongly elsewhere and are recorded correctly here:

- **#2068 cites `release.yml:160-176`** for the PAT-self-approve + merge of the
  golden-build promotion PR. At the pinned base that machinery is at **`:184-190`**
  (the `approve_pr()` function, whose PAT-scoped `gh pr review --approve` is at
  `:188`), **`:219-224`** (`gh pr create`), and **`:241-260`** (the
  bounded `gh pr merge --auto --squash --delete-branch` retry loop at `:242`).
  `:160-176` is inside `rebuild_branch_on_base()`. The substance of #2068's
  hazard claim is correct; only its line pointer had drifted.
- **ADR 0119 cites `release.yml:178-186`** for the `docker` job. At the pinned
  base that job is at **`:264-271`**. The file has grown from 186-ish to 272
  lines since 0119 was drafted.

### The write side that the group is protecting

The `release` job is not a read-only verification. In one run it:

- publishes to the npm registry and moves dist-tags (`changesets/action@v1` at
  `:70`, `publish: pnpm release` at `:72`, `version: pnpm run version` at `:89`,
  `NPM_CONFIG_PROVENANCE: true`);
- pushes git tags (via the same changesets action);
- writes `.harness/golden/manifest.json` and pushes it to `main`, or falls back
  to opening a branch, **self-approving it with a PAT** (`:184-190`) and merging
  it (`:219-224`, `:241-260`);
- calls `docker.yml` (`:264-271`), which pushes four images each tagged
  full / minor / major / **`latest`** (`docker.yml:83-92`).

`release.yml:163-169` states the invariant the group buys, in the workflow's own
words: the golden manifest step "is that file's ONLY writer, serialized by the
workflow-level Release concurrency group." That serialisation is load-bearing, not
incidental.

### The precedent set — release.yml is not the lone holdout

Splitting the group per-SHA was the right remedy in `#1865` (commit `7404cafe1`,
"stop merge bursts from cancelling main's verification"), `#1867`/`#2049`
(commit `4ce1d0e73`, the seven generated persona workflows) and `#2096`
(`76f23426e`, the scaffolded adopter workflow). Those all landed the conditional
shape:

| Workflow                                                                                                                                                                                                                                                                                     | Group                                                                                                              | `cancel-in-progress`                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `ci.yml:31-33`                                                                                                                                                                                                                                                                               | <code v-pre>${{ github.workflow }}-${{ github.event_name == 'pull_request' && github.ref \|\| github.sha }}</code> | <code v-pre>${{ github.event_name == 'pull_request' }}</code> |
| `harness.yml:27-29`                                                                                                                                                                                                                                                                          | `harness-<same expression>`                                                                                        | same                                                          |
| `persona-architecture-enforcer.yml:21-23`, `persona-codebase-health-analyst.yml:15-17`, `persona-documentation-maintainer.yml:19-21`, `persona-entropy-cleaner.yml:14-16`, `persona-graph-maintainer.yml:17-19`, `persona-performance-guardian.yml:18-20`, `persona-task-executor.yml:20-22` | same expression                                                                                                    | same                                                          |

Every one of those is a **verification** workflow triggered on _both_ `push:
[main]` and `pull_request`, where a per-ref group on the push arm destroys a
running verdict. `ci.yml:9-30` says so at length ("22 concluded `cancelled` …
these were not reruns, they were commits whose verification was destroyed").

There is a **second, equally established house pattern** that `release.yml`
belongs to — workflows that _write_ shared state and serialise with
`cancel-in-progress: false` and no per-SHA split:

| Workflow                             | Group                                                                          | What it serialises (workflow's own comment)                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `snapshot.yml:10-12`                 | `architecture-snapshot`                                                        | "Two runs both appending to the same `.harness/arch/timeline.json` would race … serialize them instead of cancelling" (`:7-9`) |
| `holiday-confidence-track.yml:46-48` | `holiday-confidence-track`                                                     | "Serialize commit-backs so two runs can never race the same append+push" (`:45`)                                               |
| `main-health.yml:47-49`              | `main-health`                                                                  | "a cancelled run could drop the green -> red notification … Serialize instead" (`:45-46`)                                      |
| `roadmap-auto-done.yml:43-45`        | <code v-pre>roadmap-auto-done-${{ github.event.pull_request.base.ref }}</code> | "`cancel-in-progress: false` is **mandatory** — an in-flight auto-done commit must NEVER be cancelled" (`:38-42`)              |
| `rollback-propose.yml:24-26`         | <code v-pre>rollback-propose-${{ github.ref }}</code>                          | —                                                                                                                              |
| `docker.yml:29-31`                   | <code v-pre>docker-${{ github.ref }}</code>                                    | —                                                                                                                              |

`release.yml` is the most write-heavy member of that second family. The reason it
still carries the un-split group is that it is in the _right_ family, not that it
was missed.

### Scope: four workflows this ADR does NOT govern

#2068's scope note named four hand-written workflows still on
<code v-pre>group: ${{ github.workflow }}-${{ github.ref }}</code> as unassessed. Their triggers
and `cancel-in-progress` values, read first-party at the pinned base:

| Workflow                        | Trigger                                             | `cancel-in-progress` |
| ------------------------------- | --------------------------------------------------- | -------------------- |
| `audit-exceptions.yml:17-19`    | `pull_request: branches: [main]` (`:13-15`)         | `true`               |
| `benchmark.yml:7-9`             | `pull_request: branches: [main]` (`:3-5`)           | `true`               |
| `openapi-drift-check.yml:12-14` | `pull_request: branches: [main]` + `paths` (`:3-9`) | `true`               |
| `pr-advisory-checks.yml:23-25`  | `pull_request: branches: [main]` (`:19-21`)         | `true`               |

**All four are pull-request-only with `cancel-in-progress: true`.** That is a
different and legitimate shape: on a PR, `github.ref` is the _PR's_ ref, so a
per-ref group is already per-PR, and cancelling in progress is exactly the
supersession behaviour wanted when a new commit is pushed to the same PR. It is
precisely the arm that `#1865` **kept** on `ci.yml` and `harness.yml`. None of
these four touches a registry, a tag, or a commit-back.

They are named here only to close the scope question, and **this ADR does not
govern them**: each would need its own trigger + `cancel-in-progress` reading
before any remedy, and none of them presents the fork this record answers.

## Decision

**Keep `release.yml`'s concurrency group exactly as it is — <code v-pre>group: ${{
github.workflow }}-${{ github.ref }}</code> with `cancel-in-progress: false` — and fix
the legibility problem instead, by recording in a comment at `release.yml:7-9`
that a `cancelled` conclusion on this workflow is expected group eviction and
must not be re-litigated as a defect.**

The behaviour is correct. Only its readability on the Actions board is at fault,
and the remedy for unreadable-but-correct behaviour is a comment, not a change to
the behaviour.

### This is a decision record, not an executed change

Accepting this ADR **authorizes the comment; it does not itself edit
`release.yml`**. No workflow file changes on acceptance. Writing the comment is a
downstream implementation item a human authorizes separately, exactly as ADR 0127
frames its own scope ("This is a decision record, not an executed migration").

### What the comment must say

The comment at `release.yml:7-9` must carry, at minimum, the four load-bearing
facts, so that a future reader or `cicd-fleet` sweep can settle the question
without re-deriving it:

1. **The group is per-ref on purpose, and `cancel-in-progress: false` is
   mandatory.** This is the publish path: one run at a time writes npm, git tags,
   `.harness/golden/manifest.json`, and container tags.
2. **A `cancelled` conclusion here means the run was evicted from the pending
   queue and never started** — check `jobs: 0` to confirm — not that a running
   verification was killed. No work is lost: each run checks out its own SHA,
   `changeset publish` consumes whatever changesets it finds, and the newest
   commit of a burst always survives.
3. **This is NOT the #1867 defect and the per-SHA remedy is wrong here.** #1865 /
   #1867 / #2049 fixed workflows with `cancel-in-progress: **true**` on a
   push+PR trigger. This workflow has `false` and no PR arm. Per-SHA would run N
   concurrent publish jobs.
4. **Cross-reference** to this ADR and to #2068 so the reasoning is recoverable.

The comment should follow the house form already established by `ci.yml:9-30` and
`harness.yml:9-26` — a block above the `concurrency:` key that opens with an
explicit "do not simplify this" and then states the measurement and the mechanism.
It is the mirror image of those comments: they say _split this_, this one says
_do not split this_, and both exist because the shape is non-obvious.

### Deliberately not decided here

Whether the _board-level_ signal should be improved by other means — a
`main-health`-style filter that excludes `cancelled` from Release's aggregate
colour, the way `scripts/main-health-check.mjs`'s `DECISIVE_CONCLUSIONS` already
excludes it for CI (noted at `ci.yml:22-24`) — is out of scope. This record
settles only the concurrency-group fork.

## Consequences

### Positive

- **The publish path keeps its serialisation.** One `release` run at a time
  continues to hold the npm publish, the tag push, the sole-writer guarantee on
  `.harness/golden/manifest.json` that `release.yml:163-169` explicitly depends
  on, the PAT self-approve + merge at `:184-190` / `:241-260`, and the `:latest`
  container tag write at `docker.yml:92`. Nothing is put at risk.
- **The plausible-looking wrong move is written down as wrong.** "Be consistent
  with #1867/#2049" is exactly what a future sweep will propose — one already
  was, which is why #2068 exists. The comment makes the next sweep's SELECT find
  the refutation before it spends a lane on it.
- **Lowest-risk option by construction.** A comment cannot break a release. Every
  other option on the table modifies the publish path or its trigger.
- **Cost is one comment.** No new triggers, no job-level guards, no second
  behavioural mode to keep correct in both states.

### Negative

- **The board stays noisy during merge bursts.** A `cancelled` run is still
  visually indistinguishable from a human abort or a real infrastructure cancel
  at a glance; only the comment (and `jobs: 0`) disambiguates, and that requires
  a reader who goes looking. _Mitigation:_ the re-measurement above shows the
  rate is burst-conditional and currently 3/30, so the ambiguity is occasional
  rather than the board's normal state. If it becomes standing, B2 is the
  recorded upgrade path.
- **A comment is not enforcement.** Nothing prevents a future automated sweep
  from proposing the per-SHA change anyway — a linter reading workflow files will
  not read the prose. _Mitigation:_ the same weakness applies to `ci.yml:9-30`
  and `harness.yml:9-26`, which have held; the house form is at least where a
  reader is trained to look.
- **The comment can rot.** If `release.yml` later gains a `pull_request` trigger
  or a second writer, the comment's reasoning becomes wrong while still reading
  as authoritative. _Mitigation:_ the revisit conditions below are stated as
  falsifiable triggers precisely so this is detectable rather than silent.
- **Line citations in this record will drift**, as #2068's `:160-176` and ADR
  0119's `:178-186` already did against this same file. Anchors are quoted inline
  so a reader can re-locate them by content.

### Neutral

- **Nothing changes on acceptance.** `release.yml` is byte-identical before and
  after; the decision is behaviour-neutral until the follow-up comment lands.
- **Reversibility is total.** Reversing means deleting a comment and applying the
  per-SHA expression — a two-line change, already written out in #2068 and in
  `ci.yml:31-33`. No migration, no state, no data.
- **`release.yml` becomes a documented member of the serialise-writers family**
  (`snapshot.yml`, `holiday-confidence-track.yml`, `main-health.yml`,
  `roadmap-auto-done.yml`, `rollback-propose.yml`, `docker.yml`) rather than an
  apparent straggler from the split-the-group family. The repo gains a stated
  rule — _verification workflows split per-SHA; state-writing workflows
  serialise per-ref_ — where it previously had two undocumented conventions.
- **The four PR-only workflows named in #2068's scope note are left exactly as
  they are**, having been read and found to be a different, correct shape.

### The falsifiable condition for revisiting this

This decision should be re-opened if **any** of the following is observed. Each
is checkable, not a matter of judgement:

1. **A burst is observed in which the newest commit's run did NOT survive.** The
   whole no-work-is-lost argument rests on the newest arrival never being evicted.
   One counterexample refutes the decision outright, and the correct response is
   B2, not B3.
2. **A cancelled `release.yml` run is found with `jobs > 0`.** That would mean a
   run _did_ start and was then killed, which `cancel-in-progress: false` is
   supposed to make impossible — either a GitHub semantics change or a
   misreading, and either way the eviction model no longer holds.
3. **`release.yml:9` is ever changed to `cancel-in-progress: true`**, or a
   `pull_request` arm is added to `:3-5`. Either makes this workflow the #1867
   shape, and the #1867 remedy becomes the right one.
4. **A changeset is shown to have been consumed by no run at all.** The
   "next run picks it up" claim would be false, and eviction would be losing work
   rather than deferring it.
5. **The eviction rate becomes standing rather than burst-conditional** — say,
   above 25% of the last 30 runs sustained across two consecutive ordinary
   (non-burst) measurement windows. At that point the board is unreadable as a
   normal condition and B2's machinery starts to earn its cost.

## Assumptions made

Every recommended-option default taken while drafting:

1. **The fork itself was not re-litigated.** The human chose B1 (accept and
   document) at CONFIRM before this draft began; B2 and B3 are recorded below as
   alternatives for the record only.
2. **The comment's required content is this ADR's own recommended default.** The
   human authorized "a comment at `release.yml:7-9`"; the four points it must
   carry, and the choice to mirror the `ci.yml:9-30` house form, are the drafter's
   proposal, not a ratified specification. Any comment carrying those four facts
   satisfies this decision.
3. **The comment is a follow-up implementation item, not part of acceptance.**
   Chosen so acceptance is behaviour-neutral, matching ADR 0127's scope
   discipline.
4. **Board-level signal filtering was scoped out** rather than folded in. It is a
   different mechanism against the same symptom and would make this a two-decision
   record.
5. **The revisit thresholds are drafter-chosen.** The 25%-across-two-windows
   figure in condition 5 is a stated tripwire, not a measured breakpoint; the
   other four conditions are binary and need no threshold.
6. **`number: 0130` is written 4-digit zero-padded**, per
   `docs/knowledge/decisions/README.md`'s numbering rule, all twenty preceding
   records (`0109`–`0128`), and `packages/cli/src/mcp/tools/adr-store.ts:33`
   ("`number` is the 4-digit zero-padded string"). The dispatch brief spelled it
   `130`; the store's `numericValue` accepts both, and house style was followed.
7. **`tier: small`** — the record authorizes one comment on one file and changes
   no behaviour.
8. **Advisor `discovery.md` / `analysis.md` / `proposal.md` artifacts were kept
   out of the commit**, per this lane's decision-record-only scope; the durable
   form of the analysis is this record.

## Alternatives Considered

### (B2) Keep the serialisation but stop generating evictable runs

Debounce trunk pushes so a merge burst enqueues one run rather than N. Two
sub-shapes were on the table: move the release to a `workflow_dispatch` or
scheduled trigger, or keep the `push` trigger and add a job-level guard that
exits 0 early with a `::notice::` when `github.sha` is not the current
`origin/main` tip, converting an eviction into an explicit green no-op.

**Why it is attractive.** It removes the noise _without_ weakening serialisation,
which is the only alternative here that does not trade safety for legibility. The
guard sub-shape in particular would make the intent self-evident on the board: a
green run annotated "superseded by a newer commit" is unambiguous in a way a
`cancelled` run is not.

**Why it was declined.** More moving parts on the one path that must not break.
The guard adds a new failure mode — a wrong tip comparison would skip a real
release rather than a redundant one — on a workflow that publishes to npm, and
the scheduled/dispatch sub-shape decouples publishing from merging entirely,
which is a larger change to how releases happen than the problem warrants. The
re-measurement in Context (3/30, not 18/30) further weakens the case: the
machinery would be paid for continuously to suppress noise that appears in
bursts. **Recorded as the upgrade path** — if revisit condition 1 or 5 fires, B2
is the correct next move, not B3.

### (B3) Per-SHA group, matching #1867 / #2049 for consistency

Adopt the conditional group already in `ci.yml:31-33` and `harness.yml:27-29`:
<code v-pre>group: ${{ github.workflow }}-${{ github.event_name == 'pull_request' &&
github.ref || github.sha }}</code>. Every main commit gets its own group, no run is
ever evicted, and the board goes clean.

**Explicitly rejected.** This is the single most important alternative to record,
because "be consistent with #1867/#2049" is the plausible-looking wrong move a
future sweep will propose — and already did, which is what produced #2068. The
consistency argument is false here: #1865/#1867/#2049 all fixed _verification_
workflows on a push+PR trigger with `cancel-in-progress: **true**`, where a per-ref
group destroyed a running verdict. `release.yml` has `false` and no PR arm. The
surface syntax matches; the mechanism does not.

Concretely, per-SHA would run **N concurrent `release` jobs** on an N-commit
burst, each of which:

- runs `changesets/action@v1` with `publish: pnpm release` (`release.yml:70-72`)
  — concurrent npm registry writes and dist-tag moves from trees at different
  SHAs, with no ordering guarantee about which one ends up as the tag;
- pushes git tags from the same action, concurrently;
- writes `.harness/golden/manifest.json` and pushes it to `main` (`:114-262`).
  The workflow's own comment at `:163-169` justifies its re-derive-on-new-tip
  logic on the explicit premise that this step "is that file's ONLY writer,
  serialized by the workflow-level Release concurrency group." **Per-SHA falsifies
  that premise**, which means it does not merely add a race — it invalidates a
  safety argument the file already relies on;
- runs the PAT self-approve + merge of the promotion PR (`:184-190`, `:219-224`,
  `:241-260`) — N concurrent self-approving merges into `main`.

**A further hazard neither #2068 nor ADR 0119 named, found in this analysis.**
`release.yml:264-271` calls `docker.yml`, whose own group is
<code v-pre>docker-${{ github.ref }}</code> with `cancel-in-progress: false`
(`docker.yml:29-31`). Under `workflow_call` the `github` context belongs to the
_caller_ — the property that caused the #1257 deadlock, documented at
`docker.yml:17-28` — so that expression evaluates to `docker-refs/heads/main`
for **every** caller regardless of the caller's own group. N concurrent Release
runs would therefore produce N `docker` calls all contending for **one**
downstream group with `cancel-in-progress: false`, which does not remove the
eviction — it relocates it into the container-publish path, where the evicted
thing is an image push rather than a queued run. And the legs that do execute
race on a mutable tag: every leg pushes <code v-pre>${{ matrix.image }}:latest</code>
(`docker.yml:83-92`), so `latest` would resolve to whichever concurrent run
finished last, not to the newest version. Serialising the publish path is not
incidental to this workflow; it is the point.

Rejected on the merits, not merely on the human's preference.

## References

- **#2068** — the parked decision fork this record answers ("`release.yml`
  concurrency: 18/30 runs cancelled by group eviction — the #1867 per-SHA remedy
  is likely WRONG for the publish path"). Its mechanism analysis is confirmed;
  its 18/30 rate is superseded by the 3/30 re-measurement in Context, and its
  `release.yml:160-176` citation is corrected to `:184-190` / `:219-224` /
  `:241-260`.
- **#1865** (commit `7404cafe1`, merge `93bc0788f`, branch
  `fix/ci-concurrency-supersession`) — "stop merge bursts from cancelling main's
  verification"; split `ci.yml` and `harness.yml` per-SHA on the push arm.
- **#1867 / #2049** (commit `4ce1d0e73`) — "stop generated persona workflows
  cancelling main's verification"; the same split across the seven generated
  `persona-*.yml`. The remedy this ADR declines to copy.
- **#2096** (commit `76f23426e`) — the same split applied to the scaffolded
  adopter workflow; establishes the pattern as the house default _for
  verification workflows_.
- **ADR 0119** (`docs/knowledge/decisions/0119-container-release-completeness.md`)
  — the one existing ADR touching `release.yml`. **It neither constrains nor
  conflicts with this decision:** it decides the container publish is a warn-only
  in-band step (`soft_fail`) and that backfill is latest-only, and says nothing
  about the concurrency group. It _interacts_ in one direction only — by keeping
  `docker` in-band under `needs: release`, it is what makes the B3 downstream
  hazard above reachable, since a per-SHA release group would fan out N in-band
  `docker.yml` calls. 0119's citation of the `docker` job as `release.yml:178-186`
  is stale; the job is at `:264-271` at this base.
- **ADR 0127**
  (`docs/knowledge/decisions/0127-retire-route-fleet-label-family.md`) — the
  decision-record-not-executed-change framing this record follows.
- `.github/workflows/release.yml:3-5, 7-9, 19, 41-42, 68-97, 114-262, 163-169,
184-190, 219-224, 241-260, 264-271` — trigger, concurrency group, jobs, the
  changesets publish, and the golden-build promotion machinery the group
  serialises.
- `.github/workflows/docker.yml:17-28, 29-31, 83-92` — the caller-context
  concurrency hazard, the literal-prefixed group, and the mutable `:latest` tag.
- `.github/workflows/ci.yml:9-30, 31-33` and `.github/workflows/harness.yml:9-26,
27-29` — the split-per-SHA precedent and the house comment form this decision's
  comment should mirror.
- `.github/workflows/snapshot.yml:7-12`,
  `.github/workflows/holiday-confidence-track.yml:45-48`,
  `.github/workflows/main-health.yml:45-49`,
  `.github/workflows/roadmap-auto-done.yml:38-45`,
  `.github/workflows/rollback-propose.yml:24-26` — the serialise-writers family
  `release.yml` belongs to.
- `.github/workflows/audit-exceptions.yml:13-15, 17-19`,
  `.github/workflows/benchmark.yml:3-5, 7-9`,
  `.github/workflows/openapi-drift-check.yml:3-9, 12-14`,
  `.github/workflows/pr-advisory-checks.yml:19-21, 23-25` — the four workflows
  #2068 scoped out, read here and confirmed to be PR-only with
  `cancel-in-progress: true`. **Not governed by this ADR.**
- Release runs `35893940894`, `35043806268`, `35043566350` (current window) and
  `34271753931`, `34271712964`, `34271676458` (from #2068) — all `cancelled`,
  all `jobs: 0`.
