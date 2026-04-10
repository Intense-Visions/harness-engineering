# Plan: Pipeline Skill Compression (Phase 1)

**Date:** 2026-04-10
**Spec:** docs/changes/pipeline-token-optimization/proposal.md
**Estimated tasks:** 9
**Estimated time:** 45 minutes

## Goal

Compress prose in all 8 pipeline SKILL.md files to reduce per-phase token consumption while preserving every behavioral rule, gate, escalation, and worked example.

## Observable Truths (Acceptance Criteria)

1. Each compressed SKILL.md has fewer lines than the original: soundness-review (<1000), autopilot (<750), code-review (<700), planning (<470), execution (<420), verification (<350), brainstorming (<340), router (<180)
2. Every gate statement from the original exists in the compressed version
3. Every escalation rule from the original exists in the compressed version
4. Every "Rationalizations to Reject" table row from the original exists in the compressed version
5. Every worked example from the original exists in the compressed version (content preserved, prose tightened)
6. Every process step and phase description exists in the compressed version
7. All emit_interaction and handoff JSON patterns exist in the compressed version
8. `harness validate` passes after all compressions are applied
9. Total line count across all 8 files is reduced by at least 25%

## Structural Baseline (for verification)

These counts MUST be preserved in compressed versions:

| Skill                    | Lines     | Gates | Escalation | Rationalizations | Iron Law | emit_interaction |
| ------------------------ | --------- | ----- | ---------- | ---------------- | -------- | ---------------- |
| harness-soundness-review | 1,277     | 4     | 6          | 5                | 1        | 0                |
| harness-autopilot        | 926       | 5     | 5          | 5                | 2        | 0                |
| harness-code-review      | 847       | 5     | 6          | 3                | 0        | 3                |
| harness-planning         | 589       | 5     | 5          | 5                | 1        | 6                |
| harness-execution        | 519       | 6     | 5          | 4                | 2        | 7                |
| harness-verification     | 430       | 5     | 5          | 4                | 3        | 3                |
| harness-brainstorming    | 415       | 5     | 5          | 4                | 1        | 6                |
| harness-router           | 208       | 4     | 3          | 4                | 2        | 0                |
| **Total**                | **5,211** |       |            |                  |          |                  |

## File Map

- MODIFY agents/skills/claude-code/harness-soundness-review/SKILL.md
- MODIFY agents/skills/claude-code/harness-autopilot/SKILL.md
- MODIFY agents/skills/claude-code/harness-code-review/SKILL.md
- MODIFY agents/skills/claude-code/harness-planning/SKILL.md
- MODIFY agents/skills/claude-code/harness-execution/SKILL.md
- MODIFY agents/skills/claude-code/harness-verification/SKILL.md
- MODIFY agents/skills/claude-code/harness-brainstorming/SKILL.md
- MODIFY agents/skills/claude-code/harness-router/SKILL.md

## Compression Techniques (apply to all tasks)

These techniques apply uniformly across all 8 files:

1. **Tighten verbose phrasing.** "You must always ensure that you..." becomes "Always...". "In order to..." becomes "To...". "It is important to note that..." becomes the content directly.
2. **Compact table cells.** Remove filler words from table cells. Shorten column headers where meaning is preserved.
3. **Remove excess blank lines.** No more than one blank line between sections. Remove blank lines between list items that don't need visual separation.
4. **Trim JSON examples.** Reduce JSON code blocks to the minimal illustrative form. Remove optional/obvious fields. Collapse multi-line JSON to fewer lines where readability is preserved.
5. **Collapse redundant explanations.** When a list item has a bold label followed by a long explanation that restates the label, shorten the explanation.
6. **Remove unnecessary horizontal rules.** Keep `---` only between major sections, not between every subsection.
7. **Shorten repeated boilerplate.** Session state tables, evidence requirements, and harness integration sections share common patterns -- compress the repetitive framing while keeping the unique content.

## Preserved Content (untouched -- do NOT compress these)

- Every gate statement (bold-prefix list items in Gates section)
- Every escalation rule (bold-prefix list items in Escalation section)
- Every Rationalizations to Reject table row
- Every worked example (tighten surrounding prose, but preserve the example content)
- Every Iron Law statement
- All emit_interaction JSON blocks (may trim optional fields but preserve structure)
- All handoff JSON patterns
- Process step numbering and phase names

## Tasks

### Task 1: Compress harness-soundness-review SKILL.md

