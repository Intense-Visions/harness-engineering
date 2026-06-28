# Harness Brainstorming

> Design exploration to spec to plan. No implementation before design approval. Think first, build second.

## When to Use

- Starting a new feature requiring design decisions
- When the problem space is ambiguous and needs exploration
- When multiple approaches exist and tradeoffs must be weighed
- When `on_new_feature` trigger fires and scope is non-trivial
- NOT when the implementation path is already clear (go straight to harness-planning, or harness-autopilot if the spec already exists)
- NOT when fixing a bug with an obvious root cause (use harness-debugging or harness-tdd)
- NOT for simple refactors with no design decisions (use harness-refactoring)

## Process

### Iron Law

**No implementation may begin before the design is approved by the human.**

If you find yourself writing production code, tests, or scaffolding before sign-off, STOP. Brainstorming produces a spec document, not code.

---

### Argument Resolution

When invoked by autopilot (or with explicit arguments), resolve paths before starting:

1. **Session slug:** If `session-slug` argument provided, use it for all session-scoped reads/writes (`{sessionDir} = .harness/sessions/<session-slug>/`). Otherwise, session-scoped paths are unavailable — fall back to global `.harness/` paths.
2. **Handoff output:** When session slug is known, write handoff to `{sessionDir}/handoff.json`. Otherwise write to `.harness/handoff.json` (deprecated fallback).

When no arguments are provided (standalone invocation), the skill operates exactly as before — no session scoping, global paths only.

---

### Phase 1: EXPLORE -- Gather Context

0a. **Read STRATEGY.md if present at repo root (upstream grounding).** Strategy is the durable product anchor that ranks above feature-level context — read it first so the rest of EXPLORE can cross-reference. Call `read_strategy({ path: "<project-root>" })` on the harness MCP server — it returns `{ present, valid, doc?, error? }` and runs validation + parsing inside the server so the project does not need `@harness-engineering/core` installed.

    Fallback for environments without the MCP server (only works when core is resolvable from the project):

    ```bash
    node -e "import('@harness-engineering/core').then(async m => {
      const v = await m.validateStrategy(process.cwd());
      if (!v.ok || !v.value.present) { console.log(JSON.stringify({ grounded: false, reason: 'absent' })); return; }
      const raw = require('fs').readFileSync('STRATEGY.md', 'utf-8');
      console.log(JSON.stringify({ grounded: true, doc: m.asStrategyDoc(m.parseStrategyDoc(raw)) }));
    })"
    ```

    Three cases:

    - **Absent or invalid:** soft-fail silently. Do not block and do not warn in the spec — the skill works exactly as before when there is no strategic anchor.
    - **Present and valid:** capture the `Target problem`, `Our approach`, `Who it's for`, and `Tracks` section bodies. Treat them as grounding context alongside `gather_context` outputs. The captured strategy is cited as evidence in step 1's `[evidence]` annotations of the spec output.
    - **Contradiction with the user's feature description:** do NOT auto-resolve. Carry the contradiction forward as an open question into Phase 2 EVALUATE — surface it explicitly so the human can decide whether to refine the feature or update strategy via `/harness:strategy`.

1. **Load project context.** Call `gather_context({ path: "<project-root>", intent: "<feature description>", skill: "harness-brainstorming", session: "<session-slug-if-known>", include: ["graph", "businessKnowledge", "sessions", "validation"] })`. The `graph` context surfaces `business_fact` nodes relevant to the feature domain. The `businessKnowledge` context loads documented domain knowledge from `docs/knowledge/`. Use both to ground exploration in verified facts rather than assumptions. When `STRATEGY.md` was loaded in step 0a, treat its sections as a higher-tier grounding source than `businessKnowledge` — strategy reflects an explicit human commitment, knowledge is observation.
2. **Read the existing codebase.** Understand architecture, constraints, and conventions. Check AGENTS.md, existing specs in `docs/`, and relevant source files.
3. **Identify the problem boundary.** What exactly needs solving? What is out of scope? Write both down. Cross-reference `businessKnowledge` domains — if documented business rules constrain the problem, note them.
4. **Check for prior art.** Has this been partially solved elsewhere? Are there patterns to follow or deliberately break?
5. **Assess scope.** If the problem spans >3 major subsystems or >2 weeks to implement, decompose into sub-projects first.

---

### Phase 2: EVALUATE -- Ask Questions and Narrow

