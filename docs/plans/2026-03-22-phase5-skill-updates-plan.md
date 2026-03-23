# Plan: Phase 5 — Skill Updates (Agent Workflow Acceleration)

**Date:** 2026-03-22
**Spec:** docs/changes/agent-workflow-acceleration/proposal.md
**Estimated tasks:** 14
**Estimated time:** 56 minutes

## Goal

All claude-code and gemini-cli skills that use `emit_interaction`, multi-call context assembly, sequential health checks, or manual code review invocations are updated to use the new structured `InteractionOption` format, `gather_context`, `assess_project`, and `review_changes` tools respectively.

## Observable Truths (Acceptance Criteria)

1. When any skill calls `emit_interaction` with `type: 'question'`, the call uses `InteractionOption` objects with `pros`, `cons`, `risk`, and `effort` fields — not bare strings. (Criterion 17)
2. When any skill calls `emit_interaction` with `type: 'question'`, the call includes a `recommendation` object with `optionIndex`, `reason`, and `confidence` fields. (Criterion 17, Decision 8)
3. When `harness-execution` loads context in its PREPARE phase, it uses `gather_context` instead of 5 separate read operations. (Criterion 18)
4. When `harness-autopilot` loads context in its INIT phase, it uses `gather_context` instead of separate file reads. (Criterion 18)
5. When `harness-code-review` runs Phase 2 MECHANICAL, it uses `assess_project` instead of running `harness validate`, `harness check-deps`, `harness check-docs` as separate commands. (Criterion 19)
6. When `harness-pre-commit-review` runs mechanical checks, it references `assess_project` for harness-specific validation. (Criterion 19)
7. When `harness-code-review` describes the review pipeline's context assembly (Phase 3), it references `gather_context` for graph-enhanced context. (Criterion 18)
8. When `harness-pre-commit-review` performs AI review on staged changes, it references `review_changes` with `depth: 'quick'`. (Criterion 20)
9. When `harness-code-review` transitions emit `type: 'transition'`, the call includes `qualityGate` with `checks` array and `allPassed` boolean. (Criterion 15)
10. All separate gemini-cli skill copies are synced to match their claude-code counterparts after edits.
11. `harness validate` passes after all changes.
12. An integration test exists at `packages/mcp-server/tests/tools/workflow-e2e.test.ts` covering the `gather_context -> do work -> emit_interaction question -> assess_project -> emit_interaction transition+qualityGate` flow. (Criterion 23)

## File Map

```
MODIFY agents/skills/claude-code/harness-brainstorming/SKILL.md (emit_interaction structured options) [HARDLINKED - edits gemini-cli too]
MODIFY agents/skills/claude-code/harness-planning/SKILL.md (emit_interaction structured options) [HARDLINKED]
MODIFY agents/skills/claude-code/harness-execution/SKILL.md (emit_interaction + gather_context) [HARDLINKED]
MODIFY agents/skills/claude-code/harness-verification/SKILL.md (emit_interaction structured options) [HARDLINKED]
MODIFY agents/skills/claude-code/harness-code-review/SKILL.md (emit_interaction + assess_project + gather_context + review_changes) [HARDLINKED]
MODIFY agents/skills/claude-code/harness-autopilot/SKILL.md (gather_context in INIT)
SYNC   agents/skills/gemini-cli/harness-autopilot/SKILL.md (copy from claude-code)
MODIFY agents/skills/claude-code/harness-pre-commit-review/SKILL.md (assess_project + review_changes) [HARDLINKED]
CREATE packages/mcp-server/tests/tools/workflow-e2e.test.ts (integration test)
```

## Tasks

### Task 1: Update harness-brainstorming emit_interaction calls to structured format

**Depends on:** none
**Files:** agents/skills/claude-code/harness-brainstorming/SKILL.md

This file is hardlinked to gemini-cli, so one edit covers both.

1. Open `agents/skills/claude-code/harness-brainstorming/SKILL.md`

2. Replace the Phase 2 question example (lines 43-52) from:

   ````markdown
   ```json
   emit_interaction({
     path: "<project-root>",
     type: "question",
     question: {
       text: "For auth, should we use:",
       options: ["A) existing JWT middleware", "B) OAuth2 via provider X", "C) external service"]
     }
   })
   ```
   ````

   To:

   ````markdown
   ```json
   emit_interaction({
     path: "<project-root>",
     type: "question",
     question: {
       text: "For auth, which approach should we use?",
       options: [
         {
           label: "A) Existing JWT middleware",
           pros: ["Already in codebase", "Team has experience"],
           cons: ["No refresh token support", "Session-only"],
           risk: "low",
           effort: "low"
         },
         {
           label: "B) OAuth2 via provider X",
           pros: ["Industry standard", "Refresh tokens built-in"],
           cons: ["New dependency", "Learning curve"],
           risk: "medium",
           effort: "medium"
         },
         {
           label: "C) External auth service",
           pros: ["Zero maintenance", "Enterprise features included"],
           cons: ["Vendor lock-in", "Monthly cost", "Latency"],
           risk: "medium",
           effort: "low"
         }
       ],
       recommendation: {
         optionIndex: 0,
         reason: "Sufficient for current requirements. OAuth2 adds complexity we don't need yet.",
         confidence: "high"
       }
     }
   })
   ```
   ````

