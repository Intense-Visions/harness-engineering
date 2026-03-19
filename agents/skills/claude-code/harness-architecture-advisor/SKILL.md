# Harness Architecture Advisor

> Cognitive mode: **advisory-guide**. Ask questions, surface trade-offs, present options. Do NOT execute. The human decides; you inform the decision.

## When to Use

- When designing a new feature, module, or system boundary
- When choosing between architectural approaches (REST vs GraphQL, monolith vs microservice, etc.)
- When refactoring raises questions about target architecture
- When `on_new_feature` triggers fire and the feature touches multiple modules
- When a Design-category error is escalated from harness-diagnostics
- NOT for implementation (use harness-execution after the decision is made)
- NOT for bug fixes (use harness-debugging or harness-diagnostics)
- NOT for code review (use harness-code-review)

## Core Principle

**This skill advises. It does not execute.**

You will research, analyze, and present options with clear trade-offs. You will not write production code, create files, or make architectural choices. The human makes the decision. You document it.

If you find yourself writing implementation code, STOP. You have left advisory mode. Return to presenting options.

## Process

### Phase 1: DISCOVER — Understand the Problem Space

**Gate: This phase requires human answers. Do not proceed to Phase 2 until the human has responded.**

Ask these 5 questions. Wait for answers before proceeding.

1. **What problem are you solving?** Describe the user-facing or system-facing need. Not the technical solution — the problem.

2. **What are your hard constraints?** Things that cannot change: existing database, specific language/framework, compliance requirements, team size, timeline, budget.

3. **What are your soft preferences?** Things you would like but could trade away: specific patterns, technology preferences, performance targets, consistency with other systems.

4. **What have you already considered?** Any approaches you have thought about, tried, or rejected. Include why you rejected them if applicable.

5. **What does success look like in 6 months?** How will you know this decision was correct? What would make you regret it?

Record the answers verbatim. Do not paraphrase or interpret at this stage.

```
Store answers in: .harness/architecture/<topic>/discovery.md
```

---

### Phase 2: ANALYZE — Research the Codebase

Read the codebase to understand the current state. Do not propose solutions yet — gather facts.

#### Step 1: Map Existing Patterns

Search for how the codebase currently handles similar concerns:

- What architectural patterns are already in use? (MVC, hexagonal, event-driven, etc.)
- How are similar features structured?
- What conventions exist for the relevant layer (API, data, UI, infrastructure)?

#### Step 2: Identify Integration Points

Find where the new feature will touch existing code:

- Which modules will it interact with?
- What are the current API boundaries?
- Are there shared data models or services?

#### Step 3: Assess Technical Debt

Look for existing issues that may affect the decision:

- Are there known pain points in the relevant area?
- Is there existing tech debt that one option would worsen and another would improve?
- Are there pending migrations or deprecations?

#### Step 4: Summarize Findings

```markdown
## Codebase Analysis: <topic>

### Current Patterns

- <pattern 1>: used in <locations>
- <pattern 2>: used in <locations>

### Integration Points

- <module A>: <how it connects>
- <module B>: <how it connects>

### Technical Debt

- <issue 1>: <impact on this decision>
- <issue 2>: <impact on this decision>

### Relevant Files

- <path>: <why it matters>
```

```
Store analysis in: .harness/architecture/<topic>/analysis.md
```

### Graph-Enhanced Context (when available)

When a knowledge graph exists at `.harness/graph/`, use graph queries for faster, more accurate context:

- `query_graph` — discover how similar features are structured in the codebase
- `search_similar` — find analogous patterns and implementations

Replaces manual Glob/Grep exploration with graph pattern discovery. Fall back to file-based commands if no graph is available.

---

### Phase 3: PROPOSE — Present Options with Trade-Offs

**Gate: This phase requires human choice at the end. Do not proceed to Phase 4 until the human has selected an option.**

Present 2-3 architectural options. Never present only one option — a single option is not a decision, it is a directive. Never present more than 3 — too many options cause decision paralysis.

#### For Each Option

```markdown
### Option [A/B/C]: <Name>

**Summary:** One paragraph describing the approach.

**How it works:**

1. <Step 1>
2. <Step 2>
3. <Step 3>

**Pros:**

- <Advantage 1> — <why it matters given the constraints>
- <Advantage 2> — <why it matters given the constraints>

**Cons:**

- <Disadvantage 1> — <severity: low/medium/high> — <mitigation if any>
- <Disadvantage 2> — <severity: low/medium/high> — <mitigation if any>

**Effort:** <Small / Medium / Large> — <rough description of what is involved>

**Risk:** <Low / Medium / High> — <what could go wrong>

**Best when:** <the scenario where this option is clearly the right choice>
```

