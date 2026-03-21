# Plan: User Escalation UX (Soundness Review Phase 8)

**Date:** 2026-03-21
**Spec:** docs/changes/spec-plan-soundness-review/proposal.md
**Estimated tasks:** 2
**Estimated time:** 8 minutes

## Goal

Replace the "Status: Not yet implemented" stub in Phase 4 SURFACE of the soundness review SKILL.md with detailed presentation procedures that define how unfixable issues are grouped, prioritized, presented, resolved, and re-checked.

## Observable Truths (Acceptance Criteria)

1. The line `> **Status:** Not yet implemented. Surfacing UX will be added in Phase 8 of the implementation order.` no longer exists in either platform copy of the SKILL.md.
2. Phase 4 SURFACE contains detailed procedures for: (a) grouping findings by severity then by check ID, (b) presenting each finding with what/why/resolution, (c) user interaction patterns (acknowledge, resolve, dismiss-with-reason), (d) resolution tracking (which findings are resolved, which are pending), and (e) the re-check flow after user resolution.
3. The Clean Exit criteria are explicit: zero findings across all checks after the final re-check pass.
4. When the user dismisses a warning-severity finding with a reason, the system shall log the dismissal and not re-surface that finding in subsequent loop iterations.
5. When the user resolves a finding, the system shall loop back to Phase 1 (CHECK) to verify the fix and catch cascading issues.
6. If no `needs-user-input` findings remain after convergence (all were auto-fixed), the system shall skip SURFACE entirely and proceed to Clean Exit.
7. Both platform copies (claude-code, gemini-cli) are byte-identical after the change.
8. `harness validate` passes after the change.

## File Map

- MODIFY `agents/skills/claude-code/harness-soundness-review/SKILL.md` (replace Phase 4 SURFACE stub with detailed procedures)
- COPY `agents/skills/gemini-cli/harness-soundness-review/SKILL.md` (byte-identical copy of claude-code version)

## Tasks

### Task 1: Replace SURFACE stub with detailed presentation procedures

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-soundness-review/SKILL.md`

1. Read the current SKILL.md and locate Phase 4: SURFACE (lines 1030-1046).

2. Replace the content between `### Phase 4: SURFACE — Present Remaining Issues` and the `---` separator before `### Codebase and Graph Integration` with the following expanded content:

```markdown
### Phase 4: SURFACE — Present Remaining Issues

When findings remain after the convergence loop (Phase 3 determined no further auto-fix progress), present them to the user. If no `needs-user-input` findings remain (all were resolved by auto-fix), skip this phase entirely and proceed to Clean Exit.

#### Step 1: Group and Prioritize Findings

Organize remaining findings for presentation:

1. **Group by severity.** Present all `error` findings before `warning` findings. Errors block sign-off; warnings are advisory.
2. **Within each severity group, order by check ID.** S1 before S2 before S3 (spec mode); P1 before P2 before P3 (plan mode). This gives the user a predictable reading order.
3. **Count and announce.** State the total: `N remaining issues need your input (X errors, Y warnings).`

#### Step 2: Present Each Finding

For each finding, present exactly three sections:

**What is wrong** — Use the finding's `title` as a heading, followed by the `detail` field. Include the `evidence` references so the user can locate the problem in context.
```

[{id}] {title} ({severity})
{detail}
Evidence: {evidence[0]}, {evidence[1]}, ...

```

**Why it matters** — Explain the consequence of leaving this unresolved:
- For `error` severity: "This blocks sign-off. The spec/plan cannot be finalized until this is resolved."
- For `warning` severity: "This is advisory. You may dismiss it with a reason, but the concern will be logged."

**Suggested resolution** — Present the `suggestedFix` as the primary option, then list alternative resolution paths:
- **Option A (recommended):** The suggested fix from the finding.
- **Option B:** An alternative approach if one is apparent from context.
- **Option C (warnings only):** "Dismiss with reason — explain why this is acceptable."

#### Step 3: User Interaction

Wait for the user to respond to each finding. Accepted responses:

1. **Resolve:** The user makes the suggested change (or an alternative). Mark the finding as `resolved`. The user may edit the spec/plan directly, add a decision to the Decisions table, add a task, or modify an existing task.

2. **Dismiss with reason (warnings only):** The user provides a reason why the warning is acceptable. Mark the finding as `dismissed` and log: `[{id}] DISMISSED by user: {reason}`. Dismissed findings are not re-surfaced in subsequent loop iterations.

3. **Clarify:** The user asks for more context about the finding. Provide additional detail from the evidence and codebase reads. Do not mark the finding as resolved — wait for a resolve or dismiss response.

Error-severity findings cannot be dismissed. They must be resolved before sign-off.

#### Step 4: Track Resolution Progress

Maintain a running status of all surfaced findings:

```