3. Replace the Phase 4 confirmation example (lines 117-126) from:

   ````markdown
   ```json
   emit_interaction({
     path: "<project-root>",
     type: "confirmation",
     confirmation: {
       text: "Approve spec at <file-path>?",
       context: "<one-paragraph summary of the design>"
     }
   })
   ```
   ````

   To:

   ````markdown
   ```json
   emit_interaction({
     path: "<project-root>",
     type: "confirmation",
     confirmation: {
       text: "Approve spec at <file-path>?",
       context: "<one-paragraph summary of the design>",
       impact: "Spec approval unlocks implementation planning. No code changes yet.",
       risk: "low"
     }
   })
   ```
   ````

4. Replace the Phase 4 transition example (lines 148-159) to include `qualityGate`:

   From:

   ````markdown
   ```json
   {
     "type": "transition",
     "transition": {
       "completedPhase": "brainstorming",
       "suggestedNext": "planning",
       "reason": "Spec approved and written to docs/",
       "artifacts": ["<spec file path>"],
       "requiresConfirmation": true,
       "summary": "<Spec title> -- <key design choices>. <N> success criteria, <N> implementation phases."
     }
   }
   ```
   ````

   To:

   ````markdown
   ```json
   {
     "type": "transition",
     "transition": {
       "completedPhase": "brainstorming",
       "suggestedNext": "planning",
       "reason": "Spec approved and written to docs/",
       "artifacts": ["<spec file path>"],
       "requiresConfirmation": true,
       "summary": "<Spec title> -- <key design choices>. <N> success criteria, <N> implementation phases.",
       "qualityGate": {
         "checks": [
           {
             "name": "spec-written",
             "passed": true,
             "detail": "Written to docs/changes/<feature>/proposal.md"
           },
           { "name": "harness-validate", "passed": true },
           { "name": "human-approved", "passed": true }
         ],
         "allPassed": true
       }
     }
   }
   ```
   ````

5. Verify the file still has required sections: `## Process`, `## Examples`, `## Gates`, `## Escalation`.

6. Run: `harness validate`

7. Commit: `feat(skills): update harness-brainstorming emit_interaction to structured format`

---

### Task 2: Update harness-planning emit_interaction calls to structured format

**Depends on:** none
**Files:** agents/skills/claude-code/harness-planning/SKILL.md

This file is hardlinked to gemini-cli, so one edit covers both.

1. Open `agents/skills/claude-code/harness-planning/SKILL.md`

2. Replace the Phase 1 scope clarification question example (lines 43-52) from:

   ````markdown
   ```json
   emit_interaction({
     path: "<project-root>",
     type: "question",
     question: {
       text: "The spec mentions X but does not define behavior for Y. Should we:",
       options: ["A) Include Y in this plan", "B) Defer Y to a follow-up plan", "C) Update the spec first"]
     }
   })
   ```
   ````

   To:

   ````markdown
   ```json
   emit_interaction({
     path: "<project-root>",
     type: "question",
     question: {
       text: "The spec mentions X but does not define behavior for Y. Should we:",
       options: [
         {
           label: "A) Include Y in this plan",
           pros: ["Complete feature in one pass", "No follow-up coordination needed"],
           cons: ["Increases plan scope and time", "May delay delivery"],
           risk: "medium",
           effort: "high"
         },
         {
           label: "B) Defer Y to a follow-up plan",
           pros: ["Keeps current plan focused", "Ship sooner"],
           cons: ["Y remains unhandled", "May need rework when Y is added"],
           risk: "low",
           effort: "low"
         },
         {
           label: "C) Update the spec first",
           pros: ["Design is complete before planning", "No surprises during execution"],
           cons: ["Blocks planning until spec is updated", "Extra round-trip"],
           risk: "low",
           effort: "medium"
         }
       ],
       recommendation: {
         optionIndex: 1,
         reason: "Keeping the current plan focused reduces risk. Y can be addressed in a dedicated follow-up.",
         confidence: "medium"
       }
     }
   })
   ```
   ````

3. Replace the Phase 4 confirmation example (lines 172-180) from:

   ````markdown
   ```json
   emit_interaction({
     path: "<project-root>",
     type: "confirmation",
     confirmation: {
       text: "Approve plan at <plan-file-path>?",
       context: "<task count> tasks, <estimated time> minutes. <one-sentence summary>"
     }
   })
   ```
   ````

   To:

   ````markdown
   ```json
   emit_interaction({
     path: "<project-root>",
     type: "confirmation",
     confirmation: {
       text: "Approve plan at <plan-file-path>?",
       context: "<task count> tasks, <estimated time> minutes. <one-sentence summary>",
       impact: "Approving unlocks task-by-task execution. Plan defines exact file paths, code, and commands.",
       risk: "low"
     }
   })
   ```
   ````