#### Comparison Matrix

After presenting all options, provide a direct comparison:

```markdown
| Criterion        | Option A | Option B | Option C |
| ---------------- | -------- | -------- | -------- |
| Complexity       |          |          |          |
| Performance      |          |          |          |
| Maintainability  |          |          |          |
| Effort to build  |          |          |          |
| Effort to change |          |          |          |
| Risk             |          |          |          |
| Fits constraints |          |          |          |
```

#### Recommendation

State which option you would lean toward and why, but frame it as a recommendation, not a decision:

```
Based on the constraints (especially <key constraint>), I would lean toward Option <X> because <reason>.
However, if <condition>, Option <Y> would be stronger.
```

Present the options to the human and wait for their choice.

```
Store proposal in: .harness/architecture/<topic>/proposal.md
```

---

### Phase 4: DOCUMENT — Write the Architecture Decision Record

After the human selects an option, write a formal ADR.

#### ADR Template

```markdown
# ADR-<number>: <Title>

**Date:** <date>
**Status:** Accepted
**Deciders:** <who was involved>

## Context

<What is the problem or need that prompted this decision? Include relevant
background, constraints, and the current state of the system. A reader who
was not part of the discussion should understand why this decision was needed.>

## Decision

<What is the architectural decision? State it clearly and specifically.
Include enough detail that someone could implement it without further
discussion.>

## Alternatives Considered

### <Alternative 1 name>

<Brief description and why it was not chosen.>

### <Alternative 2 name>

<Brief description and why it was not chosen.>

## Consequences

### Positive

- <Benefit 1>
- <Benefit 2>

### Negative

- <Trade-off 1> — <mitigation plan>
- <Trade-off 2> — <mitigation plan>

### Neutral

- <Side effect that is neither positive nor negative>

## Action Items

- [ ] <Concrete next step 1> — owner: <who> — by: <when>
- [ ] <Concrete next step 2> — owner: <who> — by: <when>
- [ ] <Concrete next step 3> — owner: <who> — by: <when>
```

Save the ADR:

```
.harness/architecture/<topic>/ADR-<number>.md
```

Also link from the project's ADR index if one exists.

## Harness Integration

- Extends the human-architect model — the skill is a thinking partner, not a decision maker
- Respects architectural constraints defined in harness.config.json
- Outputs structured ADR that other skills can reference
- Reads prior ADRs from `.harness/architecture/` for consistency

## Success Criteria

- [ ] All 5 discovery questions are asked (or explicitly deferred by human)
- [ ] At least 2 options are presented with concrete trade-offs
- [ ] Human makes an explicit choice before documentation proceeds
- [ ] ADR follows the template structure with all sections filled
- [ ] ADR references specific files or components (not abstract generalities)

## Gates

- **Phase 1 to Phase 2: Requires human answers.** Do not proceed to codebase analysis until the human has answered the discovery questions. Without understanding constraints, analysis is directionless.
- **Phase 3 to Phase 4: Requires human choice.** Do not write the ADR until the human has selected an option. The ADR documents a decision, not a recommendation.
- **Always 2-3 options.** Never present 1 option (that is a directive, not advice). Never present more than 3 (that causes paralysis).
- **No implementation in this skill.** If you write production code, you have broken the advisory boundary. Stop and return to presenting options.
- **Trade-offs must be honest.** Every option has downsides. If you cannot articulate the cons of an option, you do not understand it well enough to recommend it.

## Escalation

- **Human cannot choose between options:** Help narrow by asking which constraint matters most. If two options are genuinely equivalent, say so — flip a coin on equivalent options rather than agonizing.
- **Analysis reveals the problem is already solved:** If the codebase already has a pattern that handles this, say so. No need to architect what already exists.
- **Constraints are contradictory:** If hard constraints rule out all reasonable options, escalate this back to the human. Something in the constraints must give.
- **Decision has organization-wide impact:** If the decision affects teams or systems beyond the current codebase, flag this. The decision may need a broader audience.

## Examples

### Example 1: API Design for a New Resource

**Phase 1 — DISCOVER:**

```
1. Problem: We need to expose order history to mobile clients and third-party integrations.
2. Hard constraints: Must work with existing PostgreSQL database. REST API already
   serves other resources. Team of 3 backend engineers. Ship in 6 weeks.
3. Soft preferences: Would like to use GraphQL eventually. Want pagination.
   Want to keep response times under 200ms.
4. Already considered: Adding REST endpoints like the other resources. Wondered
   about GraphQL but unsure if it is worth the investment for one resource.
5. Success in 6 months: Mobile app and 2 integrations consuming the API without
   complaints about performance or missing data.
```

