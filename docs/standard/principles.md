# The Core Principles of Harness Engineering

Harness Engineering is a systematic approach to building software that AI agents can work on reliably. This document explains each principle in depth — but it opens with the one idea the rest depend on, and then organizes everything else around a single model of how an AI-native team is shaped.

Two essays by Ajey Gore frame this document:

- **"The Solo Climb"** — Ajey Gore, 2026-05-27 — <https://ajeygore.in/content/the-solo-climb>
- **"The Anatomy of an AI-Native Org"** — Ajey Gore, 2026-05-12 — <https://ajeygore.in/content/the-anatomy-of-an-ai-native-org>

The first gives us Principle 0 — why the harness has to be load-bearing. The second gives us the structure — the **Why / What / How** layers this document is organized around.

---

## Principle 0 — The harness is load-bearing. It catches when no human is watching.

Before any of the principles below, one idea holds them up.

In climbing, a harness is not decoration. It is the gear that catches you when you fall — and it earns its place precisely in the moment no one is holding the rope. Ajey Gore's **"The Solo Climb"** carries that image into software: as AI agents take over the bulk of execution, the team that used to catch you "is not on the wall." Safeguards that were once redundant — a reviewer here, a second pair of eyes there — become genuinely load-bearing for the first time.

The test Gore proposes is blunt, and it is the test this standard is built to pass:

> If the senior engineer goes on holiday for two weeks and the agents keep shipping, do you trust what comes out the other side?

This is the **holiday test**. An agent opens a pull request late on a Friday while the senior engineer sleeps. There is no review meeting. There is no second pair of eyes. Either the harness stops the bad change, or nothing does.

Which is why a harness has to _stop_, not merely warn:

> A harness that warns but doesn't stop is not a harness. It's a notification.

Every principle that follows exists to make one of the three layers of an AI-native team survive the holiday test — to turn warnings into gear that actually catches.

---

## The three layers: Why, What, How

Gore's companion essay, **"The Anatomy of an AI-Native Org,"** describes how a team is shaped once agents do the bulk of the conversion work. It is not a pyramid of headcount; it is three layers of human judgment resting on a foundation of agents:

- **Why** — a small, durable group defining strategic purpose. "The _why_ layer was always thin and is going to stay thin, because conviction doesn't scale linearly with headcount."
- **What** — a _larger_ group than before defining what to build and what "good" looks like. Not product managers in the old sense, but "people who can sit between the _why_ and the agent ... and make the dozens of small calls per day about what 'good' looks like." This is the dominant middle: taste and judgment.
- **How** — a _smaller_ group doing the hardest engineering. "Not ticket conversion. Architecture. Trust systems. Performance." Harnesses, evals, agent-safe architecture.
- **Agents** — beneath all three, doing the bulk of the conversion work: "Writing the PR. Updating the doc. Filing the ticket. Drafting the release note."

The harness is what makes each layer reliable. The Why layer stays thin only if its intent is captured somewhere agents can read it. The What layer can make dozens of calls a day only if "good" is defined and measurable. The How layer is load-bearing only if its constraints actually stop bad changes rather than narrate them.

A harness-engineered repository already maps onto these layers:

| Layer                                              | Where it lives in the repo                          | The principles that make it reliable                                                                       |
| -------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Why** — strategic conviction (thin, durable)     | `STRATEGY.md`, core beliefs, architectural intent   | 1. Context Engineering                                                                                     |
| **What** — judgment and taste (the growing middle) | specs, ADRs, definitions of "done", the review loop | 3. The Agent Feedback Loop · 5. Implementation Strategy (Depth-First) · 6. Key Performance Indicators      |
| **How** — deep engineering (compressed, hardest)   | code, skills, linters, structural tests, CI gates   | 2. Architectural Rigidity & Mechanical Constraints · 4. Entropy Management · 7. Deterministic-vs-LLM Split |

The seven principles below are unchanged in substance — this document groups them by the layer each one holds up. They keep their original numbers so existing references stay valid; read them in whatever order serves you.

---

## Why — strategic conviction

The thinnest layer, and the most durable. Its job is to make the reasoning behind the system legible to everyone who touches it — including agents that were never in the room when the decisions were made. A thin Why layer only survives the holiday test if its intent is written down where an agent can find it.

