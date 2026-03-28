# Plan: Wave 2.1 -- Skill Evidence Instructions

**Date:** 2026-03-27
**Spec:** docs/changes/ai-foundations-integration/proposal.md
**Estimated tasks:** 5
**Estimated time:** 15 minutes

## Goal

All five core workflow skills include evidence citation requirements in their SKILL.md files so that every technical claim is backed by file:line references, test output, or session evidence.

## Observable Truths (Acceptance Criteria)

1. `agents/skills/claude-code/harness-brainstorming/SKILL.md` contains an "Evidence Requirements" section between "Session State" and "Harness Integration" with citation instructions tailored to brainstorming (cite sources for design recommendations, reference prior art by file path)
2. `agents/skills/claude-code/harness-planning/SKILL.md` contains an "Evidence Requirements" section between "Session State" and "Harness Integration" with citation instructions tailored to planning (cite file:line for task specifications, reference existing code patterns)
3. `agents/skills/claude-code/harness-execution/SKILL.md` contains an "Evidence Requirements" section between "Session State" and "Harness Integration" with citation instructions tailored to execution (cite test output and file references for task completion claims)
4. `agents/skills/claude-code/harness-verification/SKILL.md` contains an "Evidence Requirements" section before "Harness Integration" (at line 294) with citation instructions tailored to verification (cite evidence for all pass/fail assertions -- this is the most evidence-heavy skill)
5. `agents/skills/claude-code/harness-code-review/SKILL.md` contains an "Evidence Requirements" section before "Harness Integration" (at line 631) with citation instructions tailored to code review (cite file:line for all review findings)
6. Each Evidence Requirements section includes the `manage_state` `append_entry` pattern for writing to the `evidence` session section
7. Each Evidence Requirements section documents the `[UNVERIFIED]` prefix convention for uncited claims
8. The Session State table `evidence` row is updated from `no | no` to the appropriate read/write pattern for brainstorming and planning (execution already has it correct)
9. `harness validate` passes after all modifications

## File Map

- MODIFY `agents/skills/claude-code/harness-brainstorming/SKILL.md` (add Evidence Requirements section, update Session State evidence row)
- MODIFY `agents/skills/claude-code/harness-planning/SKILL.md` (add Evidence Requirements section, update Session State evidence row)
- MODIFY `agents/skills/claude-code/harness-execution/SKILL.md` (add Evidence Requirements section)
- MODIFY `agents/skills/claude-code/harness-verification/SKILL.md` (add Evidence Requirements section)
- MODIFY `agents/skills/claude-code/harness-code-review/SKILL.md` (add Evidence Requirements section)

## Tasks

### Task 1: Add evidence requirements to harness-brainstorming

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-brainstorming/SKILL.md`
**Parallel:** yes (independent of Tasks 2-5)

1. Open `agents/skills/claude-code/harness-brainstorming/SKILL.md`

2. Update the Session State table `evidence` row. Find:

   ```
   | evidence      | no   | no    | Not used by this skill                                |
   ```

   Replace with:

   ```
   | evidence      | no   | yes   | Cites sources for design recommendations and prior art references |
   ```

3. Insert the following Evidence Requirements section between the Session State section (ends around line 277) and the Harness Integration section (starts at line 279). Find the text `## Harness Integration` (the one after Session State, around line 279) and insert before it:

   ````markdown
   ## Evidence Requirements

   When this skill makes claims about existing code behavior, architecture patterns, or technical tradeoffs, it MUST cite evidence using one of:

   1. **File reference:** `file:line` format (e.g., `src/services/auth.ts:42` -- "existing JWT middleware handles token refresh")
   2. **Prior art reference:** `file` format with description (e.g., `src/utils/email.ts` -- "email utility already exists, can be reused for notifications")
   3. **Documentation reference:** `docs/path` format (e.g., `docs/changes/user-auth/proposal.md` -- "prior spec established OAuth2 as the auth standard")
   4. **Session evidence:** Write to the `evidence` session section:
      ```json
      manage_state({
        action: "append_entry",
        session: "<current-session>",
        section: "evidence",
        authorSkill: "harness-brainstorming",
        content: "src/services/auth.ts:42 -- existing JWT middleware supports refresh tokens"
      })
      ```

   **When to cite:** During Phase 1 (EXPLORE) when referencing existing code or patterns. During Phase 3 (PRIORITIZE) when justifying tradeoffs with concrete code references. During Phase 4 (VALIDATE) when spec references existing implementation details.

   **Uncited claims:** Technical assertions without citations MUST be prefixed with `[UNVERIFIED]`. Example: `[UNVERIFIED] The current auth middleware does not support refresh tokens`. Uncited claims are flagged during review (Wave 2.2).
   ````

4. Run: `harness validate`
5. Commit: `docs(brainstorming): add evidence citation requirements to SKILL.md`

