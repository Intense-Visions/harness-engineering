# Plan — cicd-fleet skill

**Spec:** `docs/changes/cicd-fleet/proposal.md`
**Phase:** 1 — Author the cicd-fleet skill (single build phase)
**Complexity:** medium · **Integration tier:** small-to-medium (new prose skill + regenerated integration surfaces)
**Session:** `changes--cicd-fleet--proposal`

## Context

`cicd-fleet` is the CI/CD-remediation member of the `-fleet` family. The shared spine (`SELECT → CONFIRM → DISPATCH → VERIFY → terminal`, concurrency governor, artifact + all-OS-CI verification, worktree fan-out + push caveat, never-silent-merge) is documented once in `docs/reference/fleet-family.md` and cited, not re-extracted. Two sibling skills already ship this pattern: `agents/skills/claude-code/roadmap-fleet/` (build → REPORT, never merges — the structural model for cicd-fleet's terminal act) and `agents/skills/claude-code/pr-fleet/` (land). This skill defines only the CI/CD-remediation stage-specific parts: red/flaky queue source, red-cause triage taxonomy, deflake/heal per-item pipeline, batch-remediation-PR terminal act.

## Tasks

### Task 1: Author `skill.yaml`

**Files:** `agents/skills/claude-code/cicd-fleet/skill.yaml`
**Owns:** `agents/skills/claude-code/cicd-fleet/**`
**DependsOn:** none

- Orchestrator-tier metadata: `cognitive_mode: systematic-orchestrator`, `type: rigid`, `tier: 2`, `stability: static`.
- `description` — one-line, no internal tracking numbers.
- Four platforms: claude-code, codex, cursor, gemini-cli.
- `tools`: Bash, Read, Glob, Grep.
- `cli.command: harness skill run cicd-fleet` with `path`, `--concurrency`, `--report-only`, `--dry-run` args.
- `mcp.tool: run_skill` with `skill: cicd-fleet`.
- Five `phases`: select, confirm, dispatch, verify, report.
- `depends_on`: harness-roadmap-pilot, harness-debugging, harness-workflow-audit.
- `addresses` signals (drift / backlog-pressure) with weights.
- `capabilities`: tools + `network: false`, `filesystem: read-write`.
- Model on `roadmap-fleet/skill.yaml` (build-shaped sibling).

**Acceptance:** `harness skill validate cicd-fleet` parses the yaml with no schema errors.

### Task 2: Author `SKILL.md`

**Files:** `agents/skills/claude-code/cicd-fleet/SKILL.md`
**Owns:** `agents/skills/claude-code/cicd-fleet/**`
**DependsOn:** Task 1

- Self-contained rich-format skill prose with all required sections: title + one-line summary blockquote, When to Use, Flags, Process (Iron Law + five-phase table + per-phase detail), Harness Integration, Success Criteria, Gates, Escalation, Rationalizations to Reject (domain-specific: the flake-hiding shortcuts), Red Flags, Examples, Test Scenarios.
- Cite `docs/reference/fleet-family.md` for the shared spine (do not restate it in full); state only the CI/CD-remediation stage-specific parts.
- Red-cause triage taxonomy: real-failure / flake / infra-config / already-green / needs-design.
- Per-item pipeline: `harness-debugging` (heal / deflake) + `harness-workflow-audit` (infra/config).
- Iron Law: deflake = remove nondeterminism; rerun-green is the flake signature, not a fix; never disable/skip/blanket-retry to clear the board; never auto-merge.
- Terminal act = REPORT (batch remediation PRs), modeled on roadmap-fleet.
- Cite family ADRs by title only. NO internal roadmap/PR/issue numbers anywhere.

**Acceptance:** `harness skill validate cicd-fleet` passes; grep finds no `#<number>` issue/PR refs and no roadmap tracking numbers in the shipped body.

### Task 3: Regenerate integrations

**Files:** generated slash commands, skill catalog, roadmap aggregate (SHARED files)
**DependsOn:** Task 2

- Run `harness generate`.
- Commit regenerated `/harness:cicd-fleet` slash command, catalog entries, and roadmap aggregate touch.
- Note shared-file touches for the orchestrator to reconcile at merge.

**Acceptance:** `harness generate` completes; generated `:check` would pass in CI.

## Checkpoints

- None require human pause in autonomous batch mode; front-loaded forks are resolved to recommended defaults and recorded in the spec's "Assumptions made" section.

## Verification

- `harness skill validate cicd-fleet` passes (authoring gate).
- `harness validate` project health passes (or only pre-existing advisories).
- Grep-verify: no internal tracking numbers in shipped skill body.
- All-OS CI green on the pushed branch (independent VERIFY).

## Rollback

- The change is additive (one new skill directory + regenerated integration surfaces). Rollback = delete `agents/skills/claude-code/cicd-fleet/` and re-run `harness generate`.