1. **Ask ONE question at a time, in plain text.** Ask the most important question first. Wait for the answer. Let it inform the next question.

   **Ask directly in your reply. Do NOT route the question through `emit_interaction`, `AskUserQuestion`, or any tool.** `emit_interaction` records the question in state but does not display it to the human — the client collapses it to "Called harness" and the rendered prompt only returns to the model, so the human sees nothing and you end up narrating a question they cannot answer. `AskUserQuestion` is Claude-Code-only and caps headers at 12 chars / 4 options. Plain text in your own message is the only channel that reliably reaches the human across every tool (Claude Code, Cursor, Codex, Gemini CLI).

   Present the question as a markdown table so tradeoffs are scannable, state your recommendation, then STOP and wait for the human's reply:

   ```markdown
   ### Decision needed: For auth, which approach should we use?

   |            | A) Existing JWT middleware | B) OAuth2 via provider X | C) External auth service |
   | ---------- | -------------------------- | ------------------------ | ------------------------ |
   | **Pros**   | Already in codebase        | Industry standard        | Zero maintenance         |
   | **Cons**   | No refresh tokens          | New dependency           | Vendor lock-in; cost     |
   | **Risk**   | Low                        | Medium                   | Medium                   |
   | **Effort** | Low                        | Medium                   | Low                      |

   **Recommendation:** A) Existing JWT middleware (confidence: high) — sufficient for current requirements.
   ```

2. **Prefer multiple choice over open-ended questions.** Give 2-4 concrete options with brief tradeoff notes.
3. **Acknowledge answers and build on them.** Do not re-ask clarified points. Track decisions as they accumulate.
4. **Apply YAGNI ruthlessly.** For every proposed capability, ask: "Do we need this for the stated goal, or is this speculative?" If speculative, cut it. If the human insists, note it as a future consideration.
5. **Surface strategy contradictions.** If Phase 1 step 0a captured a contradiction between the feature description and `STRATEGY.md`, ask the human about it explicitly as one of the first few EVALUATE questions. Frame it as a choice — refine the feature to align, or refine strategy via `/harness:strategy` — never auto-resolve. Skip this when STRATEGY.md was absent or no contradiction was detected.
6. **Continue until you have enough clarity** to propose concrete approaches. Typically 3-7 questions suffice. If you need >10, the scope is too large -- decompose.

### Context Keywords

During Phase 2, extract 5-10 domain keywords for the spec frontmatter:

```
**Keywords:** auth, middleware, session-tokens, refresh-flow, OAuth2
```

These flow into `handoff.json` `contextKeywords` field. Select keywords that help a fresh agent understand the domain quickly.

---

### Phase 3: PRIORITIZE -- Propose Approaches

1. **Propose 2-3 concrete approaches.** Each must include:
   - **Summary:** One sentence
   - **How it works:** Key technical decisions (data structures, APIs, patterns)
   - **Tradeoffs:** What you gain, lose, what gets harder later
   - **Complexity:** Low/Medium/High with brief justification
   - **Risk:** What could go wrong, what assumptions might be wrong

   Use conventional markdown for callouts:

   ```
   **[IMPORTANT]** Approach 1 trades simplicity for extensibility
   **[SUGGESTION]** Consider Approach 2 if real-time requirements emerge
   ```

2. **Be honest about tradeoffs.** Do not soft-sell a preferred approach.
3. **State your recommendation** and why, but defer to the human's decision.
4. **Wait for the human to choose.** Do not proceed until an approach is selected.

---

### Phase 4: VALIDATE -- Write the Spec

1. **Present the design section by section** (not all at once). Get feedback on each section, incorporate it, then move to the next:
   - Overview and goals
   - Decisions made (with rationale from brainstorming)
   - Technical design (data structures, APIs, file layout)
   - Integration points (entry points, registrations, docs, decisions, knowledge impact)
   - Success criteria (observable, testable outcomes)
   - Implementation order (high-level phases, not detailed tasks)

   The **Integration Points** section is required in every spec. It defines how the feature connects to the existing system. Populate it with five subsections:
   - **Entry Points** -- Which system entry points does this feature touch or create? (e.g., new CLI command, new MCP tool, new skill, new API route, new barrel export)
   - **Registrations Required** -- What registrations are needed for the feature to be discoverable? (e.g., barrel export regeneration, skill tier assignment, route registration)
   - **Documentation Updates** -- What docs need updating to reflect the new capability? (e.g., AGENTS.md section, API docs, README, guides)
   - **Architectural Decisions** -- Which decisions from the **Decisions made** section rise to a standalone ADR? Reference each by name with a one-line note on _why_ it warrants an ADR. Do **not** restate the decisions here -- this subsection points back to the canonical **Decisions made** section; duplicating them creates two sources that drift (spec-craft flags this as SPEC-R004). Only for medium/large tier changes -- "None" for small changes.
   - **Knowledge Impact** -- What domain concepts, patterns, or relationships should enter the knowledge graph?

   If the feature is a small change (bug fix, config tweak, < 3 files), the section may contain only Entry Points and Registrations Required with "None" for the others. The section must still be present.

