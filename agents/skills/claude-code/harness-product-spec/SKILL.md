# Harness Product Spec

> Generate structured product specifications from feature requests, issues, or descriptions. Produces user stories with EARS acceptance criteria, Given-When-Then scenarios, and PRD documents with traceable requirements.

## When to Use

- When a new feature needs formal specification before implementation begins
- When GitHub issues or feature requests need to be translated into actionable user stories
- When acceptance criteria are missing, vague, or untestable for existing stories
- NOT for technical architecture decisions (use harness-architecture-advisor)
- NOT for implementation planning with task breakdown (use harness-planning)
- NOT for bug triage or root cause analysis (use harness-debugging)

## Process

### Phase 1: PARSE -- Extract Feature Intent

1. **Resolve input source.** Accept one of:
   - GitHub issue URL: fetch via `gh issue view <number> --json title,body,labels,comments`
   - Feature description file: read the provided file path
   - Inline text: use the provided description directly

2. **Extract core elements.** From the input, identify:
   - **Goal:** What is the user trying to accomplish?
   - **Actor(s):** Who are the users or systems involved? (e.g., "admin user," "API consumer," "billing system")
   - **Trigger:** What initiates the feature? (user action, system event, time-based)
   - **Constraints:** What limitations exist? (performance, platform, backward compatibility)
   - **Context:** What existing system components are involved?

3. **Identify ambiguities.** Flag any element that is missing or unclear:
   - "This issue mentions 'notifications' but does not specify the channel (email, in-app, push)"
   - "No success metric defined -- what does 'working correctly' mean?"
   - "Edge case not addressed: what happens when the user has no payment method?"

4. **Resolve ambiguities.** Use `emit_interaction` to present questions when critical information is missing:

   ```
   The feature request mentions "user notifications" but does not specify:
   1. Notification channel (email, in-app, push, SMS)
   2. Whether notifications are configurable by the user
   3. Retry behavior for failed deliveries
   Please clarify before proceeding.
   ```

5. **Load project context.** Scan the project for existing specs, user stories, or PRDs to maintain consistency in format and terminology:
   - Check `docs/changes/`, `docs/requirements/`, `docs/prd/` for existing documents
   - Check `.github/ISSUE_TEMPLATE/` for the project's preferred issue format
   - Identify domain terminology used in existing specs

6. **Classify feature type.** Categorize the feature as:
   - **New capability:** Something the system cannot do today
   - **Enhancement:** Improvement to an existing capability
   - **Integration:** Connecting with an external system
   - **Migration:** Moving from one approach to another

---

### Phase 2: CRAFT -- Generate User Stories and Acceptance Criteria

1. **Write user stories.** For each actor-goal pair, produce a story in standard format:

   ```
   As a [actor],
   I want to [action],
   so that [benefit].
   ```

   Break large features into multiple stories. Each story must be independently deliverable and testable.

2. **Write EARS acceptance criteria.** Apply the EARS (Easy Approach to Requirements Syntax) patterns:
   - **Ubiquitous:** "The [system] shall [behavior]" -- for unconditional requirements
   - **Event-driven:** "When [trigger], the [system] shall [behavior]" -- for responses to events
   - **State-driven:** "While [state], the [system] shall [behavior]" -- for ongoing conditions
   - **Optional:** "Where [feature is enabled], the [system] shall [behavior]" -- for configurable behavior
   - **Unwanted:** "If [condition], then the [system] shall [response]" -- for error handling and edge cases

3. **Write Given-When-Then scenarios.** For each acceptance criterion, produce at least one BDD scenario:

   ```
   Given [precondition],
   When [action],
   Then [expected outcome].
   ```

   Include:
   - Happy path scenario
   - At least one error/edge case scenario
   - Boundary condition scenarios where applicable

4. **Define edge cases.** For each story, enumerate:
   - What happens with empty input?
   - What happens with maximum input?
   - What happens when the user lacks permission?
   - What happens during concurrent access?
   - What happens when a dependency is unavailable?

5. **Assign story metadata.** For each story:
   - **Priority:** Must-have, Should-have, Could-have, Won't-have (MoSCoW)
   - **Size estimate:** S, M, L, XL (relative to other stories)
   - **Dependencies:** Other stories or systems this depends on
   - **Risk:** Low, Medium, High (with risk description)

---

### Phase 3: GENERATE -- Produce PRD Document

1. **Structure the PRD.** Generate a document with these sections:
   - **Title and version** (feature name, PRD version, date, author)
   - **Problem statement** (what problem does this solve, who has it, how painful is it)
   - **Goals and non-goals** (explicit scope boundaries)
   - **User stories** (from Phase 2, organized by priority)
   - **Acceptance criteria** (EARS format, traceable to stories)
   - **Technical constraints** (performance requirements, platform constraints, backward compatibility)
   - **Success metrics** (measurable outcomes that define "done")
   - **Open questions** (unresolved ambiguities from Phase 1)
   - **Out of scope** (explicitly excluded items)

