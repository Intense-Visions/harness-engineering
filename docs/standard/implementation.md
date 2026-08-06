# Harness Engineering Implementation Guide

Build the harness first, then climb.

The tempting way to adopt these practices is to grow _into_ a harness over a quarter: a couple of weeks of documentation, then a few weeks of linters, then a month or two of agent tooling before anything actually catches a bad change. That framing is backwards. A harness only earns its name when it **stops** a bad change with no human watching — the [holiday test from Principle 0](./principles.md#principle-0-the-harness-is-load-bearing-it-catches-when-no-human-is-watching). Until it does that, you have documentation and notifications, not a harness.

So don't sell yourself weeks of climbing before the rope is attached. Start with the smallest configuration that already passes the holiday test — the **load-bearing minimum** — and scaffold it in one command. Then climb toward the advanced tier only if and when the payoff is real. The adoption tiers are not a mandatory multi-month sequence; they are a floor you stand on and a ceiling you can grow toward.

---

## Start here: scaffold the load-bearing minimum

```bash
harness init --level load-bearing-minimum
```

This is the recommended starting point for most teams. It scaffolds the minimum harness that still holds when the senior engineer disappears for two weeks:

- **Mechanical constraints** — ESLint with layer enforcement, a cyclomatic-complexity cap of 15, a coupling cap, and a module-size cap, all enforced through `harness.config.json`.
- **The multi-persona review gate** — `harness review-ci`, wired into a scaffolded `.github/workflows/required-review.yml` that runs on every pull request.
- **The outcome-eval ship gate** — `harness outcome-eval-ci`, which judges each change against its spec and blocks on a high-confidence failure.
- **Local scripts** — `npm run harness:review` and `npm run harness:outcome-eval`, so you can run the same gates at your desk.

The two agent-loop gates are what catch the regressions no one is watching for, sitting on top of the mechanical floor. Together they turn a pile of warnings into gear that actually catches — the reason this tier, and not the lighter ones, is the recommended place to begin.

The rest of this guide explains what is inside that harness — so you can understand it, hand-build it, or extend it — and how to climb toward the advanced tier when you need more.

---

## The adoption tiers

Adoption is expressed as a `--level` on `harness init`. There are four tiers, but they are **not** steps you must climb in order:

| Tier                                     | What it adds on top of the tier before it                                                                                                                        | Passes the holiday test?                                          |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `basic`                                  | AGENTS.md, a documentation structure, and a one-way layer model — validated but not enforced with thresholds. The shared foundation every higher tier builds on. | No — it captures intent; it does not stop bad changes.            |
| `intermediate`                           | Mechanical constraints: ESLint layer enforcement, complexity / coupling / module-size caps, structural tests, and a CI gate.                                     | Partly — it stops structural drift, but nothing reviews behavior. |
| `load-bearing-minimum` **(recommended)** | The two agent-loop gates — multi-persona review and the outcome-eval ship gate — wired into CI on top of the intermediate constraints.                           | **Yes** — the smallest tier that stops a bad change unwatched.    |
| `advanced`                               | The full harness: scheduled entropy cleanup, agent personas, telemetry and trajectory visibility, and the complete feedback loop.                                | Yes, with the widest surface area — ambitious, not necessary.     |

`basic` and `intermediate` are lighter subsets — useful if you genuinely cannot start at the load-bearing minimum yet, or as a way to understand each layer in isolation. `advanced` is a destination to climb toward, not a prerequisite for shipping safely. **The load-bearing minimum is the pragmatic entry point: it holds the moment you scaffold it.**

The walkthrough below follows the layers in the order they stack — the context foundation, the mechanical constraints, then the two load-bearing gates that complete the recommended tier — and closes with the climb to `advanced`.

---

## The foundation: context engineering

This is the shared groundwork every tier stands on — the `basic` tier ships exactly this, and every higher tier includes it. It makes the reasoning behind the system legible to agents that were never in the room. On its own it does not stop a bad change, which is why it is a foundation rather than a harness.

### Step 1: Set Up Documentation Structure

Create the documentation directory structure:

```bash
mkdir -p docs/{architecture,design-docs,exec-plans,guides}
```

Structure:

```
docs/
├── core-beliefs.md              # Product values, non-negotiables
├── architecture/
│   ├── layers.md                # Your dependency model
│   ├── decisions/               # ADRs (Architecture Decision Records)
│   │   ├── 001-monorepo.md
│   │   ├── 002-typescript.md
│   │   └── README.md (index of ADRs)
│   └── diagrams/                # System diagrams (mermaid)
├── design-docs/                 # Design before implementation
│   ├── user-authentication.md
│   ├── payment-processing.md
│   └── README.md (index)
├── exec-plans/                  # Current work + timeline
│   ├── 2026-q1.md
│   └── current.md
├── guides/                       # How to build things
│   ├── adding-a-new-feature.md
│   ├── testing-patterns.md
│   └── README.md (index)
└── standard/                     # Harness Engineering Standard
    ├── index.md
    ├── principles.md
    ├── implementation.md
    └── kpis.md
```

### Step 2: Create Core Beliefs Document

Create `docs/core-beliefs.md` with your team's non-negotiables:

```markdown
# Core Beliefs

## Quality First

- All code must be tested
- Tests are written before or alongside implementation
- Code review is required for all changes

## Documentation as Code

- Decisions are documented in git
- No knowledge in Slack or shared drives
- README exists for every package/service

## Architectural Integrity

- Dependencies flow one-way (no cycles)
- Each layer has clear responsibilities
- Constraints are enforced mechanically

## Sustainable Pace

- No hero work required
- Features are completed end-to-end before starting next
- Technical debt is paid down weekly
```

### Step 3: Document Your Architecture Layers

Create `docs/architecture/layers.md`:

```markdown
# Architectural Layers

## Dependency Model
```

Application / UI
↓ (imports from)
Service Layer (business logic)
↓
Repository Layer (data access)
↓
Config Layer (environment, constants)
↓
Types Layer (shared types, interfaces)

```

## Layer Descriptions

### Types Layer
- **Location**: `src/types/`
- **Responsibility**: Shared types, interfaces, constants
- **Can import from**: Nothing (no upward imports)
- **Can be imported by**: Everyone

### Config Layer
- **Location**: `src/config/`
- **Responsibility**: Environment setup, configuration
- **Can import from**: Types
- **Can be imported by**: Everyone above

### Repository Layer
- **Location**: `src/repository/`
- **Responsibility**: Data access (database, external APIs)
- **Can import from**: Types, Config
- **Can be imported by**: Service layer only

### Service Layer
- **Location**: `src/services/`
- **Responsibility**: Business logic, orchestration
- **Can import from**: Types, Config, Repository
- **Can be imported by**: Application, other services (if needed)

### Application / UI Layer
- **Location**: `src/app/`, `src/ui/`
- **Responsibility**: User interface, routing, presentation
- **Can import from**: Types, Config, Service
- **Can be imported by**: Nothing (entry point)

## Enforcement

All layers are enforced:
- ESLint rule: `@harness-engineering/no-layer-violation`
- Structural test: `tests/architecture/layers.test.ts`
- Build will fail if violated
```

### Step 4: Create Architecture Decision Record (ADR) Template

Create `docs/architecture/decisions/README.md`:

````markdown
# Architecture Decision Records (ADRs)

ADRs document significant architectural decisions made during development.
They capture the "why" behind our choices.

## Format

Each ADR is a markdown file named `NNN-decision-title.md` where NNN is a sequence number.

## Template

```markdown
# ADR-001: Use TypeScript

## Context

We're building a microservice that will be maintained by multiple teams.
We need strong typing and IDE support.

## Decision

We will use TypeScript as our primary language.

## Rationale

- Type safety reduces bugs in production
- IDE support improves developer experience
- TypeScript compiles to JavaScript for deployment

## Consequences

- Build step required (TS → JS compilation)
- Team members need to learn TypeScript
- Slightly larger bundle size

## Alternatives Considered

- Python: Less suitable for type safety at scale
- Go: Would require rewriting supporting libraries

## Related Decisions

- ADR-002: Use Node.js runtime
- ADR-003: ESLint for linting
```
````

## How to Add an ADR

1. Create new file: `docs/architecture/decisions/NNN-title.md`
2. Use template above
3. Get review from architecture team
4. Merge to main branch (archived for reference)

## Current ADRs

- [ADR-001: Monorepo with pnpm](./001-monorepo.md)
- [ADR-002: TypeScript for core library](./002-typescript.md)

````

Create your first few ADRs:

- `001-why-monorepo.md` - Explain your repo structure
- `002-why-typescript.md` (or your language) - Explain tech stack
- `003-layered-architecture.md` - Explain your dependency model

### Step 5: Create AGENTS.md Knowledge Map

Create top-level `AGENTS.md` (from project root):

```markdown
# AGENTS.md - Knowledge Map

This file helps AI agents and new team members navigate the project.
Read this first to understand where to find information.

## About This Project

[Brief description: 2-3 sentences about what your project does]

## Core Documentation

**Must Read First**:
- Project vision and values: [docs/core-beliefs.md](docs/core-beliefs.md)
- How the project is organized: [docs/README.md](docs/README.md) (if exists)

**For Architecture Questions**:
- Layer definitions and dependency rules: [docs/architecture/layers.md](docs/architecture/layers.md)
- Why we made specific choices: [docs/architecture/decisions/](docs/architecture/decisions/)

**For Implementation Questions**:
- Design before starting work: [docs/design-docs/](docs/design-docs/)
- Step-by-step guides: [docs/guides/](docs/guides/)
- Examples: [examples/](examples/)

## Current Work

**What are we building now?**
- Current quarter plan: [docs/exec-plans/2026-q1.md](docs/exec-plans/2026-q1.md)
- Active issues: GitHub Issues (filter by `status:in-progress`)

## Code Structure

````

src/
├── types/ # Shared types and interfaces
├── config/ # Configuration
├── repository/ # Data access layer
├── services/ # Business logic
└── app/ # Application / UI

````

See [docs/architecture/layers.md](docs/architecture/layers.md) for full details.

## Development Workflow

1. Pick a task from [current work](docs/exec-plans/current.md)
2. Read relevant design doc if exists
3. Create feature branch: `feature/what-youre-building`
4. Follow patterns in [docs/guides/](docs/guides/)
5. Write tests alongside code
6. Open PR with self-review checklist (see template below)

**Self-Review Checklist Template** (include in PRs):
```markdown
## Self-Review
- [ ] Tests pass locally
- [ ] No linting errors
- [ ] No architectural violations (layers)
- [ ] Documentation updated if needed
- [ ] Commit message is clear
````

## Common Tasks

### Adding a New Feature

1. Design doc: [docs/design-docs/](docs/design-docs/)
2. Implementation guide: [docs/guides/adding-a-new-feature.md](docs/guides/adding-a-new-feature.md)
3. Example: [examples/](examples/)

### Setting Up Locally

1. [README.md](README.md) - Clone and install
2. [docs/guides/local-setup.md](docs/guides/local-setup.md) - Detailed setup

### Running Tests

```bash
npm test              # Run all tests
npm run test:watch   # Watch mode
npm run test:coverage # With coverage
```

### Deploying Changes

- See: [docs/guides/deployment.md](docs/guides/deployment.md)

## Reaching Out

- Questions about architecture? [file an issue](https://github.com/yourproject/issues)
- Need help? [Check discussions](https://github.com/yourproject/discussions)
- Found a bug? [Report it](https://github.com/yourproject/issues)

## Tools & Standards

- **Package manager**: pnpm
- **Runtime**: Node.js 22+
- **Language**: TypeScript 5.0+
- **Linting**: ESLint + Prettier
- **Testing**: Jest
- **Monorepo tool**: Turborepo

````

### Step 6: Create Implementation Guides

Create `docs/guides/adding-a-new-feature.md`:

```markdown
# Adding a New Feature

This guide walks through adding a complete feature end-to-end.

## Overview

A complete feature includes:
1. Design document
2. Implementation code with tests
3. Updated documentation
4. Deployment to staging/production

## Step 1: Write a Design Document

Create `docs/design-docs/your-feature.md`:

```markdown
# Design: Your Feature Name

## Problem
What problem are we solving?

## Proposed Solution
How will we solve it?

## Implementation Plan
1. Create service in `src/services/your-feature/`
2. Add API endpoint
3. Write tests
4. Deploy

## Testing Strategy
How will we verify this works?

## Risks & Mitigations
What could go wrong? How will we prevent it?

## Alternatives Considered
What other approaches did we consider?
````

## Step 2: Implement Feature

### Create Directory Structure

```
src/services/your-feature/
├── index.ts           # Main export
├── your-feature.service.ts
├── your-feature.test.ts
└── README.md
```

### Write Tests First (or Alongside)

```typescript
// your-feature.test.ts
describe('YourFeatureService', () => {
  it('should create a thing', () => {
    const result = yourFeatureService.create({...});
    expect(result).toBeDefined();
  });
});
```

### Implement Code

```typescript
// your-feature.service.ts
export const yourFeatureService = {
  create(input: Input): Result<Output, Error> {
    // Validation
    const validated = inputSchema.safeParse(input);
    if (!validated.success) {
      return { ok: false, error: validated.error };
    }

    // Implementation
    const result = doWork(validated.data);

    // Return result
    return { ok: true, value: result };
  },
};
```

### Document the Module

````markdown
# Your Feature Service

## Overview

What does this service do?

## API

### `create(input: Input): Result<Output, Error>`

Create a new thing.

**Parameters**:

- `input.name` (string): Name of the thing

**Returns**:

- Success: `{ ok: true, value: Output }`
- Failure: `{ ok: false, error: Error }`

**Example**:

```typescript
const result = yourFeatureService.create({ name: 'My Thing' });
if (result.ok) {
  console.log('Created:', result.value);
} else {
  console.error('Failed:', result.error);
}
```
````

## Testing

Run tests: `npm test -- your-feature.test.ts`

````

## Step 3: Update AGENTS.md

Add your new feature to the knowledge map:

```markdown
## Features

- Your feature: [src/services/your-feature/](src/services/your-feature/)
  Design doc: [docs/design-docs/your-feature.md](docs/design-docs/your-feature.md)
````

## Step 4: Open PR

Include self-review checklist:

```markdown
## Self-Review

- [ ] Design doc written and approved
- [ ] Implementation matches design
- [ ] Tests pass (>80% coverage for this feature)
- [ ] No architectural violations
- [ ] Documentation updated (README.md, design-docs, AGENTS.md)
- [ ] No linting errors
```

````

### Step 7: Set Up Documentation Navigation

Update root `README.md` to point to documentation:

```markdown
# [Your Project Name]

[Brief description]

## Quick Start

[Setup instructions]

## Documentation

- **New to the project?** Start with [AGENTS.md](AGENTS.md)
- **Want to understand our architecture?** Read [docs/architecture/layers.md](docs/architecture/layers.md)
- **Building a new feature?** Follow [docs/guides/adding-a-new-feature.md](docs/guides/adding-a-new-feature.md)
- **Looking for decisions made?** Check [ADRs](docs/architecture/decisions/)

[Other sections...]
````

### Step 8: Verify the foundation is complete

Checklist:

- [ ] `docs/core-beliefs.md` created and reviewed
- [ ] `docs/architecture/layers.md` documents your layer model
- [ ] 3-5 ADRs created (`docs/architecture/decisions/`)
- [ ] `AGENTS.md` created at project root
- [ ] `docs/guides/adding-a-new-feature.md` provides implementation guidance
- [ ] All links in AGENTS.md and guides are valid
- [ ] README.md points to documentation

**Test**: Can a new team member read AGENTS.md and find what they need to get started?

---

## Mechanical constraints

This is the layer the `intermediate` tier adds, and it is the mechanical floor of the load-bearing minimum: linters, layer enforcement, complexity and module-size caps, and structural tests that stop architectural drift before review. It stops _structural_ regressions — but nothing here reviews behavior, which is what the two load-bearing gates in the next section add.

### Step 1: Set Up Linting

#### For TypeScript/JavaScript (ESLint)

Install dependencies:

```bash
npm install --save-dev eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

Create `.eslintrc.json`:

```json
{
  "parser": "@typescript-eslint/parser",
  "extends": ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "no-var": "error",
    "prefer-const": "error",
    "eqeqeq": ["error", "always"]
  },
  "overrides": [
    {
      "files": ["src/services/**/*.ts"],
      "rules": {
        "@harness-engineering/no-forbidden-imports": "error"
      }
    }
  ]
}
```

Add to `package.json`:

```json
{
  "scripts": {
    "lint": "eslint src/ --ext .ts",
    "lint:fix": "eslint src/ --ext .ts --fix"
  }
}
```

### Step 2: Create Custom Linter Rules

#### Layer Violation Rule

Create `eslint-rules/no-layer-violations.js`:

```javascript
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce layer dependencies',
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        const fileName = context.getFilename();
        const importPath = node.source.value;

        // Check: Service cannot import from UI
        if (fileName.includes('services/') && importPath.includes('ui/')) {
          context.report({
            node,
            message: 'Service layer cannot import from UI layer',
          });
        }

        // Check: Repository cannot import from Service
        if (fileName.includes('repository/') && importPath.includes('services/')) {
          context.report({
            node,
            message: 'Repository layer cannot import from Service layer',
          });
        }

        // Add more layer rules as needed
      },
    };
  },
};
```

### Step 3: Create Structural Tests

#### Test: No Circular Dependencies

Create `tests/architecture/circular-deps.test.ts`:

```typescript
import { detectCircularDepsInFiles } from '@harness-engineering/core';
import { glob } from 'glob';
import * as path from 'path';