2. **Run soundness review.** Invoke `harness-soundness-review --mode spec` against the draft. Do not write to `docs/` until the review converges with no remaining issues.

3. **Write the spec** to `docs/changes/<feature>/proposal.md`.

4. **Run skill advisor scan.** After writing the spec, extract signals from its content and scan the skill index for relevant skills. Write results to `docs/changes/<feature>/SKILLS.md` alongside the spec.

   Use the `advise_skills` MCP tool:

   ```json
   advise_skills({
     "path": "<project-root>",
     "specPath": "docs/changes/<feature>/proposal.md"
   })
   ```

   Announce findings in a brief summary (skip announcement in `--fast` mode):

   ```
   Skill Advisor: Found N relevant skills for '<feature>'
     Apply: N (skill-a, skill-b, ...)
     Reference: N | Consider: N
     Full list: docs/changes/<feature>/SKILLS.md
   ```

   In `--thorough` mode, show the full skill list for human review before proceeding.

5. **Run `harness validate`** to verify proper placement and project health.

6. **Request sign-off in plain text.** Ask directly in your reply — do NOT route the request through `emit_interaction` or `AskUserQuestion` (the human will not see it). Present it as:

   ```markdown
   Approve spec at <file-path>?

   Context: <one-paragraph summary>
   Impact: Spec approval unlocks implementation planning. No code changes yet.
   Risk: low

   Proceed? (yes/no)
   ```

   The human must explicitly approve (a clear "yes") before this skill is complete.

7. **Promote the roadmap row.** If `docs/roadmap.md` exists, transition the named row to `planned` and link the spec in a single structured call (steps 7 and 8 are intentionally ordered so the commit captures the roadmap mutation). Skip silently only when no roadmap exists.
   - Derive the lookup key from the slash-command `ARGUMENTS` string (D1). Derive the summary from the spec title (the H1 heading).
   - Call `manage_roadmap` with action `promote`, `feature: "<ARGUMENTS>"`, `spec: "docs/changes/<feature>/proposal.md"`, and `summary: "<H1>"`.
   - Branch on the returned `PromoteResult` envelope:

     | Envelope                                    | Skill behavior                                                                                                                                                     |
     | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
     | `ok: true, transitioned: 'backlog→planned'` | Log "Promoted `<feature>`: backlog → planned". Continue to step 8.                                                                                                 |
     | `ok: true, transitioned: 'spec-updated'`    | Log "Updated spec link for `<feature>` (status preserved)". Continue to step 8.                                                                                    |
     | `ok: true, transitioned: 'noop'`            | Log "No change — `<feature>` already promoted with this spec". Continue to step 8.                                                                                 |
     | `ok: false, reason: 'in-progress'`          | **STOP.** Surface: "Refused to promote `<feature>`: an agent is currently dispatched against this row. Stop the agent or use a different feature name."            |
     | `ok: false, reason: 'done'`                 | **STOP.** Surface: "Refused to promote `<feature>`: row is already 'done'. To revise a shipped feature, use a new name."                                           |
     | `ok: false, reason: 'not-found'`            | If no row was expected to exist, fall through to a `created` outcome. Otherwise surface `closestMatches` as a typo hint and **STOP**.                              |
     | `ok: false, reason: 'ambiguous'`            | **STOP.** Surface: "Refused to promote `<feature>`: matches multiple rows across milestones. Re-invoke with one of: `<matches>`." Matches are milestone-qualified. |
     | `ok: false, reason: 'write-failed'`         | **STOP.** Surface `detail` verbatim. The brainstorm is not considered complete.                                                                                    |

   - The `not-found` create path: when the row genuinely does not exist yet, call `manage_roadmap` action `add` with `status: "planned"`, `milestone: "Current Work"`, the spec path, and the H1 summary (unchanged from the legacy behavior), then continue to step 8.
   - "STOP" cases skip step 8 (no commit) and step 9 (no handoff/transition). The spec file written in step 3 stays on disk; the user re-runs the skill after resolving the conflict.
   - If `manage_roadmap` is unavailable, fall back to `parseRoadmap`/`promoteFeature`/`serializeRoadmap` from core. Warn: "External sync skipped (MCP unavailable). Run `manage_roadmap sync` when MCP is restored."
   - If no roadmap exists, skip silently (no envelope) and continue to step 8; the commit then contains only the spec files.