### 1. Context Engineering

_Layer: Why — strategic conviction_

### What It Is

**Context Engineering** means treating your repository as a single source of truth for all architectural decisions, designs, and knowledge about your system. Every decision that affects how the code is organized must be documented, version-controlled, and accessible to AI agents.

This is the opposite of traditional approaches where crucial knowledge lives in:

- Slack conversations and threads
- Jira issues and comments
- Architecture documents in shared drives
- Team members' heads

### Why It Matters

AI agents can only work effectively with the context you provide. Without explicit documentation:

- Agents don't understand architectural intent and make wrong design decisions
- Each agent PR requires extensive rework because reviewers have context agents lack
- Code patterns drift because no one explained the original reasoning
- New team members (and agents) waste time reverse-engineering intent

With Context Engineering:

- Agents make better decisions because they have access to reasoning, not just code
- Reviews are faster because reviewers and agents share context
- Patterns stay consistent because the "why" is documented
- Onboarding (human or AI) happens in hours, not weeks

### Key Concepts

#### Repository-as-Documentation

All important information lives in git, not external tools:

```
docs/
├── core-beliefs.md              # Product values, non-negotiables
├── architecture/
│   ├── decisions/               # ADRs - why we chose X over Y
│   ├── layers.md                # Dependency model and boundaries
│   └── diagrams/
├── exec-plans/                  # Current work, deliverables, timeline
├── design-docs/                 # System designs before implementation
└── guides/                       # How to build things the right way
```

#### AGENTS.md Knowledge Map

A top-level file (~100 lines) that acts as a navigation guide for AI agents:

````markdown
# Knowledge Map

---

## What — judgment and taste

The dominant middle. Agents can generate endlessly; this layer decides what is worth shipping, defines what "done" and "good" look like, and measures whether the system is actually producing it. These principles are how a growing group of people hold the context of what is being built and make the dozens of small calls a day that agents cannot make for themselves.

### 3. The Agent Feedback Loop

_Layer: What — judgment and taste_

### What It Is

**The Agent Feedback Loop** is a self-correcting cycle where agents execute work, review their own changes, request peer reviews, and iterate based on feedback. This reduces human review burden while catching issues early.

Typical flow:

1. Agent receives task
2. Agent writes code, runs tests
3. Agent creates PR with self-review checklist
4. Agent (or peer agent) reviews the changes
5. If issues found, agent fixes them; if approved, human reviewer checks
6. Merge

### Why It Matters

Without feedback loops:

- Every agent PR requires extensive human review (expensive)
- Agents don't learn from mistakes; they repeat patterns
- Simple issues (missing tests, lint errors) waste reviewer time
- Agents have no visibility into whether their work failed or succeeded

With feedback loops:

- Agents catch 80% of issues before human review
- Agents improve over time by learning from past reviews
- Human review focuses on correctness and design, not lint errors
- Agents understand their own performance through telemetry

### Key Concepts

#### Agent-Led PRs

Agents open PRs themselves with:

```markdown
---

### 5. Implementation Strategy (Depth-First)

_Layer: What — judgment and taste_

### What It Is

**Depth-First Implementation** means completing features end-to-end (Design → Implementation → Testing → Deployment) before starting the next feature. The opposite is breadth-first, where you sketch many features shallowly.

Depth-first approach:

- Pick one story
- Take it to 100% completion (design, code, tests, docs, deploy)
- Learn from that vertical slice
- Move to next story with lessons learned

### Why It Matters

For agent-driven development, breadth-first scaling creates problems:

- Agents don't have clear examples of "done" (what does complete look like?)
- Patterns aren't established (agents learn from partial examples)
- Technical debt accumulates (incomplete features need rework)
- Quality suffers (shallow implementation means missed edge cases)

Depth-first approach provides:

- Clear definition of complete (agents see full vertical slice)
- Concrete patterns to follow (not abstract guidelines)
- Stable foundation for next feature (completed code is reference)
- Higher quality (edge cases caught during vertical slice)

### Key Concepts

#### The Vertical Slice

A complete, shippable feature from design to deployment:

1. **Design**: Write design doc explaining intent, trade-offs, alternatives
2. **Implementation**: Write code following established patterns
3. **Testing**: Comprehensive unit, integration, and e2e tests
4. **Documentation**: Update guides, examples, AGENTS.md as needed
5. **Deployment**: Release, monitor, verify in production
6. **Reflection**: Document learnings for next vertical slice

Example vertical slice: "Add email notifications to user signups"
```
````

