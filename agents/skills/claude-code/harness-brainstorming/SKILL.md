# Harness Brainstorming

> Design exploration to spec to plan. No implementation before design approval. Think first, build second.

## When to Use

- Starting a new feature or project that requires design decisions
- When the problem space is ambiguous and needs exploration before planning
- When multiple implementation approaches exist and tradeoffs must be weighed
- When `on_new_feature` trigger fires and the scope is non-trivial
- NOT when the implementation path is already clear (go straight to harness-planning)
- NOT when fixing a bug with an obvious root cause (use harness-debugging or harness-tdd)
- NOT when the task is a simple refactor with no design decisions (use harness-refactoring)

## Process

### Iron Law

**No implementation may begin before the design is approved by the human.**

If you find yourself writing production code, tests, or scaffolding before the human has signed off on the design, STOP. You are in the wrong skill. Brainstorming produces a spec document, not code.

---

### Phase 1: EXPLORE — Gather Context

1. **Read the existing codebase.** Understand the current architecture, constraints, and conventions. Check AGENTS.md, existing specs in `docs/`, and relevant source files.

2. **Identify the problem boundary.** What exactly needs to be solved? What is explicitly out of scope? Write down both.

3. **Check for prior art.** Has this problem been partially solved elsewhere in the codebase? Are there existing patterns that should be followed or deliberately broken?

4. **Assess scope.** If the problem spans more than 3 major subsystems or would take more than 2 weeks to implement, it is too large. Decompose into sub-projects first, then brainstorm each one separately.

---

### Phase 2: EVALUATE — Ask Questions and Narrow

1. **Ask ONE question at a time.** Do not dump a list of 10 questions on the human. Ask the most important question first. Wait for the answer. Let the answer inform the next question.

   When asking a clarifying question, use `emit_interaction` with `type: 'question'`:

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

   This records the question in state and returns a formatted prompt to present.

2. **Prefer multiple choice.** Instead of "How should we handle auth?", ask "For auth, should we: (A) use existing JWT middleware, (B) add OAuth2 via provider X, or (C) delegate to an external service?" Give 2-4 concrete options with brief tradeoff notes.

3. **When the human answers, acknowledge and build on it.** Do not re-ask clarified points. Track decisions as they accumulate.

4. **Apply YAGNI ruthlessly.** For every proposed capability, ask: "Do we need this for the stated goal, or is this speculative?" If speculative, cut it. If the human insists, note it as a future consideration, not a requirement.

5. **Continue until you have enough clarity** to propose concrete approaches. Typically 3-7 questions are sufficient. If you need more than 10, the scope is too large — decompose.

### Context Keywords

During Phase 2, extract 5-10 domain keywords that capture the problem space. Include them in the spec frontmatter:

```
**Keywords:** auth, middleware, session-tokens, refresh-flow, OAuth2
```

These keywords flow into the `handoff.json` `contextKeywords` field when the spec is handed off to planning. Select keywords that would help a fresh agent — one that has never seen this conversation — understand the domain area quickly.

---

### Phase 3: PRIORITIZE — Propose Approaches

1. **Propose 2-3 concrete approaches.** Not 1 (no choice), not 5 (decision paralysis). Each approach must include:
   - **Summary:** One sentence describing the approach
   - **How it works:** Key technical decisions (what data structures, what APIs, what patterns)
   - **Tradeoffs:** What you gain, what you lose, what gets harder later
   - **Estimated complexity:** Low / Medium / High, with a brief justification
   - **Risk:** What could go wrong, what assumptions might be wrong

   When presenting approach tradeoffs, use conventional markdown patterns:

   ```
   **[IMPORTANT]** Approach 1 trades simplicity for extensibility
   **[SUGGESTION]** Consider Approach 2 if real-time requirements emerge later
   ```

2. **Be honest about tradeoffs.** Do not soft-sell a preferred approach. If approach A is simpler but less extensible, say so plainly.

3. **State your recommendation** and why, but defer to the human's decision.

4. **Wait for the human to choose.** Do not proceed until an approach is selected.

---

### Phase 4: VALIDATE — Write the Spec

