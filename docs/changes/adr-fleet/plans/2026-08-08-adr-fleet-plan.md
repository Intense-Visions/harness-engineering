# Plan: adr-fleet skill

**Date:** 2026-08-08 · **Spec:** `docs/changes/adr-fleet/proposal.md` · **Tasks:** 19 · **Time:** ~90 min · **Integration Tier:** large

## Goal

Author the `adr-fleet` claude-code rigid orchestrator skill (`SKILL.md` + `skill.yaml`) — the **decide** stage of the `-fleet` family conveyor — that sweeps a backlog of pending architectural decisions, fans out worktree-isolated subagents that each run the **real** `harness-architecture-advisor` pipeline to draft one ADR under `docs/knowledge/decisions/NNNN-<slug>.md` at `status: proposed`, independently verifies each drafted ADR is a well-formed record (never a subagent self-report) on a CI-green branch, and hands the human **one batch sign-off pass** that flips only explicitly-accepted ADRs `proposed` → `accepted`. It **never auto-accepts**. Add the decide-stage batch-sign-off-gate ADR (0090), the three platform symlinks, a one-line reference-addition to the shared `-fleet` spine, and regenerated docs/plugin artifacts.

## Observable Truths (Acceptance Criteria)

1. `harness skill validate adr-fleet` exits 0 (all required behavioral + rigid sections present, `name` matches directory, referenced tools/deps exist, domain-specific `## Rationalizations to Reject` parity passes). **Gate:** `harness skill validate adr-fleet`.
2. `agents/skills/claude-code/adr-fleet/SKILL.md` contains, in order: `# heading` + `> summary`, `## When to Use` (positive + negative bullets), `## Flags`, `## Process` with `### Iron Law` and five named phases (SELECT, CONFIRM, DISPATCH, VERIFY, SIGN-OFF + REPORT), `## Harness Integration`, `## Success Criteria`, `## Gates`, `## Escalation`, `## Rationalizations to Reject`, `## Red Flags`, `## Examples`, `## Test Scenarios`. **Gate:** `harness skill validate adr-fleet` required-section check.
3. The `## Rationalizations to Reject` section is domain-specific (3–8 entries, none of the three universal filler rows). **Gate:** `harness skill validate adr-fleet` Rationalizations-parity check.
4. The SKILL.md and skill.yaml bodies contain zero internal roadmap/PR/issue numbers (they ship to adopter projects); the spine doc and ADRs are cited by name/title only (e.g. "the decide-stage batch-sign-off ADR", not "ADR 0090"). **Gate:** `grep -nE '#[0-9]{3,}|ADR [0-9]{4}|issue [0-9]+' agents/skills/claude-code/adr-fleet/{SKILL.md,skill.yaml}` returns no matches.
5. `agents/skills/{codex,cursor,gemini-cli}/adr-fleet` each resolve as symlinks to `../claude-code/adr-fleet`. **Gate:** `test -L … && readlink …` for each of the three.
6. `docs/reference/fleet-family.md` cross-references the new decide-stage ADR in its References list (the spine already anticipates `adr-fleet` in its conveyor and Members table — no member-row edit needed), and `adr-fleet` SKILL.md cites the spine doc by path. **Gate:** `grep` for the ADR title in `fleet-family.md` References + `grep -n 'docs/reference/fleet-family.md' SKILL.md`.
7. `docs/reference/skills-catalog.md` is regenerated and lists `adr-fleet`. **Gate:** `pnpm run generate-docs` leaves no diff on a second run, and `grep -n 'adr-fleet' docs/reference/skills-catalog.md` matches.
8. One ADR exists: `docs/knowledge/decisions/0090-adr-fleet-decide-stage-batch-signoff.md`, with the repo ADR frontmatter (`number: 0090`, `title`, `date`, `status: accepted`, `tier: large`, `source`) + `## Context` / `## Decision` / `## Consequences` / `## Alternatives Considered` / `## References`, and it records **where the accept authority sits for the decide stage** (fleet drafts `proposed`, executes a single up-front human sign-off, never auto-accepts). **Gate:** file exists; frontmatter + required sections present; ADR-README convention satisfied.
9. The ADR `proposed` status is documented so a drafted-but-unaccepted ADR is not a vocabulary violation — `docs/knowledge/decisions/README.md` Status-Values table includes a `proposed` row (contingent on the PARKED default below being confirmed). **Gate:** `grep -n 'proposed' docs/knowledge/decisions/README.md`.
10. `harness skill validate` (whole-suite) still exits 0 — no regression across the other skills. **Gate:** `harness skill validate`.
11. `pnpm format:check` (or `prettier --check`) reports no formatting diffs for the created/edited files. **Gate:** `pnpm format:check`.
12. Generated plugin artifacts (`.claude-plugin/`, `.cursor-plugin/`, `.gemini-extension/`, `.antigravity-extension/`) include an `adr-fleet` slash command. **Gate:** `harness generate` leaves no diff on a second run, and the command file exists under each plugin dir.