**Depends on:** none
**Files:** agents/skills/claude-code/harness-soundness-review/SKILL.md
**Parallel group:** A (Tasks 1-4 can run in parallel)

1. Read the full file (1,277 lines)
2. Apply compression techniques:
   - Tighten the "How to detect" paragraphs in each check (S1-S7, P1-P7) -- these are the longest prose sections
   - Trim JSON finding examples to minimal form (keep one example per check, reduce to essential fields)
   - Compress the Fix Procedures section -- remove redundant procedure framing, keep the edit operation and fix log example
   - Compact the Convergence section -- the worked examples are long; tighten the surrounding prose but preserve the pass-by-pass trace
   - Tighten Silent vs Surfaced table cell text
   - Remove excess blank lines between check subsections
   - Compress Codebase and Graph Integration table cells
3. Target: ~900-1000 lines (22-30% reduction)
4. Verify structural preservation:
   - Gates count: 4 (grep `^\- \*\*No `)
   - Escalation count: 6 (grep `^\- \*\*When `)
   - Rationalizations: 5 rows
   - All 14 checks (S1-S7, P1-P7) still present
   - Finding schema JSON block preserved
   - Both worked examples (spec mode, plan mode) preserved
5. Run: `harness validate`
6. Run: `wc -l` -- must be under 1000
7. Commit: `refactor(skills): compress harness-soundness-review prose (~25% reduction)`

### Task 2: Compress harness-autopilot SKILL.md

**Depends on:** none
**Files:** agents/skills/claude-code/harness-autopilot/SKILL.md
**Parallel group:** A

**IMPORTANT:** This is Phase 1 prose compression only. Do NOT restructure the autopilot as an orchestrator -- that happens in Phase 3. Just compress the existing prose.

1. Read the full file (926 lines)
2. Apply compression techniques:
   - Tighten state machine descriptions -- keep the ASCII diagram, compress surrounding prose
   - Compact Agent tool parameter blocks -- these are very verbose; trim to essential fields
   - Compress INIT steps -- the schema migration and flag parsing are verbose
   - Tighten APPROVE_PLAN signal evaluation prose
   - Compress retry logic description in EXECUTE
   - Trim FINAL_REVIEW agent dispatch block
   - Compact DONE section -- the learnings promotion and roadmap sync are verbose
   - Shorten the 3-Phase Security Scanner example -- keep the flow but tighten descriptions
   - Compress Retry Budget Exhaustion example
   - Tighten Rigor Levels table cells
   - Remove excess blank lines between states
3. Target: ~700-750 lines (19-24% reduction)
4. Verify structural preservation:
   - Gates count: 5 (grep `^\- \*\*No `)
   - Escalation count: 5 (grep `^\- \*\*When `)
   - Rationalizations: 5 rows
   - All states present: INIT, ASSESS, PLAN, APPROVE_PLAN, EXECUTE, VERIFY, REVIEW, PHASE_COMPLETE, FINAL_REVIEW, DONE
   - State machine ASCII diagram preserved
   - Both examples preserved
5. Run: `harness validate`
6. Run: `wc -l` -- must be under 750
7. Commit: `refactor(skills): compress harness-autopilot prose (~20% reduction)`

### Task 3: Compress harness-code-review SKILL.md

**Depends on:** none
**Files:** agents/skills/claude-code/harness-code-review/SKILL.md
**Parallel group:** A

1. Read the full file (847 lines)
2. Apply compression techniques:
   - Compress Phase 3 CONTEXT section -- the context scoping table and assembly commands are verbose
   - Tighten Phase 4 FAN-OUT agent descriptions -- the checklist items have redundant framing
   - Compress Review Learnings Calibration section -- the relevance scoring procedure is verbose
   - Trim Phase 7 OUTPUT examples -- keep format, tighten framing
   - Compact the Evidence Gate subsection
   - Shorten Role A and Role C sections -- these are process documentation, not rules
   - Compress Context Assembly Commands block
   - Tighten Rigor Levels table cells
   - Remove the bash command examples that duplicate the preceding description (keep the commands themselves)
3. Target: ~600-700 lines (17-29% reduction)
4. Verify structural preservation:
   - Gates count: 5 (grep `^\- \*\*Never `)
   - Escalation count: 6 (grep `^\- \*\*When `)
   - Rationalizations: 3 rows
   - All 7 pipeline phases present (GATE through OUTPUT)
   - All 4 fan-out agents present (Compliance, Bug Detection, Security, Architecture)
   - ReviewFinding schema preserved
   - Pipeline example preserved