Day 1: Design

- Write design doc: docs/design-docs/email-notifications.md
- Specify: Service contract, retry logic, templates
- Get approval from architecture team

Days 2-3: Implementation

- Create service: src/services/notifications/
- Implement: Queue, retry logic, template rendering
- Tests: 30+ unit tests covering edge cases

Day 4: Testing & Docs

- Add integration tests with mock email provider
- Add e2e test: user signs up → email received
- Update: docs/services/notifications.md, AGENTS.md

Day 5: Deploy & Verify

- Deploy to staging
- Verify: Metrics, error rates, email delivery
- Deploy to production
- Monitor: First 24h of real data

Day 6: Reflection

- Document: What went well, what was hard
- Patterns: How should other features do notifications?
- Next: Use these learnings for next story

```

#### Building Abstractions from Concrete

Each vertical slice teaches you how to do that type of work:

```

Slice 1: Add email notifications

- Learn: How to queue async work
- Learn: How to handle retries
- Learn: How to template content

Slice 2: Add SMS notifications

- Don't: Copy email service and modify
- Do: Extract common notification abstraction from learnings in Slice 1
- Result: Both services use shared notification abstraction

```

Agents learn from concrete examples, not abstract interfaces. Depth-first ensures examples exist before abstraction.

#### Definition of Done

Each vertical slice must be:

- ✓ Coded (implementation complete)
- ✓ Tested (unit, integration, e2e tests passing)
- ✓ Documented (design doc, implementation guide, examples)
- ✓ Deployed (in production, not staging)
- ✓ Verified (metrics show it's working correctly)
- ✓ Reflected (learnings documented for next slice)

Missing any of these = not done. Don't move to next feature.

### Examples

#### Example 1: Depth-First (Good)

Feature: "Add user search to dashboard"

```

Week 1: Design & Implement

- Write design: Query format, performance targets, edge cases
- Implement: Search service, database queries, API endpoint
- Test: 40 tests covering search behavior
- Document: guides/search.md, examples/search-examples.md

Week 2: Deploy & Learn

- Deploy to production
- Monitor: Query latency, index health, error rates
- Gather metrics: 95th percentile latency = 200ms ✓
- Document learnings: "Full-text search on postgres works well"

Week 3: Next Feature (Informed)

- Next feature: "Add filters to search results"
- Build on learnings: Use same query pattern
- Result: Faster implementation, better design

Week 4: Polish

- Next feature: "Add saved searches"
- Use abstractions learned from search implementation
- Result: High quality, consistent with existing patterns

```

Agents writing each feature have concrete examples and can see the full "done" state.

#### Example 2: Breadth-First (Bad)

Feature: "Add user dashboard"

```

Week 1: Sketch 5 features

- User search: Sketch endpoint, not tested
- Saved searches: Sketch schema, not implemented
- Analytics: Sketch query, not integrated
- Filters: Sketch UI, not connected
- Export: List as TODO

Week 2: Implement Search Partially

- Missing tests for edge cases
- Design doc wasn't updated
- Incomplete; moved to next feature

Week 3: Try Filters (without learning from search)

- Implementation style differs from search
- Tests less comprehensive
- Pattern inconsistency emerging

Result:

- Agents see incomplete examples
- No clear "done" state
- Each feature implemented differently
- Technical debt accumulating

