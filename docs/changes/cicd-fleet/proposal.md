# cicd-fleet — autonomous CI/CD-red / flaky-test backlog sweep

**Status:** Draft · **Tier:** Large · **Type:** rigid skill (orchestrator)
**Family:** `-fleet` (the CI/CD-remediation quality-queue member)
**Keywords:** fleet, orchestration, ci-red, flaky-test, deflake, heal, triage, debugging, workflow-audit, worktree, artifact-verification, batch-review, remediation-pr

## Overview

Sweeping a red CI/CD board is the same attention slog the rest of the `-fleet` family attacks, applied to the quality queue. Every failing pipeline has to be hand-triaged — is this a real regression, a flaky test, or an infra/config defect? — then diagnosed to root cause, fixed, and re-run to confirm green, one failing run at a time. Flaky tests are worse: they reproduce only sometimes, tempt a human into "just re-run it" or "mark it skip," and quietly erode trust in the whole board. For a board with dozens of red runs and a handful of chronic flakes, the human's attention is the bottleneck, not the machinery.

`cicd-fleet` is the CI/CD-remediation member of the `-fleet` family. It works a **quality queue** — red CI/CD runs and flaky-test signals — **alongside** the core spine conveyor (`issue-fleet` intake → `adr-fleet` decide → `roadmap-fleet` build → `pr-fleet` land), the same way `test-fleet` and `cleanup-fleet` do. It enumerates the red/flaky backlog, classifies each item by cause, fans out worktree-isolated subagents that each run the **real** per-item remediation pipeline (deflake a flaky test / heal a real failure), independently verifies each fix by artifact and all-OS CI, and hands back a **batch of remediation PRs for one bulk human review**. It never auto-merges and never trusts a subagent's self-report.

The genuinely-shared, stage-agnostic scaffolding — the five-phase `SELECT → CONFIRM → DISPATCH → VERIFY → terminal` spine, the concurrency governor (default 2, max ~3 — the machine-storm limit), the artifact + all-OS-CI verification discipline, the worktree fan-out with its `.claude/`-nested push-path caveat, and the never-silent-merge invariant — lives once in `docs/reference/fleet-family.md` (the `-fleet` spine). This skill cites that contract and defines only what is specific to the CI/CD-remediation stage: the red/flaky queue source, the red-cause triage taxonomy, the deflake/heal per-item pipeline, and the batch-remediation-PR terminal act.

### Goals

- Turn a red CI/CD board of N failing runs plus a set of chronic flaky tests into a batch of verified, merge-ready **remediation PRs**, each with a plan artifact and green CI across all platforms — with a single up-front human touchpoint.
- Dogfood the real per-item remediation pipeline (`harness-debugging`, plus `harness-workflow-audit` for CI/workflow-config defects) — never hand-patch a fix that leaves no plan artifact, and never make a board green by hiding a failure.
- Make each remediation auditable: every remediation PR is independently verified to make the pipeline **deterministically** green across all OS — never on a subagent's self-report, and never on a single rerun-green (the flake signature, not a fix).
- Keep the merge decision with a human; hand back a reviewable batch and never silently auto-merge.

### Non-goals (YAGNI)