8. **Commit spec artifacts and roadmap promotion.** After a successful promote (or a silent skip when no roadmap exists), commit the spec, skill recommendations, and the roadmap mutation together so the promotion ships atomically with the spec:

   ```bash
   git add docs/changes/<feature>/proposal.md docs/changes/<feature>/SKILLS.md docs/roadmap.md
   git commit -m "docs(<feature>): add spec and promote to planned"
   ```

   Include `docs/roadmap.md` in `git add` only when it exists; omit it when the project has no roadmap. Do not skip this step — `harness-execution` commits only implementation files, so a spec uncommitted here stays untracked until someone notices. If a pre-commit hook reformats a file, re-add and re-commit.

9. **Write handoff and suggest transition.** After approval:

   Write handoff to the session-scoped path when a session slug is known, otherwise fall back to the global path:
   - Session-scoped (preferred): `.harness/sessions/<session-slug>/handoff.json`
   - Global (fallback, deprecated): `.harness/handoff.json`

   > **[DEPRECATED]** Writing to `.harness/handoff.json` is deprecated. When running within an autopilot session, always write to `.harness/sessions/<session-slug>/handoff.json`. Global writes cause cross-session contamination in parallel runs.

   ```json
   {
     "fromSkill": "harness-brainstorming",
     "phase": "VALIDATE",
     "summary": "<1-sentence summary>",
     "artifacts": ["<spec path>"],
     "decisions": [{ "what": "<decision>", "why": "<rationale>" }],
     "contextKeywords": ["<keywords from Phase 2>"],
     "recommendedSkills": {
       "apply": ["<skill-names>"],
       "reference": ["<skill-names>"],
       "consider": ["<skill-names>"],
       "skillsPath": "docs/changes/<feature>/SKILLS.md"
     }
   }
   ```

   **Choose the next skill with the human — ask in plain text, not via `emit_interaction`** (a `transition` records the handoff; it does not surface the choice). Present both paths and recommend autopilot:

   > Spec approved. How do you want to build it?
   >
   > - **Autopilot (recommended)** — autonomously chains plan → execute → verify → review, pausing only at decision points. Best when the spec's `## Implementation Order` lays out clear phases.
   > - **Planning** — work the implementation plan interactively before any execution. Choose this when phases are uncertain or you want to drive the breakdown by hand.

   Record the answer as `<next>` (`autopilot` or `planning`), then call `emit_interaction`:

   ```json
   {
     "type": "transition",
     "transition": {
       "completedPhase": "brainstorming",
       "suggestedNext": "<next>",
       "reason": "Spec approved and written to docs/",
       "artifacts": ["<spec path>"],
       "requiresConfirmation": true,
       "summary": "<title> -- <key choices>. <N> success criteria, <N> phases.",
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

   If confirmed, dispatch by the recorded choice:
   - `autopilot` → invoke harness-autopilot with `--spec <spec path>`.
   - `planning` → invoke harness-planning with the spec path.

   If declined: stop. The handoff is written for future invocation.

---

### Scope Check

If the design reveals larger-than-expected scope:

1. **Identify natural decomposition boundaries** -- where can it split into independent pieces?
2. **Propose sub-projects**, each brainstormable and plannable on its own.
3. **Get approval for decomposition** before continuing.

## Party Mode

When activated with `--party`, add multi-perspective evaluation after proposing approaches.

### Perspective Selection

Select 2-3 perspectives based on topic:

| Topic         | Perspectives                                |
| ------------- | ------------------------------------------- |
| API/backend   | Backend Developer, API Consumer, Operations |
| UI/frontend   | Developer, Designer, End User               |
| Infra         | Architect, SRE, Developer                   |
| Data model    | Backend Dev, Data Consumer, Migration       |
| Library/SDK   | Library Author, Consumer, Maintainer        |
| Cross-cutting | Architect, Security, Developer              |
| Default       | Architect, Developer, User/Consumer         |

### Evaluation Process

For each approach, evaluate from each perspective:

```
### Approach N: [name]
**[Perspective 1]:** [Assessment]. Concern: [specific or "None"].
**[Perspective 2]:** [Assessment]. Concern: [specific or "None"].
**[Perspective 3]:** [Assessment]. Concern: [specific or "None"].
**Synthesis:** [Consensus. Address concerns. Recommend proceed/revise.]
```

Converge on a recommendation that addresses all concerns before presenting the design.

## Session State

| Section       | R   | W   | Purpose                                         |
| ------------- | --- | --- | ----------------------------------------------- |
| terminology   | Y   | Y   | Domain terms discovered during brainstorming    |
| decisions     |     | Y   | Design decisions made during exploration        |
| constraints   | Y   |     | Reads constraints to scope brainstorming        |
| risks         |     | Y   | Risks identified during brainstorming           |
| openQuestions | Y   | Y   | Adds new questions, resolves answered ones      |
| evidence      |     | Y   | Cites sources for recommendations and prior art |

**Write** after each phase transition (EXPLORE->EVALUATE->PRIORITIZE->VALIDATE) so downstream skills inherit context.
**Read** at Phase 1 start -- `terminology` and `constraints` from session for prior context.

## Evidence Requirements

Technical claims about existing code, architecture, or tradeoffs MUST cite evidence:

1. **File reference:** `file:line` (e.g., `src/services/auth.ts:42` -- "existing JWT middleware")
2. **Prior art:** `file` with description (e.g., `src/utils/email.ts` -- "reusable for notifications")
3. **Docs:** `docs/path` (e.g., `docs/changes/user-auth/proposal.md` -- "established OAuth2 standard")
4. **Strategy grounding:** `STRATEGY.md` with section reference (e.g., `STRATEGY.md#tracks` -- "advances the 'pulse-reports' track"). Cite when Phase 1 step 0a loaded a valid strategy AND the decision is informed by it. Mandatory when the spec extends, narrows, or contradicts a strategy section.
5. **Session evidence:** Write via `manage_state` `append_entry` to `evidence` section.

