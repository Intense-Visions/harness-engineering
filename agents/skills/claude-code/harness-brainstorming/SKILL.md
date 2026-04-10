# Harness Brainstorming

> Design exploration to spec to plan. No implementation before design approval. Think first, build second.

## When to Use

- Starting a new feature requiring design decisions
- When the problem space is ambiguous and needs exploration
- When multiple approaches exist and tradeoffs must be weighed
- When `on_new_feature` trigger fires and scope is non-trivial
- NOT when the implementation path is already clear (go straight to harness-planning)
- NOT when fixing a bug with an obvious root cause (use harness-debugging or harness-tdd)
- NOT for simple refactors with no design decisions (use harness-refactoring)

## Process

### Iron Law

**No implementation may begin before the design is approved by the human.**

If you find yourself writing production code, tests, or scaffolding before sign-off, STOP. Brainstorming produces a spec document, not code.

---

### Phase 1: EXPLORE -- Gather Context

1. **Read the existing codebase.** Understand architecture, constraints, and conventions. Check AGENTS.md, existing specs in `docs/`, and relevant source files.
2. **Identify the problem boundary.** What exactly needs solving? What is out of scope? Write both down.
3. **Check for prior art.** Has this been partially solved elsewhere? Are there patterns to follow or deliberately break?
4. **Assess scope.** If the problem spans >3 major subsystems or >2 weeks to implement, decompose into sub-projects first.

---

### Phase 2: EVALUATE -- Ask Questions and Narrow

1. **Ask ONE question at a time.** Ask the most important question first. Wait for the answer. Let it inform the next question. Use `emit_interaction` with `type: 'question'`:

   ```json
   emit_interaction({
     path: "<project-root>",
     type: "question",
     question: {
       text: "For auth, which approach should we use?",
       options: [
         { "label": "A) Existing JWT middleware", "pros": ["Already in codebase"], "cons": ["No refresh tokens"], "risk": "low", "effort": "low" },
         { "label": "B) OAuth2 via provider X", "pros": ["Industry standard"], "cons": ["New dependency"], "risk": "medium", "effort": "medium" },
         { "label": "C) External auth service", "pros": ["Zero maintenance"], "cons": ["Vendor lock-in", "Cost"], "risk": "medium", "effort": "low" }
       ],
       recommendation: { "optionIndex": 0, "reason": "Sufficient for current requirements.", "confidence": "high" }
     }
   })
   ```

2. **Prefer multiple choice over open-ended questions.** Give 2-4 concrete options with brief tradeoff notes.
3. **Acknowledge answers and build on them.** Do not re-ask clarified points. Track decisions as they accumulate.
4. **Apply YAGNI ruthlessly.** For every proposed capability, ask: "Do we need this for the stated goal, or is this speculative?" If speculative, cut it. If the human insists, note it as a future consideration.
5. **Continue until you have enough clarity** to propose concrete approaches. Typically 3-7 questions suffice. If you need >10, the scope is too large -- decompose.

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
   - Success criteria (observable, testable outcomes)
   - Implementation order (high-level phases, not detailed tasks)

2. **Run soundness review.** Invoke `harness-soundness-review --mode spec` against the draft. Do not write to `docs/` until the review converges with no remaining issues.

3. **Write the spec** to `docs/changes/<feature>/proposal.md`.

4. **Run `harness validate`** to verify proper placement and project health.

5. **Request sign-off via `emit_interaction`:**

   ```json
   emit_interaction({
     path: "<project-root>",
     type: "confirmation",
     confirmation: {
       text: "Approve spec at <file-path>?",
       context: "<one-paragraph summary>",
       impact: "Spec approval unlocks implementation planning. No code changes yet.",
       risk: "low"
     }
   })
   ```

   The human must explicitly approve before this skill is complete.

6. **Add feature to roadmap.** If `docs/roadmap.md` exists:
   - Derive feature name from the spec title (the H1 heading).
   - Call `manage_roadmap` with action `add`, `status: "planned"`, `milestone: "Current Work"`, and the spec path.
   - If the feature already exists, skip silently.
   - If `manage_roadmap` is unavailable, fall back to `parseRoadmap`/`serializeRoadmap` from core. Warn: "External sync skipped (MCP unavailable). Run `manage_roadmap sync` when MCP is restored."
   - If no roadmap exists, skip silently.

7. **Write handoff and suggest transition.** After approval:

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
     "contextKeywords": ["<keywords from Phase 2>"]
   }
   ```

   Call `emit_interaction`:

   ```json
   {
     "type": "transition",
     "transition": {
       "completedPhase": "brainstorming",
       "suggestedNext": "planning",
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

   If confirmed: invoke harness-planning with the spec path.
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
4. **Session evidence:** Write via `manage_state` `append_entry` to `evidence` section.

**When to cite:** Phase 1 (existing code/patterns), Phase 3 (tradeoff justifications), Phase 4 (spec referencing existing implementation).

**Uncited claims** MUST be prefixed with `[UNVERIFIED]`. These are flagged during review.

## Harness Integration

- **`harness validate`** -- Run after writing the spec. Verifies project health and spec placement.
- **`harness check-docs`** -- Verify spec does not conflict with existing docs.
- **Spec location** -- `docs/changes/<feature>/proposal.md`.
- **Handoff** -- Once approved, invoke harness-planning to create the implementation plan.
- **Session directory** — When session slug is known, handoff goes to `.harness/sessions/<slug>/handoff.json`. The session directory structure is: `handoff.json`, `state.json`, `artifacts.json` (registry of spec/plan paths and file lists). Do not write to `.harness/handoff.json` in session context.
- **Roadmap sync** -- After approval, call `manage_roadmap` action `add` to register as `planned`. Skip silently if no roadmap. Duplicates ignored.
- **`emit_interaction`** -- End of Phase 4 to suggest transition to harness-planning (confirmed transition).

#### Requirement Phrasing

When brainstorming produces requirements for planning, prefer EARS sentence patterns (see harness-planning for full reference):

- **Event-driven:** "When [trigger], the system shall [response]."
- **Unwanted:** "If [condition], then the system shall not [behavior]."

Apply when output includes specific behavioral expectations.

## Success Criteria

- Spec exists in `docs/` with all required sections (overview, decisions, technical design, success criteria, implementation order)
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
