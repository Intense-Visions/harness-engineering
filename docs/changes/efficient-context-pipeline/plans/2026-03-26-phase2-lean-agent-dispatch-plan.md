# Plan: Phase 2 — Lean Agent Dispatch

**Date:** 2026-03-26
**Spec:** docs/changes/efficient-context-pipeline/proposal.md
**Estimated tasks:** 5
**Estimated time:** 15 minutes

## Goal

All autopilot-dispatched agents (planner, executor, verifier, reviewer) receive only session slug, session directory, and task description in their dispatch prompts — never embedded file content. Each agent calls `gather_context({ session: "..." })` on startup to load its own context.

## Observable Truths (Acceptance Criteria)

1. When autopilot dispatches the verifier agent, the prompt contains `Session slug: {sessionSlug}` and instructs the agent to call `gather_context` on startup. No raw learnings or failures text is embedded.
2. When autopilot dispatches the reviewer agent, the prompt contains `Session slug: {sessionSlug}` and instructs the agent to call `gather_context` on startup. No raw learnings or failures text is embedded.
3. The harness-verification SKILL.md contains a gather_context call with the `session` parameter in its process section, so that when dispatched by autopilot with a session slug, the verifier loads session-scoped context.
4. The harness-code-review SKILL.md's gather_context call includes the `session` parameter, so that when dispatched by autopilot with a session slug, the reviewer loads session-scoped context.
5. The gemini-cli variants of all four modified files are identical to their claude-code counterparts.
6. `harness validate` passes after all changes.

## File Map

- MODIFY `agents/skills/claude-code/harness-autopilot/SKILL.md` (VERIFY and REVIEW dispatch prompts)
- MODIFY `agents/skills/claude-code/harness-verification/SKILL.md` (add session-aware gather_context)
- MODIFY `agents/skills/claude-code/harness-code-review/SKILL.md` (add session param to gather_context)
- MODIFY `agents/skills/gemini-cli/harness-autopilot/SKILL.md` (mirror claude-code)
- MODIFY `agents/skills/gemini-cli/harness-verification/SKILL.md` (mirror claude-code)
- MODIFY `agents/skills/gemini-cli/harness-code-review/SKILL.md` (mirror claude-code)

## Tasks

### Task 1: Update VERIFY dispatch prompt in autopilot SKILL.md

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

1. Open `agents/skills/claude-code/harness-autopilot/SKILL.md`.

2. Find the VERIFY dispatch prompt (lines 262-273). The current prompt is:

   ````
   ```
   Agent tool parameters:
     subagent_type: "harness-verifier"
     description: "Verify phase {N}: {name}"
     prompt: |
       You are running harness-verification for phase {N}: {name}.

       Session directory: {sessionDir}

       Follow the harness-verification skill process exactly.
       Report pass/fail with findings.
   ```
   ````

3. Replace it with:

   ````
   ```
   Agent tool parameters:
     subagent_type: "harness-verifier"
     description: "Verify phase {N}: {name}"
     prompt: |
       You are running harness-verification for phase {N}: {name}.

       Session directory: {sessionDir}
       Session slug: {sessionSlug}

       On startup, call gather_context({ session: "{sessionSlug}" }) to load
       session-scoped learnings, state, and validation context.

       Follow the harness-verification skill process exactly.
       Report pass/fail with findings.
   ```
   ````

4. Run: `harness validate`
5. Commit: `feat(autopilot): add session slug and gather_context to VERIFY dispatch prompt`

---

### Task 2: Update REVIEW dispatch prompt in autopilot SKILL.md

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

1. Open `agents/skills/claude-code/harness-autopilot/SKILL.md`.

2. Find the REVIEW dispatch prompt (lines 291-301). The current prompt is:

   ````
   ```
   Agent tool parameters:
     subagent_type: "harness-code-reviewer"
     description: "Review phase {N}: {name}"
     prompt: |
       You are running harness-code-review for phase {N}: {name}.

       Session directory: {sessionDir}

       Follow the harness-code-review skill process exactly.
       Report findings with severity (blocking / warning / note).
   ```
   ````

3. Replace it with:

   ````
   ```
   Agent tool parameters:
     subagent_type: "harness-code-reviewer"
     description: "Review phase {N}: {name}"
     prompt: |
       You are running harness-code-review for phase {N}: {name}.

       Session directory: {sessionDir}
       Session slug: {sessionSlug}

       On startup, call gather_context({ session: "{sessionSlug}" }) to load
       session-scoped learnings, state, and validation context.

       Follow the harness-code-review skill process exactly.
       Report findings with severity (blocking / warning / note).
   ```
   ````

4. Run: `harness validate`
5. Commit: `feat(autopilot): add session slug and gather_context to REVIEW dispatch prompt`

---

### Task 3: Add session-aware gather_context to harness-verification SKILL.md

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-verification/SKILL.md`

1. Open `agents/skills/claude-code/harness-verification/SKILL.md`.

2. Find Level 1: EXISTS section heading (line 38: `### Level 1: EXISTS`). Insert a new section **before** Level 1 that instructs the verifier to load context on startup. Add the following text immediately after the Iron Law section's closing `---` (after line 36) and before `### Level 1: EXISTS`:

   ````markdown
   ### Context Loading

   Before running verification levels, load session context if a session slug was provided (e.g., by autopilot dispatch):

   ```json
   gather_context({
     path: "<project-root>",
     intent: "Verify phase deliverables",
     skill: "harness-verification",
     session: "<session-slug-if-provided>",
     include: ["state", "learnings", "validation"]
   })
   ```
   ````

   **Session resolution:** If a session slug is known (passed via autopilot dispatch or available from a previous handoff), include the `session` parameter. This scopes all state reads to `.harness/sessions/<slug>/`. If no session is known, omit it — `gather_context` falls back to global files at `.harness/`.

   Use the returned learnings to check for known failures and dead ends relevant to the artifacts being verified.

   ***

   ```

   ```