describe('Architecture: Circular Dependencies', () => {
  it('should have no circular dependencies', async () => {
    const srcDir = path.join(__dirname, '../../src');
    const files = await glob('**/*.ts', { cwd: srcDir, absolute: true });
    const result = await detectCircularDepsInFiles(files, parser);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.cycles).toEqual([]);
    }
  });
});
```

#### Test: Layer Violations

Create `tests/architecture/layers.test.ts`:

```typescript
import { defineLayer, validateDependencies } from '@harness-engineering/core';

describe('Architecture: Layers', () => {
  const layers = [
    defineLayer({ name: 'ui', path: 'src/ui', allowedDependencies: ['services', 'types'] }),
    defineLayer({ name: 'services', path: 'src/services', allowedDependencies: ['types'] }),
    defineLayer({ name: 'types', path: 'src/types', allowedDependencies: [] }),
  ];

  it('should have no layer violations', async () => {
    const result = await validateDependencies({
      layers,
      rootDir: path.join(__dirname, '../../'),
      parser,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.violations).toHaveLength(0);
    }
  });
});
```

### Step 4: Set Up CI/CD Validation

> **CI ships on init.** `harness init` now writes `.github/workflows/ci.yml` automatically for both new and existing projects — a single fail-fast job that runs build + lint + test (language-appropriate) followed by `harness ci check` as the gate. It never overwrites an existing workflow at that path, so a hand-tuned `ci.yml` is preserved. `harness ci init` remains the on-demand path through the same generator (use `--language` and `--platform` to target Python, Go, Rust, Java, or GitLab/generic). The generated workflow installs the harness CLI (`npm install -g @harness-engineering/cli`) immediately before the gate so it runs on any GitHub-hosted runner regardless of project language, and contains no auto-baseline-update or `git push` step. The retired gate-only `harness.yml` filename is replaced by `ci.yml`.

The architecture-validation workflow below is an illustrative example of an additional, hand-authored gate. Create `.github/workflows/architecture.yml`:

```yaml
name: Architecture Validation