---

### Task 2: Add evidence requirements to harness-planning

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-planning/SKILL.md`
**Parallel:** yes (independent of Tasks 1, 3-5)

1. Open `agents/skills/claude-code/harness-planning/SKILL.md`

2. Update the Session State table `evidence` row. Find:

   ```
   | evidence | no | no | Not used by this skill |
   ```

   Replace with:

   ```
   | evidence | yes | yes | Reads prior evidence from brainstorming; writes file:line citations for task specifications |
   ```

3. Insert the following Evidence Requirements section between the Session State section (ends around line 331) and the Harness Integration section (starts at line 332). Find the text `## Harness Integration` (the one after Session State) and insert before it:

   ````markdown
   ## Evidence Requirements

   When this skill makes claims about existing code structure, file locations, or implementation patterns in task specifications, it MUST cite evidence using one of:

   1. **File reference:** `file:line` format (e.g., `src/services/index.ts:15` -- "barrel export exists, will add new export here")
   2. **Code pattern reference:** `file:line` format with pattern description (e.g., `src/services/user-service.ts:1-30` -- "existing service follows constructor injection pattern, new service will match")
   3. **Test output:** Include the command and its observed output when referencing current test state
   4. **Session evidence:** Write to the `evidence` session section:
      ```json
      manage_state({
        action: "append_entry",
        session: "<current-session>",
        section: "evidence",
        authorSkill: "harness-planning",
        content: "src/services/index.ts:15 -- barrel export pattern confirmed for new service integration"
      })
      ```

   **When to cite:** During Phase 1 (SCOPE) when referencing existing files for observable truths. During Phase 2 (DECOMPOSE) when specifying exact file paths and code patterns in task instructions. When the file map references existing files for modification.

   **Uncited claims:** Technical assertions about existing code without citations MUST be prefixed with `[UNVERIFIED]`. Example: `[UNVERIFIED] The service barrel exports all services`. Uncited claims are flagged during review (Wave 2.2).
   ````

4. Run: `harness validate`
5. Commit: `docs(planning): add evidence citation requirements to SKILL.md`

---

### Task 3: Add evidence requirements to harness-execution

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-execution/SKILL.md`
**Parallel:** yes (independent of Tasks 1-2, 4-5)

1. Open `agents/skills/claude-code/harness-execution/SKILL.md`

2. The Session State table already has `evidence | yes | yes`. No update needed.

3. Insert the following Evidence Requirements section between the Session State section (ends around line 364) and the Harness Integration section (starts at line 365). Find the text `## Harness Integration` (the one after Session State) and insert before it:

   ````markdown
   ## Evidence Requirements

   When this skill makes claims about task completion, test results, or code behavior, it MUST cite evidence using one of:

   1. **File reference:** `file:line` format (e.g., `src/services/notification-service.ts:42` -- "create method implemented with validation")
   2. **Test output:** Include the actual test command and its output:
      ```
      $ npx vitest run src/services/notification-service.test.ts
      PASS  src/services/notification-service.test.ts (8 tests)
      ```
   3. **Diff evidence:** Before/after with file path for modifications to existing files
   4. **Harness output:** Include `harness validate` output as evidence of project health
   5. **Session evidence:** Write to the `evidence` session section after each task:
      ```json
      manage_state({
        action: "append_entry",
        session: "<current-session>",
        section: "evidence",
        authorSkill: "harness-execution",
        content: "src/services/notification-service.ts:42 -- create method returns Notification with all required fields"
      })
      ```

   **When to cite:** After every task completion in Phase 2 (EXECUTE). Every commit message claim ("added X", "fixed Y") must be backed by test output or file reference. During Phase 4 (PERSIST) when writing learnings that reference specific code behavior.

   **Uncited claims:** Technical assertions without citations MUST be prefixed with `[UNVERIFIED]`. Example: `[UNVERIFIED] The notification service handles duplicate entries`. Uncited claims are flagged during review (Wave 2.2).
   ````

4. Run: `harness validate`
5. Commit: `docs(execution): add evidence citation requirements to SKILL.md`

---