```

Agents don't have clear patterns to follow. Quality suffers.

### Implementation Checklist

- [ ] Create feature selection process (prioritize by impact × effort)
- [ ] Define "Definition of Done" for your team
- [ ] Require design doc before implementation
- [ ] Require comprehensive tests (target >80% coverage)
- [ ] Require updated documentation for each feature
- [ ] Block PRs that don't meet DoD
- [ ] Track: Time per vertical slice, quality metrics
- [ ] Reflect: Lessons learned from each slice
- [ ] Share: Patterns with team/agents for next slice

---

### 6. Key Performance Indicators

_Layer: What — judgment and taste_


### What Are KPIs?

KPIs (Key Performance Indicators) are metrics that measure how well Harness Engineering is working. Three core metrics:

1. **Agent Autonomy** - What % of PRs are merged without human code changes?
2. **Harness Coverage** - What % of architectural rules are enforced mechanically?
3. **Context Density** - What's the ratio of documentation to code?

### Why These Three?

These three metrics are interconnected:

- **High Context Density** → Agents have information to make decisions
- **High Harness Coverage** → Mechanical constraints prevent bad decisions
- **High Agent Autonomy** → Result of good context + good constraints

Together, they measure progress toward the goal: **AI agents operating reliably and independently.**

### Agent Autonomy

**Definition**: % of PRs merged without human code intervention.

**What counts as "without human code intervention"**:

- Commits only from: GitHub Actions, agent automation, linter fixes
- Exclude: PRs where humans add code after PR creation
- Include: PRs where humans approve/merge, but don't modify code

**How to measure**:

1. Check each merged PR in GitHub
2. List commits: are they all from bots/automation?
3. Count: PRs with 100% bot commits / total PRs
4. Calculate: `(bot_commits / total_commits) * 100`

**Target**: 60% by Month 6, 80% by Month 12

**Example**:

```

Month 1: 10 PRs merged

- 7 PRs: all bot commits (agent + linter fixes)
- 3 PRs: includes human commits (human debugging)
  Agent Autonomy = 70% ✓

```

[Read more about Agent Autonomy in KPIs](./kpis.md)

### Harness Coverage

**Definition**: % of architectural rules enforced mechanically.

**What counts as "mechanically enforced"**:

- ESLint/linter rules that block PR if violated
- Structural tests that fail CI if violated
- Runtime validation that throws on violation
- Exclude: Rules only enforced in code review

**How to measure**:

1. List all architectural rules (from docs/architecture/, linter config, tests)
2. For each rule: is it enforced mechanically (fails CI)?
3. Count: mechanical rules / total rules
4. Calculate: `(mechanical_rules / total_rules) * 100`

**Target**: 90% by Month 6, 95% by Month 12

**Example**:

```

Total rules: 15

- No UI imports in service layer (ESLint rule) ✓
- No circular dependencies (structural test) ✓
- No hardcoded secrets (pre-commit hook) ✓
- Results must use Result type (linter rule) ✓
- ... (15 total)

Mechanical rules: 14 (14/15 = 93%)
Manual rules: 1 ("Don't copy-paste code" - cannot automate)

Harness Coverage = 93% ✓

````

[Read more about Harness Coverage in KPIs](./kpis.md)

### Context Density

**Definition**: Ratio of documentation to code.

**Formula**: `(lines_of_docs / lines_of_code)`

**What counts**:

- Documentation: .md files in `/docs/` (excluding generated API docs)
- Code: .ts, .rs, .py files in `/src/` (excluding tests, `node_modules`)

**How to measure**:

```bash
# Count docs lines (excluding generated)
docs_lines=$(find docs -name "*.md" -not -path "*/generated/*" | xargs wc -l | tail -1 | awk '{print $1}')

# Count code lines (excluding tests, node_modules)
code_lines=$(find src -name "*.ts" -o -name "*.py" -o -name "*.rs" | xargs wc -l | tail -1 | awk '{print $1}')

# Calculate ratio
ratio=$(echo "scale=2; $docs_lines / $code_lines" | bc)
````

**Target**: >0.3 (e.g., 3,000 docs lines for 10,000 code lines)

**Example**:

```
docs/ lines: 2,500 (design docs, guides, API docs)
src/ lines: 8,000 (implementation code, excluding tests)
Ratio: 2500 / 8000 = 0.31