4. Replace the Phase 4 transition example (lines 186-199) to include `qualityGate`:

   From:

   ````markdown
   ```json
   {
     "type": "transition",
     "transition": {
       "completedPhase": "planning",
       "suggestedNext": "execution",
       "reason": "Plan approved with all tasks defined",
       "artifacts": ["<plan file path>"],
       "requiresConfirmation": true,
       "summary": "<Plan title> -- <N> tasks, <N> checkpoints. Estimated <time>."
     }
   }
   ```
   ````

   To:

   ````markdown
   ```json
   {
     "type": "transition",
     "transition": {
       "completedPhase": "planning",
       "suggestedNext": "execution",
       "reason": "Plan approved with all tasks defined",
       "artifacts": ["<plan file path>"],
       "requiresConfirmation": true,
       "summary": "<Plan title> -- <N> tasks, <N> checkpoints. Estimated <time>.",
       "qualityGate": {
         "checks": [
           { "name": "plan-written", "passed": true, "detail": "Written to docs/plans/" },
           { "name": "harness-validate", "passed": true },
           { "name": "observable-truths-traced", "passed": true },
           { "name": "human-approved", "passed": true }
         ],
         "allPassed": true
       }
     }
   }
   ```
   ````

5. Verify the file still has required sections: `## Process`, `## Examples`, `## Gates`, `## Escalation`.

6. Run: `harness validate`

7. Commit: `feat(skills): update harness-planning emit_interaction to structured format`

---

### Task 3: Update harness-execution emit_interaction calls to structured format

**Depends on:** none
**Files:** agents/skills/claude-code/harness-execution/SKILL.md

This file is hardlinked to gemini-cli, so one edit covers both.

1. Open `agents/skills/claude-code/harness-execution/SKILL.md`

2. Replace the `[checkpoint:human-verify]` example (lines 107-115) from:

   ````markdown
   ```json
   emit_interaction({
     path: "<project-root>",
     type: "confirmation",
     confirmation: {
       text: "Task N complete. Output: <summary>. Continue to Task N+1?",
       context: "<test output or file diff summary>"
     }
   })
   ```
   ````

   To:

   ````markdown
   ```json
   emit_interaction({
     path: "<project-root>",
     type: "confirmation",
     confirmation: {
       text: "Task N complete. Output: <summary>. Continue to Task N+1?",
       context: "<test output or file diff summary>",
       impact: "Continuing proceeds to the next task. Declining pauses execution for review.",
       risk: "low"
     }
   })
   ```
   ````

3. Replace the `[checkpoint:decision]` example (lines 123-130) from:

   ````markdown
   ```json
   emit_interaction({
     path: "<project-root>",
     type: "question",
     question: {
       text: "Task N requires a decision: <description>",
       options: ["<option A>", "<option B>"]
     }
   })
   ```
   ````

   To:

   ````markdown
   ```json
   emit_interaction({
     path: "<project-root>",
     type: "question",
     question: {
       text: "Task N requires a decision: <description>",
       options: [
         {
           label: "<option A>",
           pros: ["<pro 1>", "<pro 2>"],
           cons: ["<con 1>"],
           risk: "low",
           effort: "low"
         },
         {
           label: "<option B>",
           pros: ["<pro 1>"],
           cons: ["<con 1>", "<con 2>"],
           risk: "medium",
           effort: "medium"
         }
       ],
       recommendation: {
         optionIndex: 0,
         reason: "<why this option is recommended>",
         confidence: "medium"
       }
     }
   })
   ```
   ````

4. Replace the Phase 3 VERIFY transition (lines 158-168) to include `qualityGate`:

   From:

   ````markdown
   ```json
   emit_interaction({
     path: "<project-root>",
     type: "transition",
     transition: {
       completedPhase: "execution",
       suggestedNext: "verification",
       reason: "All plan tasks executed and verified",
       artifacts: ["<list of created/modified files>"]
     }
   })
   ```
   ````

   To:

   ````markdown
   ```json
   emit_interaction({
     path: "<project-root>",
     type: "transition",
     transition: {
       completedPhase: "execution",
       suggestedNext: "verification",
       reason: "All plan tasks executed and verified",
       artifacts: ["<list of created/modified files>"],
       qualityGate: {
         checks: [
           { name: "all-tasks-complete", passed: true, detail: "<N>/<N> tasks" },
           { name: "harness-validate", passed: true },
           { name: "tests-pass", passed: true }
         ],
         allPassed: true
       }
     }
   })
   ```
   ````

5. Replace the Phase 4 auto-transition (lines 230-243) to include `qualityGate`:

   From:

   ````markdown
   ```json
   {
     "type": "transition",
     "transition": {
       "completedPhase": "execution",
       "suggestedNext": "verification",
       "reason": "All tasks complete",
       "artifacts": ["<list of created/modified files>"],
       "requiresConfirmation": false,
       "summary": "Completed <N> tasks. <N> files created, <N> modified. All quick gates passed."
     }
   }
   ```
   ````

   To:

   ````markdown
   ```json
   {
     "type": "transition",
     "transition": {
       "completedPhase": "execution",
       "suggestedNext": "verification",
       "reason": "All tasks complete",
       "artifacts": ["<list of created/modified files>"],
       "requiresConfirmation": false,
       "summary": "Completed <N> tasks. <N> files created, <N> modified. All quick gates passed.",
       "qualityGate": {
         "checks": [
           { "name": "all-tasks-complete", "passed": true, "detail": "<N>/<N> tasks" },
           { "name": "harness-validate", "passed": true },
           { "name": "tests-pass", "passed": true },
           { "name": "no-blockers", "passed": true }
         ],
         "allPassed": true
       }
     }
   }
   ```
   ````