1. **Present the design section by section.** Do not dump the entire spec at once. Present each major section, get feedback, and incorporate it before moving to the next:
   - Overview and goals
   - Decisions made (with rationale from the brainstorming conversation)
   - Technical design (data structures, APIs, file layout)
   - Success criteria (observable, testable outcomes)
   - Implementation order (high-level phases, not detailed tasks — that is harness-planning's job)

2. **Run soundness review.** After all sections are reviewed and the spec is drafted, invoke `harness-soundness-review --mode spec` against the draft. Do not proceed to write the spec to `docs/` until the soundness review converges with no remaining issues.

3. **Write the spec to `docs/`.** Write proposals to `docs/changes/<feature>/proposal.md`. This keeps change proposals organized by feature in a consistent location.

4. **Run `harness validate`** to verify the spec file is properly placed and the project remains healthy.

5. **Request sign-off via `emit_interaction`:**

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

   The human must explicitly approve before this skill is complete.

6. **Add feature to roadmap.** If `docs/roadmap.md` exists:
   - Derive the feature name from the spec title (the H1 heading of the proposal).
   - Call `manage_roadmap` with action `add`, `status: "planned"`, `milestone: "Current Work"`, and the spec path. Include a one-line summary from the spec overview.
   - If the feature already exists in the roadmap (duplicate name), skip silently — the feature was likely added manually or by a prior brainstorming session.
   - Log: `"Added '<feature-name>' to roadmap as planned"` (informational, not a prompt).
   - If `manage_roadmap` is unavailable, fall back to direct file manipulation using `addFeature()` from core.
   - If no roadmap exists, skip this step silently.

7. **Write handoff and suggest transition.** After the human approves the spec:

   Write `.harness/handoff.json`:

   ```json
   {
     "fromSkill": "harness-brainstorming",
     "phase": "VALIDATE",
     "summary": "<1-sentence spec summary>",
     "artifacts": ["<spec file path>"],
     "decisions": [{ "what": "<decision>", "why": "<rationale>" }],
     "contextKeywords": ["<domain keywords from Phase 2>"]
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

   If the user confirms: invoke harness-planning with the spec path.
   If the user declines: stop. The handoff is written for future invocation.

---

### Scope Check

At any point during brainstorming, if the design reveals that the project is larger than initially expected:

1. **Identify natural decomposition boundaries.** Where can the project be split into independently deliverable pieces?
2. **Propose sub-projects.** Each sub-project should be brainstormable and plannable on its own.
3. **Get approval for the decomposition** before continuing to brainstorm any individual sub-project.

## Party Mode

When activated with `--party`, add a multi-perspective evaluation step after proposing approaches.

### Perspective Selection

Select 2-3 perspectives based on design topic:

| Topic          | Perspectives                                 |
| -------------- | -------------------------------------------- |
| API / backend  | Backend Developer, API Consumer, Operations  |
| UI / frontend  | Developer, Designer, End User                |
| Infrastructure | Architect, SRE, Developer                    |
| Data model     | Backend Developer, Data Consumer, Migration  |
| Library / SDK  | Library Author, Library Consumer, Maintainer |
| Cross-cutting  | Architect, Security, Developer               |
| Default        | Architect, Developer, User/Consumer          |

### Evaluation Process

For each proposed approach, evaluate from each perspective:

```
### Approach N: [name]

**[Perspective 1] perspective:**
[Assessment]. Concern: [specific concern or "None"].

**[Perspective 2] perspective:**
[Assessment]. Concern: [specific concern or "None"].

**[Perspective 3] perspective:**
[Assessment]. Concern: [specific concern or "None"].

**Synthesis:** [Consensus summary. Address raised concerns. Recommend proceed/revise.]
```

Converge on a recommendation that addresses all concerns before presenting the design.

## Harness Integration

- **`harness validate`** — Run after writing the spec to `docs/`. Verifies project health and that the new spec file is properly placed.
- **`harness check-docs`** — Run to verify the spec does not conflict with existing documentation.
- **Spec location** — Specs go to `docs/changes/<feature>/proposal.md`. Follow existing naming patterns.
- **Handoff to harness-planning** — Once the spec is approved, invoke harness-planning to create the implementation plan from the spec.
- **Roadmap sync** — After spec approval, call `manage_roadmap` with action `add` to register the new feature as `planned` in `docs/roadmap.md`. Skip silently if no roadmap exists. Duplicates are silently ignored.
- **`emit_interaction`** -- Call at the end of Phase 4 to suggest transitioning to harness-planning. Uses confirmed transition (waits for user approval).

#### Requirement Phrasing

When brainstorming produces requirements or acceptance criteria that will feed into planning, prefer EARS sentence patterns for behavioral requirements. See the EARS Requirement Patterns section in harness-planning for the full template reference. Key patterns:

- **Event-driven:** "When [trigger], the system shall [response]."
- **Unwanted:** "If [condition], then the system shall not [behavior]."

These patterns make requirements testable and unambiguous. Apply them when the output of brainstorming includes specific behavioral expectations.

## Success Criteria

- A spec document exists in `docs/` with all required sections (overview, decisions, technical design, success criteria, implementation order)
- The human explicitly approved the design before any implementation
- YAGNI was applied: no speculative features made it into the spec
- 2-3 approaches were presented with honest tradeoffs before a decision was made
- Questions were asked one at a time with multiple-choice options where possible
- `harness validate` passes after the spec is written
- If scope was too large, it was decomposed into sub-projects with the human's approval

## Examples

### Example: Designing a Notification System

**EXPLORE:**

```
Read AGENTS.md — project is a TypeScript monorepo with React frontend and Express backend.
Read existing docs/ — no prior notification specs. Found docs/changes/user-auth/proposal.md as naming example.
Checked src/services/ — no notification code exists. Found email utility in src/utils/email.ts.
Scope assessment: single subsystem (notifications), estimated 1 week. Proceed.
```

**EVALUATE:**

```
Q1: "For notifications, should we support:
  (A) Email only (simplest, covers 90% of use cases)
  (B) Email + in-app (covers real-time needs)
  (C) Email + in-app + push (full coverage, most complex)?"
Human: "B — email and in-app."

Q2: "For in-app notifications, should we:
  (A) Poll from client every 30s (simple, slight delay)
  (B) WebSocket push (real-time, more infrastructure)?"
Human: "A — polling is fine for now."

Q3: "Should notifications be stored permanently or expire after 30 days?"
Human: "Expire after 30 days."
```

**PRIORITIZE:**

```
Approach 1: Event-driven with queue
- Services emit events, notification worker consumes and dispatches
- Tradeoff: More infrastructure (needs queue), but decoupled and scalable
- Complexity: Medium
- Risk: Queue adds operational overhead

Approach 2: Direct service calls
- Services call NotificationService directly
- Tradeoff: Simpler, but couples services to notification logic
- Complexity: Low
- Risk: Harder to add channels later, synchronous blocking

Recommendation: Approach 2. YAGNI — direct calls are sufficient for email + polling.
We can migrate to event-driven later if we add push notifications.
Human: "Agreed, approach 2."
```

**VALIDATE:**

```
Wrote docs/changes/notification-system/proposal.md
Sections: Overview, Decisions, Technical Design, Success Criteria, Implementation Order
harness validate — passes
"Spec written to docs/changes/notification-system/proposal.md. Ready for sign-off?"
Human: "Approved."
```

## Gates

These are hard stops. Violating any gate means the process has broken down.

- **No implementation before approval.** No production code, no test code, no scaffolding, no "let me just set up the directory structure." The spec must be approved first. If you wrote code, delete it.
- **No skipping the question phase.** You must ask at least one clarifying question before proposing approaches. If you think you already know the answer, you are making assumptions — validate them.
- **No single-approach proposals.** Always present at least 2 approaches with tradeoffs. A single approach is a recommendation disguised as a decision — the human has no real choice.
- **No speculative features.** Every capability in the spec must trace to a stated requirement. "We might need this later" is not a requirement. Cut it.
- **No section-dump specs.** Present the design section by section with feedback between each. Do not write the entire spec and ask "looks good?"

## Escalation

- **When the human cannot decide between approaches:** Identify the key differentiator. Ask: "The main difference is X. Given your priorities, does X matter more than Y?" If still stuck, suggest building a small spike to compare (but the spike is NOT production code).
- **When scope keeps growing during brainstorming:** Stop brainstorming. Explicitly say: "The scope has expanded beyond the original problem. Should we (A) decompose into sub-projects, or (B) revisit the original goal to narrow it?" Do not continue accumulating scope.
- **When the problem domain is unfamiliar:** State what you do not know. Ask the human if they have domain expertise, documentation, or a reference implementation. Do not guess at domain-specific requirements.
- **When requirements conflict with existing architecture:** Flag the conflict explicitly: "The spec calls for X, but the current architecture assumes Y. Should we (A) change the spec to work within current architecture, or (B) plan an architecture change as a prerequisite?"
- **When you have asked more than 10 questions without converging:** The problem is too large or too ambiguous. Stop and propose a decomposition or a scoping exercise before continuing.