on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm install
      - run: npm run lint

  architecture:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm install
      - run: npm run test -- architecture/
```

### Step 5: Add Boundary Validation

Create schema for API boundaries:

```typescript
// src/services/user/user.schema.ts
import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  createdAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;
```

Use schema in API:

```typescript
// src/app/api/users.ts
export async function getUser(req: Request) {
  try {
    const id = req.params.id;
    const user = await userService.getById(id);

    // Validate at boundary before returning
    const validated = UserSchema.parse(user);
    return res.json(validated);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}
```

### Step 6: Verify the mechanical constraints are complete

Checklist:

- [ ] ESLint configured and passing
- [ ] Custom linter rules created for layer violations
- [ ] Structural tests for circular dependencies pass
- [ ] Boundary validation schemas created
- [ ] CI/CD validation added to GitHub Actions
- [ ] All PRs run architecture validation
- [ ] Documentation updated: [docs/architecture/enforcement.md](docs/architecture/enforcement.md)

**Test**: Try to violate a constraint (e.g., import from UI in services). CI should fail.

---

## The load-bearing gates: review and outcome-eval

The mechanical constraints above stop _structural_ regressions. What makes the load-bearing minimum actually hold the holiday test is the pair of agent-loop gates that review the _behavior_ of a change with no human in the loop: multi-persona review and the outcome-eval ship gate. These two gates are the difference between the `intermediate` tier and the recommended `load-bearing-minimum` tier.

If you scaffolded with `harness init --level load-bearing-minimum`, both gates are already wired in — this section explains what they do and how to run them by hand. If you started lighter, this is the section that upgrades you to a harness that holds.

### Step 1: The multi-persona review gate

`harness review-ci` runs a panel of specialized review personas over the pull request diff and fails the check when a persona requests changes. It is scaffolded into `.github/workflows/required-review.yml`, running on every pull request against `main`:

```bash
harness review-ci --runner claude --block-on request-changes --diff "origin/main...HEAD"
```

Run the same gate locally before you push:

```bash
npm run harness:review
```

The heuristic floor of the gate runs on any runner; the LLM tier activates only when an API-key secret is present, degrading gracefully otherwise.

### Step 2: The outcome-eval ship gate

`harness outcome-eval-ci` judges the change against its spec and blocks only on a high-confidence `NOT_SATISFIED` verdict — it auto-discovers the spec from the diff. It is the second job in the scaffolded `required-review.yml`:

```bash
harness outcome-eval-ci --block-on blocking --diff "origin/main...HEAD"
```

Locally:

```bash
npm run harness:outcome-eval
```

### Step 3: Verify the load-bearing minimum is complete

Checklist:

- [ ] The foundation (context engineering) and mechanical constraints above are in place
- [ ] `.github/workflows/required-review.yml` runs both gates on pull requests
- [ ] `harness review-ci` blocks a PR when a persona requests changes
- [ ] `harness outcome-eval-ci` blocks a PR on a high-confidence spec-satisfaction failure
- [ ] `npm run harness:review` and `npm run harness:outcome-eval` run at your desk

**Test**: Open a PR that quietly breaks a documented behavior. With no human reviewing, the gates should stop it. That is the holiday test — and passing it is what makes this the recommended tier.

---

## Climbing to advanced: the full agent loop and entropy management

Everything below is the `advanced` tier. It is ambitious, not necessary — climb here when the payoff is real, not as a prerequisite for shipping safely. It widens the surface area with a full self-review template, scheduled entropy cleanup, telemetry and trajectory visibility, and configurable agent personas.

### Step 1: Set Up Agent Self-Review

Create PR template (`.github/pull_request_template.md`):

```markdown
## Description

[What changes are in this PR?]

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Refactoring

## Self-Review Checklist

- [ ] Tests pass (`npm test`)
- [ ] Linting clean (`npm run lint`)
- [ ] No architectural violations (layers)
- [ ] Documentation updated (AGENTS.md, guides, comments)
- [ ] No hardcoded secrets or sensitive data
- [ ] Performance: No N+1 queries or obvious regressions
- [ ] Error handling is comprehensive
- [ ] Commit messages are clear and follow conventions

## Peer Review Requested From

- [ ] @architecture-enforcer (for architectural changes)
- [ ] @documentation-maintainer (if docs changed)
- [ ] @test-reviewer (for significant logic changes)

## How to Test

[Instructions for reviewer to verify changes]

## Screenshots (if applicable)

[Add screenshots for UI changes]

## Notes for Reviewer

[Any context reviewer should know?]
```

### Step 2: Set Up Cleanup Agent

Create `scripts/cleanup.sh`:

```bash
#!/bin/bash
set -e

echo "Running cleanup checks..."

# Check for documentation drift
echo "Checking for doc drift..."
npm run check-doc-drift

# Check for dead code
echo "Checking for dead code..."
npm run detect-dead-code

# Check for pattern violations
echo "Checking for pattern violations..."
npm run check-patterns

echo "Cleanup checks passed!"
```

Create GitHub Action (`.github/workflows/cleanup.yml`):

```yaml
name: Weekly Cleanup

on:
  schedule:
    - cron: '0 2 * * 0' # Every Sunday at 2 AM

jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm install
      - name: Run cleanup checks
        run: npm run cleanup
      - name: Create cleanup PR if needed
        if: failure()
        run: |
          git config user.name "cleanup-bot"
          git config user.email "cleanup@example.com"
          git checkout -b cleanup/weekly
          git add -A
          git commit -m "chore: automated cleanup" || true
          git push origin cleanup/weekly
          # TODO: Create PR via GitHub API
```

### Step 3: Add Telemetry Integration

Create telemetry configuration:

```typescript
// src/telemetry.ts
// Note: harness does not ship an OpenTelemetry adapter.
// Use the @opentelemetry/sdk-node package directly for OTEL integration.
import { NodeSDK } from '@opentelemetry/sdk-node';

const sdk = new NodeSDK({
  serviceName: 'your-service',
});

sdk.start();
```

Use telemetry in agent feedback:

```typescript
// src/feedback.ts
export async function reportAgentAction(action: AgentAction) {
  const result = await logAgentAction(action);

  if (!result.ok) {
    console.error('Failed to log agent action:', result.error);
  }
}
```

### Step 4: Configure Agent Personas

Create `agents/personas/architecture-enforcer.json`:

```json
{
  "name": "Architecture Enforcer",
  "role": "Validate architectural constraints on PRs",
  "description": "Reviews PRs for layer violations, circular dependencies, and constraint breaches",
  "skills": ["enforce-architecture", "check-mechanical-constraints"],
  "triggers": ["on_pr"],
  "tools": ["linter", "dependency-analyzer", "structural-tests"],
  "reviewTargets": ["services", "repository", "config"],
  "failurePolicy": "comment_and_request_changes"
}
```

Create `agents/personas/documentation-maintainer.json`:

```json
{
  "name": "Documentation Maintainer",
  "role": "Ensure documentation stays in sync with code",
  "description": "Detects documentation drift and proposes updates",
  "skills": ["detect-doc-drift", "align-documentation"],
  "triggers": ["on_pr"],
  "tools": ["doc-analyzer", "code-parser"],
  "reviewTargets": ["all"],
  "failurePolicy": "comment_with_suggestions"
}
```

### Step 5: Add Agent Review GitHub Action

Create `.github/workflows/agent-review.yml`:

```yaml
name: Agent Review

on: [pull_request]

jobs:
  agent-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm install

      - name: Run architecture review
        run: npm run agent-review -- --type architecture-enforcer
        continue-on-error: true

      - name: Run documentation review
        run: npm run agent-review -- --type documentation-maintainer
        continue-on-error: true

      - name: Comment on PR
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '⚠️ Agent review found issues. Please check the logs above.'
            })