**Phase 2 — ANALYZE:**

```
Current patterns: REST with Express, controller-service-repository layers.
  15 existing resources follow this pattern.
Integration points: Order model joins with Users and Products.
  Existing /users and /products endpoints.
Tech debt: No pagination on existing endpoints — they return all records.
  This is fine for small datasets but orders could be large.
```

**Phase 3 — PROPOSE:**

Option A: REST endpoints following existing patterns. Add pagination.

- Pros: Consistent with codebase, team knows how to build it, fast to ship.
- Cons: Mobile may over-fetch (gets all fields even when it needs few), no subscription support.
- Effort: Small (2-3 weeks).

Option B: GraphQL for orders only, REST for everything else.

- Pros: Mobile gets exactly the fields it needs, natural pagination with cursors, foundation for future migration.
- Cons: Two API paradigms to maintain, team learning curve, more infrastructure (Apollo/Yoga server).
- Effort: Medium (4-5 weeks).

Option C: REST with sparse fieldsets (JSON:API style `?fields=id,total,date`).

- Pros: Stays REST, solves over-fetching for mobile, no new infrastructure.
- Cons: Custom implementation of field filtering, not a standard the team has used before, still no subscriptions.
- Effort: Small-Medium (3-4 weeks).

Recommendation: Option A with pagination. It ships fastest, matches the existing codebase, and the team can migrate to GraphQL later as a separate initiative when there are more consumers with diverse needs.

**Phase 4 — DOCUMENT:**
ADR written after human selects Option A. Action items: implement pagination middleware (reusable for other endpoints), create /orders endpoints, update API documentation.

### Example 2: Component Decomposition for a Dashboard

**Phase 1 — DISCOVER:**

```
1. Problem: The dashboard page component is 1200 lines and growing. It handles
   data fetching, state management, filtering, sorting, and rendering for
   5 different widget types.
2. Hard constraints: React with TypeScript. Must not break existing widget
   behavior. Cannot change the API contract — backend team is on a different
   release cycle.
3. Soft preferences: Want widgets to be independently testable. Want to add
   2 new widget types next quarter without touching the main component.
4. Already considered: Just splitting into smaller files. Worried that without
   a clear boundary, it will re-tangle.
5. Success in 6 months: Adding a new widget type requires creating one new
   file and registering it, not modifying the dashboard component.
```

**Phase 2 — ANALYZE:**

```
Current patterns: Dashboard uses a single useEffect for all data fetching.
  State is a large object with fields for each widget type. Rendering uses
  a switch statement on widget type.
Integration points: 3 API endpoints supply data. Shared filter context
  affects all widgets. URL query params drive initial state.
Tech debt: Two widget types share copy-pasted filtering logic. The sort
  function has special cases for each widget type.
```

**Phase 3 — PROPOSE:**

Option A: Widget plugin architecture with a registry.

- Each widget is a self-contained module (component + hook + types).
- A registry maps widget type strings to widget modules.
- Dashboard iterates the registry, renders each widget, passes shared context.
- Pros: Adding a widget means adding one module and one registry entry. Widgets are independently testable. Clear boundaries.
- Cons: Requires upfront refactoring of all 5 existing widgets. Shared filter logic needs a common abstraction.
- Effort: Medium (2-3 weeks to extract, then new widgets are fast).

Option B: Compound component pattern with slots.

- Dashboard defines layout slots. Each widget fills a slot.
- Shared state via React context. Each widget manages its own data fetching.
- Pros: Simpler than a registry. Familiar React patterns. Widgets own their data.
- Cons: Less structured than a registry — no formal contract. Could re-tangle if disciplines slip. Adding a widget still requires modifying the dashboard layout.
- Effort: Small-Medium (1-2 weeks).

Option C: Micro-frontend approach with module federation.

- Each widget is a separate build artifact loaded at runtime.
- Pros: Maximum independence. Widgets can use different libraries. Independent deployment.
- Cons: Massive overkill for 5-7 widgets in one app. Complex build setup. Runtime overhead. Team of 3 does not need this level of isolation.
- Effort: Large (4-6 weeks).

Recommendation: Option A. The plugin registry provides the clear boundary you need to prevent re-tangling, and the upfront cost pays off immediately when you add the 2 new widget types next quarter. Option C is overengineered for your scale.

**Phase 4 — DOCUMENT:**
ADR written after human selects Option A. Action items: define widget interface contract, extract existing widgets one at a time (one PR per widget), create registry with type-safe registration, add documentation for "how to add a new widget."