Context Density = 0.31 ✓ (above target of 0.3)
```

[Read more about Context Density in KPIs](./kpis.md)

### Tracking KPIs

**Monthly**:

- Automated scripts calculate all three metrics
- Results published to `docs/metrics/` (markdown + charts)
- Reviewed in team sync

**Quarterly**:

- Compare to OKRs set at quarter start
- Reflect on progress and blockers
- Adjust priorities if needed

**Tool Integration**:

- GitHub API: Pull agents' autonomy metrics
- npm/PyPI: Download counts
- Analytics: Documentation site traffic
- Custom scripts: Context density, harness coverage

---

## How — deep engineering

The compressed, load-bearing layer — the hardest _how_ work: architecture, trust systems, performance. These are the mechanical guarantees that let the holiday test pass: constraints that stop rather than warn, cleanup that keeps entropy bounded, and a clear line between what machines enforce and what LLMs are trusted to judge.

### 2. Architectural Rigidity & Mechanical Constraints

_Layer: How — deep engineering_

### What It Is

**Architectural Constraints** are rules about how code can be organized and dependencies can flow. Instead of enforcing these rules through code review ("Hmm, should this be allowed?"), mechanical constraints are enforced automatically.

A typical constraint: "Service layer cannot import from UI layer." This is:

- Documented in `docs/architecture/layers.md`
- Enforced by an ESLint rule that runs in CI
- Enforced by a structural test that validates the import graph
- So automatic that violating it is nearly impossible

### Why It Matters

Constraints prevent wasted work:

- **For agents**: No time spent exploring architectural dead ends; the constraint blocks the wrong path
- **For humans**: Clear rules reduce decision fatigue and code review time
- **For the codebase**: Patterns remain consistent; one team's refactoring doesn't break another's assumptions

Without constraints:

- Each team interprets architecture differently
- Violations accumulate (creeping technical debt)
- Agents waste cycles exploring wrong approaches
- Reviews become subjective ("I don't think this violates our architecture... but maybe?")

With constraints:

- Architecture is objective and verifiable
- Violations fail CI immediately (no wasted review time)
- Agents learn the boundaries quickly and work within them
- Code review focuses on behavior, not architecture

### Key Concepts

#### Layered Dependency Model

Define clear layers and one-way dependencies:

```
Application
    ↓ (imports from)
Service Layer
    ↓
Repository Layer
    ↓
Config Layer
    ↓
Types Layer
```

Rules:

- Service can import from Repository, Config, Types
- Service cannot import from Application or UI
- Each layer only imports from layers below it
- No circular dependencies allowed

#### Mechanical Enforcement

Three mechanisms:

1. **Linter Rules** (ESLint, custom linters)

   ```javascript
   // ESLint rule: no-ui-imports-in-service
   if (fileName.includes('services/') && importPath.includes('ui/')) {
     throw new Error('Service layer cannot import from UI layer');
   }
   ```

2. **Structural Tests**

   ```typescript
   // Test: verify no circular dependencies
   const graph = buildDependencyGraph();
   const cycles = detectCycles(graph);
   expect(cycles).toHaveLength(0);
   ```

3. **Runtime Boundary Validation**

   ```typescript
   // At module boundary, validate input shape with Zod
   const userSchema = z.object({
     id: z.string(),
     email: z.string().email(),
   });

   export function processUser(input: unknown) {
     const user = userSchema.parse(input); // Throws if invalid
     // Proceed with confidence
   }
   ```

#### Circular Dependency Detection

Build a dependency graph and detect cycles algorithmically:

```typescript
// Detect circular dependencies using Tarjan's algorithm
const cycles = detectCircularDeps(modules);
if (cycles.found) {
  throw new Error(`Circular dependencies found:\n${cycles.message}`);
}
```

#### Boundary Parsing

Use schema validation libraries (Zod, Pydantic) to validate data at module boundaries:

```typescript
import { z } from 'zod';

// Define API response schema
const UserResponseSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  createdAt: z.date(),
});

export async function fetchUser(id: string): Promise<z.infer<typeof UserResponseSchema>> {
  const raw = await api.get(`/users/${id}`);
  return UserResponseSchema.parse(raw); // Validates structure
}
```

### Examples

#### Example 1: Preventing Circular Dependencies

Problem: Service A imports from Repository B, Repository B imports from Service A

- Makes code impossible to test in isolation
- Hidden bugs appear only under specific conditions
- Agents waste time debugging

Solution: Structural test that fails the build

```typescript
// tests/architecture/no-circular-deps.test.ts
it('should have no circular dependencies', () => {
  const cycles = detectCircularDeps(buildDependencyGraph());
  expect(cycles).toHaveLength(0);
});
```

Agents learn: "If I create a circular dep, the test fails and I'll fix it immediately."

#### Example 2: Enforcing Layer Separation

Problem: UI components importing business logic directly

```typescript
// ❌ BAD - violates architecture
import { calculatePrice } from '../../services/pricing-service.ts';
export function PriceDisplay() { ... }
```

Solution: ESLint rule + structural test

```typescript
// eslint-config.ts
rules: {
  '@harness/no-service-imports-in-ui': 'error',
}