## Uncertainties

- [ASSUMPTION] Platform skill-source dirs are exactly `codex`, `cursor`, `gemini-cli` (matches `pr-fleet` / `roadmap-fleet`); `antigravity` is a plugin-generation target, not a skill symlink source.
- [ASSUMPTION] Next free ADR number is 0090 (highest existing is 0089). If a concurrent branch claims it, renumber per the ADR-README convention (never reuse a number).
- [ASSUMPTION] `harness skill run adr-fleet` requires no new MCP tool in v1 — it orchestrates existing skills/tools + `gh` + the ADR convention (per spec Integration Points → Entry Points). `depends_on` is `harness-roadmap-pilot` (impact scoring) + `harness-architecture-advisor` (per-item decide pipeline).
- [PARKED] **Draft-location / status-vocabulary fork.** Draft ADR lives in the canonical `docs/knowledge/decisions/` with a new `proposed` status **vs** a staging directory promoted (moved into the canonical dir) only on sign-off. **Recommended default: proposed-status-in-canonical-dir** — it makes the batch reviewable as ordinary ADR diffs and matches Decision 4. This plan proceeds on that default; Tasks 6–8 (DISPATCH/VERIFY/SIGN-OFF prose) write/verify to the canonical dir at `status: proposed`, and Task 17 adds the `proposed` row to the ADR-README vocabulary. **If the human instead picks a staging dir:** revise Tasks 6–8 to write to / promote from the staging path and drop Task 17's README `proposed` row (the canonical dir would only ever hold `accepted`). This is a `[checkpoint:decision]` surfaced at Task 4.
- [PARKED] **Deeper seat of the decide-stage sign-off gate.** Per-ADR accept/reject in one pass (settled default, per Decision 5) vs a single all-or-nothing batch acceptance, and whether a post-verify second touchpoint is ever warranted. The deeper gate-seat question is **recorded in the decide-stage ADR itself (Task 16, ADR 0090)** — that ADR is where this fork is resolved and its alternatives documented, not the SKILL.md prose.
- [DEFERRABLE] Exact wording of per-phase prose, the `DecisionCandidate` field names, and example transcripts — finalized during authoring; does not change task structure.

## File Map

- CREATE `agents/skills/claude-code/adr-fleet/skill.yaml`
- CREATE `agents/skills/claude-code/adr-fleet/SKILL.md`
- CREATE `agents/skills/codex/adr-fleet` (symlink → `../claude-code/adr-fleet`)
- CREATE `agents/skills/cursor/adr-fleet` (symlink → `../claude-code/adr-fleet`)
- CREATE `agents/skills/gemini-cli/adr-fleet` (symlink → `../claude-code/adr-fleet`)
- CREATE `docs/knowledge/decisions/0090-adr-fleet-decide-stage-batch-signoff.md`
- MODIFY `docs/reference/fleet-family.md` (one-line reference-addition: the decide-stage ADR in the References list; the Members table + conveyor already name `adr-fleet`)
- MODIFY `docs/knowledge/decisions/README.md` (add a `proposed` row to the Status-Values table — contingent on the PARKED default; see Task 17)
- MODIFY `docs/reference/skills-catalog.md` (regenerated via `pnpm run generate-docs` — do not hand-edit)
- MODIFY generated plugin artifacts (`.claude-plugin/`, `.cursor-plugin/`, `.gemini-extension/`, `.antigravity-extension/`) via `harness generate` (do not hand-edit)

## Skeleton

Mirrors the spec's 4-phase Implementation Order, bracketed by foundation and registration/regen groups.

