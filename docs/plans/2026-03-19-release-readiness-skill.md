# Plan: Release Readiness Skill

**Date:** 2026-03-19
**Spec:** docs/changes/release-readiness/proposal.md
**Estimated tasks:** 8
**Estimated time:** 25-35 minutes

## Goal

A `/harness:release-readiness` skill exists that audits npm release readiness, dispatches maintenance skills in parallel, offers auto-fixes, and tracks state across sessions.

## Observable Truths (Acceptance Criteria)

1. `agents/skills/claude-code/harness-release-readiness/skill.yaml` exists with correct metadata (name, type: rigid, 4 phases, triggers: manual + on_milestone, depends_on lists all sub-skills)
2. `agents/skills/claude-code/harness-release-readiness/SKILL.md` exists with complete workflow documentation covering all 4 phases, gates, escalation, and examples
3. When the skill's AUDIT phase instructions are followed on a project with known gaps (e.g., missing `files` field in package.json), the gaps are identified
4. When the skill's MAINTAIN phase instructions are followed, it directs the agent to dispatch `/harness:detect-doc-drift`, `/harness:cleanup-dead-code`, `/harness:enforce-architecture`, and `/harness:diagnostics` in parallel
5. When the skill's FIX phase instructions are followed, fixable findings are presented with `[y/n/all]` prompting
6. When the skill's REPORT phase instructions are followed, both `release-readiness-report.md` and `.harness/release-readiness.json` are produced with the documented schema
7. When invoked a second time with existing state, the skill loads prior state and displays deltas
8. `--comprehensive` flag is documented and activates additional check categories (API docs, examples, dep health, git hygiene)
9. `harness validate` passes after both files are written
10. Running the skill against harness-engineering produces a meaningful report identifying real gaps

## File Map

- CREATE agents/skills/claude-code/harness-release-readiness/skill.yaml
- CREATE agents/skills/claude-code/harness-release-readiness/SKILL.md

## Tasks

### Task 1: Create skill.yaml

**Depends on:** none
**Files:** agents/skills/claude-code/harness-release-readiness/skill.yaml

1. Create `agents/skills/claude-code/harness-release-readiness/skill.yaml` with metadata: name, version 1.0.0, description, cognitive_mode meticulous-verifier, triggers (manual, on_milestone), platforms (claude-code, gemini-cli), tools (Bash, Read, Write, Edit, Glob, Grep), cli/mcp definitions, type rigid, 4 phases (audit, maintain, fix, report), state persistent with `.harness/release-readiness.json`, depends_on listing all 6 sub-skills
2. Verify valid YAML: `python3 -c "import yaml; yaml.safe_load(open('agents/skills/claude-code/harness-release-readiness/skill.yaml'))"`
3. Commit: `feat(skills): add harness-release-readiness skill.yaml`

### Task 2: Write SKILL.md — Header, When to Use, and Iron Law

**Depends on:** Task 1
**Files:** agents/skills/claude-code/harness-release-readiness/SKILL.md

1. Create `agents/skills/claude-code/harness-release-readiness/SKILL.md` with:
   - Title: "Harness Release Readiness"
   - Tagline: "Audit, fix, and track your project's path to a publishable release."
   - When to Use: manual release prep, milestone check-in, NOT for performing releases, NOT for non-npm targets
   - Iron Law: "No release may be performed without a passing release readiness report."
   - CLI args: `--comprehensive` flag documentation
2. Commit: `feat(skills): add SKILL.md header and usage for release-readiness`

### Task 3: Write SKILL.md — Phase 1: AUDIT

**Depends on:** Task 2
**Files:** agents/skills/claude-code/harness-release-readiness/SKILL.md (append)

1. Append Phase 1: AUDIT section:
   - Session resumption: load `.harness/release-readiness.json` if exists, display delta
   - Standard checks table: packaging (name, version, license, exports, files, publishConfig, repository, bugs, homepage, build, pnpm pack), documentation (README sections, CHANGELOG, LICENSE), repo hygiene (CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, .gitignore, no TODO/FIXME in published source), CI/CD (CI workflow, release workflow, scripts)
   - Comprehensive checks table: API docs (JSDoc coverage), examples (build and run), dep health (npm audit, deprecated), git hygiene (large binaries, secrets)
   - Monorepo: iterate packages/\*/package.json, skip private
   - Severity: pass/warn/fail definitions
2. Commit: `feat(skills): add AUDIT phase to release-readiness SKILL.md`

### Task 4: Write SKILL.md — Phase 2: MAINTAIN

**Depends on:** Task 3
**Files:** agents/skills/claude-code/harness-release-readiness/SKILL.md (append)

1. Append Phase 2: MAINTAIN section:
   - Parallel dispatch via Agent tool: 4 concurrent agents for detect-doc-drift, cleanup-dead-code, enforce-architecture, harness-diagnostics
   - Result collection: structured findings from each
   - Merge logic: combine into unified categories
   - Failure isolation: log errors, continue with remaining
2. Commit: `feat(skills): add MAINTAIN phase to release-readiness SKILL.md`

### Task 5: Write SKILL.md — Phase 3: FIX

**Depends on:** Task 4
**Files:** agents/skills/claude-code/harness-release-readiness/SKILL.md (append)

1. Append Phase 3: FIX section:
   - Fixable findings table with fix descriptions
   - Per-fix prompting: `[y/n/all]`
   - Batch mode (`all`) behavior
   - Non-fixable findings with remediation guidance
   - Sub-skill delegation: align-documentation, cleanup-dead-code --fix
   - Post-fix validation: harness validate
2. Commit: `feat(skills): add FIX phase to release-readiness SKILL.md`

### Task 6: Write SKILL.md — Phase 4: REPORT

**Depends on:** Task 5
**Files:** agents/skills/claude-code/harness-release-readiness/SKILL.md (append)

1. Append Phase 4: REPORT section:
   - Markdown report template (release-readiness-report.md)
   - JSON state schema (.harness/release-readiness.json)
   - Session resumption behavior
   - Milestone trigger variant (progress framing)
2. Commit: `feat(skills): add REPORT phase to release-readiness SKILL.md`

### Task 7: Write SKILL.md — Gates, Escalation, Integration, Success Criteria, Examples

**Depends on:** Task 6
**Files:** agents/skills/claude-code/harness-release-readiness/SKILL.md (append)

1. Append remaining sections:
   - Gates: no release without passing report, no skipping MAINTAIN, no auto-fix without prompting, evidence-based findings
   - Escalation: too many failures, unavailable sub-skills, inconsistent monorepo configs
   - Harness Integration: harness validate, sub-skill invocations, state file
   - Success Criteria: 9 criteria from proposal
   - Example: full walkthrough on project with packaging gaps, doc drift, dead code
2. Run: `harness validate`
3. Commit: `feat(skills): complete release-readiness SKILL.md with gates, examples, and integration`

### Task 8: Validate and run on harness-engineering

**Depends on:** Task 7

[checkpoint:human-verify]

1. Read complete SKILL.md end-to-end for coherence and convention compliance
2. Verify skill.yaml dependencies match SKILL.md references
3. Run `harness validate`
4. Invoke `/harness:release-readiness` against harness-engineering
5. Review report — confirm it identifies known gaps
6. Report findings to human for sign-off
