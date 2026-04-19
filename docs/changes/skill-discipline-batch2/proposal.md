# Skill Discipline Upgrades — ACE Batch 2

**Date:** 2026-04-19
**Status:** Proposed
**Parent:** docs/changes/anti-rationalization-standard/proposal.md (ACE Batch 1)
**Scope:** harness-tdd, harness-refactoring, harness-debugging, harness-skill-authoring, harness-verification, harness-soundness-review, harness-pre-commit-review, harness-execution, harness-planning, harness-code-review
**Keywords:** discipline, Iron-Law, Red-Flags, review-never-fixes, comment-guards, uncertainty-surfacing, rubric-compression, read-only-research, rationalizations

## Overview

ACE Batch 1 standardized `## Rationalizations to Reject` across all skills. Batch 2 deepens the discipline stack in the 10 core harness workflow skills by adding 8 complementary discipline patterns. Inspired by Trail of Bits security skill rigor and Superpowers behavioral constraint patterns.

### Goals

1. Add Red Flags sections to 9 skills (all except harness-code-review which already has them)
2. Add Iron Laws to 3 skills missing explicit ones (Debugging, Skill Authoring, Pre-Commit Review)
3. Add review-never-fixes guards to 4 review/verification skills
4. Add comment replacement guards to 9 skills (all except Code Review which already has them)
5. Add uncertainty surfacing to 7 skills that make judgment calls
6. Add rubric compression to 2 review skills missing it (Soundness Review, Pre-Commit Review)
7. Add read-only research guards to 3 skills with investigation phases
8. Expand Rationalizations to Reject with new domain-specific entries across all 10 skills

### Non-Goals

- Changing skill process flow, phases, or phase ordering
- Adding patterns to non-core skills (knowledge skills, technology pattern skills)
- Runtime enforcement of discipline patterns (static spec additions only)
- Modifying validation rules (Batch 1 handles `## Rationalizations to Reject` enforcement)

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Red Flags as a dedicated section with quoted trigger phrases | Agents pattern-match quoted phrases more reliably than prose descriptions. Code Review's existing Red Flags section is the model. |
| D2 | Comment guards as Red Flag entries, not a separate section | Comment replacement is one type of red flag. Adding it as entries within Red Flags keeps the skill structure flat. |
| D3 | Uncertainty surfacing as a subsection within Process, not standalone | Uncertainty classification (blocking/assumption/deferrable) is a process behavior, not a structural section. Embedding it where decisions happen is more effective. |
| D4 | Rubric compression follows Code Review/Verification format exactly | `domain\|check-name\|severity\|criterion` pipe-delimited single-line format. Proven to reduce token consumption 2-5x. |
| D5 | review-never-fixes as both an Iron Law reinforcement and a Rationalization entry | The constraint needs to appear where the agent encounters the temptation (during findings) AND in the rejection table (as a safety net). |
| D6 | read-only research as a Gate, not just a guideline | Investigation/research phases that produce code violate the skill's phase contract. Hard stop, not suggestion. |
| D7 | New Rationalizations are additive — existing entries unchanged | Existing entries are proven. New entries fill gaps revealed by production agent behavior. |
| D8 | Iron Law naming normalized to "Iron Law" (not "Iron Rule") | Consistency across the skill suite. Refactoring's "Iron Rule" becomes "Iron Law" to match the 7 other skills. |

## Technical Design

### Pattern Definitions and Format

#### 1. Red Flags

Quoted phrases that signal the agent is about to violate discipline. When an agent detects itself producing or encountering these phrases, it must stop and follow the corrective action.

```markdown
## Red Flags

| Flag | Corrective Action |
| ---- | ----------------- |
| "I'll just..." | STOP. "Just" signals corner-cutting. State what you are skipping and why the skip is safe — if you cannot, do not skip. |
| "This is similar enough to..." | STOP. Similar is not identical. Verify the assumption before proceeding. |
```

Format: 2-column table, `Flag` (quoted phrase) and `Corrective Action` (imperative instruction). 3-6 entries per skill, domain-specific.

#### 2. Comment Replacement Guards (within Red Flags)

Entries added to the Red Flags table that specifically catch code-to-comment replacement:

```markdown
| "// removed", "// TODO: re-add", "// no longer needed" replacing functional code | STOP. Deleting code and replacing with a comment is not refactoring — it is deletion with a fig leaf. Either keep the code or delete it cleanly with a test proving it is unnecessary. |
```

#### 3. Uncertainty Surfacing

A subsection within Process that classifies unknowns encountered during skill execution:

```markdown
### Uncertainty Surfacing

When you encounter an unknown during [phase], classify it immediately:

- **Blocking:** Cannot proceed without resolution. STOP and surface to human with options.
- **Assumption:** Can proceed if assumption is stated explicitly. Document the assumption and continue. If the assumption proves wrong later, the work must be revisited.
- **Deferrable:** Does not affect current work. Record in session state for future consideration.

Do not bury unknowns. An unstated assumption is a latent bug.
```

#### 4. Rubric Compression

Pipe-delimited single-line format for checklists passed to subagents or used internally:

```
level|check-name|criterion
```

Already present in Code Review and Verification. Add to Soundness Review and Pre-Commit Review.

#### 5. review-never-fixes

Reinforcement of the boundary between identifying issues and fixing them:

```markdown
**Review identifies issues. Review never fixes them.**
```