6. Verify the file still has required sections: `## Process`, `## Examples`, `## Gates`, `## Escalation`.

7. Run: `harness validate`

8. Commit: `feat(skills): update harness-execution emit_interaction to structured format`

---

### Task 4: Update harness-execution PREPARE phase to use gather_context

**Depends on:** Task 3
**Files:** agents/skills/claude-code/harness-execution/SKILL.md

1. Open `agents/skills/claude-code/harness-execution/SKILL.md`

2. Replace Phase 1: PREPARE steps 2-5 (lines 29-35) from:

   ```markdown
   2. **Load state.** Read `.harness/state.json` to determine current position. If the file does not exist, this is a fresh start — position is Task 1.

   3. **Load learnings.** Read `.harness/learnings.md` for context from previous sessions. These are hard-won insights — do not ignore them.

   4. **Load failures.** Read `.harness/failures.md` for known dead ends. If any entries match approaches in the current plan, surface warnings before proceeding.

   5. **Load handoff.** Read `.harness/handoff.json` if it exists. Contains structured context from the previous skill (e.g., harness-planning passing context to harness-execution). Use this to prime session state.
   ```

   To:

   ````markdown
   2. **Gather context in one call.** Use the `gather_context` MCP tool to load all working context at once:

      ```json
      gather_context({
        path: "<project-root>",
        intent: "Execute plan tasks starting from current position",
        skill: "harness-execution",
        include: ["state", "learnings", "handoff", "validation"]
      })
      ```
   ````

   This returns `state` (current position — if null, this is a fresh start at Task 1), `learnings` (hard-won insights from previous sessions — do not ignore them), `handoff` (structured context from the previous skill), and `validation` (current project health). If any constituent fails, its field is null and the error is reported in `meta.errors`.
   3. **Check for known dead ends.** Review `learnings` entries tagged `[outcome:failure]`. If any match approaches in the current plan, surface warnings before proceeding.

   ```

   ```

3. Update the Harness Integration section to mention `gather_context`:

   Add after the existing `harness validate` bullet:

   ```markdown
   - **`gather_context`** — Used in PREPARE phase to load state, learnings, handoff, and validation in a single call instead of 4+ separate reads.
   ```

4. Verify the file still has required sections: `## Process`, `## Examples`, `## Gates`, `## Escalation`.

5. Run: `harness validate`

6. Commit: `feat(skills): update harness-execution to use gather_context in PREPARE phase`

---

### Task 5: Update harness-verification emit_interaction calls to structured format

**Depends on:** none
**Files:** agents/skills/claude-code/harness-verification/SKILL.md

This file is hardlinked to gemini-cli, so one edit covers both.

1. Open `agents/skills/claude-code/harness-verification/SKILL.md`

2. Replace the Verification Sign-Off example (lines 174-183) from:

   ````markdown
   ```json
   emit_interaction({
     path: "<project-root>",
     type: "confirmation",
     confirmation: {
       text: "Verification report: <VERDICT>. Accept and proceed?",
       context: "<summary: N artifacts checked, N gaps found>"
     }
   })
   ```
   ````

   To:

   ````markdown
   ```json
   emit_interaction({
     path: "<project-root>",
     type: "confirmation",
     confirmation: {
       text: "Verification report: <VERDICT>. Accept and proceed?",
       context: "<summary: N artifacts checked, N gaps found>",
       impact: "Accepting proceeds to code review. Declining requires gap resolution first.",
       risk: "<low if PASS, high if gaps remain>"
     }
   })
   ```
   ````

3. Replace the PASS transition example (lines 206-218) to include `qualityGate`:

   From:

   ````markdown
   ```json
   {
     "type": "transition",
     "transition": {
       "completedPhase": "verification",
       "suggestedNext": "review",
       "reason": "Verification passed at all 3 levels",
       "artifacts": ["<verified file paths>"],
       "requiresConfirmation": false,
       "summary": "Verification passed: <N> artifacts checked. EXISTS, SUBSTANTIVE, WIRED all passed."
     }
   }
   ```
   ````

   To:

   ````markdown
   ```json
   {
     "type": "transition",
     "transition": {
       "completedPhase": "verification",
       "suggestedNext": "review",
       "reason": "Verification passed at all 3 levels",
       "artifacts": ["<verified file paths>"],
       "requiresConfirmation": false,
       "summary": "Verification passed: <N> artifacts checked. EXISTS, SUBSTANTIVE, WIRED all passed.",
       "qualityGate": {
         "checks": [
           { "name": "level1-exists", "passed": true, "detail": "<N> artifacts present" },
           { "name": "level2-substantive", "passed": true, "detail": "No stubs or placeholders" },
           {
             "name": "level3-wired",
             "passed": true,
             "detail": "All artifacts imported, tested, integrated"
           },
           { "name": "anti-pattern-scan", "passed": true, "detail": "No matches" },
           { "name": "harness-validate", "passed": true }
         ],
         "allPassed": true
       }
     }
   }
   ```
   ````

4. Verify the file still has required sections: `## Process`, `## Examples`, `## Gates`, `## Escalation`.

5. Run: `harness validate`

6. Commit: `feat(skills): update harness-verification emit_interaction to structured format`

---

### Task 6: Update harness-code-review emit_interaction calls to structured format

**Depends on:** none
**Files:** agents/skills/claude-code/harness-code-review/SKILL.md

