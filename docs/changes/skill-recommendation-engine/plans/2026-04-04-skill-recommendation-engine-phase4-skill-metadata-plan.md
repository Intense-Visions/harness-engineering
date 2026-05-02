# Plan: Skill Recommendation Engine -- Phase 4: Skill Metadata Updates

**Date:** 2026-04-04
**Spec:** docs/changes/skill-recommendation-engine/proposal.md
**Estimated tasks:** 5
**Estimated time:** 15 minutes

## Goal

Add `addresses` fields to 15 bundled skill.yaml files so that health signal mappings are colocated with skill metadata, matching the FALLBACK_RULES entries exactly.

## Observable Truths (Acceptance Criteria)

1. Each of the 15 skill.yaml files listed in the file map contains an `addresses` field with entries exactly matching the corresponding FALLBACK_RULES entry in `packages/cli/src/skill/recommendation-rules.ts`.
2. No other fields in any skill.yaml file are modified -- only `addresses` is added.
3. `harness validate` passes after all changes.
4. When `parseSkillEntry` reads any of the 15 skill.yaml files, the resulting `SkillIndexEntry.addresses` array contains the correct entries (verified by the existing schema validation in the index builder).

## File Map

```
MODIFY agents/skills/claude-code/enforce-architecture/skill.yaml
MODIFY agents/skills/claude-code/harness-dependency-health/skill.yaml
MODIFY agents/skills/claude-code/harness-tdd/skill.yaml
MODIFY agents/skills/claude-code/harness-codebase-cleanup/skill.yaml
MODIFY agents/skills/claude-code/harness-security-scan/skill.yaml
MODIFY agents/skills/claude-code/harness-refactoring/skill.yaml
MODIFY agents/skills/claude-code/detect-doc-drift/skill.yaml
MODIFY agents/skills/claude-code/harness-perf/skill.yaml
MODIFY agents/skills/claude-code/harness-supply-chain-audit/skill.yaml
MODIFY agents/skills/claude-code/harness-code-review/skill.yaml
MODIFY agents/skills/claude-code/harness-integrity/skill.yaml
MODIFY agents/skills/claude-code/harness-soundness-review/skill.yaml
MODIFY agents/skills/claude-code/harness-debugging/skill.yaml
MODIFY agents/skills/claude-code/harness-hotspot-detector/skill.yaml
MODIFY agents/skills/claude-code/cleanup-dead-code/skill.yaml
```

## Tasks

### Task 1: Add addresses to enforce-architecture, harness-dependency-health, and harness-tdd

**Depends on:** none
**Files:** `agents/skills/claude-code/enforce-architecture/skill.yaml`, `agents/skills/claude-code/harness-dependency-health/skill.yaml`, `agents/skills/claude-code/harness-tdd/skill.yaml`

1. Edit `agents/skills/claude-code/enforce-architecture/skill.yaml`. Add `addresses` field after `depends_on: []` (last line). Append:

   ```yaml
   addresses:
     - signal: circular-deps
       hard: true
     - signal: layer-violations
       hard: true
     - signal: high-coupling
       metric: fanOut
       threshold: 20
       weight: 0.8
     - signal: high-coupling
       metric: couplingRatio
       threshold: 0.7
       weight: 0.6
   ```

2. Edit `agents/skills/claude-code/harness-dependency-health/skill.yaml`. Add `addresses` field after `depends_on: []` (last line). Append:

   ```yaml
   addresses:
     - signal: high-coupling
       metric: fanOut
       threshold: 15
       weight: 0.7
     - signal: anomaly-outlier
       weight: 0.6
     - signal: articulation-point
       weight: 0.5
   ```

3. Edit `agents/skills/claude-code/harness-tdd/skill.yaml`. Add `addresses` field after `depends_on:` block (after `  - harness-verification`). Append:

   ```yaml
   addresses:
     - signal: low-coverage
       weight: 0.9
   ```

4. Run: `harness validate`
5. Commit: `feat(skills): add addresses to enforce-architecture, dependency-health, tdd`