2. **Write the problem statement.** Include:
   - Who is affected (specific user segments)
   - How the problem manifests today (current workaround or pain)
   - Quantified impact if available (time lost, error rate, support tickets)

3. **Define success metrics.** Every metric must be:
   - **Measurable:** Can be tracked with existing or planned instrumentation
   - **Time-bound:** Has a target timeline for evaluation
   - **Specific:** Not "improve user experience" but "reduce checkout abandonment by 15% within 30 days"

4. **Map requirements to stories.** Create a traceability matrix:

   ```
   REQ-001 -> US-001, US-003 (must-have)
   REQ-002 -> US-002 (should-have)
   REQ-003 -> US-004, US-005 (could-have)
   ```

5. **Write the PRD to file.** Save to the project's spec directory (detected in Phase 1 or defaulting to `docs/changes/`). Use a filename pattern: `YYYY-MM-DD-feature-name-prd.md`.

---

### Phase 4: VALIDATE -- Verify Completeness and Testability

1. **Check story independence.** Verify each user story can be delivered independently:
   - Does the story depend on another story being completed first?
   - If yes, is the dependency documented?
   - Can the story be tested in isolation?

2. **Check acceptance criteria testability.** Every EARS criterion must be verifiable:
   - Can an automated test be written for this criterion?
   - Is the expected behavior specific enough to distinguish pass from fail?
   - Are boundary values defined (not "handles large files" but "handles files up to 100MB")?
     Flag untestable criteria: "Criterion AC-003 says 'the system should be fast' -- this is not testable. Recommend: 'the system shall respond within 200ms for the 95th percentile.'"

3. **Check coverage completeness.** Verify all parsed elements from Phase 1 are addressed:
   - Every actor has at least one story
   - Every constraint has a corresponding acceptance criterion
   - Every ambiguity is either resolved or listed in open questions
   - Error handling is specified for every user-facing action

4. **Check format consistency.** Verify the output matches existing project conventions:
   - Story format matches templates in `.github/ISSUE_TEMPLATE/` if present
   - Terminology matches existing specs (do not introduce "user" when the project uses "member")
   - Priority scheme matches existing stories

5. **Output validation summary:**

   ```
   Product Spec Validation: [COMPLETE/INCOMPLETE]
   Stories: N generated (M must-have, K should-have)
   Acceptance criteria: N (all testable: YES/NO)
   BDD scenarios: N (covering N criteria)
   Coverage: all actors covered, all constraints addressed
   Open questions: N remaining

   Generated: docs/changes/2026-03-27-notifications-prd.md
   ```

---

## Harness Integration

- **`harness skill run harness-product-spec`** -- Primary command for generating product specifications.
- **`harness validate`** -- Run after generating specs to verify project health.
- **`Bash`** -- Used to fetch GitHub issues via `gh` CLI and check existing spec files.
- **`Read`** -- Used to read input feature descriptions, existing specs, and issue templates.
- **`Write`** -- Used to generate PRD documents and user story files.
- **`Glob`** -- Used to locate existing spec directories, issue templates, and requirement documents.
- **`Grep`** -- Used to extract domain terminology from existing specs and find related stories.
- **`emit_interaction`** -- Used to present ambiguities for clarification and confirm spec structure before writing.

## Success Criteria

- Every feature input produces at least one user story with EARS acceptance criteria
- All acceptance criteria are testable (specific, measurable, with defined boundaries)
- BDD scenarios cover happy path and at least one error/edge case per criterion
- PRD document includes all required sections with traceable requirements
- Ambiguities are surfaced and either resolved or tracked as open questions
- Output format matches existing project conventions when they exist
- Generated PRD is saved to the correct directory with consistent naming

## Rationalizations to Reject

| Rationalization                                                                                    | Why It Is Wrong                                                                                                                                        |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "The feature request is clear enough -- I can skip the ambiguity check and start writing stories"  | The gate: no generating specs from ambiguous input without clarification. Missing actors or undefined triggers lead to untestable acceptance criteria. |
| "This acceptance criterion is understood by the team, so it does not need to be formally testable" | No untestable acceptance criteria is a hard gate. Every criterion must be verifiable by an automated test or specific manual procedure.                |
| "The happy path scenarios are enough -- edge cases are unlikely"                                   | The skill requires at least one unwanted-behavior criterion for every user-facing action. Edge cases are where production bugs live.                   |
| "The existing PRD is outdated, so I will just replace it with a fresh one"                         | No overwriting existing specs is a gate. Present the diff rather than replacing the file.                                                              |
| "We can figure out the success metrics later during implementation"                                | Every success metric must be measurable, time-bound, and specific at spec time.                                                                        |