This file is hardlinked to gemini-cli, so one edit covers both.

1. Open `agents/skills/claude-code/harness-code-review/SKILL.md`

2. Replace the Review Acceptance example (lines 491-499) from:

   ````markdown
   ```json
   emit_interaction({
     path: "<project-root>",
     type: "confirmation",
     confirmation: {
       text: "Review complete: <Assessment>. Accept review?",
       context: "<N critical, N important, N suggestion findings>"
     }
   })
   ```
   ````

   To:

   ````markdown
   ```json
   emit_interaction({
     path: "<project-root>",
     type: "confirmation",
     confirmation: {
       text: "Review complete: <Assessment>. Accept review?",
       context: "<N critical, N important, N suggestion findings>",
       impact: "Accepting the review finalizes findings. If 'approve', ready for merge. If 'request-changes', fixes are needed.",
       risk: "<low if approve, high if critical findings>"
     }
   })
   ```
   ````

3. Replace the approve transition example (lines 522-534) to include `qualityGate`:

   From:

   ````markdown
   ```json
   {
     "type": "transition",
     "transition": {
       "completedPhase": "review",
       "suggestedNext": "merge",
       "reason": "Review approved with no blocking issues",
       "artifacts": ["<reviewed files>"],
       "requiresConfirmation": true,
       "summary": "Review approved. <N> suggestions noted. Ready to create PR or merge."
     }
   }
   ```
   ````

   To:

   ````markdown
   ```json
   {
     "type": "transition",
     "transition": {
       "completedPhase": "review",
       "suggestedNext": "merge",
       "reason": "Review approved with no blocking issues",
       "artifacts": ["<reviewed files>"],
       "requiresConfirmation": true,
       "summary": "Review approved. <N> suggestions noted. Ready to create PR or merge.",
       "qualityGate": {
         "checks": [
           { "name": "mechanical-checks", "passed": true },
           { "name": "no-critical-findings", "passed": true },
           { "name": "no-important-findings", "passed": true },
           { "name": "harness-validate", "passed": true }
         ],
         "allPassed": true
       }
     }
   }
   ```
   ````

4. Verify the file still has required sections: `## Process`, `## Examples`, `## Gates`, `## Escalation`.

5. Run: `harness validate`

6. Commit: `feat(skills): update harness-code-review emit_interaction to structured format`

---

### Task 7: Update harness-code-review Phase 2 MECHANICAL to use assess_project

**Depends on:** Task 6
**Files:** agents/skills/claude-code/harness-code-review/SKILL.md

1. Open `agents/skills/claude-code/harness-code-review/SKILL.md`

2. Replace the Phase 2 MECHANICAL harness validation step (lines 125-130) from:

   ````markdown
   1. **Harness validation:**
      ```bash
      harness validate
      harness check-deps
      harness check-docs
      ```
   ````

   To:

   ````markdown
   1. **Harness validation:** Use `assess_project` to run all harness health checks in parallel:
      ```json
      assess_project({
        path: "<project-root>",
        checks: ["validate", "deps", "docs"],
        mode: "detailed"
      })
      ```
      This runs `harness validate`, `harness check-deps`, and `harness check-docs` in parallel and returns a unified report. Any check failure is reported in the `checks` array with `passed: false`.
   ````

3. Update the Harness Integration section. Replace:

   ```markdown
   - **`harness validate`** — Run in Phase 2 (MECHANICAL). Must pass for the pipeline to continue to AI review.
   - **`harness check-deps`** — Run in Phase 2 (MECHANICAL). Failures are Critical issues that stop the pipeline.
   - **`harness check-docs`** — Run in Phase 2 (MECHANICAL). Documentation drift findings are recorded for the exclusion set.
   ```

   With:

   ```markdown
   - **`assess_project`** — Used in Phase 2 (MECHANICAL) to run `validate`, `deps`, and `docs` checks in parallel. Must pass for the pipeline to continue to AI review. Failures are Critical issues that stop the pipeline.
   ```

4. Verify the file still has required sections: `## Process`, `## Examples`, `## Gates`, `## Escalation`.

5. Run: `harness validate`

6. Commit: `feat(skills): update harness-code-review Phase 2 to use assess_project`

---

### Task 8: Update harness-code-review Phase 3 CONTEXT to reference gather_context

**Depends on:** Task 7
**Files:** agents/skills/claude-code/harness-code-review/SKILL.md

1. Open `agents/skills/claude-code/harness-code-review/SKILL.md`

2. In the "Graph-Enhanced Context (when available)" subsection of Phase 3 (around lines 204-211), replace:

   ```markdown
   #### Graph-Enhanced Context (when available)

   When a knowledge graph exists at `.harness/graph/`, use graph queries for faster, more accurate context:

   - `query_graph` — traverse dependency chain from changed files to find all imports and transitive dependencies
   - `get_impact` — find all affected tests, docs, and downstream code
   - `find_context_for` — assemble review context within token budget, ranked by relevance

   Graph queries replace manual grep/find commands and discover transitive dependencies that file search misses. Fall back to file-based commands if no graph is available.
   ```

   With:

   ````markdown
   #### Graph-Enhanced Context (when available)

   When a knowledge graph exists at `.harness/graph/`, use `gather_context` for efficient context assembly:

   ```json
   gather_context({
     path: "<project-root>",
     intent: "Code review of <change description>",
     skill: "harness-code-review",
     tokenBudget: 8000,
     include: ["graph", "learnings", "validation"]
   })
   ```
   ````

   This replaces manual `query_graph` + `get_impact` + `find_context_for` calls with a single composite call that assembles review context in parallel, ranked by relevance. Falls back gracefully when no graph is available (`meta.graphAvailable: false`).

   For domain-specific scoping (compliance, bug detection, security, architecture), supplement `gather_context` output with targeted `query_graph` calls as needed.

   ```

   ```