// tests/architecture/layers.test.ts
it('UI layer should not import from service layer', () => {
  const violations = checkLayerViolations('src/ui', 'services');
  expect(violations).toHaveLength(0);
});
```

Result: Agents know immediately: "I can't import from services in UI files. I'll create an API call instead."

### Implementation Checklist

- [ ] Document your layers in `docs/architecture/layers.md`
- [ ] Identify 3-5 critical constraints that protect your architecture
- [ ] Create ESLint rules or custom linter rules for constraints
- [ ] Create structural tests that validate the dependency graph
- [ ] Set up boundary validation with Zod/Pydantic at key module edges
- [ ] Run linters and structural tests in CI/CD (block PRs if violated)
- [ ] Document exceptions (if a constraint must be violated, require an ADR)

---

### 4. Entropy Management (Garbage Collection)

_Layer: How — deep engineering_

### What It Is

**Entropy Management** is the practice of systematically managing technical debt, documentation drift, and pattern violations through periodic automated cleanup.

In AI-driven codebases, entropy (disorder) accumulates faster because agents generate code without the context humans had when writing originals. Without systematic cleanup, entropy leads to:

- Documentation that doesn't match implementation
- Dead code that agents don't know is unused
- Pattern violations that agents copy (propagating bad patterns)
- Inconsistent naming and structure across the codebase

### Why It Matters

Entropy unchecked:

- Each agent PR adds to the problem
- Technical debt becomes unmaintainable
- Agents learn from bad patterns and repeat them
- Onboarding becomes harder (inconsistent patterns)

Entropy managed:

- Documentation stays accurate (agents trust it)
- Agents learn correct patterns from examples
- Codebase remains maintainable
- Technical debt stays bounded

### Key Concepts

#### Periodic Cleanup Agents

Run agents on a schedule (daily/weekly) to detect and fix issues:

```yaml
# .github/workflows/cleanup.yml
schedule:
  - cron: '0 2 * * 0' # Every Sunday at 2 AM

jobs:
  entropy-cleanup:
    runs-on: ubuntu-latest
    steps:
      - name: Run cleanup agent
        uses: harness-engineering/cleanup-agent@v1
        with:
          checks: [doc-drift, dead-code, pattern-violations]
```

Cleanup agents detect:

1. **Documentation Drift** - Code changed but docs weren't updated

   ```
   Expected: docs/services/user-service.md says "accepts email"
   Actual: src/services/user-service.ts accepts "emailAddress"
   Action: Agent proposes doc update
   ```

2. **Dead Code** - Code that's no longer used anywhere

   ```
   Found: function calculateLegacyPrice() in src/services/pricing.ts
   Not called: anywhere (search_imports returns 0 results)
   Action: Agent proposes removal with explanation
   ```

3. **Pattern Violations** - Code that deviates from standards
   ```
   Expected: All API responses use z.object schema
   Found: getUserById returns raw object without schema
   Action: Agent proposes adding schema validation
   ```

#### Documentation Alignment

Detect when code changes without corresponding doc updates:

```typescript
// Detect doc drift: AGENTS.md mentions file that no longer exists
const drift = await detectDocDrift({
  docsDir: 'docs/',
  codeDir: 'src/',
});

// Output:
// {
//   file: 'docs/architecture/legacy-auth.md',
//   issue: 'OUTDATED',
//   details: 'File references UserAuthService which was refactored',
//   suggestion: 'Review and update docs/architecture/legacy-auth.md'
// }
```

#### Pattern Enforcement

Identify code that violates established patterns:

```typescript
// Find pattern violations: error handling should use Result type
const violations = await findPatternViolations([
  {
    name: 'use-result-type',
    matcher: (file, ast) => {
      // Check if async functions return Result or Promise<Result>
      return !usesResultType(ast);
    },
  },
]);
```

#### Dead Code Detection

Find unused files, functions, and imports:

```typescript
// Dead code: unused exports
const deadCode = await detectDeadCode({
  entryPoints: ['src/index.ts'],
  rootDir: 'src/',
});

