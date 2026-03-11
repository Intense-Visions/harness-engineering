# Harness Engineering: AI Agent Knowledge Map

This is the single source of truth for AI agents working on the Harness Engineering project. It provides essential context about our repository structure, architecture, conventions, and where to find information.

## Project Overview

**Harness Engineering** is a comprehensive toolkit for transitioning from manual coding to **agent-first development**. We help teams architect software in ways that enable AI agents to execute, maintain, and improve code reliably and autonomously.

### Purpose and Goals

- Create a reusable library and toolkit for agent-first development
- Establish patterns that make AI-driven development predictable and scalable
- Document architectural decisions as the single source of truth
- Enforce constraints mechanically rather than through code review
- Measure and improve agent autonomy over time

### Current Phase

**Phase 1: Foundation and Documentation** - We are building the core library, documentation, and tooling that establishes the foundation for agent-first development.

## Repository Structure

This is a **monorepo** using pnpm workspaces and Turborepo for orchestration.

```
harness-engineering/
├── packages/                  # Core application packages
│   ├── types/                # Shared TypeScript types and interfaces
│   ├── core/                 # Core runtime library and utilities
│   └── [future packages]     # Additional packages (CLI, agents, etc.)
├── docs/                     # Complete documentation suite
│   ├── index.md             # Documentation homepage
│   ├── standard/            # Harness Engineering principles and standard
│   ├── guides/              # How-to guides and tutorials
│   ├── reference/           # Configuration and API reference
│   ├── api/                 # Generated API documentation
│   └── superpowers/         # Specifications and implementation plans
│       ├── specs/           # Detailed technical specifications
│       └── plans/           # Implementation and execution plans
├── package.json             # Root package metadata and scripts
├── tsconfig.json            # Root TypeScript configuration
├── pnpm-workspace.yaml      # pnpm workspace definition
├── turbo.json               # Turborepo configuration
└── AGENTS.md                # This file - AI agent knowledge map
```

### Package Relationships

- **types** → Shared type definitions (no dependencies)
- **core** → Runtime library (depends on types)
- All packages follow strict dependency rules: no circular dependencies, no upward dependencies

## Architecture

### Layered Architecture

We follow a strict, one-way dependency model:

```
Types (bottom layer - no dependencies)
  ↓
Configuration & Constants
  ↓
Repository & Data Access
  ↓
Services & Business Logic
  ↓
Agents & External Interfaces (top layer)
```

**Key Rule**: Layers can only depend on lower layers, never upward.

### Design Decisions