3. In the Harness Integration section (currently no gather_context entry), add the following bullet after the existing content near line 340, before the `## Gates` section is not right — actually add it as part of the post-verification learnings section. Let me be more precise.

   Actually, the verification SKILL.md does not have a "Harness Integration" section. Instead, add a gather_context reference at the bottom of the Gates section. Find the line (currently ~341):

   ```
   After verification completes, append a tagged learning:
   ```

   Insert before that line:

   ```markdown
   ## Harness Integration

   - **`gather_context`** — Used in Context Loading phase (before Level 1) to load session-scoped state, learnings, and validation in a single call. The `session` parameter scopes reads to the session directory when provided by autopilot dispatch.
   - **`harness validate`** — Run during Level 3 (WIRED) to verify artifact integration.
   - **`harness check-deps`** — Run during Level 3 (WIRED) to verify dependency boundaries.
   ```

4. Run: `harness validate`
5. Commit: `feat(verification): add session-aware gather_context to verification skill`

---

### Task 4: Add session parameter to harness-code-review gather_context

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-code-review/SKILL.md`

1. Open `agents/skills/claude-code/harness-code-review/SKILL.md`.

2. Find the existing gather_context call in the Graph-Enhanced Context section (lines 210-217):

   ```json
   gather_context({
     path: "<project-root>",
     intent: "Code review of <change description>",
     skill: "harness-code-review",
     tokenBudget: 8000,
     include: ["graph", "learnings", "validation"]
   })
   ```

3. Replace it with:

   ```json
   gather_context({
     path: "<project-root>",
     intent: "Code review of <change description>",
     skill: "harness-code-review",
     session: "<session-slug-if-provided>",
     tokenBudget: 8000,
     include: ["graph", "learnings", "validation"]
   })
   ```

4. Update the paragraph after the call (line 220) to mention session scoping. Replace:

   ```
   This replaces manual `query_graph` + `get_impact` + `find_context_for` calls with a single composite call that assembles review context in parallel, ranked by relevance. Falls back gracefully when no graph is available (`meta.graphAvailable: false`).
   ```

   With:

   ```
   This replaces manual `query_graph` + `get_impact` + `find_context_for` calls with a single composite call that assembles review context in parallel, ranked by relevance. Falls back gracefully when no graph is available (`meta.graphAvailable: false`). When `session` is provided (e.g., via autopilot dispatch), learnings and state are scoped to the session directory. If no session is known, omit the parameter — `gather_context` falls back to global files.
   ```

5. Update the Harness Integration section (line 617). Replace:

   ```
   - **`gather_context`** — Used in Phase 3 (CONTEXT) for efficient parallel context assembly. Replaces separate graph query calls.
   ```

   With:

   ```
   - **`gather_context`** — Used in Phase 3 (CONTEXT) for efficient parallel context assembly. The `session` parameter scopes learnings and state to the session directory when provided by autopilot dispatch. Replaces separate graph query calls.
   ```

6. Run: `harness validate`
7. Commit: `feat(code-review): add session parameter to gather_context call`

---

### Task 5: Mirror all changes to gemini-cli variants

**Depends on:** Task 1, Task 2, Task 3, Task 4
**Files:** `agents/skills/gemini-cli/harness-autopilot/SKILL.md`, `agents/skills/gemini-cli/harness-verification/SKILL.md`, `agents/skills/gemini-cli/harness-code-review/SKILL.md`

1. Copy each modified claude-code file to its gemini-cli counterpart:

   ```bash
   cp agents/skills/claude-code/harness-autopilot/SKILL.md agents/skills/gemini-cli/harness-autopilot/SKILL.md
   cp agents/skills/claude-code/harness-verification/SKILL.md agents/skills/gemini-cli/harness-verification/SKILL.md
   cp agents/skills/claude-code/harness-code-review/SKILL.md agents/skills/gemini-cli/harness-code-review/SKILL.md
   ```

2. Verify parity:

   ```bash
   diff agents/skills/claude-code/harness-autopilot/SKILL.md agents/skills/gemini-cli/harness-autopilot/SKILL.md
   diff agents/skills/claude-code/harness-verification/SKILL.md agents/skills/gemini-cli/harness-verification/SKILL.md
   diff agents/skills/claude-code/harness-code-review/SKILL.md agents/skills/gemini-cli/harness-code-review/SKILL.md
   ```

   All three diffs must produce no output (identical files).

3. Run: `harness validate`
4. Commit: `chore: sync gemini-cli skill variants with claude-code`

## Traceability

| Observable Truth                                            | Delivered by |
| ----------------------------------------------------------- | ------------ |
| 1. VERIFY dispatch has session slug + gather_context        | Task 1       |
| 2. REVIEW dispatch has session slug + gather_context        | Task 2       |
| 3. Verification SKILL.md has session-aware gather_context   | Task 3       |
| 4. Code-review SKILL.md has session param in gather_context | Task 4       |
| 5. Gemini-cli variants identical                            | Task 5       |
| 6. harness validate passes                                  | All tasks    |
