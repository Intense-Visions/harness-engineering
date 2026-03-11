# KPIs & Metrics: Measuring Harness Engineering Success

Harness Engineering success is measured through three interconnected metrics. These KPIs tell you whether your system is enabling agent-driven development effectively.

---

## Overview

### The Three Core KPIs

```
Context Density
    ↓
Agent has information to make decisions

Harness Coverage
    ↓
Mechanical constraints prevent bad decisions

Agent Autonomy
    ↓
AI agents operate reliably and independently
```

These three metrics are interdependent:

- **High context density** enables good decisions
- **High harness coverage** prevents bad decisions
- **Together**, they enable **high agent autonomy**

---

## KPI 1: Agent Autonomy

### Definition

**Agent Autonomy**: The percentage of PRs merged without human code intervention.

In other words: Of all merged PRs, how many contain only commits from:
- Automated systems (GitHub Actions, CI/CD)
- Linter fixes and code generation
- Bot accounts (not human developers)

PRs where humans add code commits after creation: **do not count** as autonomous.

### Why It Matters

Agent autonomy is the ultimate KPI for Harness Engineering:

- **Low autonomy** (<40%) = Agents need heavy human oversight; not effective
- **Medium autonomy** (40-70%) = Agents can handle routine tasks; humans focus on design
- **High autonomy** (70-90%) = Agents handle most work; humans validate
- **Very high autonomy** (>90%) = Agents are primary developers; humans set direction

### How to Measure

#### Method 1: GitHub API (Automated)

```bash
#!/bin/bash
# Script to calculate agent autonomy

TOKEN=$GITHUB_TOKEN
REPO=$1  # e.g., owner/repo

# Get all merged PRs from last month
SINCE=$(date -u -d '30 days ago' +%Y-%m-%dT%H:%M:%SZ)

curl -s "https://api.github.com/repos/$REPO/pulls?state=closed&merged=true&since=$SINCE" \
  -H "Authorization: token $TOKEN" | jq -r '.[] | .number' | while read PR; do

  # Get commits for this PR
  COMMITS=$(curl -s "https://api.github.com/repos/$REPO/pulls/$PR/commits" \
    -H "Authorization: token $TOKEN")

  # Check if all commits are from bots
  BOT_COMMITS=$(echo $COMMITS | jq '[.[] | select(.author.type == "Bot")] | length')
  TOTAL_COMMITS=$(echo $COMMITS | jq 'length')

  if [ "$BOT_COMMITS" -eq "$TOTAL_COMMITS" ]; then
    echo "PR #$PR: Autonomous (all $TOTAL_COMMITS commits from bots)"
  fi
done
```

#### Method 2: Manual Review

For small teams or quick audits:

1. Look at last 20 merged PRs in GitHub
2. For each PR, click "Commits" tab
3. Count commits:
   - From bots/automation (dependabot, github-actions, linter-bot)
   - From humans (named accounts)
4. Calculate: `(PRs with 100% bot commits) / total PRs`

#### Example Calculation

```
August Metrics (20 PRs merged):

PR #145: Main branch update - 3 commits, all from github-actions ✓ Autonomous
PR #146: Feature: Add caching - 5 commits, all from human engineer ✗ Human-led
PR #147: Bug fix - 4 commits, all from github-actions ✓ Autonomous
PR #148: Linter fix - 1 commit from linter-bot ✓ Autonomous
PR #149: Feature + tests - 6 commits, 5 from human, 1 from linter ✗ Human-led
... (15 more)

Autonomous PRs: 12 out of 20
Agent Autonomy = 60% ✓
```

### Setting Targets

**Month 1-2**: 20-30% (Agents learning, humans guiding heavily)
**Month 3-4**: 40-50% (Agents handle routine tasks)
**Month 6**: 60%+ (Agents handle most, humans focus on design)
**Month 12**: 80%+ (Mature system, human oversight light)

### Improving Agent Autonomy

To increase autonomy:

1. **Increase context density** - Agents need information to work independently
   ```bash
   npm run measure:context-density
   # Target: >0.3 (3000 lines of docs for 10k lines of code)
   ```