## Examples

### Example: GitHub Issue to PRD for Team Notifications

```
Phase 1: PARSE
  Source: gh issue view 234 (title: "Add team notification preferences")
  Actor: team admin, team member
  Goal: control which notifications team members receive
  Ambiguities found:
    - Channel not specified (resolved: email + in-app per comment #3)
    - "Important notifications" undefined (flagged as open question)

Phase 2: CRAFT
  US-001: As a team admin, I want to set default notification preferences for my team,
          so that new members receive appropriate notifications without manual setup.
    AC-001 (Ubiquitous): The system shall apply team-default preferences to new members on join.
    AC-002 (Event-driven): When a team admin updates default preferences, the system shall
            prompt whether to apply to existing members.
    AC-003 (Unwanted): If a team member has custom preferences, then the system shall
            preserve them when team defaults change.

  US-002: As a team member, I want to override team notification defaults,
          so that I receive only notifications relevant to my role.
    Scenario: Given a team member with default preferences,
              When they disable "deployment" notifications,
              Then they shall not receive deployment notifications
              And their other preferences remain unchanged.

Phase 3: GENERATE
  Written: docs/changes/2026-03-27-team-notifications-prd.md
  Sections: problem statement, 4 user stories, 12 acceptance criteria, 8 BDD scenarios
  Traceability: REQ-001 -> US-001, US-002 | REQ-002 -> US-003, US-004

Phase 4: VALIDATE
  Stories: 4 (2 must-have, 1 should-have, 1 could-have)
  Acceptance criteria: 12 (all testable: YES)
  Open questions: 1 ("important notifications" needs product definition)
  Result: COMPLETE
```

### Example: Inline Feature Description for Stripe Webhook Integration

```
Phase 1: PARSE
  Source: inline text "We need to handle Stripe webhooks for subscription changes"
  Actor: billing system (automated), finance admin (human oversight)
  Constraints: idempotency required, webhook signature verification, 5-second response SLA
  Ambiguities:
    - Which subscription events? (resolved via clarification: created, updated, canceled, past_due)
    - Retry handling? (Stripe retries for 72 hours)

Phase 2: CRAFT
  US-001: As the billing system, I want to process Stripe subscription.updated webhooks,
          so that user plan changes are reflected within 60 seconds.
    AC-001 (Event-driven): When a subscription.updated webhook arrives, the system shall
            update the user's plan within 60 seconds.
    AC-002 (Unwanted): If a duplicate webhook event ID is received, then the system shall
            return 200 OK without reprocessing.
    AC-003 (Unwanted): If webhook signature verification fails, then the system shall
            return 400 and log a security warning.

Phase 3: GENERATE
  Written: docs/changes/2026-03-27-stripe-webhooks-prd.md
  Technical constraints section includes: idempotency keys, signature verification,
    5-second response SLA, Stripe retry behavior documentation

Phase 4: VALIDATE
  All 4 webhook event types have stories: YES
  Idempotency criterion is testable: YES (duplicate event ID -> no side effects)
  Result: COMPLETE
```

## Gates

- **No generating specs from ambiguous input without clarification.** If the input lacks a clear actor, goal, or trigger, pause and ask. Do not invent requirements that were not stated or implied.
- **No untestable acceptance criteria.** Every criterion must be verifiable by an automated test or a specific manual procedure. "The system should be user-friendly" is not an acceptance criterion.
- **No skipping edge cases for user-facing actions.** Every action that a user can trigger must have at least one unwanted-behavior criterion (EARS "If" pattern) covering the error case.
- **No overwriting existing specs.** If a PRD already exists for this feature, present the diff rather than replacing the file. Existing specs may have been reviewed and approved.

## Escalation

- **When the feature request is too vague to parse:** Present what was extracted and what is missing: "This issue contains a title but no description. I need at minimum: who is the user, what action they want to perform, and why. Please add details to the issue or provide them here."
- **When requirements conflict with existing system behavior:** Flag the conflict: "AC-003 requires real-time sync, but the existing event system uses eventual consistency with up to 30-second delay. This needs an architectural decision before the spec can be finalized."
- **When the feature scope is too large for a single PRD:** Recommend splitting: "This feature contains 3 independent capabilities (notifications, preferences, audit log). Recommend splitting into 3 PRDs that can be prioritized and delivered independently."
- **When acceptance criteria require metrics that do not exist yet:** Flag the instrumentation gap: "Success metric 'reduce checkout time by 20%' requires checkout timing instrumentation that does not currently exist. Add an instrumentation story as a prerequisite."