Added as Iron Law reinforcement in review/verification skills, plus a Rationalization entry:

```markdown
| "I found the issue and the fix is obvious, so I will apply it while reviewing" | Review and fix are separate roles. A reviewer who applies fixes is editing with reviewer authority and no review. Note the fix in the finding. Do not apply it. |
```

#### 6. read-only research

Gate for investigation/research phases:

```markdown
- **Research phases are read-only.** Phase 1 INVESTIGATE / SCOPE / EXPLORE produces understanding, not code. If you find yourself writing production code or tests during a research phase, STOP. You have jumped ahead.
```

#### 7. Iron Law additions

For skills with implicit but not explicit Iron Laws:

- **Debugging:** "Phase 1 before ANY fix. No exceptions." (already stated in prose, promote to Iron Law section)
- **Skill Authoring:** "No skill ships without validation and test scenarios exercising every discipline section."
- **Pre-Commit Review:** "Mechanical checks gate AI review. No exceptions."

#### 8. Expanded Rationalizations

2-3 new domain-specific entries per skill. Content targets gaps revealed by agent behavior patterns.

### Upgrade Matrix

| Skill | Iron Law | Red Flags | review-never-fixes | read-only | comment guards | uncertainty | rubric | New Rationalizations |
|-------|----------|-----------|--------------------|-----------| --------------|-------------|--------|---------------------|
| harness-tdd | — | ADD (4) | — | — | ADD (1 entry) | ADD | — | ADD (2) |
| harness-refactoring | RENAME | ADD (4) | — | — | ADD (1 entry) | ADD | — | ADD (2) |
| harness-debugging | ADD | ADD (4) | — | ADD | ADD (1 entry) | ADD | — | ADD (2) |
| harness-skill-authoring | ADD | ADD (4) | ADD | — | ADD (1 entry) | — | — | ADD (2) |
| harness-verification | — | ADD (4) | ADD | — | ADD (1 entry) | ADD | — | ADD (2) |
| harness-soundness-review | — | ADD (4) | ADD | — | ADD (1 entry) | ADD | ADD | ADD (2) |
| harness-pre-commit-review | ADD | ADD (4) | ADD | — | ADD (1 entry) | — | ADD | ADD (2) |
| harness-execution | — | ADD (4) | — | ADD | ADD (1 entry) | ADD | — | ADD (2) |
| harness-planning | — | ADD (4) | — | ADD | ADD (1 entry) | — | — | ADD (2) |
| harness-code-review | — | — | — | — | — | ADD | — | ADD (2) |

**Totals:** 3 Iron Laws added/renamed, 9 Red Flags sections (36 entries), 4 review-never-fixes, 3 read-only research, 9 comment guard entries, 7 uncertainty surfacing, 2 rubric compression, 20 new Rationalizations.

### What Is NOT Changing

- No changes to skill.yaml files
- No changes to skill process phases or ordering
- No changes to validation rules or CLI code
- No changes to MCP tools
- No changes to existing Rationalizations to Reject entries (additive only)
- No changes to non-core skills

## Success Criteria

| # | Criterion | Observable/Testable |
|---|-----------|---------------------|
| 1 | All 9 target skills have `## Red Flags` section | Grep for `## Red Flags` in all 10 SKILL.md files; 10/10 match (Code Review already has it) |
| 2 | All 10 skills have explicit `## Iron Law` or `### Iron Law` section | Grep for `Iron Law` heading; 10/10 match |
| 3 | 4 review/verification skills state review-never-fixes constraint | Grep for "Review identifies issues. Review never fixes" in Verification, Soundness, Pre-Commit, Skill Authoring |
| 4 | 9 skills have comment replacement guard entry in Red Flags | Grep for "replacing functional code" or "comment replacing code" in Red Flags sections |
| 5 | 7 skills have uncertainty surfacing subsection | Grep for "Uncertainty Surfacing" or "Blocking.*Assumption.*Deferrable" pattern |
| 6 | Soundness Review and Pre-Commit Review have Rubric Compression sections | Grep for `## Rubric Compression` in both files |
| 7 | 3 skills have read-only research gate | Grep for "read-only" in Gates of Debugging, Execution, Planning |
| 8 | All 10 skills have 2+ new Rationalization entries (total entries increased) | Count rows in Rationalizations table before/after |
| 9 | `harness validate` passes after all changes | Run `harness validate` — exit code 0 |
| 10 | No existing Rationalization entries were modified or removed | Diff shows only additions to Rationalizations tables |

## Implementation Order

1. **Iron Law normalization** — Rename Refactoring's "Iron Rule" to "Iron Law". Add Iron Law sections to Debugging, Skill Authoring, Pre-Commit Review.
2. **Red Flags sections** — Add to all 9 skills missing them, including comment replacement guard entries.
3. **review-never-fixes guards** — Add to Verification, Soundness Review, Pre-Commit Review, Skill Authoring.
4. **read-only research gates** — Add to Debugging, Execution, Planning.
5. **Uncertainty surfacing** — Add to TDD, Refactoring, Debugging, Verification, Soundness Review, Execution, Code Review.
6. **Rubric compression** — Add to Soundness Review and Pre-Commit Review.
7. **Expanded Rationalizations** — Add 2-3 new entries per skill across all 10.
8. **Validate** — Run `harness validate` across all skills.