1. **Foundation** — skill dir, `skill.yaml`, SKILL heading + summary + When to Use + Flags + Process/Iron-Law/phase-table/spine-citation (~3 tasks, ~16 min)
2. **Phase 1 — SELECT + CONFIRM prose** — three-source pending-decision enumeration + existing-ADR cross-check + impact ordering + ADR-number pre-allocation + `DecisionCandidate` record; single-round CONFIRM carrying fork answers, batch approval, concurrency (~2 tasks, ~14 min) `[checkpoint:decision at Task 4]`
3. **Phase 2 — DISPATCH prose** — worktree advisor-drafting fan-out (run `harness-architecture-advisor`, draft to canonical dir at `status: proposed`, feed fork answers + allocated number), governor, fork-parking, assumptions-made note, push caveat (~1 task, ~7 min)
4. **Phase 3 — VERIFY + SIGN-OFF + REPORT prose** — independent well-formed-ADR artifact verification + all-OS CI; batch sign-off pass with human-authorized `proposed`→`accepted` flip; batch report; already-decided closure (~2 tasks, ~14 min)
5. **Discipline sections** — Harness Integration, Success Criteria, Gates, Escalation, domain-specific Rationalizations, Red Flags, Examples, Test Scenarios (~4 tasks, ~20 min)
6. **Registration + regen** — `harness skill validate adr-fleet` green, three platform symlinks, plugin/slash-command regen (`harness generate`), catalog regen (`pnpm run generate-docs`) (~4 tasks, ~12 min)
7. **ADR + status-vocab + final sweep** — decide-stage ADR 0090, ADR-README `proposed` row, whole-suite validate + `format:check` sweep (~3 tasks, ~7 min)

**Estimated total:** 19 tasks, ~90 minutes.

## Tasks

### Task 1: Create skill dir + `skill.yaml`

**Depends on:** none | **Files:** `agents/skills/claude-code/adr-fleet/skill.yaml` | **Owns:** `agents/skills/claude-code/adr-fleet/**`

1. Create `agents/skills/claude-code/adr-fleet/skill.yaml` modeled on `pr-fleet`'s `skill.yaml`: `name: adr-fleet`; `version: '1.0.0'`; a `description` naming the decide stage (draft ADRs via the real architecture-advisor, verify each is a well-formed record, one batch sign-off, never auto-accepts); `stability: static`; `cognitive_mode: systematic-orchestrator`; `triggers: [manual]`; `platforms: [claude-code, codex, cursor, gemini-cli]`; `tools: [Bash, Read, Glob, Grep]`; `cli.command: harness skill run adr-fleet` with args `path`, `--concurrency`, `--report-only`, `--dry-run`; `mcp.tool: run_skill` (input `{skill: adr-fleet, path: string}`); `type: rigid`; `tier: 2`; five `phases` (select, confirm, dispatch, verify, signoff) each with a decide-stage `description` + `required: true`; `state: {persistent: false, files: []}`; `depends_on: [harness-roadmap-pilot, harness-architecture-advisor]`; `addresses` signals; `capabilities` (tools, `network: false`, `filesystem: read-write`).
2. **Acceptance gate:** `harness skill validate adr-fleet` no longer reports a `skill.yaml` schema error (it will still report the missing `SKILL.md` — expected at this stage). No internal issue/PR numbers in the yaml.
3. Commit: `feat(adr-fleet): scaffold skill.yaml`

### Task 2: SKILL.md heading + summary + When to Use + Flags

**Depends on:** Task 1 | **Files:** `agents/skills/claude-code/adr-fleet/SKILL.md`

1. Create `SKILL.md` with `# ADR Fleet` heading and a `>` summary (decide stage; drafts ADRs via the real advisor, verifies each is a well-formed record, one batch sign-off, never auto-accepts, never trusts a self-report).
2. Add `## When to Use` — positive bullets (a backlog of pending architectural decisions; undocumented decision points in specs; decision-blocked work; parked forks never written up; one bulk sign-off instead of per-decision babysitting) and negative bullets (NOT for a single decision — just run the advisor; NOT for building the decision the ADR records — that is downstream build; NOT for a genuinely-contested trade-off the fleet would have to guess — it parks and reports; NOT a convergence pipeline looping on one target).
3. Add `## Flags` table: `--concurrency` (default 2, max ~3 machine-storm cap), `--report-only` (enumerate + rank the pending-decision batch, no dispatch/sign-off), `--dry-run` (SELECT + CONFIRM only).
4. **Acceptance gate:** headings render; `harness skill validate adr-fleet` shows these sections satisfied (remaining errors point only to not-yet-written sections). No internal numbers.
5. Commit: `feat(adr-fleet): SKILL heading, When to Use, Flags`

