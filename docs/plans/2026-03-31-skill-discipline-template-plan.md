# Plan: Skill Discipline Template (Phase 1)

**Date:** 2026-03-31
**Spec:** docs/changes/skill-discipline-upgrades/proposal.md
**Estimated tasks:** 1
**Estimated time:** 3 minutes

## Goal

Create the discipline template file that defines universal Evidence Requirements, Red Flags, and Rationalizations to Reject patterns for all upgraded skills.

## Observable Truths (Acceptance Criteria)

1. The file `agents/skills/templates/discipline-template.md` exists
2. The file contains an `## Evidence Requirements` section with 4 citation methods (file reference, code pattern reference, test/command output, session evidence) and the `[UNVERIFIED]` prefix rule
3. The file contains `## Red Flags` with `### Universal` listing exactly 3 entries, each with a quoted phrase in bold
4. The file contains `## Rationalizations to Reject` with `### Universal` listing exactly 3 entries, each with a quoted rationalization in bold
5. Both Red Flags and Rationalizations have `### Domain-Specific` subsections with HTML comment authoring guidance
6. `harness validate` passes after the file is created

## File Map

- CREATE `agents/skills/templates/discipline-template.md`

## Tasks

### Task 1: Create discipline template file

**Depends on:** none
**Files:** `agents/skills/templates/discipline-template.md`

1. Create directory `agents/skills/templates/`

   ```bash
   mkdir -p agents/skills/templates
   ```

2. Create file `agents/skills/templates/discipline-template.md` with the following exact content (from spec Technical Design > Discipline Template):

   ```markdown
   ## Evidence Requirements

   When this skill makes claims about existing code, architecture, or behavior,
   it MUST cite evidence using one of:

   1. **File reference:** `file:line` format (e.g., `src/auth.ts:42`)
   2. **Code pattern reference:** `file` with description (e.g., `src/utils/hash.ts` —
      "existing bcrypt wrapper")
   3. **Test/command output:** Inline or referenced output from a test run or CLI command
   4. **Session evidence:** Write to the `evidence` session section via `manage_state`

   **Uncited claims:** Technical assertions without citations MUST be prefixed with
   `[UNVERIFIED]`. Example: `[UNVERIFIED] The auth middleware supports refresh tokens`.

   ## Red Flags

   ### Universal

   These apply to ALL skills. If you catch yourself doing any of these, STOP.

   - **"I believe the codebase does X"** — Stop. Read the code and cite a file:line
     reference. Belief is not evidence.
   - **"Let me recommend [pattern] for this"** without checking existing patterns — Stop.
     Search the codebase first. The project may already have a convention.
   - **"While we're here, we should also [unrelated improvement]"** — Stop. Flag the idea
     but do not expand scope beyond the stated task.

   ### Domain-Specific

   <!-- Add 3-5 red flags specific to this skill's domain.
        Each MUST contain a quoted phrase the agent would say.
        Format: **"<quoted phrase>"** — <why it's dangerous and what to do instead> -->

   ## Rationalizations to Reject

   ### Universal

   These reasoning patterns sound plausible but lead to bad outcomes. Reject them.

   - **"It's probably fine"** — "Probably" is not evidence. Verify before asserting.
   - **"This is best practice"** — Best practice in what context? Cite the source and
     confirm it applies to this codebase.
   - **"We can fix it later"** — If it is worth flagging, it is worth documenting now
     with a concrete follow-up plan.

   ### Domain-Specific

   <!-- Add 3-5 rationalizations specific to this skill's domain.
        Format: **"<rationalization>"** — <why it's wrong and what to do instead> -->
   ```

3. Run: `harness validate`
4. Observe: validation passes
5. Commit: `feat(skills): add discipline template with universal patterns`