2. **Increase harness coverage** - Reduce cases where agents get it wrong
   ```bash
   npm run measure:harness-coverage
   # Target: >90% of rules enforced mechanically
   ```

3. **Improve feedback quality** - Agents learn from feedback to improve
   - Ensure PR reviews are constructive
   - Document patterns and learnings
   - Share feedback with agents for future PRs

4. **Reduce exceptions** - Each exception reduces predictability
   - Track architectural rule exceptions
   - Trend should move toward zero
   - Only exceptions with ADRs are acceptable

---

## KPI 2: Harness Coverage

### Definition

**Harness Coverage**: The percentage of architectural rules enforced mechanically (via CI/CD) versus manually (via code review).

Rules that fail the build automatically (high harness coverage) are easier to enforce than rules that rely on reviewer vigilance (low harness coverage).

### Why It Matters

Without mechanical enforcement:

- Rules are subjective ("does this violate the architecture?")
- Reviewers have different standards (inconsistent enforcement)
- Agents don't know what's allowed (expensive trial-and-error)
- Violations accumulate (entropy grows)

With high mechanical enforcement:

- Rules are objective and verifiable
- Violations fail CI immediately (no wasted review time)
- Agents learn boundaries quickly (no trial-and-error)
- Violations are impossible (entropy prevented)

### How to Measure

#### Step 1: List All Architectural Rules

Create `docs/rules-inventory.md`:

```markdown
# Architectural Rules Inventory

## Rules Enforced Mechanically ✓

1. No imports from UI in service layer
   - Tool: ESLint rule `@harness/no-ui-imports-in-service`
   - Enforced: CI fails if violated

2. No circular dependencies between modules
   - Tool: Structural test `circular-deps.test.ts`
   - Enforced: CI fails if violated

3. No hardcoded secrets in code
   - Tool: Pre-commit hook (git-secrets)
   - Enforced: Commit blocked if violated

4. All public APIs must have schema validation
   - Tool: ESLint rule `require-boundary-schema`
   - Enforced: CI fails if violated

5. All errors must use Result type
   - Tool: ESLint rule `require-result-type`
   - Enforced: CI fails if violated

6. Documentation must be updated with code
   - Tool: Doc drift detection in cleanup agent
   - Enforced: Cleanup PR created, requires review

7. No T+1 queries in services
   - Tool: Structural test `no-n-plus-one.test.ts`
   - Enforced: CI fails if violated

...

Total Mechanical Rules: 10

## Rules Enforced Manually (Code Review) ✗

1. Use clear variable names
   - Checked by: Code review
   - Risk: Inconsistent enforcement

2. Functions should be <50 lines
   - Checked by: Code review
   - Risk: Varies by reviewer

3. Error messages should be helpful
   - Checked by: Code review
   - Risk: Subjective judgment

...

Total Manual Rules: 5

## Summary

- Mechanical: 10
- Manual: 5
- Coverage: 10 / (10 + 5) = 66.7%
- Target: >90%
```

#### Step 2: Calculate Coverage

```bash
#!/bin/bash
# Count rules from various sources

MECHANICAL=$(grep -r 'Tool:' docs/rules-inventory.md | grep '✓' | wc -l)
MANUAL=$(grep -r 'Checked by:' docs/rules-inventory.md | wc -l)
TOTAL=$((MECHANICAL + MANUAL))
COVERAGE=$((MECHANICAL * 100 / TOTAL))

echo "Harness Coverage: $COVERAGE% ($MECHANICAL / $TOTAL rules)"
```

#### Example Calculation

```
Mechanical Rules (enforced by CI):
- No UI imports in services (ESLint) ✓
- No circular dependencies (test) ✓
- No hardcoded secrets (pre-commit) ✓
- All APIs must use schema (ESLint) ✓
- No N+1 queries (test) ✓
- Type-safe config (TypeScript) ✓
- No unused imports (ESLint) ✓
- No var declarations (ESLint) ✓
- No undefined variables (TypeScript) ✓
- No console.log in production (linter) ✓

Total Mechanical: 10

Manual Rules (code review only):
- Clear variable names
- Helpful error messages
- Good function names
- Reasonable function length

Total Manual: 4

Harness Coverage = 10 / (10 + 4) = 71.4%
Target: >90%
```