**When to cite:** Phase 1 (existing code/patterns), Phase 3 (tradeoff justifications), Phase 4 (spec referencing existing implementation).

**Uncited claims** MUST be prefixed with `[UNVERIFIED]`. These are flagged during review.

## Harness Integration

- **`harness validate`** -- Run after writing the spec. Verifies project health and spec placement.
- **`harness check-docs`** -- Verify spec does not conflict with existing docs.
- **`STRATEGY.md` grounding (Phase 1 step 0a)** -- When present at repo root and valid, loaded via the `read_strategy` MCP tool (which the harness MCP server backs with `validateStrategy` + `parseStrategyDoc` + `asStrategyDoc` from `@harness-engineering/core` — projects do not need core installed). Soft-fails when absent or invalid; cites strategy sections in the spec's evidence annotations when present. Boundary with `harness-strategy`: brainstorming READS; `harness-strategy` WRITES. Never modify `STRATEGY.md` from this skill.
- **Spec location** -- `docs/changes/<feature>/proposal.md`.
- **Handoff** -- Once approved, hand off per the human's choice: harness-autopilot (recommended -- autonomous plan → execute → verify → review) or harness-planning (interactive plan only).
- **Session directory** — When session slug is known, handoff goes to `.harness/sessions/<slug>/handoff.json`. The session directory structure is: `handoff.json`, `state.json`, `artifacts.json` (registry of spec/plan paths and file lists). Do not write to `.harness/handoff.json` in session context.
- **Spec commit** -- After sign-off, the Phase 4 step 8 commit captures `docs/changes/<feature>/proposal.md`, `docs/changes/<feature>/SKILLS.md`, and the promoted `docs/roadmap.md` together so the spec enters git history at approval, not retroactively. `harness-execution` does not backfill these — see issue #487.
- **Roadmap promotion** -- After approval (Phase 4 step 7), call `manage_roadmap` action `promote` to transition the named row to `planned` and link the spec atomically with the spec commit. Falls back to `add` (create new row) when the row does not exist; refuses on `in-progress`/`done`/`ambiguous`. Skip silently if no roadmap.
- **`emit_interaction`** -- End of Phase 4 to record the transition to harness-autopilot or harness-planning (the human picks; default autopilot). The choice itself is asked in plain text -- `emit_interaction` records the confirmed transition, it does not surface the question.

#### Requirement Phrasing

When brainstorming produces requirements for planning, prefer EARS sentence patterns (see harness-planning for full reference):