### Task 3: Process — Iron Law + five-phase diagram + phase table + spine citation

**Depends on:** Task 2 | **Files:** `agents/skills/claude-code/adr-fleet/SKILL.md`

1. Add `## Process` with `### Iron Law`: an ADR is flipped to `accepted` only after the human explicitly signed it off AND independent verification confirmed it is a well-formed record on a CI-green branch; the fleet never auto-accepts and never trusts a subagent self-report.
2. Add the five-phase ASCII diagram (SELECT → CONFIRM → DISPATCH, then VERIFY → SIGN-OFF + REPORT) mirroring the spine, and a phase/purpose/exit-condition table.
3. Add the spine-citation paragraph: the five-phase spine, concurrency governor, artifact + all-OS-CI verification, worktree fan-out + push caveat, and never-silent invariant are family-shared and stated once in `docs/reference/fleet-family.md`; this skill states only the decide-stage specifics (pending-decision queue, advisor-drafting, human sign-off gate). Cite the spine by path.
4. **Acceptance gate:** `harness skill validate adr-fleet` shows `## Process` + Iron Law present; `grep -n 'docs/reference/fleet-family.md' SKILL.md` matches. No internal numbers.
5. Commit: `feat(adr-fleet): Process, Iron Law, phase spine`

### Task 4: Phase 1 SELECT prose + `DecisionCandidate` record `[checkpoint:decision]`

**Depends on:** Task 3 | **Files:** `agents/skills/claude-code/adr-fleet/SKILL.md`

1. `[checkpoint:decision]` — before authoring DISPATCH/VERIFY prose, confirm the PARKED draft-location fork with the human (proposed-status-in-canonical-dir vs staging dir). Proceed on the recommended default (canonical dir, `status: proposed`) unless the human chooses otherwise; if staging is chosen, revise Tasks 6–8 and drop Task 17 per the Uncertainties note.
2. Write `### Phase 1: SELECT` prose: enumerate the pending-decision queue from the three sources — (a) undocumented decision points (`docs/changes/*/proposal.md` "Decisions made"/"Architectural Decisions" naming a decision with no matching ADR), (b) decision-blocked work (open issues/roadmap items tagged needs-adr or referencing a not-yet-existing ADR number), (c) parked forks from prior fleet REPORT rows never written up. Cross-check each candidate against existing ADRs in `docs/knowledge/decisions/` — an already-decided point is flagged resolved, not re-drafted. Score/order via `harness-roadmap-pilot`-style impact scoring (not ad-hoc). Pre-allocate a contiguous block of sequential ADR numbers (one per candidate) to avoid the scan-and-increment collision when N subagents draft concurrently.
3. Add the `DecisionCandidate` record block: `source` (`undocumented-decision-point` | `decision-blocked-work` | `parked-fork`), `id`, `title`, `score`, `crossCheck` (`novel` | `already-decided`), `existingAdr`, `allocatedAdrNumber`, `forks`, `assumptionsMade`, `parkedForks`, `draftStatus` (`proposed` | `accepted` | `rejected`).
4. **Acceptance gate:** `harness skill validate adr-fleet` shows the SELECT phase present; prose names all three sources, cross-check, scoring, and number pre-allocation. No internal numbers.
5. Commit: `feat(adr-fleet): Phase 1 SELECT + DecisionCandidate`

### Task 5: Phase 2 CONFIRM prose `[checkpoint:human-verify]`

**Depends on:** Task 4 | **Files:** `agents/skills/claude-code/adr-fleet/SKILL.md`