// Output:
// {
//   unusedFiles: ['src/services/legacy-cache.ts'],
//   unusedExports: ['calculateDeprecatedHash()'],
//   unusedImports: ['import { oldHelper } from ...'],
// }
```

### Examples

#### Example 1: Detecting Documentation Drift

Scenario: Service implementation changes signature, docs aren't updated

```
Before:
- Code: async function getUser(id: string): Promise<User>
- Docs: "Returns User object with id, name, email fields"

Change: Add new field `lastLogin: Date` to User

After:
- Code: async function getUser(id: string): Promise<User>
  (User now includes lastLogin)
- Docs: Still says "id, name, email fields" (outdated!)

Detection:
- Cleanup agent finds AGENTS.md → docs/services/user.md
- Reads code schema: User has 4 fields
- Reads docs: Lists 3 fields
- Opens PR: "Update user service docs - add lastLogin field"
```

#### Example 2: Removing Dead Code

Scenario: Old authentication method not used anywhere

```
Detected:
- File: src/auth/legacy-jwt-auth.ts
- Search results: 0 imports, 0 usages
- Created: 2 years ago
- Last modified: 6 months ago

Action:
- Cleanup agent creates PR
- Title: "Remove dead code: legacy-jwt-auth.ts (unused)"
- Description: "No usages found. Replaced by oauth-auth.ts"
- Removes: src/auth/legacy-jwt-auth.ts and related tests
- Waits for approval before merging
```

#### Example 3: Pattern Violation Enforcement

Scenario: New error handling code doesn't use established Result type

```
Expected Pattern:
- All async functions return Result<T, Error>
- Error handling via if (!result.ok) checks

Found Violation:
- src/services/payment.ts: Returns raw Promise that throws