5. Run: `harness validate`
6. Run: `wc -l` -- must be under 700
7. Commit: `refactor(skills): compress harness-code-review prose (~20% reduction)`

### Task 4: Compress harness-planning SKILL.md

**Depends on:** none
**Files:** agents/skills/claude-code/harness-planning/SKILL.md
**Parallel group:** A

1. Read the full file (589 lines)
2. Apply compression techniques:
   - Tighten EARS Requirement Patterns section -- the "when to use" column and worked examples are verbose
   - Compress Phase 2 DECOMPOSE skeleton pass description -- the gating logic repeats what the Rigor Levels table says
   - Trim the emit_interaction JSON blocks -- keep structure, remove optional fields
   - Compact Session State table framing
   - Shorten Evidence Requirements section -- shares boilerplate with other skills
   - Tighten Change Specifications section
   - Compress Plan Document Structure template -- keep the structure, trim commentary
   - Compact Harness Integration bullets
   - Shorten both examples (notification feature, skeleton mode)
3. Target: ~420-470 lines (20-29% reduction)
4. Verify structural preservation:
   - Gates count: 5 (grep `^\- \*\*No `)
   - Escalation count: 5 (grep `^\- \*\*When `)
   - Rationalizations: 5 rows
   - All 4 phases present (SCOPE, DECOMPOSE, SEQUENCE, VALIDATE)
   - Iron Law preserved
   - EARS table preserved
   - Rigor Levels table preserved
   - Both examples preserved
5. Run: `harness validate`
6. Run: `wc -l` -- must be under 470
7. Commit: `refactor(skills): compress harness-planning prose (~22% reduction)`

### Task 5: Compress harness-execution SKILL.md

**Depends on:** none
**Files:** agents/skills/claude-code/harness-execution/SKILL.md
**Parallel group:** B (Tasks 5-8 can run in parallel)

1. Read the full file (519 lines)
2. Apply compression techniques:
   - Compress Phase 1 PREPARE -- the gather_context explanation and session resolution are verbose
   - Tighten Checkpoint Protocol -- three checkpoint types have repetitive framing; compress while keeping the JSON patterns
   - Compact Phase 3 VERIFY -- tighten the quick gate vs deep audit distinction
   - Compress Phase 4 PERSIST -- the session-scoped file paths are repeated with verbose fallback explanations
   - Shorten the Stopping Conditions section -- each condition has a bold label + long explanation; tighten
   - Trim the 5-Task Notification Plan example -- keep the flow, compress verbose descriptions
   - Compact Session State and Evidence Requirements sections
   - Compress Trace Output section
3. Target: ~370-420 lines (19-29% reduction)
4. Verify structural preservation:
   - Gates count: 6 (grep `^\- \*\*No `)
   - Escalation count: 5 (grep `^\- \*\*When `)
   - Rationalizations: 4 rows
   - All 4 phases present (PREPARE, EXECUTE, VERIFY, PERSIST)
   - Iron Law preserved
   - Checkpoint protocol preserved (3 types)
   - Example preserved
5. Run: `harness validate`
6. Run: `wc -l` -- must be under 420
7. Commit: `refactor(skills): compress harness-execution prose (~22% reduction)`

### Task 6: Compress harness-verification SKILL.md

**Depends on:** none
**Files:** agents/skills/claude-code/harness-verification/SKILL.md
**Parallel group:** B

1. Read the full file (430 lines)
2. Apply compression techniques:
   - Tighten Level 1/2/3 descriptions -- each level has numbered steps with verbose explanations; compress
   - Compact Anti-Pattern Scan section -- the scan targets list can be condensed
   - Compress Gap Identification template -- tighten the framing around the report format
   - Trim Regression Test Verification -- the 6-step protocol is clear but wordy
   - Compact Verification Sign-Off and Handoff sections
   - Shorten Evidence Requirements section -- shares boilerplate
   - Compress Non-Determinism Tolerance section
   - Tighten the New Service Module example
3. Target: ~300-350 lines (19-30% reduction)
4. Verify structural preservation:
   - Gates count: 5 (grep `^\- \*\*No `)
   - Escalation count: 5 (grep `^\- \*\*When `)
   - Rationalizations: 4 rows
   - All 3 verification levels present (EXISTS, SUBSTANTIVE, WIRED)
   - Iron Law preserved (3 occurrences)
   - Anti-pattern scan preserved
   - Regression test protocol preserved
   - Example preserved
