# The Six Core Principles of Harness Engineering

This document provides a detailed explanation of each principle that defines Harness Engineering. Each principle addresses a specific challenge in building systems that AI agents can work with reliably.

---

## 1. Context Engineering

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

```markdown
# Knowledge Map

## About This Project

Brief description and links to core documents.

## Core Beliefs

- File: docs/core-beliefs.md

## Architecture

- Layers and dependencies: docs/architecture/layers.md
- Design decisions: docs/architecture/decisions/

## Implementation

- How to build features: docs/guides/
- Code examples: examples/

## Agent Resources

- Skills available: agents/skills/
- How agents work: docs/agent-feedback-loop.md
```

Agents can read AGENTS.md first, understand the structure, then navigate to relevant documentation.

#### Documentation Coverage

Measure what percentage of your codebase is documented:

- Documented: Code with corresponding design docs, README, or ADRs
- Undocumented: Code without any architectural explanation
- Goal: >90% coverage, with explicit exceptions for obvious code

### Examples

#### Example 1: API Design Decision

Instead of context living in Slack:

```
[Slack conversation lost in 500+ messages]
Engineer A: "Should we return error objects or status codes?"
Engineer B: "Objects, they're easier to parse"
Engineer A: "Cool"
```

Document in git:

```markdown
# ADR-042: Error Response Format

## Context

Our API needs to communicate errors to clients...

## Decision

Return error objects with code, message, and details fields.
Rationale: Easier for clients to parse, extensible for future fields.

## Implementation

File: src/api/error-response.ts
Tests: tests/api/error-response.test.ts
```

Now agents can read this decision and follow it consistently.

#### Example 2: Layer Boundaries

Slack/tribal knowledge:

```
"Yeah, services can't import from UI... I think?
(Everyone has a different understanding)
```

Repository documentation:

```
# Architecture Layers

## Dependency Model
Types → Config → Repository → Service → UI

One-way flow only. UI can import from Service.
Service cannot import from UI.

## Enforcement
- ESLint rule: no-ui-imports-in-service
- Structural tests verify dependencies at build time
- Failed rule = CI fails, PR blocked

## Exceptions
None currently. If you need an exception, file an ADR.
```

Agents know exactly what's allowed and can be held to the same standards.

### Implementation Checklist

- [ ] Create `docs/core-beliefs.md` with product values and non-negotiables
- [ ] Create `docs/architecture/layers.md` documenting your dependency model
- [ ] Create `docs/architecture/decisions/` directory for ADRs
- [ ] Create top-level `AGENTS.md` knowledge map
- [ ] Document all major design decisions as ADRs
- [ ] Ensure all package READMEs are comprehensive
- [ ] Run `harness validate` to check documentation coverage

---

## 2. Architectural Rigidity & Mechanical Constraints

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

## 3. The Agent Feedback Loop

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
## Summary

Implemented feature X with behavior Y.

## Changes

- Added service layer for X
- Added tests covering scenarios A, B, C
- Updated documentation in docs/guides/

## Self-Review Checklist

- [x] Tests pass locally
- [x] ESLint passes
- [x] No architectural violations
- [x] Documentation updated
- [x] Dependency graph validated

## Remaining Questions

- Should X behavior handle edge case Z? (Flagged for review)
```

Agents describe their work clearly so reviewers can focus on design questions, not implementation details.

#### Self-Review Checklist

Before requesting human review, agents verify:

```typescript
const selfReviewChecklist = [
  { check: 'Tests pass', passed: true },
  { check: 'Linting clean', passed: true },
  { check: 'No architectural violations', passed: true },
  { check: 'Documentation updated', passed: false, suggestion: 'Update guide.md' },
  { check: 'Dependency graph valid', passed: true },
];
```

Failed checks trigger agent fixes, not human review.

#### Peer Agent Review

For critical PRs, request a specialized agent reviewer:

```typescript
await requestPeerReview({
  agentType: 'architecture-enforcer',
  context: {
    files: changedFiles,
    diff: gitDiff,
    commitMessage: 'Add caching layer to user service',
  },
});
```

Specialized agents check:

- `architecture-enforcer` - Validates architectural decisions
- `documentation-maintainer` - Ensures docs are updated
- `test-reviewer` - Verifies test coverage
- `security-checker` - Looks for vulnerabilities

#### Observability Integration

Agents access telemetry to diagnose failures:

```typescript
const telemetry = await getTelemetry('user-service', {
  timeRange: { start: '1h ago', end: 'now' },
  filter: { level: 'ERROR' },
});

if (telemetry.errors > threshold) {
  // Agent can see what went wrong and propose a fix
  console.log('High error rate detected. Proposing rollback.');
}
```

Agents with observability access can:

- Diagnose test failures by reading logs
- Understand performance issues
- Propose fixes based on actual system behavior

### Examples

#### Example 1: Agent Self-Review in Action

```markdown
## PR: Add email notification service

### Summary

Added new service for sending notifications via email.
Implements exponential backoff retry logic.

### Self-Review

- [x] Unit tests: 15 tests, all passing
- [x] Integration tests: 3 tests with mock email provider
- [x] ESLint: Clean
- [x] Circular dependencies: None
- [x] Documentation: Updated docs/services/notifications.md

### Peer Review Requested

Requesting @architecture-enforcer review of dependency choices.

### Ready for Human Review

Questions for reviewer:

- Should we log PII in error cases? (Currently no)
- Is exponential backoff config acceptable? (Currently 1s → 60s)
```

Human reviewer can focus on design questions, not lint errors.

#### Example 2: Agent Debugging with Telemetry

Agent fails test run. Instead of waiting for human help:

```typescript
// Agent reads logs
const logs = await getTelemetry('test-service', {
  filter: { testName: 'send-email-on-signup' },
});

// Sees: "TIMEOUT: Email provider took > 5s to respond"
// Realizes: Mock email provider needs tweaking
// Fixes: Adjusts mock timeout config
// Reruns: Tests pass

// Opens PR: "Fix flaky email test by increasing mock timeout"
```

Faster iteration, no human involvement needed.

### Implementation Checklist

- [ ] Set up agent skill for code generation (Claude Code, Gemini CLI, etc.)
- [ ] Create self-review checklist template in git (e.g., `REVIEW_TEMPLATE.md`)
- [ ] Configure specialized agent personas (architecture-enforcer, etc.)
- [ ] Set up GitHub Actions (or CI/CD equivalent) for agent PR automation
- [ ] Integrate telemetry adapter (OpenTelemetry, Sentry, etc.)
- [ ] Create logs and metrics that agents can read
- [ ] Document how agents should request peer review
- [ ] Train team on interpreting agent-led PRs

---

## 4. Entropy Management (Garbage Collection)

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

## 5. Implementation Strategy (Depth-First)

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

## 6. Key Performance Indicators

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
```

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
```

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

## Summary

These six principles work together to create a system where:

1. **Context Engineering** ensures agents have the information they need
2. **Mechanical Constraints** prevent bad decisions automatically
3. **Agent Feedback Loop** lets agents self-correct before human review
4. **Entropy Management** keeps technical debt bounded
5. **Depth-First Implementation** builds clear examples and patterns
6. **KPIs** measure progress toward agent autonomy

Adopt them progressively:

- **Level 1**: Context Engineering + Documentation
- **Level 2**: Add Mechanical Constraints + Linters
- **Level 3**: Add Agent Feedback Loop + Entropy Management

[← Back to Overview](./index.md) | [Implementation Guide →](./implementation.md) | [KPIs & Metrics →](./kpis.md)

_Last Updated: 2026-03-11_