Action:
- Cleanup agent creates PR
- Title: "Refactor payment service to use Result type"
- Changes: Wraps function to return Result
- Runs tests: All pass
- Requests review from @documentation-maintainer
- Merges after approval
```

### Implementation Checklist

- [ ] Create cleanup agent task in CI/CD (scheduled weekly)
- [ ] Implement `detectDocDrift()` validation
- [ ] Implement `findPatternViolations()` check
- [ ] Implement `detectDeadCode()` analysis
- [ ] Create PR template for cleanup findings
- [ ] Configure which cleanup agents run (and when)
- [ ] Set up approval requirements for deletions
- [ ] Track cleanup metrics (issues found, issues fixed)

---

### 7. Deterministic-vs-LLM Responsibility Split

_Layer: How — deep engineering_

### What It Is

**The Deterministic-vs-LLM Split** is a decision framework for choosing whether an operation should be handled by mechanical tooling (linters, scripts, type checkers) or by LLM judgment. The core rule is simple:

> **If an operation can be expressed as if-else logic, it MUST be enforced mechanically — not delegated to LLM judgment.**

This principle extends [Principle 2 (Architectural Rigidity)](#2-architectural-rigidity--mechanical-constraints) from _what to enforce_ to _how to decide what to enforce_. Principle 2 says "use mechanical constraints." This principle says "here is the line between what the machine handles and what the LLM handles."

### Why It Matters

LLMs are probabilistic. Given the same input twice, they may produce different outputs. This is a strength for creative tasks (code generation, architectural reasoning) but a liability for deterministic tasks (formatting, import ordering, naming validation).

Without a clear split:

- LLMs waste tokens re-checking formatting that a linter handles in milliseconds
- Teams argue about whether a rule "should be a linter rule" or "agent guidance"
- Agents hallucinate compliance — they claim they followed a convention without mechanical verification
- Quality depends on prompt engineering rather than toolchain engineering

With a clear split:

- Deterministic checks run first, fast, and reliably — every time
- LLM effort focuses on tasks that genuinely require reasoning
- Agent output quality is mechanically verified, not self-reported
- Teams have a simple heuristic for where to invest enforcement effort

### Key Concepts

#### The Responsibility Matrix

| Responsibility            | Owner      | Examples                                       |
| ------------------------- | ---------- | ---------------------------------------------- |
| Intent understanding      | LLM        | "What does the user want to build?"            |
| Architectural reasoning   | LLM        | "Should this be a service or a utility?"       |
| Code generation           | LLM        | Writing implementation code                    |
| Debugging decisions       | LLM        | "What's causing this failure?"                 |
| Ambiguous trade-offs      | LLM        | "Should we optimize for speed or readability?" |
| Formatting                | Mechanical | Prettier, Black, gofmt                         |
| Import ordering           | Mechanical | ESLint import-order rules                      |
| Naming conventions        | Mechanical | Linter rules for file/variable naming          |
| File structure validation | Mechanical | Structural tests, directory layout checks      |
| Test execution            | Mechanical | Test runners, CI pipelines                     |
| Type checking             | Mechanical | TypeScript compiler, mypy, rustc               |
| Dependency direction      | Mechanical | Custom linter rules (see Principle 2)          |

#### The Decision Heuristic

When adding a new rule or convention, apply this test:

1. **Can you write it as an if-else statement?** → Mechanical enforcement
2. **Does it require understanding context or intent?** → LLM judgment
3. **Is it ambiguous or situation-dependent?** → LLM judgment with documented guidelines
4. **Does the same input always produce the same correct output?** → Mechanical enforcement

Examples of applying the heuristic:

- "Functions must be under 50 lines" → if-else → **Mechanical** (linter rule)
- "Functions should have a single responsibility" → requires judgment → **LLM** (review guidance)
- "Imports must be sorted alphabetically" → if-else → **Mechanical** (auto-formatter)
- "This abstraction is at the wrong level" → requires reasoning → **LLM** (architectural review)

#### Deterministic-First Execution

When a skill or workflow produces code, it should follow this sequence:

```
1. LLM generates code (creative phase)
2. Mechanical checks run (deterministic phase)
   - Format (prettier, black)
   - Lint (eslint, ruff)
   - Type-check (tsc, mypy)
   - Test (vitest, pytest)
3. If mechanical checks fail → LLM fixes (targeted creative phase)
4. Repeat until mechanical checks pass
5. LLM self-review (creative phase — only after deterministic checks pass)
```

This sequence ensures LLM effort is never spent on issues that mechanical tools catch faster and more reliably.

#### Skill Template: Deterministic Checks Section

Every skill that produces or modifies code should include a `## Deterministic Checks` section listing what the skill enforces mechanically before and after LLM invocation:

```markdown
---

## Summary

These principles are not a checklist to admire; they are the gear that has to hold when the senior engineer is on holiday and the agents keep shipping. Grouped by the layer each one supports:

**Why — strategic conviction**

1. **Context Engineering** captures the durable intent behind the system where agents can read it.

**What — judgment and taste**

3. **The Agent Feedback Loop** lets agents self-correct so human judgment is spent on design, not lint errors.
4. **Depth-First Implementation** defines what "done" looks like and produces the concrete examples that teach taste.
5. **KPIs** measure whether the system is actually producing good outcomes — agent autonomy, harness coverage, context density.

**How — deep engineering**

2. **Mechanical Constraints** stop bad changes automatically instead of narrating them.
3. **Entropy Management** keeps technical debt bounded as agents generate code faster than humans can review it.
4. **The Deterministic-vs-LLM Split** draws the line between what machines enforce and what LLMs are trusted to judge.

Adopt them progressively:

- **Level 1**: Context Engineering + documentation — make the **Why** legible.
- **Level 2**: Add Mechanical Constraints + linters + the Deterministic-vs-LLM Split — make the **How** load-bearing.
- **Level 3**: Add the Agent Feedback Loop + Entropy Management — make the **What** reliable and keep it that way.

The measure of success is not how many principles you have adopted. It is whether, with no one watching the rope, you still trust what ships.

[← Back to Overview](./index.md) | [Implementation Guide →](./implementation.md) | [KPIs & Metrics →](./kpis.md)

_Last Updated: 2026-08-05_
```