### Setting Targets

- **Month 1**: 50-60% (Basic linting, some structural tests)
- **Month 3**: 70-80% (More comprehensive rules)
- **Month 6**: 90%+ (Most rules mechanically enforced)

### Improving Harness Coverage

To increase coverage, convert manual rules to mechanical ones:

#### Identify Manual Rules

```bash
# Rules only in code review, not in CI/CD
grep -r 'Checked by:' docs/rules-inventory.md | grep '✗'
```

#### Create Linter Rules

For "clear variable names":

```javascript
// eslint-rules/descriptive-names.js
module.exports = {
  meta: { type: 'suggestion' },
  create(context) {
    return {
      VariableDeclarator(node) {
        const name = node.id.name;
        // Flag single-letter variables (except i, j in loops)
        if (name.length === 1 && !['i', 'j'].includes(name)) {
          context.report({
            node,
            message: `Use descriptive variable name instead of '${name}'`,
            suggest: [{ desc: 'Use a descriptive name' }],
          });
        }
      },
    };
  },
};
```

#### Create Structural Tests

For "reasonable function length":

```typescript
// tests/architecture/function-length.test.ts
it('should have functions <50 lines', () => {
  const violations = checkFunctionLength({
    sourceDir: 'src',
    maxLines: 50,
  });
  expect(violations).toHaveLength(0);
});
```

#### Automate Fixes

Where possible, auto-fix violations:

```bash
npm run lint:fix  # Auto-fixes ESLint violations
npm run format    # Auto-formats code
```

---

## KPI 3: Context Density

### Definition

**Context Density**: The ratio of lines of documentation to lines of code.

Formula: `(lines in /docs/) / (lines in /src/)`

A high context density means agents have ample information about what code does and why.

### Why It Matters

Agents work with context you provide:

- **Low density** (<0.1) = Agents lack context, make wrong decisions
- **Medium density** (0.1-0.3) = Agents have some context, need trial-and-error
- **High density** (0.3-0.5+) = Agents have rich context, make good decisions

High context density enables:

- Better design decisions (agents understand intent)
- Faster implementation (agents don't reinvent)
- Fewer reviews (context explains the approach)
- Consistent patterns (documented patterns are followed)

### How to Measure

#### Method 1: Automated Script

```bash
#!/bin/bash

# Count documentation lines
DOC_LINES=$(find docs -name "*.md" \
  -not -path "*/node_modules/*" \
  -not -path "*/.vitepress/*" \
  -not -path "*/generated/*" \
  | xargs wc -l | tail -1 | awk '{print $1}')

# Count code lines (excluding tests, node_modules)
CODE_LINES=$(find src \
  -name "*.ts" -o -name "*.tsx" -o -name "*.py" -o -name "*.rs" \
  -not -path "*/.test.*" \
  -not -path "*/node_modules/*" \
  -not -path "*/__pycache__/*" \
  | xargs wc -l | tail -1 | awk '{print $1}')

# Calculate ratio
DENSITY=$(echo "scale=3; $DOC_LINES / $CODE_LINES" | bc)

echo "Context Density: $DENSITY ($DOC_LINES docs / $CODE_LINES code)"
```

#### Method 2: Manual Count

1. Count lines in `docs/`:
   ```bash
   find docs -name "*.md" | xargs wc -l | tail -1
   ```

2. Count lines in `src/`:
   ```bash
   find src -name "*.ts" | xargs wc -l | tail -1
   ```

3. Divide docs by code

#### Example Calculation

```
docs/ content:
- AGENTS.md: 100 lines
- core-beliefs.md: 50 lines
- architecture/layers.md: 150 lines
- architecture/decisions/: 800 lines (across multiple ADRs)
- design-docs/: 1,200 lines
- guides/: 1,500 lines
- standards/: 400 lines
Total docs: ~4,200 lines

src/ code:
- services/: 3,000 lines
- repository/: 2,000 lines
- types/: 500 lines
- config/: 300 lines
- app/: 4,000 lines
Total code: ~9,800 lines

Context Density = 4,200 / 9,800 = 0.43
Target: >0.3, achieved: 0.43 ✓
```

### What Should Be Documented

Different types of documentation add to context density:

#### Architecture Documentation
- `docs/core-beliefs.md` - Product values and non-negotiables
- `docs/architecture/layers.md` - Layer model and dependencies
- `docs/architecture/decisions/` - ADRs explaining why

#### Design Documentation
- `docs/design-docs/feature-name.md` - Before implementing features
- Problem, solution, implementation plan, testing strategy

#### Implementation Guides
- `docs/guides/adding-a-new-feature.md` - How to build
- `docs/guides/testing-patterns.md` - Testing approach
- `docs/guides/deployment.md` - How to deploy

#### API Documentation
- Service/module README.md - What it does, how to use
- Code comments - Complex logic, non-obvious decisions
- Type definitions - Interface documentation in JSDoc/docstrings

#### Knowledge Maps
- `AGENTS.md` - Navigation guide for agents and team members
- `README.md` - Quick start, links to docs

### Setting Targets

- **Month 1**: 0.1-0.2 (Early project, minimal docs)
- **Month 3**: 0.2-0.3 (Core architecture documented)
- **Month 6**: 0.3-0.5 (Design docs, guides, ADRs)
- **Month 12**: 0.4-0.6 (Comprehensive context)

### Improving Context Density

To increase density, add documentation strategically:

#### 1. Prioritize Architecture Docs (High ROI)

```markdown
# docs/architecture/layers.md
- Explains dependency model
- Prevents agents from exploring wrong approaches
- Enables faster code reviews
- Effort: 1-2 hours, payoff: ongoing
```

#### 2. Add Design Docs Before Implementation

```markdown
# docs/design-docs/my-feature.md
- Written before code
- Explains intent and trade-offs
- Agents can read and understand approach
- Effort: 1-2 hours per feature, payoff: clearer implementation
```

#### 3. Create Implementation Guides

```markdown
# docs/guides/adding-a-new-service.md
- Step-by-step example
- Shows correct patterns
- Agents can reference and follow
- Effort: 2-4 hours, payoff: multiple features follow pattern
```

#### 4. Maintain AGENTS.md

```markdown
# AGENTS.md
- Navigation guide
- Points to relevant documentation
- Agents and humans start here
- Effort: 30 minutes to create, 5 minutes weekly to maintain
```

#### ROI Analysis

```
Investment in docs: 40 hours over 6 months
  - AGENTS.md: 1 hour
  - Architecture docs: 8 hours
  - Design docs: 20 hours (4 features × 5 hours each)
  - Implementation guides: 10 hours

Payoff in saved time:
  - Agent decision quality: 5 hours saved per feature (clearer context)
  - Code review time: 2 hours saved per PR (less back-and-forth)
  - Onboarding: 20 hours saved per new engineer
  - Pattern consistency: 10 hours saved in rework

Total payoff over 6 months: ~100 hours saved
ROI: 100 saved / 40 invested = 2.5x return on investment
```

---

## Tracking KPIs Over Time

### Monthly KPI Dashboard

Create `docs/metrics/dashboard.md`:

```markdown
# KPI Dashboard

## Current Status (March 2026)

| KPI | Current | Target | Trend |
|-----|---------|--------|-------|
| Agent Autonomy | 35% | 60% | ↑ +5% |
| Harness Coverage | 68% | 90% | ↑ +8% |
| Context Density | 0.28 | 0.35 | ↑ +0.03 |

## Agent Autonomy

- **Definition**: % of PRs merged without human code intervention
- **Current**: 35% (7 of 20 PRs last month)
- **Target**: 60% by Month 6
- **Action**: Improve harness coverage (blocking more violations early)

## Harness Coverage

- **Definition**: % of architectural rules enforced mechanically
- **Current**: 68% (17 of 25 rules enforced in CI)
- **Target**: 90%
- **Next**: Add linter rule for N+1 queries (+1 rule)

## Context Density

- **Definition**: lines of docs / lines of code
- **Current**: 0.28 (4,100 docs / 14,600 code)
- **Target**: >0.3
- **Next**: Add design doc for upcoming feature (+500 docs lines)

## Trends

```
Agent Autonomy (Monthly)
Month 1: 15% ↑
Month 2: 25% ↑
Month 3: 35% ← current

Harness Coverage (Monthly)
Month 1: 45% ↑
Month 2: 60% ↑
Month 3: 68% ← current

Context Density (Monthly)
Month 1: 0.15 ↑
Month 2: 0.22 ↑
Month 3: 0.28 ← current
```

## Opportunities

- [ ] Add ESLint rule for hardcoded URLs (+1 rule)
- [ ] Create design doc for caching feature (+300 docs)
- [ ] Document testing patterns guide (+200 docs)
- [ ] Improve doc drift detection (+autonomy)

Updated: 2026-03-11
```

### Quarterly Reviews

Every 3 months:

1. **Calculate KPIs** for the quarter
2. **Compare to targets** - Are we on track?
3. **Identify blockers** - What's preventing progress?
4. **Adjust strategy** - What needs to change?
5. **Celebrate wins** - Acknowledge progress

---

## Integration with Agent Feedback

Agents can use KPIs to understand performance:

```typescript
// Agent reads KPIs to understand context
const metrics = await getMetrics();

if (metrics.agentAutonomy < 50) {
  console.log('Low autonomy. Reading more context to improve decisions.');
  const docs = await readDocumentation('architecture');
  // Agent reads docs before proposing changes
}

if (metrics.harnessCovarage < 80) {
  console.log('Low harness coverage. Violations might slip through.');
  // Agent runs extra validation
}

if (metrics.contextDensity < 0.3) {
  console.log('Low context density. Proposing design doc for new feature.');
  // Agent suggests creating design doc
}
```

---

## Comparing to Industry Benchmarks

### Typical Adoption Timeline

```
Month 1-2: Foundation (Context Engineering)
- Context Density: 0.1-0.2
- Harness Coverage: 40-50%
- Agent Autonomy: 10-20%

Month 3-4: Constraints (Mechanical Enforcement)
- Context Density: 0.2-0.3
- Harness Coverage: 60-75%
- Agent Autonomy: 30-45%

Month 6+: Full Harness (Agent Loop)
- Context Density: 0.3-0.5
- Harness Coverage: 85-95%
- Agent Autonomy: 60-80%

Month 12+: Mature System
- Context Density: 0.4-0.6
- Harness Coverage: 90-98%
- Agent Autonomy: 75-90%
```

Your project's timeline may vary based on:
- Team size (larger teams benefit more from constraints)
- Codebase complexity (complex systems need more documentation)
- Agent capability (better agents achieve autonomy faster)

---

## Actionable Recommendations

### If Agent Autonomy is Low (<40%)

1. **Check Context Density** - If <0.2, agents lack information
   - Add AGENTS.md knowledge map
   - Add architecture documentation
   - Create design docs for major features

2. **Check Harness Coverage** - If <60%, agents make mistakes
   - Add linter rules for common violations
   - Create structural tests for dependencies
   - Automate rule enforcement in CI

3. **Improve Feedback** - If agents don't learn from PRs
   - Ensure PR reviews include clear explanations
   - Document rejected patterns and why
   - Share feedback with agents for future work

### If Harness Coverage is Low (<70%)

1. **List all rules** (see Harness Coverage section)
2. **Prioritize by impact** - Which rules prevent the most damage?
3. **Convert to mechanical enforcement** - Create linter rules or tests
4. **Measure impact** - Does agent autonomy improve?

### If Context Density is Low (<0.2)

1. **Add AGENTS.md** (1-2 hours) - Navigation guide
2. **Document architecture** (4-8 hours) - Layers, decisions
3. **Create design docs** (5 hours per feature) - Before implementation
4. **Write guides** (4-6 hours) - How to build things

---

## Success Criteria

Your system is "successful" when:

- ✓ **Agent Autonomy > 70%** - Agents handle most routine work
- ✓ **Harness Coverage > 90%** - Rules are enforced mechanically
- ✓ **Context Density > 0.3** - Rich context for decision-making

At these levels:

- Agents can work independently most of the time
- Violations are impossible (caught automatically)
- Humans focus on design and validation, not implementation
- Code quality is consistent and high

---

[← Back to Implementation](./implementation.md) | [Principles Overview →](./principles.md)

*Last Updated: 2026-03-11*