5. Run: `harness validate`
6. Run: `wc -l` -- must be under 350
7. Commit: `refactor(skills): compress harness-verification prose (~22% reduction)`

### Task 7: Compress harness-brainstorming SKILL.md

**Depends on:** none
**Files:** agents/skills/claude-code/harness-brainstorming/SKILL.md
**Parallel group:** B

1. Read the full file (415 lines)
2. Apply compression techniques:
   - Compress Phase 2 EVALUATE -- the question-asking guidance repeats the "one at a time" and "multiple choice" points with verbose explanations
   - Tighten Phase 3 PRIORITIZE -- the approach template (Summary, How it works, Tradeoffs, Complexity, Risk) has verbose framing
   - Compact Phase 4 VALIDATE -- the spec writing and roadmap sync steps are wordy
   - Trim the Notification System example -- keep the flow, compress the multi-line Q&A format
   - Compress Party Mode section -- the perspective selection table and evaluation format are verbose
   - Shorten Session State, Evidence Requirements, and Harness Integration sections
   - Compact Scope Check section
   - Trim Context Keywords framing
3. Target: ~300-340 lines (18-28% reduction)
4. Verify structural preservation:
   - Gates count: 5 (grep `^\- \*\*No `)
   - Escalation count: 5 (grep `^\- \*\*When `)
   - Rationalizations: 4 rows
   - All 4 phases present (EXPLORE, EVALUATE, PRIORITIZE, VALIDATE)
   - Iron Law preserved
   - Party Mode section preserved
   - Example preserved
5. Run: `harness validate`
6. Run: `wc -l` -- must be under 340
7. Commit: `refactor(skills): compress harness-brainstorming prose (~22% reduction)`

### Task 8: Compress harness-router SKILL.md

**Depends on:** none
**Files:** agents/skills/claude-code/harness-router/SKILL.md
**Parallel group:** B

1. Read the full file (208 lines)
2. Apply compression techniques:
   - Compact the scope classification table -- the signal words column is verbose
   - Tighten the scope-to-skill mapping table
   - Compress Phase 2 CONFIRM -- the high/low confidence presentation templates are verbose
   - Trim Phase 3 DISPATCH -- short section but has redundant explanation
   - Compact the 5 examples -- each is 3 lines; tighten to 2 lines each
   - Compress confidence assessment description
3. Target: ~160-180 lines (13-23% reduction)
4. Verify structural preservation:
   - Gates count: 4 (grep `^\- \*\*No `)
   - Escalation count: 3 (grep `^\- \*\*When `)
   - Rationalizations: 4 rows
   - All 3 phases present (CLASSIFY, CONFIRM, DISPATCH)
   - Iron Law preserved
   - All 5 examples preserved
5. Run: `harness validate`
6. Run: `wc -l` -- must be under 180
7. Commit: `refactor(skills): compress harness-router prose (~18% reduction)`

### Task 9: Final Structural Verification

**Depends on:** Tasks 1-8
**Files:** all 8 SKILL.md files (read-only verification)

[checkpoint:human-verify]

1. Run `wc -l` on all 8 files. Verify each is within target range:
   - harness-soundness-review: <1000
   - harness-autopilot: <750
   - harness-code-review: <700
   - harness-planning: <470
   - harness-execution: <420
   - harness-verification: <350
   - harness-brainstorming: <340
   - harness-router: <180
2. Verify total line reduction is at least 25% (from 5,211 to <3,908)
3. Run structural verification script for each file:
   ```bash
   for skill in harness-soundness-review harness-autopilot harness-code-review harness-planning harness-execution harness-verification harness-brainstorming harness-router; do
     f="agents/skills/claude-code/$skill/SKILL.md"
     echo "=== $skill ==="
     echo "  Lines: $(wc -l < "$f")"
     echo "  Gates: $(grep -c '^\- \*\*No \|^\- \*\*Never ' "$f")"
     echo "  Escalation: $(grep -c '^\- \*\*When ' "$f")"
     echo "  Rationalizations: $(grep -c '^| \"' "$f")"
     echo "  Iron Law: $(grep -c 'Iron Law' "$f")"
     echo "  emit_interaction: $(grep -c 'emit_interaction' "$f")"
   done
   ```
4. Compare counts against the Structural Baseline table. Any decrease in gate/escalation/rationalization count is a FAILURE -- content was removed that should have been preserved.
5. Run: `harness validate`
6. Present results to human for sign-off
7. No commit for this task (verification only)