1. Write `### Phase 2: CONFIRM` prose: the single guaranteed up-front human round presents, in one surface — the ranked pending-decision batch with scores; already-decided points flagged for closure; each decision's key trade-off question (the advisor's DISCOVER question) as a multiple-choice fork with a recommended default; and the proposed concurrency. The human approves/trims the batch, answers the forks, and sets concurrency. Mark the phase `[checkpoint:human-verify]`. State that from here it is autonomous except a genuinely-unforeseen fork that parks a single item; under `--dry-run` the skill stops here.
2. **Acceptance gate:** `harness skill validate adr-fleet` shows the CONFIRM phase present; prose contains the `[checkpoint:human-verify]` marker and the fork/approval/concurrency triad. No internal numbers.
3. Commit: `feat(adr-fleet): Phase 2 CONFIRM`

### Task 6: Phase 3 DISPATCH prose

**Depends on:** Task 5 | **Files:** `agents/skills/claude-code/adr-fleet/SKILL.md`

1. Write `### Phase 3: DISPATCH` prose: one worktree-isolated subagent per confirmed decision, briefed to run the **real** `harness-architecture-advisor` (ANALYZE → PROPOSE → DOCUMENT), fed the CONFIRM fork answers and its pre-allocated ADR number, drafting `docs/knowledge/decisions/NNNN-<slug>.md` at `status: proposed` (the never-auto-accept marker). The subagent drafts, it never accepts. Cap concurrency at the governor (default 2, max ~3). A genuinely-**unforeseen** question (not surfaced in CONFIRM, whose answer materially changes the decision) **parks that one item and reports it**; the batch continues. Record an "assumptions made" note per item. Add the push-path caveat (a `.claude/`-nested worktree self-excludes the pre-push `check-docs` gate → push via the GitHub API or a non-`.claude` worktree; never `--no-verify`).
2. **Acceptance gate:** `harness skill validate adr-fleet` shows the DISPATCH phase present; prose names the real advisor, the `status: proposed` draft, the governor, fork-parking, assumptions note, and push caveat. No internal numbers.
3. Commit: `feat(adr-fleet): Phase 3 DISPATCH`

### Task 7: Phase 4 VERIFY prose

**Depends on:** Task 6 | **Files:** `agents/skills/claude-code/adr-fleet/SKILL.md`

1. Write `### Phase 4: VERIFY` prose: for each returned drafted ADR, independently confirm — never by subagent self-report — that a well-formed ADR file exists on the branch (required frontmatter with a unique sequential number and `status: proposed`, plus `## Context` / `## Decision` / `## Consequences`), and that the pushed branch's CI is green on all three OS plus the project's required checks. A missing/malformed draft means the advisor pipeline did not run as required → reject or retry (at most once), never sign-off-ready. Classify each as `sign-off-ready` / `not-ready` / `retry`.
2. **Acceptance gate:** `harness skill validate adr-fleet` shows the VERIFY phase present; prose states independent artifact check (frontmatter + sections + `status: proposed`) + all-OS CI, and the never-self-report rule. No internal numbers.
3. Commit: `feat(adr-fleet): Phase 4 VERIFY`

### Task 8: Phase 5 SIGN-OFF + REPORT prose

**Depends on:** Task 7 | **Files:** `agents/skills/claude-code/adr-fleet/SKILL.md`