3. Update the Harness Integration section. Add:

   ```markdown
   - **`gather_context`** — Used in Phase 3 (CONTEXT) for efficient parallel context assembly. Replaces separate graph query calls.
   ```

4. Verify the file still has required sections: `## Process`, `## Examples`, `## Gates`, `## Escalation`.

5. Run: `harness validate`

6. Commit: `feat(skills): update harness-code-review Phase 3 to reference gather_context`

---

### Task 9: Update harness-pre-commit-review to use assess_project and review_changes

**Depends on:** none
**Files:** agents/skills/claude-code/harness-pre-commit-review/SKILL.md

This file is hardlinked to gemini-cli, so one edit covers both.

1. Open `agents/skills/claude-code/harness-pre-commit-review/SKILL.md`

2. After Phase 1 step 2 "Run Checks in Order" (the bash commands block around lines 36-43), add a new step before the Gate Decision:

   ````markdown
   #### 2b. Harness Health Check

   If the project uses harness, run `assess_project` for harness-specific validation:

   ```json
   assess_project({
     path: "<project-root>",
     checks: ["validate", "deps"],
     mode: "summary"
   })
   ```
   ````

   If `healthy: false`, include harness check failures in the mechanical check report. This replaces manually running `harness validate` and `harness check-deps` as separate commands.

   ```

   ```

3. In Phase 4: AI Review, step 1 "Get the Staged Diff" (lines 138-139), replace the raw git diff approach:

   From:

   ````markdown
   #### 1. Get the Staged Diff

   ```bash
   git diff --cached
   ```
   ````

   To:

   ````markdown
   #### 1. Quick Review via review_changes

   Use the `review_changes` MCP tool with `depth: 'quick'` for fast pre-commit analysis:

   ```json
   review_changes({
     path: "<project-root>",
     diff: "<output of git diff --cached>",
     depth: "quick",
     mode: "summary"
   })
   ```

   This runs forbidden pattern checks and size analysis. For the semantic review items below, supplement with manual diff reading.
   ````

4. Update the Harness Integration section (or add one if not present). Add references:

   ```markdown
   - **`assess_project`** — Used in Phase 1 for harness-specific health checks (validate + deps) in a single call.
   - **`review_changes`** — Used in Phase 4 with `depth: 'quick'` for fast pre-commit diff analysis.
   ```

5. Verify the file still has required sections: `## Process`, `## Examples`, `## Gates`, `## Escalation`.

6. Run: `harness validate`

7. Commit: `feat(skills): update harness-pre-commit-review to use assess_project and review_changes`

---

### Task 10: Update harness-autopilot (claude-code) INIT to use gather_context

**Depends on:** none
**Files:** agents/skills/claude-code/harness-autopilot/SKILL.md

This file is NOT hardlinked to gemini-cli (separate inodes, but identical content). Edit claude-code version.

1. Open `agents/skills/claude-code/harness-autopilot/SKILL.md`

2. Replace INIT step 5 (line 98) from:

   ```markdown
   5. **Load context.** Read `.harness/learnings.md` and `.harness/failures.md` (global, at `.harness/` root) if they exist. Note any relevant learnings or known dead ends for the current phase.
   ```

   To:

   ````markdown
   5. **Load context via gather_context.** Use the `gather_context` MCP tool to load all working context efficiently:

      ```json
      gather_context({
        path: "<project-root>",
        intent: "Autopilot phase execution for <spec name>",
        skill: "harness-autopilot",
        include: ["state", "learnings", "handoff", "validation"]
      })
      ```
   ````

   This loads learnings (including failure entries tagged `[outcome:failure]`), handoff context, state, and validation results in a single call. Note any relevant learnings or known dead ends for the current phase from the returned `learnings` array.

   ```

   ```

3. Update the Harness Integration section. Add:

   ```markdown
   - **`gather_context`** — Used in INIT phase to load learnings, state, handoff, and validation in a single call instead of reading files individually.
   ```

4. Verify the file still has required sections: `## Process`, `## Examples`, `## Gates`, `## Escalation`.

5. Run: `harness validate`

6. Commit: `feat(skills): update harness-autopilot to use gather_context in INIT phase`

---

### Task 11: Sync gemini-cli autopilot skill from claude-code

**Depends on:** Task 10
**Files:** agents/skills/gemini-cli/harness-autopilot/SKILL.md

1. Copy the updated claude-code autopilot to gemini-cli:

   ```bash
   cp agents/skills/claude-code/harness-autopilot/SKILL.md agents/skills/gemini-cli/harness-autopilot/SKILL.md
   ```

2. Verify the copy matches:

   ```bash
   diff agents/skills/claude-code/harness-autopilot/SKILL.md agents/skills/gemini-cli/harness-autopilot/SKILL.md
   ```

   (should produce no output)

