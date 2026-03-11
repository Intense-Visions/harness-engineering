# @harness-engineering/core

Core runtime library for harness engineering, implementing all 6 principles.

## Installation

```bash
npm install @harness-engineering/core
# or
pnpm add @harness-engineering/core
```

## Usage

```typescript
import { validateAgentsMap, validateKnowledgeMap } from '@harness-engineering/core';

// Validate AGENTS.md structure
const agentsResult = validateAgentsMap('./AGENTS.md');
if (!agentsResult.ok) {
  console.error(agentsResult.error.message);
  process.exit(1);
}

// Validate all links resolve
const linksResult = await validateKnowledgeMap();
if (!linksResult.ok) {
  console.error(`Found ${linksResult.error.brokenLinks.length} broken links`);
}
```

## Modules

> **Note:** The APIs listed below represent the planned functionality for Phase 2. Currently, only the Result type and helper functions are available in the `@harness-engineering/types` package.

### Context Engineering

Validate and enforce repository-as-documentation patterns.

**APIs:**

- `validateAgentsMap()` - Validate AGENTS.md structure
- `validateKnowledgeMap()` - Check link integrity
- `checkDocCoverage()` - Measure documentation coverage
- `generateAgentsMap()` - Generate AGENTS.md from code

### Architectural Constraints

Runtime enforcement of layered dependencies and boundaries.

**APIs:**

- `defineLayer()` - Define architectural layers
- `validateDependencies()` - Validate dependency graph
- `detectCircularDeps()` - Find circular dependencies
- `createBoundarySchema()` - Zod-based boundary validation

### Agent Feedback

APIs for self-review, peer reviews, and telemetry access.

**APIs:**

- `createSelfReview()` - Generate review checklist
- `requestPeerReview()` - Request specialized agent review
- `getTelemetry()` - Access observability data
- `logAgentAction()` - Log agent actions

### Entropy Management

Detect drift, dead code, and pattern violations.

**APIs:**

- `detectDocDrift()` - Find outdated documentation
- `findPatternViolations()` - Check pattern compliance
- `detectDeadCode()` - Find unused code
- `autoFixEntropy()` - Auto-fix safe issues

### Validation

Cross-cutting validation utilities.

**APIs:**

- `validateFileStructure()` - Check file conventions
- `validateConfig()` - Type-safe config validation
- `validateCommitMessage()` - Validate commit format

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Test
pnpm test

# Test with coverage
pnpm test:coverage

# Watch mode
pnpm test:watch
```

## License

MIT