### Task 2: Add addresses to harness-codebase-cleanup, harness-security-scan, and harness-refactoring

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-codebase-cleanup/skill.yaml`, `agents/skills/claude-code/harness-security-scan/skill.yaml`, `agents/skills/claude-code/harness-refactoring/skill.yaml`

1. Edit `agents/skills/claude-code/harness-codebase-cleanup/skill.yaml`. Add `addresses` field after the `depends_on:` block (after `  - harness-hotspot-detector`). Append:

   ```yaml
   addresses:
     - signal: dead-code
       weight: 0.8
     - signal: drift
       weight: 0.6
   ```

2. Edit `agents/skills/claude-code/harness-security-scan/skill.yaml`. Add `addresses` field after `depends_on: []` (last line). Append:

   ```yaml
   addresses:
     - signal: security-findings
       hard: true
   ```

3. Edit `agents/skills/claude-code/harness-refactoring/skill.yaml`. Add `addresses` field after `depends_on: []` (last line). Append:

   ```yaml
   addresses:
     - signal: high-complexity
       metric: cyclomaticComplexity
       threshold: 15
       weight: 0.8
     - signal: high-coupling
       metric: couplingRatio
       threshold: 0.5
       weight: 0.6
   ```

4. Run: `harness validate`
5. Commit: `feat(skills): add addresses to codebase-cleanup, security-scan, refactoring`

### Task 3: Add addresses to detect-doc-drift, harness-perf, and harness-supply-chain-audit

**Depends on:** none
**Files:** `agents/skills/claude-code/detect-doc-drift/skill.yaml`, `agents/skills/claude-code/harness-perf/skill.yaml`, `agents/skills/claude-code/harness-supply-chain-audit/skill.yaml`

1. Edit `agents/skills/claude-code/detect-doc-drift/skill.yaml`. Add `addresses` field after `depends_on: []` (last line). Append:

   ```yaml
   addresses:
     - signal: doc-gaps
       weight: 0.7
     - signal: drift
       weight: 0.5
   ```

2. Edit `agents/skills/claude-code/harness-perf/skill.yaml`. Add `addresses` field after the `depends_on:` block (after `  - harness-verify`). Append:

   ```yaml
   addresses:
     - signal: perf-regression
       weight: 0.8
   ```

3. Edit `agents/skills/claude-code/harness-supply-chain-audit/skill.yaml`. Add `addresses` field after the `depends_on:` block (after `  - harness-security-scan`). Append:

   ```yaml
   addresses:
     - signal: security-findings
       weight: 0.6
   ```

4. Run: `harness validate`
5. Commit: `feat(skills): add addresses to detect-doc-drift, perf, supply-chain-audit`

### Task 4: Add addresses to harness-code-review, harness-integrity, and harness-soundness-review

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-code-review/skill.yaml`, `agents/skills/claude-code/harness-integrity/skill.yaml`, `agents/skills/claude-code/harness-soundness-review/skill.yaml`

1. Edit `agents/skills/claude-code/harness-code-review/skill.yaml`. Add `addresses` field after `depends_on: []` (last line). Append:

   ```yaml
   addresses:
     - signal: high-complexity
       weight: 0.5
     - signal: high-coupling
       weight: 0.4
   ```

2. Edit `agents/skills/claude-code/harness-integrity/skill.yaml`. Add `addresses` field after the `depends_on:` block (after `  - harness-code-review`). Append:

   ```yaml
   addresses:
     - signal: drift
       weight: 0.7
     - signal: dead-code
       weight: 0.5
   ```

3. Edit `agents/skills/claude-code/harness-soundness-review/skill.yaml`. Add `addresses` field after `depends_on: []` (last line). Append:

   ```yaml
   addresses:
     - signal: layer-violations
       weight: 0.6
     - signal: circular-deps
       weight: 0.5
   ```

4. Run: `harness validate`
5. Commit: `feat(skills): add addresses to code-review, integrity, soundness-review`

### Task 5: Add addresses to harness-debugging, harness-hotspot-detector, and cleanup-dead-code

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-debugging/skill.yaml`, `agents/skills/claude-code/harness-hotspot-detector/skill.yaml`, `agents/skills/claude-code/cleanup-dead-code/skill.yaml`

1. Edit `agents/skills/claude-code/harness-debugging/skill.yaml`. Add `addresses` field after `depends_on: []` (last line). Append:

   ```yaml
   addresses:
     - signal: perf-regression
       weight: 0.5
     - signal: anomaly-outlier
       weight: 0.6
   ```

2. Edit `agents/skills/claude-code/harness-hotspot-detector/skill.yaml`. Add `addresses` field after `depends_on: []` (last line). Append:

   ```yaml
   addresses:
     - signal: high-complexity
       metric: cyclomaticComplexity
       threshold: 20
       weight: 0.9
     - signal: anomaly-outlier
       weight: 0.7
     - signal: articulation-point
       weight: 0.8
   ```

3. Edit `agents/skills/claude-code/cleanup-dead-code/skill.yaml`. Add `addresses` field after `depends_on: []` (last line). Append:

   ```yaml
   addresses:
     - signal: dead-code
       hard: true
   ```

4. Run: `harness validate`
5. Commit: `feat(skills): add addresses to debugging, hotspot-detector, cleanup-dead-code`

---

**[checkpoint:human-verify]** After all 5 tasks, verify that `harness validate` passes and spot-check 2-3 skill.yaml files to confirm the `addresses` entries match FALLBACK_RULES.

## Traceability

| Observable Truth                             | Delivered By                                      |
| -------------------------------------------- | ------------------------------------------------- |
| 1. Each skill.yaml has correct addresses     | Tasks 1-5 (each task covers 3 skills)             |
| 2. No other fields modified                  | Tasks 1-5 (edit instructions are append-only)     |
| 3. harness validate passes                   | Tasks 1-5 (each task runs validate)               |
| 4. parseSkillEntry reads addresses correctly | Already working from Phase 1; validated by schema |