3. Run: `harness validate`

4. Commit: `chore(skills): sync gemini-cli harness-autopilot with claude-code`

---

### Task 12: Sync all remaining separate gemini-cli skills

[checkpoint:human-verify] -- Verify Tasks 1-11 are correct before bulk-syncing all gemini skills.

**Depends on:** Tasks 1-11
**Files:** All 22 separate gemini-cli SKILL.md files

The 5 hardlinked skills (brainstorming, planning, execution, verification, code-review) are already synced by editing the claude-code copy. The harness-autopilot was synced in Task 11. The harness-pre-commit-review is hardlinked. This task syncs all remaining separate gemini-cli skills that may have been affected by transitive changes.

1. Run this sync script to copy all separate (non-hardlinked) gemini-cli skills from their claude-code counterparts:

   ```bash
   cd /Users/cwarner/Projects/harness-engineering
   for skill in harness-accessibility harness-codebase-cleanup harness-dependency-health harness-design harness-design-mobile harness-design-system harness-design-web harness-docs-pipeline harness-hotspot-detector harness-i18n harness-i18n-process harness-i18n-workflow harness-impact-analysis harness-knowledge-mapper harness-perf harness-perf-tdd harness-release-readiness harness-roadmap harness-security-scan harness-soundness-review harness-test-advisor; do
     cp "agents/skills/claude-code/$skill/SKILL.md" "agents/skills/gemini-cli/$skill/SKILL.md"
   done
   ```

2. Verify no diffs remain between claude-code and gemini-cli for all skills:

   ```bash
   for skill in $(ls agents/skills/gemini-cli/); do
     diff -q "agents/skills/claude-code/$skill/SKILL.md" "agents/skills/gemini-cli/$skill/SKILL.md" 2>/dev/null
   done
   ```

   (should produce no output)

3. Run: `harness validate`

4. Commit: `chore(skills): sync all separate gemini-cli skills with claude-code`

---

### Task 13: Create integration test for full workflow end-to-end

**Depends on:** none (tests against already-built Phase 1-4 tools)
**Files:** packages/mcp-server/tests/tools/workflow-e2e.test.ts