- Silent auto-merge of any remediation PR — the terminal act is REPORT; landing is the human's step (optionally via `pr-fleet`).
- "Green by deletion / skip / retry" — disabling a test, marking it `skip`, or wrapping a flaky test in blanket retries to clear the board is out of scope by design; it hides the failure instead of remediating it.
- Building or fixing a _feature_ — a red that reveals a substantial product defect needing design judgment parks and reports (it is a `roadmap-fleet` / human build item, not a CI sweep).
- A deterministic workflow-engine execution — named as a future upgrade (per the family's ADR on subagent worktree fan-out vs the Workflow primitive); v1 is model-driven fan-out.
- A new flake-detection database or CI provider integration beyond what `gh` already exposes — flake signal is derived from rerun deltas and existing run history, not a new subsystem.

## Decisions made

1. **Family-shared spine, cited as a documented contract — not a physical library.** `cicd-fleet` reuses the same five-phase spine, concurrency governor, artifact + all-OS-CI verification discipline, worktree fan-out with its `.claude/`-nested push-path caveat, and never-silent-merge invariant that `roadmap-fleet` and `pr-fleet` already build on. That scaffolding is stated once in `docs/reference/fleet-family.md` and **cited**, not re-extracted into a runtime module or base skill — skills are self-contained `SKILL.md` prose that must validate and run standalone in adopter projects, so factoring shared prose into an imported module is both impossible under the skill format and the over-engineering the family charter warns against. Rationale: the documented-contract-vs-physical-library question was already settled for the family; this member follows the established pattern at zero framework cost.

2. **The queue is red CI/CD runs plus flaky-test signals.** SELECT enumerates two sources via `gh`: **red runs** (`gh run list --status failure`, plus per-PR `gh pr checks` failures) and **flaky-test signals** (tests whose outcome flipped across reruns of the same commit, derived from `gh run list` rerun history / `gh run view` job logs). A test that has both passed and failed on an identical SHA is the canonical flake signature. Missing `gh` auth degrades to whichever signal is available and is reported, not aborted — with no board access there is nothing to sweep. Rationale: these are the two failure shapes that keep a board red, and both are observable from `gh` without a new subsystem.

3. **A red-cause triage taxonomy governs remediation.** SELECT classifies each queue item into one bucket, because the fix differs per bucket:
   - **real-failure** — a deterministic failure that reproduces on rerun → **heal** (diagnose root cause and fix).
   - **flake** — a non-deterministic failure (passes on rerun of the same SHA) → **deflake** (remove the nondeterminism).
   - **infra/config** — a workflow-file, runner, permissions, or action-pinning defect → **heal via `harness-workflow-audit`**.
   - **already-green / superseded** — a run that a newer green run or a merged fix already resolved → flag for closure, not remediation.
   - **needs-design** — a red whose root cause is a substantial product defect requiring design judgment → park and report; hand to a human / `roadmap-fleet`.

   Rationale: the terminal act differs per bucket — only real-failure and flake are remediated in-fleet; infra/config is healed through the workflow auditor; the rest are reported or parked.

4. **The per-item pipeline is the real deflake/heal remediation, never a hand-patch and never a hide.** DISPATCH fans out worktree-isolated subagents that run the **real** `harness-debugging` (systematic root-cause-before-fix) for real-failures and flakes, and `harness-workflow-audit` for infra/config defects. **Deflake means removing the nondeterminism** (fixing the race, the time/order/seed dependency, the shared-state leak) — never adding a blanket retry, marking the test `skip`, or deleting it. A flake that cannot be deflaked within the item **parks and reports a quarantine proposal** (a documented, tracked, human-decided quarantine) — it is never silently disabled. Rationale: the whole point of the sweep is to restore trust in the board; hiding a failure spends that trust instead of rebuilding it.

5. **The terminal act is REPORT — a batch of remediation PRs for human review; never auto-merge.** Like `roadmap-fleet` (build) and unlike `pr-fleet` (land), `cicd-fleet` stops at verified, merge-ready remediation PRs and hands them back for one bulk human review. Rationale: the family invariant is never-silent-merge; a CI remediation still needs a human at the merge button.

6. **Verification is by artifact + deterministic all-OS-CI green, never self-report.** For each returned remediation branch, the orchestrator independently confirms (a) a plan artifact under `docs/changes/<slug>/plans/` plus an autopilot-state exists (proof the real pipeline ran), and (b) CI is green on **all** operating systems plus the project's required checks. For a **deflake specifically**, green must be **deterministic** — the previously-flaky test passes across repeated runs, not merely once; a single rerun-green is the flake signature, not a fix. Rationale: the family's artifact + all-OS-CI discipline, hardened with a flake-specific determinism check because "it passed this time" is exactly the illusion a flake produces.

7. **Hard invariants (shared with the family, per `docs/reference/fleet-family.md`).** Dogfood the real per-item skills (here: `harness-debugging` / `harness-workflow-audit`); verify adherence by artifact and all-OS CI green before any terminal action; a self-report is never verification; never silently auto-merge. A `-fleet` fans out across many independent items into many outcomes for one batch review — distinct from a convergence _pipeline_ that loops on one target.

## Technical design

### Skill shape

A claude-code rigid skill at `agents/skills/claude-code/cicd-fleet/` (`SKILL.md` plus `skill.yaml`), orchestrator-tier (`cognitive_mode: systematic-orchestrator`, `tier: 2`), with a domain-specific `## Rationalizations to Reject`. Platform variants (codex, cursor, gemini-cli) ship exactly as `roadmap-fleet` and `pr-fleet` do (declared in `skill.yaml` `platforms`). The skill body carries **no** internal roadmap/PR/issue numbers (it runs in adopter projects) and cites the shared spine doc plus the family ADRs by name/title, never by tracking number.

### The loop — five phases

1. **SELECT.** Enumerate red runs (`gh run list --status failure`, `gh pr checks`) and flaky-test signals (rerun-delta / run history). Classify each item into the red-cause taxonomy (Decision 3). Cross-check for already-green / superseded runs. Score and order the remediable candidates by impact, reusing `harness-roadmap-pilot`-style scoring (a chronically-red required check outranks a one-off) rather than ad-hoc ranking. Detect known decision forks up front.
2. **CONFIRM `[checkpoint:human-verify]`.** Present the triaged queue in one round: remediable items (real-failure / flake / infra-config) with their buckets, already-green/superseded items flagged for closure, `needs-design` items flagged to park, known forks as multiple-choice questions with recommended defaults, and the proposed concurrency. The human approves/trims once, answers forks, and confirms closures. This is the only guaranteed human touchpoint; it is autonomous from here.
3. **DISPATCH.** For each remediable item, spawn a worktree-isolated subagent that runs the real remediation pipeline — `harness-debugging` (heal / deflake) or `harness-workflow-audit` (infra/config) — pushes the fix on a branch, and re-runs CI. Cap concurrency at the governor (default 2, max ~3). A subagent that hits an unforeseen fork, or a flake it cannot deflake, **parks and reports** (a quarantine proposal for an un-deflakable flake) instead of guessing or hiding; parking is per-item and the batch continues. Each subagent records an "assumptions made / remediation actions" note.
4. **VERIFY.** For each returned branch, independently confirm — never by self-report — the plan artifact + autopilot-state exist and CI is green on all OS plus enforce and harness. For deflakes, additionally require **deterministic** green (repeated-run stability), because a single rerun-green is the flake signature. Classify each item `verified` / `rejected` / `retry` (transient, retried at most once).
5. **REPORT.** Emit a one-row-per-item batch summary (item, cause bucket, verdict, remediation actions, PR link, parked forks / quarantine proposals) for bulk human review. Close already-green / superseded runs' tracking with a citation. **Never merge** — the human (optionally via `pr-fleet`) lands the batch.

### Key seams and data

- **CicdCandidate** record: item id (run id / check name / test id), title, source (`red-run` | `flaky-test`), cause bucket (`real-failure` | `flake` | `infra-config` | `already-green` | `needs-design`), ciStatus (per-OS), flakeEvidence (the passed-and-failed-on-same-SHA trace, when `flake`), score, supersededBy (when already-green), remediation actions taken, parked forks / quarantine proposal.
- **Reuses:** `harness-roadmap-pilot`-style scoring for remediation ordering; `harness-debugging` as the per-item root-cause-and-fix pipeline; `harness-workflow-audit` for CI/workflow-config red; the subagent worktree-isolation primitive for fan-out; `gh` for all run/check/log operations.
- **Concurrency governor** at default 2 / max ~3 (shared spine) to avoid the compound-load failure mode — doubly relevant here, since a stormed batch manufactures exactly the flaky failures the fleet is trying to eliminate.
- **Push/heal path:** subagents pushing a fix from a `.claude/`-nested worktree hit the pre-push `check-docs` self-exclusion caveat; they push via the GitHub API or a non-`.claude` worktree. Never `--no-verify`.

### Flags

| Flag            | Effect                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------ |
| `--concurrency` | Cap concurrent remediation subagents (default 2, max recommended 3 — the machine-storm limit)    |
| `--report-only` | Enumerate and triage the red/flaky queue and present the ranked batch; do not dispatch or verify |
| `--dry-run`     | Run SELECT and CONFIRM only; stop before fan-out                                                 |

## Integration Points

### Entry Points

- **New skill** `cicd-fleet` at `agents/skills/claude-code/cicd-fleet/` (`SKILL.md` + `skill.yaml`), with codex/cursor/gemini-cli platform variants as the siblings ship them.
- **New CLI command surface** `harness skill run cicd-fleet` (declared in `skill.yaml` `cli.command`), plus the generated slash command `/harness:cicd-fleet`.
- **New MCP entry** via the shared `run_skill` tool with `skill: cicd-fleet`.

### Registrations Required

- `harness generate` regenerates the integration surfaces: slash commands (`/harness:cicd-fleet`), agent/skill catalog, and the roadmap aggregate. These are committed with the skill.
- `harness skill validate cicd-fleet` must pass (authoring gate).
- No barrel export or route registration — this is a prose skill, not a code module.

### Documentation Updates

- `docs/reference/fleet-family.md` already lists `cicd-fleet` in the Members table (queue = CI/CD-red / flaky-test runs; per-item = deflake / heal; terminal = REPORT) — no edit required; this skill realizes that row.
- The regenerated skill catalog / slash-command index (via `harness generate`) reflects the new skill.

### Architectural Decisions

- **Documented-contract-vs-physical-library (Decision 1)** does not warrant a new standalone ADR — it was already settled for the family and is captured in `docs/reference/fleet-family.md` (which references the family's fan-out and interaction-model ADRs). This member follows the existing decision rather than opening a new one.
- No other decision rises to a standalone ADR; the queue source, triage taxonomy, per-item pipeline, and terminal act are stage-specific realizations of the already-decided family spine.

### Knowledge Impact

- Concept: **CI/CD-remediation quality queue** as a `-fleet` stage — a member that works a quality board alongside the core spine, with a cause-based triage taxonomy (real-failure / flake / infra-config).
- Relationship: `cicd-fleet` **composes** `harness-debugging` and `harness-workflow-audit` (per-item pipeline) and **cites** `docs/reference/fleet-family.md` (shared spine), mirroring how `roadmap-fleet` composes `brainstorming`/`autopilot`.
- Pattern: **deflake means remove the nondeterminism, never hide it**; **rerun-green is the flake signature, not a fix** — the flake-specific hardening of the family's all-OS-CI verification discipline.

## Success Criteria

- Given a confirmed batch of N remediable items, the fleet produces **up to N** remediation PRs, each with a verified plan artifact and green CI across all OS plus enforce and harness.
- There is **exactly one** up-front human decision round; no per-item interactive pauses except a genuinely-new fork or an un-deflakable flake parked to its own item.
- Every remediation PR carries a **remediation-actions / assumptions-made** note.
- Every **deflake** is verified by **deterministic** green (repeated-run stability), never a single rerun-green.
- **No test is disabled, skipped, or blanket-retried to clear the board** — an un-deflakable flake parks a quarantine proposal for a human, it is never silently hidden.
- Already-green / superseded runs are **closed with a citation, not re-remediated**.
- A red whose root cause is a substantial product defect is **parked as `needs-design`, not force-fixed** inside the sweep.
- The skill **never auto-merges** a remediation PR.
- It **degrades gracefully**: missing `gh` auth, an unavailable signal source, or a single item's failed remediation is reported while the batch continues.
- Concurrency never exceeds the confirmed governor (default 2, max ~3).
- No item is marked remediated on a subagent self-report — every verdict is backed by independently-checked artifact + CI evidence.
- `harness skill validate cicd-fleet` passes; the skill body contains no internal roadmap/PR/issue numbers.

## Implementation Order

1. **Author `skill.yaml`** — orchestrator-tier metadata (`systematic-orchestrator`, `tier: 2`), the five phases (select / confirm / dispatch / verify / report), `depends_on` (`harness-roadmap-pilot`, `harness-debugging`, `harness-workflow-audit`), `addresses` signals, and the four platforms. Model on `roadmap-fleet`'s and `pr-fleet`'s yaml.
2. **Author `SKILL.md`** — the self-contained skill prose: overview + spine citation, When to Use, Flags, Iron Law, the five-phase process, the red-cause triage taxonomy, Harness Integration, Success Criteria, Gates, Escalation, a domain-specific `## Rationalizations to Reject` (the flake-hiding shortcuts), Red Flags, Examples, and Test Scenarios — citing `docs/reference/fleet-family.md` and the family ADRs by title, with no internal tracking numbers.
3. **Authoring gate** — `harness skill validate cicd-fleet` passes.
4. **Regenerate integrations** — `harness generate`; commit the regenerated slash commands / catalog / roadmap aggregate.
5. **Grep-verify** the shipped `SKILL.md` / `skill.yaml` carry no internal roadmap/PR/issue numbers.

## Assumptions made (autonomous defaults — recorded for review)

Run autonomously; these front-loaded forks were resolved to their recommended defaults rather than paused on (no live human in the batch loop):

- **Flake-vs-real classification** = rerun-delta + run history: a test that has both passed and failed on the _same_ commit SHA is a flake; a failure that reproduces deterministically on rerun is a real-failure. (Alternative considered: static-analysis-only flake heuristics — rejected as lower-signal and a new subsystem.)
- **What "remediation" covers** = a fix PR that makes the pipeline **deterministically green** — heal a real failure, deflake a flaky test by removing the nondeterminism, or fix a CI/workflow-config defect via the workflow auditor. Quarantine is a **reported, tracked, human-decided** sub-outcome for un-deflakable flakes, never an in-fleet silent action.
- **Product-code scope** = remediation may touch test code, test setup/fixtures, and CI/workflow config freely; it may touch product code when the debugging pipeline's root cause lands there and the fix is bounded. A red whose root cause is a substantial product defect needing design is **parked as `needs-design`** and handed to a human / `roadmap-fleet`.
- **Queue discovery** = `gh run list --status failure` + `gh pr checks` for red runs and `gh` rerun history for flake signal; degrade gracefully to whichever source is available.
- **Terminal act** = REPORT (batch remediation PRs), never merge — consistent with the build-shaped sibling `roadmap-fleet`.
