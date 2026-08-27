# Plan: Cross-run claim lease — Phase 3 (Roll to the remaining ID-based members)

**Date:** 2026-08-26 | **Spec:** `docs/changes/fleet-cross-run-claim-lease/proposal.md` (§Implementation Order → Phase 3) | **Tasks:** 5 | **Checkpoints:** 0 | **Time:** ~22 min | **Integration Tier:** medium

## Goal

Mirror the already-canonical cross-run claim-lease wiring (defined in the family spine and proven in `roadmap-fleet`) into the other two ID-based members — `issue-fleet` and `pr-fleet` — so each drops live-leased items in SELECT, claims → heartbeats → releases in DISPATCH, and exposes `--lease-seconds` / `--no-claim`, then regenerate the plugin/gemini/antigravity bundles.

## Scope boundary (this phase only)

- **In scope:** prose wiring in `agents/skills/claude-code/issue-fleet/SKILL.md` and `agents/skills/claude-code/pr-fleet/SKILL.md` (SELECT drop + DISPATCH CLAIM→HEARTBEAT→RELEASE + Flags table + Harness Integration bullet, each **referencing** the spine, never restating it); the mirror/plugin/gemini/antigravity regeneration those edits require.
- **Out of scope:** any core/types code (Phase 1 shipped the primitive; Phase 2 shipped the SELECT-composition helper — **no code changes expected this phase**); the spine section itself (Phase 2); the family claim-lease **ADR**, `fleet-command` flag pass-through, and `AGENTS.md` pointer (Phase 4); `ideate-fleet`/`adr-fleet` and the area-based fleets (not ID-based — out of the whole feature's v1 scope).

## Prior-phase baseline (verified — build on, do not re-create)

Confirmed by reading the tree at HEAD (`6cd118597`):

- **Spine section exists.** `docs/reference/fleet-family.md` §"Cross-run claim lease (ID-based members)" (lines 93-114) is the canonical statement of the record format, the SELECT → CLAIM → HEARTBEAT → RELEASE lifecycle, server-`updated_at` staleness, the "open PR is the durable claim" rule, the "terminal non-`done` outcome with no PR **also releases the label**" rule, soft-reservation, the reclaim tiebreak, `gh`-degradation, and `--lease-seconds` / `--no-claim`. It ends: "Each ID-based member's `SKILL.md` **references this section** … rather than restating the mechanism." That is exactly the contract this phase honors.
- **Reference member is wired.** `roadmap-fleet/SKILL.md` shows the exact pattern to mirror: SELECT enumerate adds `--label fleet:claimed` + drops `claimed-elsewhere`/degrades (`SKILL.md:53,55`); DISPATCH has the "**Claim the item before building**" paragraph (`SKILL.md:131`); Flags table adds `--lease-seconds` / `--no-claim` (`SKILL.md:25-26`); Harness Integration adds the §Cross-run claim lease bullet (`SKILL.md:188`).
- **Core primitive is complete and pure.** `@harness-engineering/core` `fleet/claims` exports `buildClaimBody`/`parseClaimComment`/`isLeaseLive`/`classifyClaim`/`selectUnclaimed` + `CLAIM_LABEL`/`DEFAULT_LEASE_SECONDS`/`HEARTBEAT_SECONDS`; `@harness-engineering/types` exports `FleetClaim`. No new export is needed — these members are agent-driven prose; all `gh` I/O lives in the (agent-executed) skill layer, not a CLI arg parser.
- **Mirrors are symlinks.** `agents/skills/{cursor,codex,gemini-cli}/issue-fleet` and `…/pr-fleet` symlink to `../claude-code/<member>` (verified). Editing the `claude-code` `SKILL.md` updates all three automatically; only the generated Gemini `.toml`, the Antigravity `.toml`, and the plugin bundles need a regen. Generated command tomls exist for both members under `.gemini-extension/commands/` and `.antigravity-extension/commands/`.
- **Regen commands** (`package.json`): `pnpm generate:plugin` (all targets via `generate:plugin:all`), checked by `pnpm generate:plugin:check`; barrels checked by `pnpm generate:barrels:check`. Pre-commit enforces `generate:plugin:check`. Phase 2's regen commit (`6cd118597`) touched the `.antigravity-extension` (and gemini) tomls — same surface here.

## Observable Truths (Acceptance Criteria)

1. **OT1 (issue-fleet SELECT drop).** When `issue-fleet` SELECT enumerates the backlog, then it also fetches `--label fleet:claimed` issues and drops an issue carrying a **live lease written by another run** as `claimed-elsewhere` (a **stale** lease is ignored), referencing the spine. _Verify:_ read `issue-fleet/SKILL.md` Phase 1 + `harness skill validate issue-fleet`.
2. **OT2 (issue-fleet claim lifecycle + correct release point).** When an `issue-fleet` subagent begins triaging an issue, then the orchestrator claims it, heartbeats while triaging, and **releases the label when the issue's terminal triage outcome is reached** — its mutations applied (HANDOFF), or it parks/fails — since issue-fleet opens **no PR** (see Nuance A). _Verify:_ read Phase 3 + Phase 5 + `harness skill validate issue-fleet`.
3. **OT3 (pr-fleet SELECT drop).** When `pr-fleet` SELECT enumerates the open-PR queue, then it drops a PR carrying a **live lease written by another run** (another run already review-assisting) as `claimed-elsewhere`, referencing the spine. _Verify:_ read `pr-fleet/SKILL.md` Phase 1 + `harness skill validate pr-fleet`.
4. **OT4 (pr-fleet claim lifecycle + correct release point).** When a `pr-fleet` subagent begins review-assisting a PR, then the orchestrator claims the PR (posting the claim on the PR itself), heartbeats during review-assist, and **releases on terminal outcome — landed / parked / superseded / reported-not-land-ready** — because the "open PR is the durable claim" backstop is degenerate when the item **is** a PR (see Nuance B). _Verify:_ read Phase 3 + Phase 5 + `harness skill validate pr-fleet`.
5. **OT5 (flags).** Where a run passes `--lease-seconds <n>` or `--no-claim`, both members document the flag in their Flags table (mirroring `roadmap-fleet:25-26`). _Verify:_ read both Flags tables.
6. **OT6 (references, not restatement).** The system shall have each member's SELECT and DISPATCH point to `docs/reference/fleet-family.md` §Cross-run claim lease rather than restating the record format / TTL / reclaim tiebreak. _Verify:_ grep both files for the spine reference; confirm no duplicated record-format/TTL prose.
7. **OT7 (regen clean).** When the SKILL.md edits land, then `pnpm generate:plugin:check` and `pnpm generate:barrels:check` are both green and `git status` is clean. _Verify:_ run both checks + `git status`.

## Two release-point nuances (flagged per the brief — these are the crux of this phase)

- **Nuance A — issue-fleet: RELEASE is not "PR-open"; it is "triage terminal outcome".** issue-fleet's terminal act is a **routed queue**, not a PR — it opens no PR ever. So the spine's `RELEASE on PR-open` trigger does not apply. The correct release point is when the issue's triage work reaches a **terminal outcome**: its verified mutations are applied in HANDOFF (labels/route recorded, or duplicate closed), or the issue parks/fails. This is the spine's "a terminal non-`done` outcome with no PR **also releases the label**" rule — but for issue-fleet it is the **primary** (only) release path, not a fallback, because **every** issue-fleet outcome has no PR. The `fleet:claimed` label is removed at that point; the claim comment stays as an audit trail. Note also: heartbeat rarely fires in practice because triage completes in seconds, but the mechanism is kept for parity and for a slice that parks long.
- **Nuance B — pr-fleet: the "open PR is the durable claim" rule is degenerate; RELEASE is on terminal outcome.** For pr-fleet the work-item **is** an open PR, so the spine's backstop — "once the PR is open it becomes the durable claim" — already holds at SELECT and can never be the release trigger. The duplication this claim actually guards is the **review-assist worktree work** (two runs both running `harness-code-review` + pushing fixes on the same PR), not the merge (which is atomic in GitHub). So the claim is posted **on the PR itself** and released on the review-assist **terminal outcome**: landed (merged), parked, superseded/closed, or reported not-land-ready. Corollary honesty note: because every pr-fleet item is already an open PR, the spine's "degrade to open-PR-cross-check only" fallback provides **no** cross-run review-assist dedup for pr-fleet (open-PR cross-check is supersession detection here); under `--no-claim` or an unavailable claim-scan, pr-fleet has the same cross-run behavior as today. State this honestly in the degradation clause rather than implying a protection that does not exist.

## File Map

- MODIFY `agents/skills/claude-code/issue-fleet/SKILL.md` — SELECT drop + IssueCandidate field (Task 1); DISPATCH CLAIM→HEARTBEAT→RELEASE + HANDOFF release clause + Flags + Harness Integration (Task 2).
- MODIFY `agents/skills/claude-code/pr-fleet/SKILL.md` — SELECT drop + PrCandidate field (Task 3); DISPATCH CLAIM→HEARTBEAT→RELEASE + LAND release clause + Flags + Harness Integration (Task 4).
- MODIFY (generated, via regen — do not hand-edit) `.gemini-extension/commands/{issue-fleet,pr-fleet}.toml`, `.antigravity-extension/commands/{issue-fleet,pr-fleet}.toml`, and the plugin bundles (Task 5).
- (Symlink mirrors under `agents/skills/{cursor,codex,gemini-cli}/{issue-fleet,pr-fleet}` update automatically — no manual edit.)

## Uncertainties

- [ASSUMPTION] `harness skill validate <member>` validates SKILL.md structure/schema and does **not** require the flags to be wired into a CLI arg parser (confirmed by the spec: "no new CLI command"; the ID-based members are agent-driven, `gh` I/O in the skill layer). Mirrors Phase 2's verified assumption.
- [ASSUMPTION] No core/types change is needed this phase (the primitive + SELECT helper already exist). If, while wiring, a member needs a helper the core module does not expose, STOP and flag it — do not add prose that implies un-built code. (None expected.)
- [DEFERRABLE] Exact `gh` heartbeat-edit command wording — the mechanism is agent-executed; the skill states intent + cadence (`HEARTBEAT_SECONDS`), not a literal command line, exactly as `roadmap-fleet` does.

## Tasks

### Task 1: issue-fleet SELECT — drop live-leased issues + degradation

**Depends on:** none | **Files:** `agents/skills/claude-code/issue-fleet/SKILL.md` | **Owns:** `agents/skills/claude-code/issue-fleet/**`

1. In `## Process → ### Phase 1: SELECT`, **item 1** ("Enumerate the open-issue backlog"), append after the existing degradation sentence:

   > Additionally fetch issues carrying the `fleet:claimed` label and their claim comments — this piggybacks the same enumeration (no extra `gh` call). An issue carrying a **live claim lease written by another run** is dropped as **claimed-elsewhere** (a soft reservation — another run is already triaging it); a **stale** lease is ignored and the issue stays triageable. The claim record, staleness (server `updated_at`), and reclaim tiebreak are defined once in the **§Cross-run claim lease** section of `docs/reference/fleet-family.md` — do not restate them here. If the `fleet:claimed` scan is unavailable, **degrade to triaging without the cross-run drop** and log the degradation (issue-fleet already stops when `gh` auth is wholly absent — there is then no queue to triage).

2. In `### Phase 1` **item 5** (`IssueCandidate` record), add one field after `dedup`:

   ```
   claimedElsewhere,  // true when another run holds a live claim lease (§Cross-run claim lease); dropped from triage
   ```

3. Verify: `( cd /Users/cwarner/Projects/iv/_wt/fleet-concurrency-dedup && node packages/cli/dist/bin/harness.js skill validate issue-fleet )` — passes.
4. Verify: `( cd /Users/cwarner/Projects/iv/_wt/fleet-concurrency-dedup && node packages/cli/dist/bin/harness.js validate )` — passes.
5. Commit: `feat(issue-fleet): drop live-leased issues in SELECT (cross-run claim lease)`

### Task 2: issue-fleet DISPATCH/HANDOFF — CLAIM→HEARTBEAT→RELEASE (terminal-outcome release) + flags

**Depends on:** Task 1 | **Files:** `agents/skills/claude-code/issue-fleet/SKILL.md` | **Owns:** `agents/skills/claude-code/issue-fleet/**`

Implements **Nuance A** (release at triage terminal outcome, not PR-open).

1. In `### Phase 3: DISPATCH`, immediately after the **"Worker handoff — return the canonical `FleetHandoffRecord`"** paragraph, add a new paragraph:

   > **Claim the issue before triaging — cross-run claim lease (CLAIM → HEARTBEAT → RELEASE).** On entering DISPATCH for an issue, the orchestrator takes the issue's cross-run claim so a concurrent run on another clone auto-partitions around it: add the `fleet:claimed` label and post the claim comment on the issue, then **re-read** — if a competing live claim appeared since SELECT, **yield this issue** (soft reservation) and continue the batch. While the slice triages, the orchestrator **heartbeats** the claim (edits the comment every `HEARTBEAT_SECONDS`) so a long-running slice is not mistaken for a dead one; because triage typically completes in seconds the heartbeat rarely fires, but it is kept for parity and for a slice that parks. **issue-fleet opens no PR, so the spine's `RELEASE on PR-open` does not apply: the claim releases when the issue reaches its terminal triage outcome** — its verified mutations are applied in HANDOFF (labels/route recorded, or the duplicate closed), or it parks/fails. This is the spine's "a terminal non-`done` outcome with no PR also releases the label" rule, which for issue-fleet is the primary release path. On release the `fleet:claimed` label is removed; the claim comment stays as an audit trail. Under `--no-claim` this whole step is skipped. The record format, TTL/staleness semantics, and the reclaim tiebreak are stated once in the **§Cross-run claim lease** section of `docs/reference/fleet-family.md` — this member references them, it does not restate them.

2. In `### Phase 5: HANDOFF + REPORT`, **item 2** ("Close only the authorized + verified duplicates"), append a sentence:

   > As each issue reaches its terminal outcome here (mutations applied, or closed as a duplicate), **release its cross-run claim** — remove the `fleet:claimed` label, leaving the claim comment as an audit trail (see §Cross-run claim lease); a parked/failed issue releases the label too, so nothing is stranded.

3. In `## Flags`, add two rows (mirroring `roadmap-fleet`):

   ```
   | `--lease-seconds` | Override the cross-run claim-lease TTL (default 720s); see §Cross-run claim lease in `docs/reference/fleet-family.md` |
   | `--no-claim`      | Disable the cross-run claim lease entirely — fall back to today's no-cross-run-coordination triage                     |
   ```

4. In `## Harness Integration`, add a bullet after the `docs/reference/fleet-family.md` bullet:

   > - **§Cross-run claim lease (`docs/reference/fleet-family.md`) + `@harness-engineering/core` (`fleet/claims`)** — The canonical cross-run coordination mechanism this member consumes in SELECT (drop live-leased issues) and DISPATCH (CLAIM → HEARTBEAT → RELEASE, released at the triage terminal outcome since issue-fleet opens no PR); the pure `buildClaimBody`/`parseClaimComment`/`isLeaseLive` primitives live in core, all `gh` I/O in this (agent-executed) skill layer.

5. Verify: `( cd /Users/cwarner/Projects/iv/_wt/fleet-concurrency-dedup && node packages/cli/dist/bin/harness.js skill validate issue-fleet )` — passes.
6. Verify: `( cd /Users/cwarner/Projects/iv/_wt/fleet-concurrency-dedup && node packages/cli/dist/bin/harness.js validate )` — passes.
7. Commit: `feat(issue-fleet): claim/heartbeat/release lifecycle + lease flags`

### Task 3: pr-fleet SELECT — drop live-leased PRs + honest degradation

**Depends on:** none | **Files:** `agents/skills/claude-code/pr-fleet/SKILL.md` | **Owns:** `agents/skills/claude-code/pr-fleet/**`

Runs in parallel with Tasks 1-2 (different file).

1. In `### Phase 1: SELECT`, **item 1** ("Enumerate the open-PR queue"), append after the existing degradation sentence:

   > Additionally fetch PRs carrying the `fleet:claimed` label and their claim comments (piggybacks the same enumeration). A PR carrying a **live claim lease written by another run** — meaning another run is already review-assisting it — is dropped as **claimed-elsewhere** (a soft reservation); a **stale** lease is ignored and the PR stays landable. The claim record, staleness (server `updated_at`), and reclaim tiebreak are defined once in the **§Cross-run claim lease** section of `docs/reference/fleet-family.md` — do not restate them here. **Degradation note:** because every pr-fleet item is itself an open PR, the spine's "open PR is the durable claim" backstop does not distinguish concurrent runs; if the `fleet:claimed` scan is unavailable (or under `--no-claim`), pr-fleet has **no** cross-run review-assist dedup and behaves as today — log the degradation, never abort.

2. In `### Phase 1` **item 6** (`PrCandidate` record), add one field after `bucket`:

   ```
   claimedElsewhere,  // true when another run holds a live claim lease on this PR (§Cross-run claim lease); dropped from the batch
   ```

3. Verify: `( cd /Users/cwarner/Projects/iv/_wt/fleet-concurrency-dedup && node packages/cli/dist/bin/harness.js skill validate pr-fleet )` — passes.
4. Verify: `( cd /Users/cwarner/Projects/iv/_wt/fleet-concurrency-dedup && node packages/cli/dist/bin/harness.js validate )` — passes.
5. Commit: `feat(pr-fleet): drop live-leased PRs in SELECT (cross-run claim lease)`

### Task 4: pr-fleet DISPATCH/LAND — CLAIM→HEARTBEAT→RELEASE (terminal-outcome release) + flags

**Depends on:** Task 3 | **Files:** `agents/skills/claude-code/pr-fleet/SKILL.md` | **Owns:** `agents/skills/claude-code/pr-fleet/**`

Implements **Nuance B** (claim guards review-assist, not the atomic merge; "open PR is the durable claim" is degenerate → release on terminal outcome).

1. In `### Phase 3: DISPATCH`, immediately after the **"Worker handoff — return the canonical `FleetHandoffRecord`"** paragraph, add a new paragraph:

   > **Claim the PR before review-assisting — cross-run claim lease (CLAIM → HEARTBEAT → RELEASE).** The item here **is** an open PR, so the spine's "open PR is the durable claim" rule is degenerate — the duplication this claim guards is the **review-assist worktree work** (running `harness-code-review` + pushing mechanical fixes + re-running CI), not the merge (atomic in GitHub). On entering DISPATCH for a PR that needs assist/heal, the orchestrator posts the claim **on the PR itself** (add the `fleet:claimed` label + the claim comment), then **re-reads** — if a competing live claim appeared since SELECT, **yield this PR** (soft reservation) and continue the batch. While the subagent review-assists, the orchestrator **heartbeats** the claim every `HEARTBEAT_SECONDS` so a live-but-slow assist is not mistaken for a dead one. Because the durable-claim backstop cannot be the release trigger, the claim **releases on the review-assist terminal outcome — landed, parked, superseded/closed, or reported not-land-ready** — removing the `fleet:claimed` label (the comment stays as an audit trail). `land-ready` PRs that skip assist take and release the claim trivially. Under `--no-claim` this step is skipped. The record format, TTL/staleness semantics, and the reclaim tiebreak are stated once in the **§Cross-run claim lease** section of `docs/reference/fleet-family.md` — this member references them, it does not restate them.

2. In `### Phase 5: LAND + REPORT`, **item 1** ("Land only the approved + verified PRs"), append a sentence:

   > As each PR reaches its terminal outcome (landed, parked, reported not-land-ready, or closed as superseded), **release its cross-run claim** — remove the `fleet:claimed` label, leaving the claim comment as an audit trail (see §Cross-run claim lease).

3. In `## Flags`, add two rows:

   ```
   | `--lease-seconds` | Override the cross-run claim-lease TTL (default 720s); see §Cross-run claim lease in `docs/reference/fleet-family.md` |
   | `--no-claim`      | Disable the cross-run claim lease entirely — pr-fleet then has no cross-run review-assist dedup (today's behavior)     |
   ```

4. In `## Harness Integration`, add a bullet after the `docs/reference/fleet-family.md` bullet:

   > - **§Cross-run claim lease (`docs/reference/fleet-family.md`) + `@harness-engineering/core` (`fleet/claims`)** — The canonical cross-run coordination mechanism this member consumes in SELECT (drop live-leased PRs) and DISPATCH (CLAIM → HEARTBEAT → RELEASE on the PR itself, released at the review-assist terminal outcome — the claim guards the review-assist work, not the atomic merge); the pure primitives live in core, all `gh` I/O in this (agent-executed) skill layer.

5. Verify: `( cd /Users/cwarner/Projects/iv/_wt/fleet-concurrency-dedup && node packages/cli/dist/bin/harness.js skill validate pr-fleet )` — passes.
6. Verify: `( cd /Users/cwarner/Projects/iv/_wt/fleet-concurrency-dedup && node packages/cli/dist/bin/harness.js validate )` — passes.
7. Commit: `feat(pr-fleet): claim/heartbeat/release lifecycle + lease flags`

### Task 5: Regenerate mirrors/plugin/gemini/antigravity bundles + confirm checks green

**Depends on:** Task 2, Task 4 | **Files:** `.gemini-extension/commands/{issue-fleet,pr-fleet}.toml`, `.antigravity-extension/commands/{issue-fleet,pr-fleet}.toml`, plugin bundles (all generated) | **Category:** integration

1. Regenerate all targets: `( cd /Users/cwarner/Projects/iv/_wt/fleet-concurrency-dedup && pnpm generate:plugin:all )`
2. Confirm plugin drift-free: `( cd /Users/cwarner/Projects/iv/_wt/fleet-concurrency-dedup && pnpm generate:plugin:check )` — green (pre-commit enforces this).
3. Confirm barrels drift-free (no core edits this phase, so expected clean): `( cd /Users/cwarner/Projects/iv/_wt/fleet-concurrency-dedup && pnpm generate:barrels:check )` — green.
4. Confirm the tree is clean after staging generated files: `( cd /Users/cwarner/Projects/iv/_wt/fleet-concurrency-dedup && git status --porcelain )` shows only the regenerated command tomls / plugin bundles.
5. Verify: `( cd /Users/cwarner/Projects/iv/_wt/fleet-concurrency-dedup && node packages/cli/dist/bin/harness.js validate )` — passes.
6. Commit: `chore(plugin): regenerate issue-fleet + pr-fleet mirrors + gemini/antigravity toml for claim-lease`

## Sequencing & parallelism

- Tasks 1→2 (issue-fleet, same file, ordered) and Tasks 3→4 (pr-fleet, same file, ordered) are two independent chains touching disjoint files — the chains may run in parallel.
- Task 5 depends on the SKILL.md prose from Tasks 2 and 4 being final (it regenerates from them).

## Validation checklist (Phase 4 of planning)

- Every observable truth traces to a task: OT1→T1, OT2→T2, OT3→T3, OT4→T4, OT5→T2/T4, OT6→T1-4, OT7→T5.
- Every task is one file (or generated-only) and completable in one context window.
- No TDD code tasks — these are skill-doc prose edits; the analogue of "test-first" is `harness skill validate <member>` + `harness validate` in every task, mirroring Phase 2's member tasks.
- No core/types changes (baseline confirms the primitive exists); if any surface as needed during execution, STOP and flag — do not write prose implying un-built code.
- `harness validate` passes before this plan was written and is a step in every task.
- The two release-point nuances (A, B) are stated explicitly and drive Tasks 2 and 4.