1. Create the integration test file `packages/mcp-server/tests/tools/workflow-e2e.test.ts`:

   ```typescript
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import * as path from 'node:path';
   import * as os from 'node:os';
   import * as fs from 'node:fs';

   /**
    * Integration test: Full workflow end-to-end
    * Criterion 23: gather_context -> do work -> emit_interaction question ->
    *               assess_project -> emit_interaction transition + qualityGate
    */
   describe('Workflow E2E: gather_context -> work -> emit_interaction -> assess_project -> transition', () => {
     let tmpDir: string;

     beforeEach(() => {
       tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-e2e-'));
       // Create minimal project structure
       fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });
       fs.writeFileSync(
         path.join(tmpDir, '.harness', 'state.json'),
         JSON.stringify({ schemaVersion: 1, position: { phase: 'execute', task: 'Task 1' } })
       );
       fs.writeFileSync(
         path.join(tmpDir, '.harness', 'learnings.md'),
         '## 2026-03-22\n- [skill:test] [outcome:success] Test learning\n'
       );
       fs.writeFileSync(
         path.join(tmpDir, '.harness', 'handoff.json'),
         JSON.stringify({
           fromSkill: 'harness-planning',
           phase: 'VALIDATE',
           summary: 'Test handoff',
         })
       );
     });

     it('gather_context returns state, learnings, and handoff in a single call', async () => {
       // This test verifies the gather_context tool can assemble context
       // We import the handler directly to test without MCP transport
       const { handleGatherContext } = await import('../../src/tools/gather-context');

       const result = await handleGatherContext({
         path: tmpDir,
         intent: 'Execute plan tasks',
         skill: 'harness-execution',
         include: ['state', 'learnings', 'handoff'],
       });

       expect(result.state).toBeDefined();
       expect(result.learnings).toBeDefined();
       expect(result.handoff).toBeDefined();
       expect(result.meta).toBeDefined();
       expect(result.meta.errors).toHaveLength(0);
     });

     it('emit_interaction validates structured question with InteractionOption', async () => {
       const { handleEmitInteraction } = await import('../../src/tools/interaction');

       const result = await handleEmitInteraction({
         path: tmpDir,
         type: 'question',
         question: {
           text: 'Which approach should we use?',
           options: [
             {
               label: 'A) Approach One',
               pros: ['Simple', 'Fast'],
               cons: ['Limited'],
               risk: 'low',
               effort: 'low',
             },
             {
               label: 'B) Approach Two',
               pros: ['Flexible'],
               cons: ['Complex', 'Slow'],
               risk: 'medium',
               effort: 'high',
             },
           ],
           recommendation: {
             optionIndex: 0,
             reason: 'Simplicity wins for current scope',
             confidence: 'high',
           },
         },
       });

       // Should return rendered markdown with pros/cons table
       expect(result.content).toBeDefined();
       const text =
         typeof result.content === 'string' ? result.content : (result.content[0]?.text ?? '');
       expect(text).toContain('Approach One');
       expect(text).toContain('Approach Two');
       expect(text).toContain('Recommendation');
     });

     it('assess_project runs health checks and returns unified report', async () => {
       const { handleAssessProject } = await import('../../src/tools/assess-project');

       const result = await handleAssessProject({
         path: tmpDir,
         checks: ['validate'],
         mode: 'summary',
       });

       expect(result).toHaveProperty('healthy');
       expect(result).toHaveProperty('checks');
       expect(result).toHaveProperty('assessedIn');
       expect(Array.isArray(result.checks)).toBe(true);
     });

     it('emit_interaction transition includes qualityGate', async () => {
       const { handleEmitInteraction } = await import('../../src/tools/interaction');

       const result = await handleEmitInteraction({
         path: tmpDir,
         type: 'transition',
         transition: {
           completedPhase: 'execution',
           suggestedNext: 'verification',
           reason: 'All tasks complete',
           artifacts: ['/path/to/file.ts'],
           requiresConfirmation: false,
           summary: 'Completed 5 tasks. All quick gates passed.',
           qualityGate: {
             checks: [
               { name: 'all-tasks-complete', passed: true, detail: '5/5 tasks' },
               { name: 'harness-validate', passed: true },
               { name: 'tests-pass', passed: true },
             ],
             allPassed: true,
           },
         },
       });

       expect(result.content).toBeDefined();
       const text =
         typeof result.content === 'string' ? result.content : (result.content[0]?.text ?? '');
       expect(text).toContain('verification');
     });

     it('full workflow sequence: gather -> question -> assess -> transition', async () => {
       const { handleGatherContext } = await import('../../src/tools/gather-context');
       const { handleEmitInteraction } = await import('../../src/tools/interaction');
       const { handleAssessProject } = await import('../../src/tools/assess-project');

       // Step 1: Gather context
       const context = await handleGatherContext({
         path: tmpDir,
         intent: 'Full workflow test',
         skill: 'harness-execution',
         include: ['state', 'learnings', 'handoff'],
       });
       expect(context.meta.errors).toHaveLength(0);

       // Step 2: Do work (simulated — nothing to do in test)

       // Step 3: Ask a structured question
       const question = await handleEmitInteraction({
         path: tmpDir,
         type: 'question',
         question: {
           text: 'Proceed with implementation?',
           options: [
             {
               label: 'Yes, proceed',
               pros: ['Keeps momentum'],
               cons: ['None identified'],
               risk: 'low',
               effort: 'low',
             },
           ],
           recommendation: {
             optionIndex: 0,
             reason: 'No blockers identified',
             confidence: 'high',
           },
         },
       });
       expect(question.content).toBeDefined();

       // Step 4: Assess project health
       const assessment = await handleAssessProject({
         path: tmpDir,
         checks: ['validate'],
         mode: 'summary',
       });
       expect(assessment).toHaveProperty('healthy');

       // Step 5: Emit transition with qualityGate
       const transition = await handleEmitInteraction({
         path: tmpDir,
         type: 'transition',
         transition: {
           completedPhase: 'execution',
           suggestedNext: 'verification',
           reason: 'All tasks complete',
           artifacts: [],
           requiresConfirmation: false,
           summary: 'Workflow complete.',
           qualityGate: {
             checks: [
               { name: 'assess-project', passed: assessment.healthy ?? false },
               { name: 'harness-validate', passed: true },
             ],
             allPassed: assessment.healthy ?? false,
           },
         },
       });
       expect(transition.content).toBeDefined();
     });
   });
   ```

2. Run the test:

   ```bash
   cd packages/mcp-server && npx vitest run tests/tools/workflow-e2e.test.ts
   ```

3. If tests fail due to import paths or handler signatures, adjust the imports to match the actual exports from the Phase 1-4 implementations. The key constraint is testing the sequence: `gather_context -> emit_interaction(question) -> assess_project -> emit_interaction(transition+qualityGate)`.

4. Run: `harness validate`

5. Commit: `test(mcp-server): add workflow e2e integration test for gather->question->assess->transition`

---

### Task 14: Final validation and acceptance

[checkpoint:human-verify] -- Verify all changes are correct and tests pass before final sign-off.

**Depends on:** Tasks 1-13
**Files:** none (validation only)

1. Run the full test suite:

   ```bash
   cd /Users/cwarner/Projects/harness-engineering && npx turbo run test
   ```

2. Run `harness validate` one final time.

3. Verify all acceptance criteria:
   - [ ] All 5 skills with `emit_interaction` use structured `InteractionOption` format (Tasks 1-6)
   - [ ] All `emit_interaction` `question` calls include `recommendation` with `optionIndex`, `reason`, `confidence` (Tasks 1-3)
   - [ ] All `emit_interaction` `transition` calls include `qualityGate` (Tasks 1-6)
   - [ ] `harness-execution` PREPARE uses `gather_context` (Task 4)
   - [ ] `harness-autopilot` INIT uses `gather_context` (Task 10)
   - [ ] `harness-code-review` Phase 2 uses `assess_project` (Task 7)
   - [ ] `harness-code-review` Phase 3 references `gather_context` (Task 8)
   - [ ] `harness-pre-commit-review` uses `assess_project` and `review_changes` (Task 9)
   - [ ] All gemini-cli skills synced (Tasks 11-12)
   - [ ] Integration test passes (Task 13)

4. Report results.