1. **TypeScript Strict Mode** - All code runs with strict type checking enabled
2. **Project References** - We use tsconfig project references for proper compilation order and dependency validation
3. **Monorepo Structure** - Enables shared code and consistent tooling across packages
4. **Documentation-First** - All architectural decisions live in git as version-controlled markdown
5. **Result<T, E> Pattern** - Explicit error handling using Result types (similar to Rust's Result)

### Module Boundaries

Each package has a clear responsibility:

- **types**: Type definitions, interfaces, and constants used across packages
- **core**: Runtime library with validation, utilities, and common functionality
- Future packages will handle: CLI tools, agent skills, linting rules, etc.

## Development Workflow

### Prerequisites

Ensure you have these tools installed:

- **Node.js 18+** - Download from [nodejs.org](https://nodejs.org/)
- **pnpm 8+** - Install with: `npm install -g pnpm`
- **Git** - Required for version control

Verify your setup:

```bash
node --version    # Should be 18.x or higher
pnpm --version    # Should be 8.x or higher
git --version     # Any recent version
```

### Setting Up the Project

```bash
# 1. Clone the repository
git clone https://github.com/harness-engineering/harness-engineering.git
cd harness-engineering

# 2. Install all dependencies
pnpm install

# 3. Verify the setup by building
pnpm build

# 4. Run tests to ensure everything works
pnpm test
```

### Common Development Tasks

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Watch mode for development
pnpm dev

# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests for a specific package
pnpm test --filter=@harness-engineering/core

# Lint all code
pnpm lint

# Format code (TypeScript, JavaScript, Markdown, JSON)
pnpm format

# Check formatting without making changes
pnpm format:check

# Type checking
pnpm typecheck

# Start documentation server
pnpm docs:dev

# Build documentation
pnpm docs:build

# Preview built documentation
pnpm docs:preview

# Clean build artifacts
pnpm clean
```

### Git Workflow and Commit Conventions

We use **Conventional Commits** for clear, machine-readable commit messages:

```
type(scope): brief description

Optional longer explanation of the change and why it was made.
```

**Commit Types:**

- `feat:` - New feature or functionality
- `fix:` - Bug fix
- `docs:` - Documentation changes (no code changes)
- `style:` - Code style changes (formatting, semicolons, etc.)
- `refactor:` - Code changes without new features or fixes
- `test:` - Test additions or modifications
- `chore:` - Dependency updates, tooling, etc.

**Example Commits:**

```
feat(core): add Result type for error handling
fix(types): correct generic constraints on Handler interface
docs: update AGENTS.md with architecture overview
refactor(core): simplify validation logic
test(core): add tests for Result type
```

## Key Concepts

### Result<T, E> Pattern

We use a Result type (similar to Rust) for explicit error handling:

```typescript
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

This provides:

- **Explicit error handling** - No surprise errors
- **Type-safe operations** - Compiler enforces error handling
- **Clear intent** - Functions signal they may fail
- **Composability** - Easy to chain operations

### TypeScript Project References

We use `tsconfig.json` project references for:

- **Proper compilation order** - Dependencies compile first
- **Incremental builds** - Only rebuild what changed
- **Dependency validation** - Prevent circular dependencies
- **Clear boundaries** - Explicit package dependencies

Configuration example:

```json
{
  "references": [{ "path": "./packages/types" }, { "path": "./packages/core" }]
}
```

### Monorepo Structure Benefits

- **Shared Dependencies** - One pnpm-lock.yaml ensures consistency
- **Unified Tooling** - Same linting, formatting, and test configuration
- **Coordinated Changes** - Easy to update multiple packages together
- **Turborepo Caching** - Faster builds with smart caching

### Documentation-First Approach

All architectural decisions must be documented:

1. **Design Documents** - Explain the "why" before implementing
2. **Architecture Decisions** - Record key choices in `/docs/standard/`
3. **Implementation Plans** - Track execution in `/docs/superpowers/plans/`
4. **Specifications** - Detailed technical specs in `/docs/superpowers/specs/`
5. **Guides** - How-to documentation for common tasks

This creates a permanent record that AI agents can access and understand.

## Where to Find Things

### Documentation Structure

- **[docs/standard/](./docs/standard/)** - Core Harness Engineering standard and principles
  - `index.md` - Overview of the standard
  - `principles.md` - Deep dive into the 6 core principles
  - `implementation.md` - Step-by-step adoption guide
  - `kpis.md` - Metrics for measuring success

- **[docs/guides/](./docs/guides/)** - How-to guides and tutorials
  - `getting-started.md` - Quick start guide for new projects
  - `best-practices.md` - Recommended patterns and practices
  - Additional guides for specific topics

- **[docs/reference/](./docs/reference/)** - Technical reference documentation
  - Configuration reference
  - CLI documentation
  - API reference

- **[docs/api/](./docs/api/)** - Generated API documentation
  - Auto-generated from code comments
  - TypeScript type definitions
  - Function signatures and examples

- **[docs/superpowers/](./docs/superpowers/)** - Project planning and design
  - `specs/` - Detailed technical specifications for features
  - `plans/` - Implementation and execution plans

### Key Documentation

When working on this project, agents should prioritize reading:

1. **First**: [Harness Engineering Standard](./docs/standard/index.md) - Understanding the vision
2. **Second**: [Six Core Principles](./docs/standard/principles.md) - Understanding how it works
3. **Third**: [Getting Started Guide](./docs/guides/getting-started.md) - Practical setup
4. **Reference**: [Implementation Guide](./docs/standard/implementation.md) - Detailed guidance
5. **Context**: This file (AGENTS.md) - Navigation and quick reference

## Conventions

### Code Style

- **TypeScript Strict Mode** - All code compiles with `strict: true`
- **ESLint** - Configured in `eslint.config.js` for code quality rules
- **Prettier** - Auto-formatting with rules in `.prettierrc.json`
  - 2-space indentation
  - Single quotes for strings
  - Trailing commas where valid
  - Line length: 80 characters (practical limit)

### Code Organization

- **Barrel Exports** - Each package has `src/index.ts` that re-exports public API
- **Type-Safe Code** - No `any` types unless absolutely necessary with `// @ts-ignore` comments
- **Clear Imports** - Explicit imports from package exports, not internal paths

### Commit Message Format

Follow **Conventional Commits** (see Git Workflow section above):

```
type(scope): brief description under 50 chars

Optional longer body explaining the "why" and "what" of the change.
Keep lines under 72 characters for readability.

Closes #123  # Optional reference to related issues
```

### Documentation Standards

When writing documentation:

1. **Be Specific** - Explain decisions, not just facts
2. **Include Examples** - Code examples for technical decisions
3. **Link References** - Link to related docs
4. **Update AGENTS.md** - Add new docs to the navigation
5. **Explain the Why** - Focus on reasoning, not just implementation

Example documentation template:

```markdown
# Feature Name

## Overview

One-sentence description of what this is and why it exists.

## Design

Detailed explanation of the design and key decisions.

## Implementation

How it works technically with code examples.

## Examples

Real-world usage examples.

## Related

Links to related documentation.
```

### Testing Approach

- **Unit Tests** - Test individual functions and classes
- **Integration Tests** - Test package interactions
- **Test Coverage** - Aim for high coverage of critical paths
- **Descriptive Names** - Test names explain what is being tested

Test file locations:

- Core code: `src/module.ts`
- Tests: `src/__tests__/module.test.ts`

## Common Tasks for Agents

### Adding a New Package

1. **Create directory structure**:

   ```bash
   mkdir -p packages/my-package/src
   ```

2. **Create package.json** with name `@harness-engineering/my-package`

3. **Add TypeScript configuration** (`tsconfig.json`)

4. **Export from src/index.ts** (barrel export)

5. **Add to root tsconfig.json** references

6. **Add to pnpm-workspace.yaml** if not auto-detected

### Updating Documentation

1. **Create or edit markdown file** in appropriate `/docs/` subdirectory

2. **Follow documentation standards** (see Conventions section)

3. **Update navigation** - Add links to AGENTS.md or VitePress config if needed

4. **Link to related docs** - Help agents navigate to context

5. **Update AGENTS.md** if creating new major sections

### Running Tests

```bash
# Run all tests
pnpm test

# Watch mode for development
pnpm test:watch

# Test specific package
pnpm test --filter=@harness-engineering/core

# Run with coverage
pnpm test -- --coverage
```

### Building the Project

```bash
# Build all packages
pnpm build

# Build specific package
pnpm build --filter=@harness-engineering/core

# Development mode (watch)
pnpm dev

# Clean build (remove artifacts)
pnpm clean && pnpm build
```

## Context for AI Agents

### Our Approach to AI Development

This project is **specifically designed** for AI agents to work on it effectively:

1. **Documentation is Law** - Decisions are recorded, not assumed
2. **Explicit Over Implicit** - Clear patterns and constraints guide work
3. **Mechanical Validation** - Rules are enforced by code, not hope
4. **Self-Verification** - Agents can run tests and validate their work
5. **Context-Dense** - All information needed is in the repository

### Principles to Follow

When working on this project, AI agents should:

1. **Read AGENTS.md First** - Understand the project context
2. **Check Related Documentation** - Follow links to understand decisions
3. **Follow Conventions Strictly** - Code style, commit messages, structure
4. **Write Tests** - Verify new code before committing
5. **Update Documentation** - Keep docs in sync with code changes
6. **Self-Review** - Run tests, check formatting, verify types before submitting
7. **Be Specific in PRs** - Explain the why, not just the what
8. **Respect Boundaries** - Stay within architectural constraints

### Harness Engineering Principles

The project embodies these core principles:

1. **Context Engineering** - All knowledge lives in git (this AGENTS.md, architectural docs, specs)
2. **Architectural Rigidity** - Layered architecture with mechanical constraints prevents bad patterns
3. **Agent Feedback Loop** - Self-review, peer review, testing all happen before human review
4. **Entropy Management** - Documentation must stay in sync with code
5. **Depth-First Implementation** - Complete features fully before starting new ones
6. **Measurable Success** - Track metrics: agent autonomy, harness coverage, context density

### Error Handling Pattern

Always use Result types for operations that may fail:

```typescript
import type { Result } from '@harness-engineering/core';

export function validateConfig(data: unknown): Result<Config, ValidationError> {
  if (!isValidConfig(data)) {
    return { ok: false, error: new ValidationError('Invalid config') };
  }
  return { ok: true, value: data as Config };
}
```

This makes error handling explicit and type-safe.

## Quick Reference

### File Locations by Task

| Task                 | Location                                         |
| -------------------- | ------------------------------------------------ |
| Add a new feature    | `packages/core/src/newfeature.ts`                |
| Write tests          | `packages/core/src/__tests__/newfeature.test.ts` |
| Update standard      | `docs/standard/`                                 |
| Create a guide       | `docs/guides/`                                   |
| API reference        | `docs/api/`                                      |
| Technical specs      | `docs/superpowers/specs/`                        |
| Implementation plans | `docs/superpowers/plans/`                        |

### Important Configuration Files

| File                  | Purpose                                               |
| --------------------- | ----------------------------------------------------- |
| `package.json`        | Root project metadata and scripts                     |
| `pnpm-workspace.yaml` | Monorepo workspace definition                         |
| `tsconfig.json`       | Root TypeScript configuration with project references |
| `turbo.json`          | Turborepo build orchestration                         |
| `eslint.config.js`    | ESLint configuration (flat config format)             |
| `.prettierrc.json`    | Code formatting rules                                 |

### Development Commands Cheat Sheet

```bash
# Setup
pnpm install

# Development
pnpm dev              # Watch mode
pnpm test:watch       # Tests in watch mode
pnpm format           # Auto-format code

# Validation
pnpm test             # Run tests
pnpm lint             # Check linting
pnpm typecheck        # Check types
pnpm format:check     # Check formatting

# Building
pnpm build            # Build all packages
pnpm docs:dev         # Dev docs server

# Cleanup
pnpm clean            # Remove all build artifacts
```

## Additional Resources

- **Project Repository**: https://github.com/harness-engineering/harness-engineering
- **Main Documentation**: See `/docs/` directory
- **Standard Specification**: `/docs/standard/`
- **Implementation Plans**: `/docs/superpowers/plans/`

## Updating This Document

AGENTS.md should be kept up-to-date as the project evolves. When making significant changes:

1. Update relevant sections in this file
2. Add new sections for new major features
3. Keep links current
4. Verify all paths are correct
5. Commit with `docs: update AGENTS.md` message

This is the living documentation of our project - keep it accurate and comprehensive.

---

**Last Updated**: 2026-03-11
**Version**: 1.0
**Maintained By**: AI Agents and Engineering Team