1. Write `### Phase 5: SIGN-OFF + REPORT` prose: present every verified drafted ADR to the human in **one** batch pass `[checkpoint:human-verify]`. Flip `status: proposed` → `accepted` for **only** the ADRs the human explicitly accepts; remove or send back rejected ones with the reason. The fleet executes the flip only for explicitly-accepted ADRs — it never originates the accept decision, never flips on its own judgment or because "the draft looks right." Emit a one-row-per-decision batch summary table (decision, ADR number/link, verdict, assumptions made, parked forks, sign-off result). Close already-decided candidates with a comment citing the existing ADR. Degrade gracefully (a missing queue source, missing `gh` auth, or one item's failed draft is reported while the batch continues).
2. **Acceptance gate:** `harness skill validate adr-fleet` shows the SIGN-OFF phase present; prose states the human-authorized `proposed`→`accepted` flip, the batch report table, already-decided closure, and graceful degradation. No internal numbers.
3. Commit: `feat(adr-fleet): Phase 5 SIGN-OFF + REPORT`

### Task 9: Harness Integration + Success Criteria

**Depends on:** Task 8 | **Files:** `agents/skills/claude-code/adr-fleet/SKILL.md`

1. Add `## Harness Integration`: `harness skill run adr-fleet` (full five-phase decide pipeline); `harness-roadmap-pilot` (impact scoring reused in SELECT); `harness-architecture-advisor` (the real per-item decide pipeline each subagent runs; composed, never reimplemented); `gh` (enumerate decision-blocked issues, push drafted ADRs, close already-decided candidates with citations); `docs/reference/fleet-family.md` (the shared spine); `harness skill validate adr-fleet` (authoring-time gate).
2. Add `## Success Criteria` derived from the spec's Success Criteria (up to N verified well-formed ADRs on a CI-green branch; exactly one up-front CONFIRM + one terminal sign-off; never auto-accept; every ADR produced by the real advisor and never verified on self-report; already-decided candidates flagged and closed citing the existing ADR; graceful degradation; concurrency ≤ governor; `harness skill validate adr-fleet` passes + docs regenerated).
3. **Acceptance gate:** `harness skill validate adr-fleet` shows both sections present. No internal numbers.
4. Commit: `feat(adr-fleet): Harness Integration + Success Criteria`

### Task 10: Gates + Escalation

**Depends on:** Task 9 | **Files:** `agents/skills/claude-code/adr-fleet/SKILL.md`

1. Add `## Gates`: no accept without explicit human sign-off (never auto-accept); no sign-off-ready without a well-formed `status: proposed` ADR + all-OS CI green; a self-report is never verification; the advisor must actually run (a hand-written ADR skipping the advisor is a gate violation); never exceed the concurrency governor; never `--no-verify`.
2. Add `## Escalation`: missing queue source / `gh` auth → report the gap, continue; an unforeseen fork → park the one item and report it; malformed/missing draft → reject or retry once, never sign-off-ready; a genuinely-contested trade-off → park and report, never guess-and-draft; branch/push gate failing in a `.claude/`-nested worktree → push via API or non-`.claude` worktree, never `--no-verify`.
3. **Acceptance gate:** `harness skill validate adr-fleet` shows both sections present. No internal numbers.
4. Commit: `feat(adr-fleet): Gates + Escalation`

### Task 11: Rationalizations to Reject (domain-specific) + Red Flags

**Depends on:** Task 10 | **Files:** `agents/skills/claude-code/adr-fleet/SKILL.md`

1. Add `## Rationalizations to Reject` — 3–8 domain-specific rows (none of the three universal filler rows), e.g.: "the draft looks right, I'll mark it accepted" → accept is a human act, the fleet only flips ADRs the human explicitly signed off; "the advisor is slow, I'll just hand-write the ADR" → the artifact VERIFY checks is proof the real advisor ran; hand-writing skips the audited flow; "the subagent said the ADR is well-formed" → a self-report is a claim, independently confirm frontmatter + sections + `status: proposed` + all-OS CI; "this trade-off is obvious, I'll pick the option and draft" → a genuinely-contested fork parks and reports, it is never resolved by guessing; "CI is green on Linux, sign-off-ready" → green on one OS is not green; "bump concurrency to clear the backlog faster" → beyond ~3 is the machine-storm zone.
2. Add `## Red Flags` table mirroring the same failure modes with corrective `STOP.` actions.
3. **Acceptance gate:** `harness skill validate adr-fleet` Rationalizations-parity check passes (domain-specific, no filler rows); both sections present. No internal numbers.
4. Commit: `feat(adr-fleet): Rationalizations + Red Flags`

### Task 12: Examples + Test Scenarios

**Depends on:** Task 11 | **Files:** `agents/skills/claude-code/adr-fleet/SKILL.md`

1. Add `## Examples`: a worked multi-decision backlog transcript (SELECT enumerates from the three sources + flags an already-decided point; CONFIRM ranks + human answers forks + sets concurrency; DISPATCH drafts to `status: proposed`, one item parks on an unforeseen fork; VERIFY independently confirms well-formed + all-OS CI; SIGN-OFF flips only the human-accepted ADRs to `accepted`, closes the already-decided candidate citing its ADR). Add a second short example: refusing to auto-accept a well-formed draft the human did not sign off.
2. Add `## Test Scenarios`: (1) Gate — accepting a draft with no human sign-off is halted; (2) Rationalization — hand-writing an ADR to skip the advisor is rejected by the artifact gate; (3) Park-unforeseen — a contested trade-off parks and reports rather than being guessed; (4) Self-report — "ADR is well-formed, CI green" is independently re-checked before sign-off-ready.
3. **Acceptance gate:** `harness skill validate adr-fleet` shows both sections present. No internal numbers.
4. Commit: `feat(adr-fleet): Examples + Test Scenarios`

### Task 13: `harness skill validate adr-fleet` green

**Depends on:** Task 12 | **Files:** `agents/skills/claude-code/adr-fleet/SKILL.md`, `agents/skills/claude-code/adr-fleet/skill.yaml`

1. Run `harness skill validate adr-fleet`. Fix any remaining section-order, required-section, `name`-mismatch, referenced-tool/dep, or Rationalizations-parity errors it reports.
2. **Acceptance gate:** `harness skill validate adr-fleet` exits 0.
3. Commit (only if fixes were needed): `fix(adr-fleet): satisfy skill validation`

### Task 14: Platform symlinks (codex, cursor, gemini-cli)

**Depends on:** Task 13 | **Files:** `agents/skills/codex/adr-fleet`, `agents/skills/cursor/adr-fleet`, `agents/skills/gemini-cli/adr-fleet` | **Category:** integration

1. Create three relative symlinks, each → `../claude-code/adr-fleet`, exactly as `pr-fleet` ships: `ln -s ../claude-code/adr-fleet agents/skills/codex/adr-fleet` (repeat for `cursor`, `gemini-cli`).
2. **Acceptance gate:** for each, `test -L <path>` and `readlink <path>` = `../claude-code/adr-fleet`; `harness skill validate adr-fleet` still exits 0.
3. Commit: `feat(adr-fleet): platform-variant symlinks`

### Task 15: fleet-family.md reference-addition

**Depends on:** Task 16 | **Files:** `docs/reference/fleet-family.md` | **Category:** integration

1. Add a one-line entry to the `## References` list in `docs/reference/fleet-family.md` naming the new decide-stage ADR (0090) — the batch-sign-off-gate decision — as the decide-stage complement to ADR 0087/0088/0089. Do **not** edit the Members table or conveyor: they already name `adr-fleet` (decide stage).
2. **Acceptance gate:** `grep -n '0090' docs/reference/fleet-family.md` matches in the References list; `pnpm format:check` clean for the file.
3. Commit: `docs(fleet-family): reference the decide-stage ADR`

### Task 16: Decide-stage ADR 0090

**Depends on:** Task 8 | **Files:** `docs/knowledge/decisions/0090-adr-fleet-decide-stage-batch-signoff.md` | **Category:** integration

1. Create `docs/knowledge/decisions/0090-adr-fleet-decide-stage-batch-signoff.md`, modeled on ADR 0089, with frontmatter (`number: 0090`, `title: The adr-fleet decide-stage batch-sign-off gate model`, `date: 2026-08-08`, `status: accepted`, `tier: large`, `source: docs/changes/adr-fleet/proposal.md`) and sections `## Context`, `## Decision`, `## Consequences`, `## Alternatives Considered`, `## References`.
2. Record the decide-stage gate model: the fleet drafts to `status: proposed`; independent verification stands between drafting and acceptance; a single up-front human sign-off flips only explicitly-accepted ADRs to `accepted`; the fleet is the executor, never the originator, of the accept decision. Document the deeper gate-seat fork (per-ADR accept/reject in one pass — the chosen default — vs all-or-nothing batch acceptance vs a post-verify second touchpoint) in `## Alternatives Considered`. Name it the decide-stage complement to the fan-out ADR (0087), the interaction-model ADR (0088), and the land-stage merge-gate ADR (0089). Reference the source proposal, companions, first instance (`agents/skills/claude-code/adr-fleet/SKILL.md`), and the family overview.
3. **Acceptance gate:** file exists with all frontmatter fields + the five sections; slug follows `NNNN-<slug>.md`; ADR-README convention satisfied.
4. Commit: `docs(decisions): add ADR 0090 adr-fleet decide-stage batch sign-off`

### Task 17: ADR-README `proposed` status vocabulary `[checkpoint:decision]`

**Depends on:** Task 16 | **Files:** `docs/knowledge/decisions/README.md` | **Category:** integration

1. **Contingent on the PARKED draft-location default (Task 4) being confirmed as proposed-status-in-canonical-dir.** If confirmed: add a `proposed` row to the Status-Values table in `docs/knowledge/decisions/README.md` — meaning "drafted by a fleet, awaiting human sign-off; not yet governing architecture" — and note that only a human sign-off flips `proposed` → `accepted`. If the human chose a staging dir instead, **skip this task** (the canonical dir would only ever hold `accepted`).
2. **Acceptance gate:** `grep -n 'proposed' docs/knowledge/decisions/README.md` matches in the Status-Values table (or task skipped per the fork); `pnpm format:check` clean for the file.
3. Commit: `docs(decisions): document proposed ADR status`

### Task 18: Regenerate plugin artifacts + skills catalog

**Depends on:** Task 14 | **Files:** `.claude-plugin/`, `.cursor-plugin/`, `.gemini-extension/`, `.antigravity-extension/`, `docs/reference/skills-catalog.md` | **Category:** integration

1. Run `harness generate` to regenerate the platform slash-command / plugin artifacts (do not hand-edit). Run `pnpm run generate-docs` to regenerate `docs/reference/skills-catalog.md` (do not hand-edit — it is AUTO-GENERATED).
2. **Acceptance gate:** `grep -n 'adr-fleet' docs/reference/skills-catalog.md` matches; an `adr-fleet` command file exists under each plugin dir; re-running `harness generate` and `pnpm run generate-docs` leaves no further diff (idempotent).
3. Commit: `chore(adr-fleet): regenerate plugin artifacts and skills catalog`

### Task 19: Final sweep — whole-suite validate + format:check

**Depends on:** Task 15, Task 17, Task 18 | **Files:** (verification only)

1. Run `harness skill validate adr-fleet` (exits 0), `harness skill validate` whole-suite (exits 0 — no regression), and `pnpm format:check` (no diffs across created/edited files; run `pnpm format` and re-commit if any).
2. Confirm the no-internal-numbers gate: `grep -nE '#[0-9]{3,}|ADR [0-9]{4}|issue [0-9]+' agents/skills/claude-code/adr-fleet/SKILL.md agents/skills/claude-code/adr-fleet/skill.yaml` returns no matches.
3. **Acceptance gate:** all three validate/format commands green; the grep returns empty.
4. Commit (only if a format fix was needed): `chore(adr-fleet): format sweep`

## Notes for the executor

- **This is skill-authoring** (docs/instructions), not TS package code. There is no code-level TDD; the verification equivalents are `harness skill validate adr-fleet` (schema + required-section + domain-specific-Rationalizations parity), the embedded `## Test Scenarios` in the SKILL.md, and `pnpm format:check`. Every authoring task's acceptance check names the concrete gate that proves it.
- **Keep the SKILL.md self-contained and citing the spine.** The shared `-fleet` scaffolding lives in `docs/reference/fleet-family.md` and is _cited_ by path, but the SKILL.md must still carry its full required sections to pass validation and to run standalone in adopter projects — the reference doc is a reader aid / sibling-onboarding anchor, not an include.
- **No internal roadmap/PR/issue numbers in shipped bodies.** SKILL.md and skill.yaml ship to adopter projects; cite the spine doc and ADRs by name/title, never by tracking number. (ADR 0090 itself lives in `docs/` and may use its own number; the SKILL body may not.)
- **The two PARKED forks.** (1) Draft-location: proceed on the recommended `status: proposed`-in-canonical-dir default; if the human picks a staging dir, revise Tasks 6–8 and skip Task 17. (2) The deeper sign-off gate-seat fork is resolved and documented inside ADR 0090 (Task 16), not in SKILL.md prose.
- **Regenerate shared files, do not hand-edit them.** Plugin artifacts via `harness generate`; `docs/reference/skills-catalog.md` via `pnpm run generate-docs` (it is AUTO-GENERATED). Commit the regenerated files. Re-run to confirm idempotence before committing.
- **Never `--no-verify` in a `.claude/`-nested worktree.** This worktree is nested under `.claude/`, which breaks the local `check-docs` push gate (it self-excludes → scans zero files). Push via the GitHub API or a non-`.claude` worktree.
- **Node 22 for this repo.** The default Node 26 breaks better-sqlite3 (native ABI) and can fail the pre-push hook; use Node 22 when building/regenerating or running gates locally.