- **Event-driven:** "When [trigger], the system shall [response]."
- **Unwanted:** "If [condition], then the system shall not [behavior]."

Apply when output includes specific behavioral expectations.

## Success Criteria

- Spec exists in `docs/` with all required sections (overview, decisions, technical design, integration points, success criteria, implementation order)
- Human explicitly approved before any implementation
- YAGNI applied: no speculative features in the spec
- 2-3 approaches presented with honest tradeoffs before decision
- Questions asked one at a time with multiple-choice options where possible
- `harness validate` passes after spec is written
- If scope was too large, it was decomposed with human approval

## Rationalizations to Reject

| Rationalization                                                                    | Reality                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "I already understand the problem well enough to skip the question phase"          | The Gates section is explicit: you must ask at least one clarifying question before proposing approaches. Skipping questions means making untested assumptions.                             |
| "There is only one viable approach, so presenting alternatives would be contrived" | The gate requires at least 2 approaches with tradeoffs. A single approach is a recommendation disguised as a decision -- the human has no real choice.                                      |
| "I will draft the full spec and present it for review all at once to save time"    | Section-dump specs are explicitly forbidden. Presenting section by section with feedback between each catches misunderstandings early.                                                      |
| "This future capability is low-cost to include now, so we should build it in"      | YAGNI is a gate, not a suggestion. Every capability must trace to a stated requirement. "We might need this later" is the exact rationalization that turns focused specs into bloated ones. |

## Examples

### Example: Designing a Notification System

**EXPLORE:**

```
Read AGENTS.md -- TypeScript monorepo, React frontend, Express backend.
No prior notification specs. Found docs/changes/user-auth/proposal.md as naming example.
No notification code in src/services/. Found email utility in src/utils/email.ts.
Scope: single subsystem, ~1 week. Proceed.
```

**EVALUATE:**

```
Q1: "Notifications: (A) Email only, (B) Email + in-app, (C) Email + in-app + push?"
Human: "B -- email and in-app."
Q2: "In-app delivery: (A) Poll every 30s (simple), (B) WebSocket (real-time, more infra)?"
Human: "A -- polling is fine."
Q3: "Store permanently or expire after 30 days?"
Human: "Expire after 30 days."
```

**PRIORITIZE:**

```
Approach 1: Event-driven with queue
- Services emit events, worker consumes and dispatches
- Tradeoff: More infra (needs queue), but decoupled and scalable
- Complexity: Medium. Risk: Queue adds operational overhead

Approach 2: Direct service calls
- Services call NotificationService directly
- Tradeoff: Simpler, but couples services to notification logic
- Complexity: Low. Risk: Harder to add channels later, synchronous blocking

Recommendation: Approach 2 (YAGNI). Direct calls suffice for email + polling.
Human: "Agreed."
```

**VALIDATE:**

```
Wrote docs/changes/notification-system/proposal.md
Sections: Overview, Decisions, Technical Design, Success Criteria, Implementation Order
harness validate -- passes. Human: "Approved."
```

## Gates

These are hard stops. Violating any gate means the process has broken down.

- **No implementation before approval.** No production code, tests, or scaffolding. The spec must be approved first. If you wrote code, delete it.
- **No skipping the question phase.** Ask at least one clarifying question before proposing approaches. If you think you know the answer, validate the assumption.
- **No single-approach proposals.** Always present at least 2 approaches with tradeoffs. A single approach is a recommendation disguised as a decision.
- **No speculative features.** Every capability must trace to a stated requirement. "We might need this later" is not a requirement.
- **No section-dump specs.** Present section by section with feedback between each. Do not write the entire spec and ask "looks good?"

## Escalation

- **Human cannot decide between approaches:** Identify the key differentiator. Ask: "The main difference is X. Given your priorities, does X matter more than Y?" If still stuck, suggest a small spike (not production code).
- **Scope keeps growing:** Stop brainstorming. Say: "Scope has expanded beyond the original problem. Should we (A) decompose into sub-projects, or (B) narrow the original goal?"
- **Unfamiliar problem domain:** State what you do not know. Ask if the human has domain expertise, docs, or a reference implementation. Do not guess at domain-specific requirements.
- **Requirements conflict with architecture:** Flag explicitly: "The spec calls for X, but current architecture assumes Y. Should we (A) change the spec, or (B) plan an architecture change as prerequisite?"
- **More than 10 questions without converging:** The problem is too large or ambiguous. Stop and propose decomposition or a scoping exercise.