### Task 4: Add evidence requirements to harness-verification

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-verification/SKILL.md`
**Parallel:** yes (independent of Tasks 1-3, 5)

1. Open `agents/skills/claude-code/harness-verification/SKILL.md`

2. Insert the following Evidence Requirements section before the first `## Harness Integration` section (at line 294). Find the text `## Harness Integration` at line 294 and insert before it:

   ````markdown
   ## Evidence Requirements

   This skill is the primary evidence producer in the workflow. Every pass/fail assertion in the verification report MUST include concrete evidence. The words "should", "probably", and "seems to" are already forbidden by the Iron Law -- this section defines HOW to cite evidence.

   Every verification claim MUST use one of:

   1. **File reference:** `file:line` format with observed content (e.g., `src/services/user-service.ts:42` -- "create method validates email format before insert")
   2. **Test output:** Include the actual test command and its complete output:
      ```
      $ npx vitest run src/services/user-service.test.ts
      PASS  src/services/user-service.test.ts
        UserService
          create (4 tests)
          list (3 tests)
          expiry (2 tests)
      Tests: 9 passed, 9 total
      ```
   3. **Harness output:** Include full `harness validate` and `harness check-deps` output
   4. **Anti-pattern scan output:** Include the actual grep/search command and results (or absence of results)
   5. **Import chain evidence:** Include the actual import statements found when verifying WIRED level
   6. **Session evidence:** Write to the `evidence` session section for each verification level:
      ```json
      manage_state({
        action: "append_entry",
        session: "<current-session>",
        section: "evidence",
        authorSkill: "harness-verification",
        content: "[EXISTS:PASS] src/services/user-service.ts (189 lines) -- verified via direct file read"
      })
      ```

   **When to cite:** At every verification level. Level 1 (EXISTS) cites file reads. Level 2 (SUBSTANTIVE) cites specific line content. Level 3 (WIRED) cites import statements, test execution output, and harness check output. The verification report format already requires `[PASS]`/`[FAIL]` markers -- each marker must be accompanied by the evidence that produced it.

   **Uncited claims:** ANY verification assertion without direct evidence is a verification failure, not merely an uncited claim. This skill does not use `[UNVERIFIED]` -- if evidence cannot be produced, the verdict is FAIL or INCOMPLETE.
   ````

3. Run: `harness validate`
4. Commit: `docs(verification): add evidence citation requirements to SKILL.md`

---

### Task 5: Add evidence requirements to harness-code-review

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-code-review/SKILL.md`
**Parallel:** yes (independent of Tasks 1-4)

1. Open `agents/skills/claude-code/harness-code-review/SKILL.md`

2. Insert the following Evidence Requirements section before the `## Harness Integration` section (at line 631). Find the text `## Harness Integration` at line 631 and insert before it:

   ````markdown
   ## Evidence Requirements

   When this skill produces review findings, every finding MUST include evidence citations. The `ReviewFinding.evidence` array field already exists in the finding schema -- this section defines the citation standard for populating it.

   Every review finding MUST cite evidence using one of:

   1. **File reference:** `file:line` format (e.g., `src/api/routes/users.ts:12-15` -- "direct import from db/queries.ts bypasses service layer")
   2. **Diff evidence:** Before/after code from the PR diff with file path and line numbers
   3. **Dependency chain:** Import path showing the violation (e.g., `routes/users.ts:3 imports db/queries.ts` -- "violates routes -> services -> db layer direction")
   4. **Test evidence:** Include test command and output when findings relate to missing or failing tests
   5. **Convention reference:** Cite the specific convention file and rule (e.g., `AGENTS.md:45` -- "convention requires services layer between routes and db")
   6. **Session evidence:** Write significant findings to the `evidence` session section:
      ```json
      manage_state({
        action: "append_entry",
        session: "<current-session>",
        section: "evidence",
        authorSkill: "harness-code-review",
        content: "src/api/routes/users.ts:12-15 -- layer violation: direct import from db/queries.ts"
      })
      ```

   **When to cite:** In Phase 4 (FAN-OUT), each subagent populates the `evidence` array in every `ReviewFinding`. In Phase 5 (VALIDATE), evidence is used to verify reachability claims. In Phase 7 (OUTPUT), every issue in the review includes its file:line location and rationale backed by evidence.

   **Uncited claims:** Review findings without evidence in the `evidence` array are discarded during Phase 5 (VALIDATE). Observations that cannot be tied to specific file:line references MUST be prefixed with `[UNVERIFIED]` and downgraded to `severity: 'suggestion'`.
   ````

3. Run: `harness validate`
4. Commit: `docs(code-review): add evidence citation requirements to SKILL.md`

---

## Traceability Matrix

| Observable Truth                              | Delivered By                          |
| --------------------------------------------- | ------------------------------------- |
| 1. brainstorming has Evidence Requirements    | Task 1                                |
| 2. planning has Evidence Requirements         | Task 2                                |
| 3. execution has Evidence Requirements        | Task 3                                |
| 4. verification has Evidence Requirements     | Task 4                                |
| 5. code-review has Evidence Requirements      | Task 5                                |
| 6. manage_state append_entry pattern included | Tasks 1-5 (each section includes it)  |
| 7. [UNVERIFIED] prefix documented             | Tasks 1-5 (each section documents it) |
| 8. Session State evidence rows updated        | Tasks 1-2 (brainstorming, planning)   |
| 9. harness validate passes                    | Tasks 1-5 (each runs it)              |