```

### Step 6: Verify the advanced tier is complete

Checklist:

- [ ] PR template created with self-review checklist
- [ ] Cleanup agent running on schedule (weekly)
- [ ] Telemetry integration working
- [ ] Agent personas configured
- [ ] GitHub Action for agent review set up
- [ ] Agents can successfully review and comment on PRs
- [ ] Documentation updated: [docs/guides/agent-feedback.md](docs/guides/agent-feedback.md)

**Test**: Create a PR with a constraint violation. Verify agent review catches it.

---

## Conventions & Standards

These conventions are referenced by skills and workflows. They are not mechanically enforced yet — they are documented standards that agents follow by convention. Future workflow gates (see the research roadmap) may add mechanical enforcement.

### Checkpoint-Based Context Handoff

**Convention:** At phase boundaries (between skills, between milestones, between agent sessions), write a structured handoff document to `.harness/handoff.md`.

**Purpose:** When one skill/phase completes and another begins, context is lost. The handoff file preserves what was done, what was discovered, what's blocked, and what should happen next. Subsequent skills read this file as input context.

**Schema:**

```markdown
# Handoff: [phase/skill name]

## Completed

- [what was done, with file paths]
- Example: Created `src/services/auth.ts` with JWT validation logic
- Example: Updated `docs/guides/authentication.md` with new flow diagram