Surfaced findings: N total
Resolved: X
Dismissed: Y (warnings only)
Pending: Z

```

After each user resolution or dismissal, update the count and present the next pending finding. When all findings are either resolved or dismissed, proceed to Step 5.

#### Step 5: Re-Check After Resolution

After all surfaced findings have been addressed:

1. Loop back to Phase 1 (CHECK) to verify that user resolutions are correct and catch any cascading issues introduced by the changes.
2. Previously dismissed findings (logged with reason) are excluded from this re-check. They do not re-appear.
3. If the re-check produces new findings, the full convergence loop runs again (Phase 1 through Phase 4). This is expected — user changes can introduce new issues.
4. If the re-check produces zero findings, proceed to Clean Exit.

#### Clean Exit

Clean Exit occurs when ALL of the following are true:

- All checks pass with zero findings (excluding dismissed warnings).
- No `error`-severity findings are pending or dismissed (errors cannot be dismissed).
- The convergence loop has terminated (issue count stopped decreasing or reached zero).

On clean exit:
1. Announce: `CLEAN EXIT — all checks pass. Returning control to {parent skill} for sign-off.`
2. If any warnings were dismissed, include a summary: `Note: {N} warnings were dismissed by user. See log for reasons.`
3. Return control to the parent skill (harness-brainstorming or harness-planning).
```

3. Verify the new content integrates smoothly with the surrounding sections. The section before (Phase 3: CONVERGE) ends with the termination proof. The section after starts with `### Codebase and Graph Integration`. Ensure the `---` separator is preserved between them.

4. Run: `harness validate`
5. Commit: `feat(soundness-review): add detailed SURFACE presentation procedures for user escalation UX`

### Task 2: Copy to gemini-cli and verify parity

**Depends on:** Task 1
**Files:** `agents/skills/gemini-cli/harness-soundness-review/SKILL.md`

1. Copy the claude-code SKILL.md to the gemini-cli location:

   ```
   cp agents/skills/claude-code/harness-soundness-review/SKILL.md agents/skills/gemini-cli/harness-soundness-review/SKILL.md
   ```

2. Verify byte-identical parity:

   ```
   diff agents/skills/claude-code/harness-soundness-review/SKILL.md agents/skills/gemini-cli/harness-soundness-review/SKILL.md
   ```

   Expected: no output (files are identical).

3. Run: `harness validate`

4. Stage both files together (honoring the Prettier parity learning from prior phases) and commit:

   ```
   git add agents/skills/claude-code/harness-soundness-review/SKILL.md agents/skills/gemini-cli/harness-soundness-review/SKILL.md
   ```

5. Commit: `feat(soundness-review): add detailed SURFACE presentation procedures for user escalation UX`

**Note:** Tasks 1 and 2 should be combined into a single commit to ensure both platform copies are staged together, consistent with the Prettier parity learning from prior phases (see learnings.md entries from Phases 3-6).

---

## Traceability

| Observable Truth                          | Delivered by                                       |
| ----------------------------------------- | -------------------------------------------------- |
| 1. Stub removed                           | Task 1, step 2                                     |
| 2. Detailed procedures present            | Task 1, step 2 (all five sub-procedures)           |
| 3. Clean Exit criteria explicit           | Task 1, step 2 (Clean Exit subsection)             |
| 4. Dismiss-with-reason logged             | Task 1, step 2 (Step 3: User Interaction)          |
| 5. Re-check after resolution              | Task 1, step 2 (Step 5: Re-Check After Resolution) |
| 6. Skip SURFACE when no user-input needed | Task 1, step 2 (opening paragraph)                 |
| 7. Platform parity                        | Task 2                                             |
| 8. harness validate passes                | Tasks 1 and 2, final steps                         |

## Notes

- The examples in the SKILL.md (lines 1081-1180) already demonstrate the SURFACE flow with realistic output. They do not need to be updated -- the new detailed procedures are consistent with what the examples show.
- The existing references to Phase 4 (SURFACE) in Phase 3 CONVERGE (line 898) and Escalation (line 1195) use the correct terminology and do not need updates.
- Both platform copies must be staged together in one commit to ensure Prettier formats them identically.