## Discovered

- [unexpected findings, edge cases, dependencies found]
- Example: The existing UserService has a circular dependency with AuthService
- Example: Rate limiting is not implemented on the /login endpoint

## Blocked

- [what couldn't be completed and why]
- Example: Cannot add Redis caching — redis client package not in dependencies
- Example: Integration test requires database seed data that doesn't exist yet

## Test Results

- [pass/fail summary with command output]
- Example: 14/14 unit tests passing
- Example: 2/3 integration tests passing — `test-login-rate-limit` skipped (see Blocked)

## Next Steps

- [what the next skill/phase should do]
- Example: Run `harness-code-review` on the auth service changes
- Example: Address the circular dependency before adding caching
```

**When to write a handoff:**

- After completing a skill invocation that produces artifacts (code, docs, config)
- After a long-running agent session that spans multiple tasks
- When pausing work that another agent or session will resume
- After debugging sessions that discovered unexpected state

**How skills use it:**

- Skills that produce output **write** `.harness/handoff.md` as their final step
- Skills that consume context **read** `.harness/handoff.md` as their first step (if it exists)
- Each handoff overwrites the previous one — it captures the current state, not history
- For historical context, the anti-pattern log (below) and git history serve as the record

### Anti-Pattern Log

**Convention:** Maintain an append-only log at `.harness/anti-patterns.md` that records failed approaches, dead ends, and lessons learned during agent work.

**Purpose:** Agents exploring solutions (debugging, refactoring, architectural decisions) often try approaches that fail. Without a record, the same dead-end gets explored repeatedly — across sessions, across agents, across team members. The anti-pattern log prevents this waste.

**Schema:**

```markdown
## [YYYY-MM-DD] [skill name]: [brief description]

**Tried:** [what was attempted]
**Failed because:** [why it didn't work]
**What worked instead:** [the successful approach]
```

**Example entries:**

```markdown
## 2026-03-15 harness-debugging: Fix circular dependency in auth module

**Tried:** Moved shared types into a `common/` directory and re-exported from both services.
**Failed because:** The re-export created an implicit dependency cycle that TypeScript caught at compile time — `common/` imported a type that transitively depended on `auth/`.
**What worked instead:** Extracted the shared interface into `src/types/auth-types.ts` (Types layer) with zero upward dependencies. Both services import from the Types layer, following the dependency model.

## 2026-03-14 harness-execution: Add Redis caching to user service

**Tried:** Used `ioredis` with default connection pooling.
**Failed because:** The test environment doesn't have Redis running, and the `ioredis` mock library doesn't support the `pipeline()` method we needed.
**What worked instead:** Created a `CachePort` interface in the Repository layer and a `RedisCacheAdapter` that implements it. Tests use an `InMemoryCacheAdapter`. The adapter pattern lets us swap implementations without changing service code.
```

**Rules:**

- **Append-only**: Never delete entries. The history is the value.
- **Skills read at start**: Before exploring a solution, check if a similar approach was already tried and failed.
- **Skills append at end**: After recovering from a failed approach, record what happened.
- **Keep entries brief**: 3-5 sentences per entry. Link to relevant files instead of pasting code.
- **Date and skill name are required**: These make it searchable and attributable.

**What belongs in the anti-pattern log:**

- Failed debugging approaches
- Architectural dead ends
- Library/tool incompatibilities discovered
- Configuration mistakes and their fixes
- Performance optimizations that didn't work

**What does NOT belong:**

- Successful approaches (those go in handoff docs and git history)
- General best practices (those go in `docs/guides/best-practices.md`)
- Opinions or preferences (those go in ADRs)

### Review Learnings

**Convention:** Maintain a calibration file at `.harness/review-learnings.md` that records what review findings are valuable versus noisy for a specific project.

**Purpose:** Code review produces findings. Some findings catch real bugs; others are noise (project-specific patterns flagged as issues). Without calibration, the review skill wastes attention on known false positives and misses project-specific priorities.

**Schema:**

```markdown
# Review Learnings

## Useful Findings

- [category]: [example] — [why this was valuable]

## Noise / False Positives

- [category]: [example] — [why this wasn't helpful]

## Calibration Notes

- [specific guidance for this project]
```

**Example:**

```markdown
# Review Learnings

## Useful Findings

- error-handling: Missing catch in async pipeline — caused silent failures in production
- type-safety: Implicit any in service boundaries — led to runtime type mismatches
- test-coverage: Untested error paths in payment flow — caught a real bug

## Noise / False Positives

- naming: Flagging single-letter variables in test helpers — these are conventional (e.g., `t`, `e`)
- error-handling: Missing error handling in CLI scripts — these exit on error by design
- docs: Missing JSDoc on internal utility functions — we document at module level, not function level

## Calibration Notes

- This project uses Result types everywhere — do not flag missing try/catch in functions that return Result<T, E>
- Test helpers intentionally use loose types for ergonomics — do not flag missing type annotations in test/
- The CLI package uses process.exit() intentionally — do not flag as an anti-pattern
```

**Maintenance:** Append new entries after each review cycle. Periodically prune entries that are no longer relevant (e.g., after a major refactor changes the codebase patterns).

---

## Measuring Success

Track adoption with these metrics:

### Context Density

```bash
# Lines of documentation / lines of code
docs_lines=$(find docs -name "*.md" -not -path "*/node_modules/*" | xargs wc -l | tail -1 | awk '{print $1}')
code_lines=$(find src -name "*.ts" | xargs wc -l | tail -1 | awk '{print $1}')
echo "Context Density: $(echo "scale=2; $docs_lines / $code_lines" | bc)"
```

### Harness Coverage

```bash
# Count enforced rules vs total rules
echo "Enforced rules: $(grep -r 'error' .eslintrc.json | wc -l)"
echo "Total rules: [manual count from all configs]"
```

### Agent Autonomy

Track via GitHub:

- Count PRs where all commits are from bots (GitHub Actions, linter fixes)
- Calculate: (bot_commits / total_commits) \* 100

---

## Common Challenges & Solutions

### "Documentation gets out of sync with code"

**Solution**: Set up doc drift detection in cleanup agent

```bash
npm run detect-doc-drift
```

Proposes PRs when docs don't match code.

### "Linter rules are too strict"

**Solution**: Create exceptions via ADR

- Document exception in `docs/architecture/decisions/NNN-exception.md`
- Add eslint-disable comment with ADR reference
- Maintain exception count (trend should decrease)

### "Agents waste time exploring wrong patterns"

**Solution**: Ensure patterns are documented + mechanically enforced

- Design doc explains the pattern
- Examples in `/examples/` show correct usage
- Linter rule prevents wrong usage
- Structural test validates at build time

---

## Next Steps

1. **Scaffold the load-bearing minimum** — `harness init --level load-bearing-minimum`. This is the harness; the rest is climbing.
2. **Confirm it holds** — open a PR that breaks a documented behavior and watch the review and outcome-eval gates stop it. That is the holiday test.
3. **Fill in the foundation** — flesh out AGENTS.md, the architecture docs, and the ADRs so agents have the context the gates assume.
4. **Measure KPIs** — context density, harness coverage, agent autonomy.
5. **Climb to advanced only when the payoff is real** — scheduled entropy cleanup, agent personas, and the full feedback loop are ambitious, not necessary.

---

[← Back to Principles](./principles.md) | [KPIs & Metrics →](./kpis.md)

_Last Updated: 2026-08-05_
