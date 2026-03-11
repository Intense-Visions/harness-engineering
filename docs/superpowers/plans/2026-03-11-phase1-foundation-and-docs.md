# Phase 1 Foundation & Documentation Infrastructure - Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the harness-engineering monorepo with pnpm/Turborepo, create the three-tier documentation structure, and establish the AGENTS.md knowledge map.

**Architecture:** Unified monorepo using pnpm workspaces for package management and Turborepo for build orchestration. Documentation uses VitePress for the documentation site, organized into three tiers: Standard (manifesto), Guides (implementation), and Reference (technical). AGENTS.md serves as the top-level knowledge map.

**Tech Stack:**

- pnpm 8+, Turborepo, TypeScript 5+
- VitePress for documentation site
- Zod for validation, Vitest for testing
- ESLint, Prettier for code quality

---

## Chunk 1: Monorepo Setup

### Task 1: Initialize Git and Monorepo Structure

**Files:**

- Create: `package.json` (root)
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `.gitignore`
- Create: `.npmrc`

- [ ] **Step 1: Initialize git repository (already done)**

```bash
git status
```

Expected: Already initialized

- [ ] **Step 2: Create root package.json**

```json
{
  "name": "harness-engineering",
  "version": "0.0.0",
  "private": true,
  "description": "Comprehensive toolkit for agent-first development",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/harness-engineering/harness-engineering.git"
  },
  "license": "MIT",
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "format": "prettier --write \"**/*.{ts,tsx,md,json}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,md,json}\"",
    "typecheck": "turbo run typecheck",
    "clean": "turbo run clean && rm -rf node_modules",
    "docs:dev": "pnpm --filter docs dev",
    "docs:build": "pnpm --filter docs build",
    "docs:preview": "pnpm --filter docs preview"
  },
  "devDependencies": {
    "@changesets/cli": "^2.27.1",
    "prettier": "^3.2.5",
    "turbo": "^1.12.5",
    "typescript": "^5.3.3"
  },
  "packageManager": "pnpm@8.15.4",
  "engines": {
    "node": ">=18.0.0",
    "pnpm": ">=8.0.0"
  }
}
```

- [ ] **Step 3: Create pnpm-workspace.yaml**

```yaml
packages:
  - 'packages/*'
  - 'docs'
```

- [ ] **Step 4: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": ["coverage/**"]
    },
    "lint": {
      "outputs": []
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "clean": {
      "cache": false
    }
  }
}
```

- [ ] **Step 5: Create .gitignore**

```gitignore
# Dependencies
node_modules/
.pnp
.pnp.js

# Testing
coverage/
*.lcov

# Build outputs
dist/
build/
.turbo/
.next/
out/

# Misc
.DS_Store
*.pem
.env*.local

# Debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# Temporary
.tmp/
temp/
```

- [ ] **Step 6: Create .npmrc**

```
# Use pnpm
auto-install-peers=true
strict-peer-dependencies=false
```

- [ ] **Step 7: Install pnpm globally (if not installed)**

Run: `npm install -g pnpm@8.15.4`

Expected: pnpm installed globally

- [ ] **Step 8: Install root dependencies**

Run: `pnpm install`

Expected: Dependencies installed, `pnpm-lock.yaml` created

- [ ] **Step 9: Commit monorepo setup**

```bash
git add package.json pnpm-workspace.yaml turbo.json .gitignore .npmrc pnpm-lock.yaml
git commit -m "chore: initialize monorepo with pnpm and Turborepo"
```

---

### Task 2: TypeScript and Tooling Configuration

**Files:**

- Create: `tsconfig.json` (root)
- Create: `tsconfig.base.json`
- Create: `.eslintrc.js`
- Create: `.prettierrc.js`
- Create: `.prettierignore`

- [ ] **Step 1: Create root tsconfig.json**

```json
{
  "files": [],
  "references": [],
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "declarationMap": true
  }
}
```

- [ ] **Step 2: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowJs": false,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true,
    "incremental": true
  },
  "exclude": ["node_modules", "dist", "build", ".turbo"]
}
```

- [ ] **Step 3: Install linting dependencies**

Run: `pnpm add -Dw eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-config-prettier`

Expected: Dev dependencies added to root

- [ ] **Step 4: Create .eslintrc.js**

```javascript
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'prettier',
  ],
  plugins: ['@typescript-eslint'],
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-function-return-type': ['warn', { allowExpressions: true }],
  },
  ignorePatterns: ['dist', 'build', 'node_modules', '.turbo'],
};
```

- [ ] **Step 5: Create .prettierrc.js**

```javascript
module.exports = {
  semi: false,
  singleQuote: true,
  trailingComma: 'es5',
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
};
```

- [ ] **Step 6: Create .prettierignore**

```
# Build outputs
dist
build
.turbo
.next
out

# Dependencies
node_modules
pnpm-lock.yaml

# Generated files
coverage
*.min.js
```

- [ ] **Step 7: Commit tooling configuration**

```bash
git add tsconfig.json tsconfig.base.json .eslintrc.js .prettierrc.js .prettierignore
git commit -m "chore: configure TypeScript, ESLint, and Prettier"
```

---

### Task 3: Create Package Structure

**Files:**

- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`
- Create: `packages/types/package.json`
- Create: `packages/types/tsconfig.json`
- Create: `packages/types/src/index.ts`

- [ ] **Step 1: Create packages directory structure**

Run: `mkdir -p packages/core/src packages/types/src`

Expected: Directory structure created

- [ ] **Step 2: Create packages/types/package.json**

```json
{
  "name": "@harness-engineering/types",
  "version": "0.1.0",
  "description": "Shared TypeScript types for harness-engineering",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts",
    "dev": "tsup src/index.ts --format cjs,esm --dts --watch",
    "lint": "eslint src --ext .ts",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "devDependencies": {
    "tsup": "^8.0.2",
    "typescript": "^5.3.3"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

- [ ] **Step 3: Create packages/types/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "references": []
}
```

- [ ] **Step 4: Create packages/types/src/index.ts**

```typescript
/**
 * Core type definitions for harness-engineering
 */

/**
 * Result type for consistent error handling across all APIs
 */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

/**
 * Helper to create a successful Result
 */
export function Ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/**
 * Helper to create a failed Result
 */
export function Err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/**
 * Type guard to check if Result is Ok
 */
export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok === true;
}

/**
 * Type guard to check if Result is Err
 */
export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return result.ok === false;
}
```

- [ ] **Step 5: Install tsup in types package**

Run: `cd packages/types && pnpm add -D tsup && cd ../..`

Expected: tsup added to types package

- [ ] **Step 6: Create packages/core/package.json**

```json
{
  "name": "@harness-engineering/core",
  "version": "0.1.0",
  "description": "Core runtime library for harness engineering",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts",
    "dev": "tsup src/index.ts --format cjs,esm --dts --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src --ext .ts",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist coverage"
  },
  "dependencies": {
    "@harness-engineering/types": "workspace:*",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "tsup": "^8.0.2",
    "typescript": "^5.3.3",
    "vitest": "^1.3.1"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

- [ ] **Step 7: Create packages/core/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "references": [
    {
      "path": "../types"
    }
  ]
}
```

- [ ] **Step 8: Create packages/core/src/index.ts (placeholder)**

```typescript
/**
 * @harness-engineering/core
 *
 * Core runtime library implementing all 6 harness engineering principles
 */

export * from '@harness-engineering/types';

// Module exports will be added as we implement them
export const version = '0.1.0';
```

- [ ] **Step 9: Install dependencies for all packages**

Run: `pnpm install`

Expected: All dependencies installed, workspace links created

- [ ] **Step 10: Build packages to verify setup**

Run: `pnpm build`

Expected: types and core packages build successfully

- [ ] **Step 11: Commit package structure**

```bash
git add packages/
git commit -m "chore: create core package structure"
```

---

## Chunk 2: Documentation Infrastructure

### Task 4: VitePress Documentation Site Setup

**Files:**

- Create: `docs/package.json`
- Create: `docs/tsconfig.json`
- Create: `docs/.vitepress/config.ts`
- Create: `docs/index.md`
- Create: `docs/.gitignore`

- [ ] **Step 1: Create docs directory**

Run: `mkdir -p docs/.vitepress`

Expected: docs directory created

- [ ] **Step 2: Create docs/package.json**

```json
{
  "name": "docs",
  "version": "0.1.0",
  "private": true,
  "description": "Documentation site for harness-engineering",
  "scripts": {
    "dev": "vitepress dev",
    "build": "vitepress build",
    "preview": "vitepress preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "vitepress": "^1.0.0-rc.44",
    "vue": "^3.4.19"
  },
  "devDependencies": {
    "typescript": "^5.3.3"
  }
}
```

- [ ] **Step 3: Create docs/tsconfig.json**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "preserve"
  },
  "include": [".vitepress/**/*", "**/*.md"],
  "exclude": ["node_modules", ".vitepress/dist", ".vitepress/cache"]
}
```

- [ ] **Step 4: Create docs/.vitepress/config.ts**

```typescript
import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Harness Engineering',
  description: 'Comprehensive toolkit for agent-first development',
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Standard', link: '/standard/' },
      { text: 'Guides', link: '/guides/' },
      { text: 'Reference', link: '/reference/' },
    ],
    sidebar: {
      '/standard/': [
        {
          text: 'The Standard',
          items: [
            { text: 'Overview', link: '/standard/' },
            { text: 'Context Engineering', link: '/standard/context-engineering' },
            {
              text: 'Architectural Constraints',
              link: '/standard/architectural-constraints',
            },
            { text: 'Agent Feedback Loop', link: '/standard/agent-feedback-loop' },
            { text: 'Entropy Management', link: '/standard/entropy-management' },
            { text: 'Implementation Strategy', link: '/standard/implementation-strategy' },
            { text: 'KPIs', link: '/standard/kpis' },
          ],
        },
      ],
      '/guides/': [
        {
          text: 'Implementation Guides',
          items: [
            { text: 'Getting Started', link: '/guides/' },
            { text: 'Adoption Levels', link: '/guides/adoption-levels' },
          ],
        },
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'API Reference', link: '/reference/' },
            { text: 'Architecture', link: '/reference/architecture/' },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/harness-engineering/harness-engineering' },
    ],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026-present Harness Engineering',
    },
  },
  markdown: {
    theme: {
      light: 'github-light',
      dark: 'github-dark',
    },
  },
});
```

- [ ] **Step 5: Create docs/index.md**

```markdown
---
layout: home

hero:
  name: Harness Engineering
  text: Agent-First Development
  tagline: Comprehensive toolkit for teams transitioning from manual coding to agent-first development
  actions:
    - theme: brand
      text: Get Started
      link: /guides/
    - theme: alt
      text: The Standard
      link: /standard/

features:
  - icon: 📚
    title: Context Engineering
    details: Repository-as-documentation. All knowledge in git, accessible to AI agents.
  - icon: 🏗️
    title: Architectural Constraints
    details: Mechanical enforcement of dependencies, boundaries, and patterns.
  - icon: 🔄
    title: Agent Feedback Loop
    details: Self-correcting agents with peer review and observability.
  - icon: 🧹
    title: Entropy Management
    details: Automated cleanup, drift detection, and pattern enforcement.
  - icon: 📊
    title: Measurable Success
    details: Track agent autonomy, harness coverage, and context density.
  - icon: 🎯
    title: Depth-First Strategy
    details: One feature to 100% completion. Build abstractions from concrete work.
---
```

- [ ] **Step 6: Create docs/.gitignore**

```
.vitepress/dist
.vitepress/cache
node_modules
```

- [ ] **Step 7: Install docs dependencies**

Run: `pnpm install`

Expected: VitePress and dependencies installed

- [ ] **Step 8: Test docs dev server**

Run: `pnpm docs:dev`

Expected: VitePress dev server starts on http://localhost:5173

(Stop server with Ctrl+C after verification)

- [ ] **Step 9: Commit documentation site setup**

```bash
git add docs/
git commit -m "feat: set up VitePress documentation site"
```

---

### Task 5: Create Standard Documentation Structure

**Files:**

- Create: `docs/standard/index.md`
- Create: `docs/standard/context-engineering.md`
- Create: `docs/standard/architectural-constraints.md`
- Create: `docs/standard/agent-feedback-loop.md`
- Create: `docs/standard/entropy-management.md`
- Create: `docs/standard/implementation-strategy.md`
- Create: `docs/standard/kpis.md`

- [ ] **Step 1: Create docs/standard directory**

Run: `mkdir -p docs/standard`

Expected: Directory created

- [ ] **Step 2: Create docs/standard/index.md**

```markdown
# The Harness Engineering Standard

AI Harness Engineering represents a fundamental shift from manual implementation to systemic leverage.

## Vision

- **Human Role**: Architect, intent-specifier, and validator
- **AI Role**: Executor, implementer, and primary maintainer of the codebase

## The Six Principles

The standard is built on six core principles that work together to enable reliable, autonomous AI agents:

### [1. Context Engineering](/standard/context-engineering)

AI agents are only as effective as the context they can access. Everything must be in the repository.

**Key practices:**

- Repository-as-Documentation
- AGENTS.md knowledge map
- Version-controlled decisions and specs

### [2. Architectural Constraints](/standard/architectural-constraints)

Constraints are productivity multipliers that prevent agents from exploring dead ends.

**Key practices:**

- Layered dependency model
- Mechanical enforcement
- Boundary parsing

### [3. Agent Feedback Loop](/standard/agent-feedback-loop)

Agents operate in a self-correcting cycle of execution and review.

**Key practices:**

- Agent-led PRs
- Self-correction before human review
- Observability integration

### [4. Entropy Management](/standard/entropy-management)

AI-generated codebases can accumulate technical debt rapidly.

**Key practices:**

- Periodic cleanup agents
- Documentation alignment
- Pattern enforcement

### [5. Implementation Strategy](/standard/implementation-strategy)

Avoid breadth-first scaling. Build depth-first.

**Key practices:**

- One story to 100% completion
- Build abstractions from concrete work
- Validate before scaling

### [6. Key Performance Indicators](/standard/kpis)

Measure what matters.

**Metrics:**

- Agent Autonomy
- Harness Coverage
- Context Density

---

## Quick Start

New to harness engineering? Start with our [Getting Started Guide](/guides/).

Ready to adopt? See [Adoption Levels](/guides/adoption-levels) for a phased approach.
```

- [ ] **Step 3: Create docs/standard/context-engineering.md**

```markdown
# Context Engineering (Single Source of Truth)

AI agents are only as effective as the context they can access. Information stored in Slack, Jira, or human heads is invisible to the system.

## Principle

**Everything that matters must be in the repository as version-controlled documentation.**

## The Problem

Traditional software development scatters critical information:

- Architectural decisions in Slack threads
- Product specs in Confluence or Jira
- Execution plans in human heads
- Context in email chains

AI agents can't access this information, leading to:

- Repeated questions
- Wrong assumptions
- Inconsistent implementations
- Lost context between sessions

## The Solution

### Repository-as-Documentation

All architectural decisions, product specs, and execution plans must be checked into the repository as version-controlled Markdown files.

**What goes in the repository:**

- Core beliefs and principles (`docs/core-beliefs.md`)
- Design documents (`docs/design-docs/`)
- Architecture decision records (`docs/architecture/decisions/`)
- Execution plans (`docs/exec-plans/`)
- API documentation (`docs/reference/`)

### Knowledge Map Structure

The `AGENTS.md` file provides a top-level map (~100 lines) that tells agents where to find domain knowledge.

**Example AGENTS.md:**

\`\`\`markdown

# Project Knowledge Map

## About This Project

[Brief description]

## Core Principles

- Standard definition: `docs/standard/index.md`
- Architecture: `docs/architecture/overview.md`

## Implementation

- Core library: `packages/core/README.md`
- CLI tool: `packages/cli/README.md`

## Active Work

- Current sprint: `docs/exec-plans/2026-03-sprint.md`

## Getting Started

- Setup: `docs/guides/setup.md`
- Contributing: `CONTRIBUTING.md`
  \`\`\`

## Benefits

**For Agents:**

- Self-service context access
- Consistent information across sessions
- Clear navigation to relevant knowledge

**For Teams:**

- Onboarding new developers is faster
- Knowledge doesn't disappear when people leave
- Decisions are documented and searchable

## Implementation Checklist

- [ ] Create `AGENTS.md` at repository root
- [ ] Move architectural decisions to `docs/architecture/decisions/`
- [ ] Document active work in `docs/exec-plans/`
- [ ] Set up automatic link checking in CI
- [ ] Validate that all critical paths are documented

## Success Metrics

- **Context Density**: Ratio of docs to code (target: >0.3)
- **Coverage**: % of code with corresponding documentation
- **Link Integrity**: 100% of internal links resolve correctly

---

**Next:** [Architectural Constraints →](/standard/architectural-constraints)
```

- [ ] **Step 4: Create docs/standard/architectural-constraints.md**

```markdown
# Architectural Constraints & Mechanical Enforcement

Constraints are not blockers—they are productivity multipliers that prevent agents from exploring dead ends.

## Principle

**Enforce architectural rules mechanically, not through manual code review.**

## The Problem

Manual code review for architectural compliance:

- Is inconsistent
- Catches violations too late
- Depends on reviewer availability and expertise
- Doesn't scale with codebase size

AI agents exploring the solution space:

- Can violate constraints unknowingly
- Waste time on architecturally invalid approaches
- Introduce technical debt

## The Solution

### Layered Dependency Model

Define a strict one-way flow of dependencies:
```

Types → Config → Repository → Service → UI

```

**Rules:**
- UI can depend on Service, Repository, Config, Types
- Service can depend on Repository, Config, Types
- Repository can depend on Config, Types
- Config can depend on Types
- Types depend on nothing

### Mechanical Enforcement

**Custom Linters:**
- Generate linters from config files
- Fail CI on violations
- Provide actionable error messages

**Structural Tests:**
- Validate dependency graph
- Detect circular dependencies
- Check boundary compliance

**Boundary Parsing:**
- Use Zod (TypeScript) or Pydantic (Python) at module boundaries
- Validate data shapes at runtime
- Fail fast on type mismatches

## Example: Layered Dependencies

**Configuration (`harness.config.yml`):**

\`\`\`yaml
layers:
  - name: types
    pattern: "src/types/**"
    dependencies: []

  - name: config
    pattern: "src/config/**"
    dependencies: [types]

  - name: repository
    pattern: "src/repository/**"
    dependencies: [types, config]

  - name: service
    pattern: "src/services/**"
    dependencies: [types, config, repository]

  - name: ui
    pattern: "src/ui/**"
    dependencies: [types, config, service]
```

**Linter Rule:**

\`\`\`typescript
// Generated from config
rule: {
name: 'no-ui-imports-in-service',
check: (file, imports) => {
if (file.matches('src/services/**')) {
const uiImports = imports.filter(i => i.matches('src/ui/**'))
if (uiImports.length > 0) {
return error(`Service layer cannot import from UI layer`)
}
}
}
}
\`\`\`

## Benefits

**For Agents:**

- Clear constraints guide exploration
- Fast feedback on violations
- No waiting for human review

**For Teams:**

- Architectural rules are documented
- Violations caught in CI
- Consistent enforcement across all code

## Implementation Checklist

- [ ] Define architectural layers in config
- [ ] Set up linter generation
- [ ] Add boundary validation at module edges
- [ ] Configure CI to fail on violations
- [ ] Document architectural patterns

## Success Metrics

- **Harness Coverage**: % of rules enforced mechanically (target: >90%)
- **Violation Rate**: Architectural violations in merged code (target: <5%)
- **Feedback Time**: Time from violation to detection (target: <5 minutes)

---

**Next:** [Agent Feedback Loop →](/standard/agent-feedback-loop)

````

- [ ] **Step 5: Commit standard documentation (part 1)**

```bash
git add docs/standard/index.md docs/standard/context-engineering.md docs/standard/architectural-constraints.md
git commit -m "docs: add standard documentation (context, constraints)"
````

- [ ] **Step 6: Create docs/standard/agent-feedback-loop.md**

```markdown
# The Agent Feedback Loop

Agents must operate in a self-correcting cycle of execution and review.

## Principle

**Before human review, agents review their own changes and request peer reviews from specialized agents.**

## The Problem

Without structured feedback:

- Agents make mistakes that could be caught early
- Humans spend time on issues agents could fix themselves
- No systematic improvement in agent behavior
- Quality depends entirely on human review capacity

## The Solution

### Agent-Led Pull Requests

1. **Agent describes task** and plans approach
2. **Agent implements** changes
3. **Agent runs tests** locally
4. **Agent self-reviews** against checklist
5. **Agent requests peer review** from specialized agents
6. **Agent iterates** until automated reviewers pass
7. **Human reviews** final result (or auto-merges if thresholds met)

### Self-Correction

Before requesting human review, agents run a self-review checklist:

\`\`\`typescript
const checklist = createSelfReview(changes)

// Example checks:
// - All tests passing?
// - Code coverage maintained?
// - Documentation updated?
// - No linting violations?
// - Architectural constraints satisfied?
// - Performance within bounds?
\`\`\`

### Peer Review Agents

Specialized agents review specific aspects:

**Architecture Enforcer:**

- Validates dependencies
- Checks layering violations
- Ensures boundary parsing

**Documentation Maintainer:**

- Checks docs match code
- Validates examples work
- Ensures AGENTS.md is current

**Test Reviewer:**

- Evaluates test quality
- Checks edge cases
- Validates coverage

### Observability Integration

Agents have direct access to telemetry:

\`\`\`typescript
// Agent can query metrics, traces, logs
const telemetry = await getTelemetry('my-service', lastHour)

// Diagnose failures
if (telemetry.errors.length > 0) {
// Agent analyzes errors and proposes fixes
}
\`\`\`

## Example: The Review Cycle

\`\`\`
┌─────────────┐
│ Agent │
│ implements │
└──────┬──────┘
│
▼
┌─────────────┐
│ Self-review │ ◄── Checklist validation
└──────┬──────┘
│
▼
┌─────────────┐
│ Peer review │ ◄── Architecture Enforcer
│ │ ◄── Documentation Maintainer
│ │ ◄── Test Reviewer
└──────┬──────┘
│
├─── Issues? ──► Agent fixes ──┐
│ │
│ │
▼ │
┌─────────────┐ │
│ Human │ │
│ review │ │
└─────────────┘ │
│ │
▼ │
✅ Merge │
│ │
└───────────────────────────────┘
\`\`\`

## Benefits

**For Agents:**

- Faster feedback
- Learn from specialized reviewers
- Build institutional knowledge

**For Humans:**

- Review higher-quality work
- Focus on design, not mechanics
- Trust in systematic quality

## Implementation Checklist

- [ ] Define self-review checklist
- [ ] Create specialized reviewer agents
- [ ] Integrate telemetry access
- [ ] Set up automated PR workflow
- [ ] Configure auto-merge thresholds

## Success Metrics

- **Agent Autonomy**: % of PRs merged without human code changes (target: >70%)
- **Iteration Count**: Average revisions before human review (lower is better)
- **Pass Rate**: % of PRs that pass all automated checks (target: >80%)

---

**Next:** [Entropy Management →](/standard/entropy-management)
```

- [ ] **Step 7: Create docs/standard/entropy-management.md**

```markdown
# Entropy Management (Garbage Collection)

AI-generated codebases can accumulate technical debt rapidly. Continuous cleanup is essential.

## Principle

**Periodic cleanup agents detect and fix drift, dead code, and pattern violations.**

## The Problem

Over time, codebases accumulate entropy:

- **Documentation drift**: Docs no longer match implementation
- **Dead code**: Unused functions, exports, imports
- **Pattern violations**: One-off solutions that deviate from standards
- **Bit rot**: Dependencies become outdated

AI agents accelerate this:

- Generate more code faster
- May not notice existing patterns
- Can create inconsistencies across the codebase

## The Solution

### Periodic Cleanup Agents

Schedule agents to run regularly (weekly/monthly):

**Documentation Alignment Agent:**

- Compares docs to implementation
- Detects outdated examples
- Flags missing documentation

**Pattern Enforcement Agent:**

- Identifies deviations from established patterns
- Suggests refactoring to align with standards
- Creates issues for manual review

**Dead Code Removal Agent:**

- Analyzes usage from entry points
- Identifies unused exports, imports, files
- Creates PRs to remove dead code

### Continuous Validation

Run validation checks in CI:

\`\`\`yaml

# CI workflow

- check-doc-drift
- detect-dead-code
- validate-patterns
  \`\`\`

Fail CI if entropy exceeds thresholds.

### Auto-Fix Where Safe

Some entropy can be fixed automatically:

**Safe auto-fixes:**

- Remove unused imports
- Format code consistently
- Update generated API docs
- Sync package versions

**Require review:**

- Remove unused functions (might be called externally)
- Refactor pattern violations (might have valid reasons)
- Update documentation (might be intentionally different)

## Example: Documentation Drift Detection

\`\`\`typescript
const driftReport = detectDocDrift({
docsDir: 'docs/',
codeDir: 'packages/',
})

if (!driftReport.ok) {
console.error('Documentation drift detected:')
driftReport.error.drifts.forEach(drift => {
console.log(`${drift.file}: ${drift.issue}`)
console.log(`Suggestion: ${drift.details}`)
})
}

// Example output:
// docs/guides/api-usage.md: OUTDATED
// Suggestion: API signature changed from (a: string) to (a: string, b?: number)
\`\`\`

## Benefits

**For Agents:**

- Clean codebase easier to reason about
- Consistent patterns reduce confusion
- Up-to-date docs improve context

**For Teams:**

- Automated maintenance
- Prevents accumulation of tech debt
- Codebase stays healthy

## Implementation Checklist

- [ ] Set up scheduled cleanup jobs
- [ ] Configure drift detection in CI
- [ ] Define auto-fix policies
- [ ] Create cleanup agent workflows
- [ ] Track entropy metrics over time

## Success Metrics

- **Documentation Drift**: Failed validation checks (target: 0)
- **Dead Code**: Lines of unused code (target: <1%)
- **Pattern Compliance**: % of code following standards (target: >95%)

---

**Next:** [Implementation Strategy →](/standard/implementation-strategy)
```

- [ ] **Step 8: Create docs/standard/implementation-strategy.md**

```markdown
# Implementation Strategy (Depth-First)

Avoid breadth-first scaling where many features are built shallowly.

## Principle

**Build one feature to 100% completion before starting the next.**

## The Problem

**Breadth-first development:**

- Many features at 50% completion
- Nothing is production-ready
- Hard to validate assumptions
- Accumulates incomplete work

**Result:**

- Can't ship anything
- Unclear what "done" means
- Technical debt accumulates
- Hard to course-correct

## The Solution

### Depth-First Approach

**One story to 100% completion:**

1. **Design** - Spec the feature completely
2. **Implementation** - Write code with tests
3. **Testing** - Manual and automated validation
4. **Documentation** - Update guides and API docs
5. **Deployment** - Ship to production (or staging)

**Only then** move to the next feature.

### Build Abstractions from Concrete

Don't design abstractions upfront. Build them from concrete work:

1. **First implementation**: Solve the specific problem
2. **Second implementation**: Notice patterns
3. **Third implementation**: Extract abstraction

**Three strikes and refactor.**

### Validate Before Scaling

After completing a vertical slice:

- Get user feedback
- Measure success metrics
- Validate assumptions
- Course-correct if needed

**Then** apply learnings to the next feature.

## Example: Building a New Module

**❌ Breadth-First (Wrong):**

Week 1: Start all 5 modules (context, constraints, feedback, entropy, validation)
Week 2: Get each to 30% complete
Week 3: Get each to 60% complete
Week 4: Nothing is production-ready

**✅ Depth-First (Right):**

Week 1: Complete `context` module (design, implement, test, document)
Week 2: Complete `constraints` module (apply learnings from `context`)
Week 3: Complete `feedback` module (reuse patterns from previous modules)
Week 4: Three production-ready modules

## Benefits

**For Agents:**

- Clear "done" criteria
- Immediate validation
- Learn from completed work

**For Teams:**

- Ship value continuously
- Validate assumptions early
- Reduce work in progress

## Implementation Checklist

- [ ] Break work into complete vertical slices
- [ ] Define "done" criteria for each slice
- [ ] Ship each slice before starting the next
- [ ] Extract abstractions after 2-3 implementations
- [ ] Measure success after each completion

## Success Metrics

- **Work in Progress**: Number of incomplete features (target: <3)
- **Completion Rate**: % of started features that reach production (target: >80%)
- **Cycle Time**: Days from start to production (lower is better)

---

**Next:** [KPIs →](/standard/kpis)
```

- [ ] **Step 9: Create docs/standard/kpis.md**

````markdown
# Key Performance Indicators

Measure success through quantifiable metrics that reflect the effectiveness of harness engineering.

## The Three Core KPIs

### 1. Agent Autonomy

**Definition:** Percentage of PRs merged without human code intervention.

**Why it matters:**

- Core measure of agent effectiveness
- Indicates trust in automated processes
- Shows progress toward agent-first development

**How to measure:**

```typescript
// Track PRs where commits are ONLY from:
// - Agent automation (GitHub Actions, agent-reviewer)
// - Automated code generation (linter fixes, doc generation)
//
// Exclude PRs where humans add commits after PR creation

const autonomy = (agentOnlyPRs / totalPRs) * 100;
```
````

**Targets:**

- Month 1-3: 30-40% (baseline)
- Month 4-6: 60%
- Month 7-12: 80%

**Collection:**

- GitHub API webhook → `docs/metrics/agent-autonomy.json`
- Weekly automated reports
- Dashboard in docs site

---

### 2. Harness Coverage

**Definition:** Percentage of architectural rules enforced mechanically vs. manual code review.

**Why it matters:**

- Shows adoption of mechanical constraints
- Reduces manual review burden
- Enables scaling

**How to measure:**

```typescript
// Count rules from:
// - harness-linter.yml
// - ESLint plugin rules
// - Structural tests
//
// Categorize as:
// - Mechanical: Fails CI automatically
// - Manual: Checked by humans in reviews

const coverage = (mechanicalRules / totalRules) * 100;
```

**Targets:**

- Month 1-3: 60-70% (foundation)
- Month 4-6: 90%
- Month 7-12: 95%

**Collection:**

- Automated script scans configs
- CI workflow analysis
- Monthly reports

---

### 3. Context Density

**Definition:** Ratio of documentation (lines in `/docs`) to code (lines in `/packages`).

**Why it matters:**

- Measures knowledge accessibility
- Indicates agent context quality
- Shows commitment to documentation

**How to measure:**

```typescript
// Count lines:
// - Docs: /docs/**/*.md (exclude generated API docs)
// - Code: /packages/**/*.{ts,rs,py} (exclude tests, node_modules)

const density = docsLines / codeLines;
```

**Targets:**

- Month 1-3: >0.2
- Month 4-6: >0.3
- Month 7-12: >0.3 (maintain)

**Example:** 3,000 lines of docs for 10,000 lines of code = 0.30

**Collection:**

- Weekly automated script via GitHub Action
- Results in `docs/metrics/context-density.json`

---

## Supporting Metrics

### Effectiveness Metrics (for teams using the library)

**Time to Onboard:**

- Measure: Survey or time-to-first-PR
- Target: Decrease over time

**Bug Density:**

- Measure: Bugs per 1,000 lines of code
- Target: Decrease as constraints catch issues early

**Documentation Drift:**

- Measure: Failed `harness validate` checks
- Target: Trend toward zero

### Project Health Metrics

**Test Coverage:**

- Target: >80% for all packages

**Build Time:**

- Target: <5 minutes for full build

**CI Pipeline:**

- Target: <10 minutes for full pipeline

**Dependency Freshness:**

- Target: <30 days behind latest versions

---

## Measurement & Reporting

### Monthly KPI Dashboard

Automated metrics collection creates dashboard:

\`\`\`
docs/metrics/
├── agent-autonomy.json # Weekly updates
├── harness-coverage.json # Monthly updates
├── context-density.json # Weekly updates
└── dashboard.md # Generated report
\`\`\`

### Visualization

Dashboard includes:

- Trend charts (last 12 months)
- Current vs. target comparison
- Breakdown by component/package
- Recommendations for improvement

### Reviews

**Weekly:** Quick check of automated metrics
**Monthly:** Maintainer sync to review trends
**Quarterly:** OKR setting and retrospective

---

## Success Definition

**Minimum Viable Success (Month 12):**

- Agent Autonomy: >70%
- Harness Coverage: >90%
- Context Density: >0.3

**Aspirational Success (Month 18):**

- Agent Autonomy: >85%
- Harness Coverage: >95%
- Context Density: >0.4

````

- [ ] **Step 10: Commit standard documentation (part 2)**

```bash
git add docs/standard/
git commit -m "docs: complete standard documentation (feedback loop, entropy, strategy, KPIs)"
````

---

### Task 6: Create Guides and Reference Structure

**Files:**

- Create: `docs/guides/index.md`
- Create: `docs/guides/adoption-levels.md`
- Create: `docs/reference/index.md`
- Create: `docs/reference/architecture/index.md`

- [ ] **Step 1: Create directories**

Run: `mkdir -p docs/guides docs/reference/architecture`

Expected: Directories created

- [ ] **Step 2: Create docs/guides/index.md**

````markdown
# Getting Started with Harness Engineering

Welcome! This guide will help you start adopting harness engineering practices in your projects.

## Quick Start

### 1. Understand the Principles

Read [The Standard](/standard/) to understand the six core principles of harness engineering.

**Start here:**

- [Context Engineering](/standard/context-engineering) - Everything in the repository
- [Architectural Constraints](/standard/architectural-constraints) - Mechanical enforcement
- [Agent Feedback Loop](/standard/agent-feedback-loop) - Self-correcting agents

### 2. Choose Your Adoption Level

Harness engineering can be adopted incrementally. See [Adoption Levels](/guides/adoption-levels) for a phased approach.

**Three levels:**

- **Level 1 (Basic)**: AGENTS.md + documentation structure
- **Level 2 (Intermediate)**: Add linters + constraints
- **Level 3 (Advanced)**: Full agent loop + entropy management

### 3. Install the Library

```bash
npm install @harness-engineering/core
# or
pnpm add @harness-engineering/core
```
````

### 4. Set Up Context Engineering

Create your AGENTS.md:

\`\`\`markdown

# [Your Project] Knowledge Map

## About This Project

[Brief description]

## Core Architecture

- Overview: `docs/architecture/overview.md`
- Decisions: `docs/architecture/decisions/`

## Implementation

- Getting started: `docs/guides/setup.md`
- API documentation: `docs/api/`

## Active Work

- Current sprint: `docs/exec-plans/current.md`
  \`\`\`

### 5. Add Validation

```typescript
import { validateAgentsMap } from '@harness-engineering/core';

const result = validateAgentsMap('./AGENTS.md');

if (!result.ok) {
  console.error('AGENTS.md validation failed:', result.error.message);
  process.exit(1);
}

console.log('✓ AGENTS.md is valid');
```

### 6. Run Validation in CI

```yaml
# .github/workflows/validate.yml
name: Validate Harness

on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 18
      - run: pnpm install
      - run: pnpm validate
```

---

## Next Steps

- **Explore [Adoption Levels](/guides/adoption-levels)** to plan your phased rollout
- **Check [API Reference](/reference/)** for detailed library documentation
- **See [Architecture](/reference/architecture/)** for design decisions

---

## Need Help?

- **GitHub Discussions**: Ask questions, share experiences
- **GitHub Issues**: Report bugs, request features
- **Examples**: See `examples/` directory for reference implementations

````

- [ ] **Step 3: Create docs/guides/adoption-levels.md**

```markdown
# Adoption Levels

Harness engineering can be adopted incrementally. Start simple, add capabilities as you go.

## Overview

| Level | Focus | Time Investment | Benefits |
|-------|-------|-----------------|----------|
| **Level 1** | Documentation | 1-2 days | Context for agents |
| **Level 2** | Constraints | 1-2 weeks | Mechanical enforcement |
| **Level 3** | Full Harness | 1-2 months | Autonomous agents |

---

## Level 1: Basic (Start Here)

**Goal:** Establish repository-as-documentation and knowledge map.

### Checklist

- [ ] Create `AGENTS.md` at repository root
- [ ] Set up `docs/` directory structure:
  - `docs/architecture/` - Architectural decisions
  - `docs/guides/` - Implementation guides
  - `docs/exec-plans/` - Active work tracking
- [ ] Document core architecture
- [ ] Add link validation to CI
- [ ] Install `@harness-engineering/core`
- [ ] Add AGENTS.md validation

### Example AGENTS.md

\`\`\`markdown
# MyProject Knowledge Map

## About This Project
E-commerce platform built with Next.js and PostgreSQL

## Core Architecture
- System overview: `docs/architecture/overview.md`
- Data model: `docs/architecture/data-model.md`
- API design: `docs/architecture/api-design.md`

## Implementation
- Setup: `docs/guides/setup.md`
- API docs: `docs/api/`
- Testing: `docs/guides/testing.md`

## Active Work
- Current sprint: `docs/exec-plans/2026-03-sprint.md`
- Roadmap: `ROADMAP.md`
\`\`\`

### Validation

```typescript
import { validateAgentsMap, validateKnowledgeMap } from '@harness-engineering/core'

// Validate AGENTS.md structure
const agentsResult = validateAgentsMap('./AGENTS.md')
if (!agentsResult.ok) {
  console.error(agentsResult.error.message)
}

// Validate all links resolve
const linksResult = await validateKnowledgeMap()
if (!linksResult.ok) {
  console.error(`${linksResult.error.brokenLinks.length} broken links found`)
}
````

### Success Metrics

- **Context Density**: >0.2 (docs/code ratio)
- **Link Integrity**: 100% of links resolve
- **Agent Feedback**: Agents can navigate the codebase

---

## Level 2: Intermediate (Add Constraints)

**Goal:** Enforce architectural rules mechanically.

### Checklist

- [ ] Define architectural layers in `harness.config.yml`
- [ ] Set up linter generator
- [ ] Add boundary validation (Zod schemas)
- [ ] Configure CI to fail on violations
- [ ] Document architectural patterns

### Example harness.config.yml

\`\`\`yaml
version: 1

layers:

- name: types
  pattern: "src/types/\*\*"
  dependencies: []

- name: repository
  pattern: "src/repository/\*\*"
  dependencies: [types]

- name: service
  pattern: "src/services/\*\*"
  dependencies: [types, repository]

- name: ui
  pattern: "src/ui/\*\*"
  dependencies: [types, service]

constraints:

- no-circular-dependencies
- enforce-boundary-parsing
- validate-layered-architecture
  \`\`\`

### Validation

```typescript
import { validateDependencies, createBoundarySchema } from '@harness-engineering/core';
import { z } from 'zod';

// Validate dependency graph
const config = loadConfig('./harness.config.yml');
const depsResult = await validateDependencies(config);

if (!depsResult.ok) {
  depsResult.error.violations.forEach((v) => {
    console.error(`${v.file}: ${v.reason}`);
  });
}

// Boundary validation example
const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
});

const parser = createBoundarySchema(UserSchema);

// At module boundary
function processUser(data: unknown) {
  const result = parser.parse(data);
  if (!result.ok) {
    throw new Error(`Invalid user data: ${result.error.message}`);
  }
  // result.value is typed as User
  return result.value;
}
```

### Success Metrics

- **Harness Coverage**: >70% of rules enforced mechanically
- **Violation Rate**: <10% of PRs have architectural violations
- **Feedback Time**: Violations caught in <5 minutes

---

## Level 3: Advanced (Full Harness)

**Goal:** Enable autonomous agent workflows with feedback loops.

### Checklist

- [ ] Set up specialized reviewer agents
- [ ] Configure agent feedback loop
- [ ] Add observability integration (OpenTelemetry)
- [ ] Schedule periodic cleanup agents
- [ ] Set up entropy detection
- [ ] Configure auto-merge thresholds

### Agent Configuration

\`\`\`typescript
import {
configureAgentFeedback,
SubprocessExecutor,
OpenTelemetryAdapter
} from '@harness-engineering/core'

configureAgentFeedback({
executor: new SubprocessExecutor({
agentsDir: './agents',
timeout: 300000, // 5 minutes
}),
telemetry: new OpenTelemetryAdapter({
endpoint: process.env.OTEL_ENDPOINT,
}),
logger: console,
})

```

### CI/CD Integration

\`\`\`yaml
# .github/workflows/agent-review.yml
name: Agent Review

on: pull_request

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: harness-engineering/agent-reviewer-action@v1
        with:
          agent_type: 'architecture-enforcer'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
\`\`\`

### Entropy Management

\`\`\`typescript
import { detectDocDrift, detectDeadCode, findPatternViolations } from '@harness-engineering/core'

// Weekly cleanup job
async function runCleanup() {
  // Detect documentation drift
  const driftResult = await detectDocDrift({
    docsDir: 'docs/',
    codeDir: 'src/',
  })

  // Detect dead code
  const deadCodeResult = await detectDeadCode({
    entryPoints: ['src/index.ts'],
    rootDir: 'src/',
  })

  // Check pattern violations
  const patterns = loadPatterns('./harness-patterns.yml')
  const violationsResult = await findPatternViolations(patterns, {
    rootDir: 'src/',
  })

  // Create cleanup PR if issues found
  if (!driftResult.ok || !deadCodeResult.ok || !violationsResult.ok) {
    await createCleanupPR({ drift, deadCode, violations })
  }
}
\`\`\`

### Success Metrics

- **Agent Autonomy**: >70% of PRs merged without human code changes
- **Harness Coverage**: >90% of rules enforced mechanically
- **Documentation Drift**: 0 failed validation checks
- **Context Density**: >0.3

---

## Migration Path

### From Level 1 → Level 2

1. Audit existing architecture
2. Define layers in config
3. Generate initial linter rules
4. Fix existing violations (create issues)
5. Enable linter in CI (warning mode first)
6. Increase to error mode

**Time:** 1-2 weeks

### From Level 2 → Level 3

1. Create reviewer agent configurations
2. Set up observability (if not already)
3. Configure agent feedback loop
4. Run agents in advisory mode
5. Gradually increase autonomy thresholds
6. Enable auto-merge for trusted agents

**Time:** 3-4 weeks

---

## Choosing Your Level

**Start with Level 1 if:**
- New to harness engineering
- Small team (<5 developers)
- Want quick wins

**Move to Level 2 when:**
- Agents struggle with architectural violations
- Manual code review is a bottleneck
- Codebase is growing rapidly

**Adopt Level 3 when:**
- Level 2 is working well
- Team is comfortable with agents
- Agent autonomy >50%
- Ready to scale further
```

- [ ] **Step 4: Create docs/reference/index.md**

```markdown
# API Reference

Complete reference documentation for `@harness-engineering/core` and related packages.

## Packages

### [@harness-engineering/core](https://www.npmjs.com/package/@harness-engineering/core)

Core runtime library implementing all 6 harness engineering principles.

**Modules:**

- [Context Engineering](#context-engineering) - Validation, knowledge maps
- [Architectural Constraints](#architectural-constraints) - Dependencies, boundaries
- [Agent Feedback](#agent-feedback) - Reviews, telemetry
- [Entropy Management](#entropy-management) - Drift, dead code
- [Validation](#validation) - File structure, configs

### [@harness-engineering/types](https://www.npmjs.com/package/@harness-engineering/types)

Shared TypeScript types used across all packages.

---

## Context Engineering

APIs for validating and enforcing repository-as-documentation patterns.

### `validateAgentsMap()`

Validates the structure and content of AGENTS.md.

**Signature:**
\`\`\`typescript
function validateAgentsMap(
path: string
): Result<ValidationSuccess, ValidationError>
\`\`\`

**Parameters:**

- `path` - Path to AGENTS.md file

**Returns:**

- `Result<ValidationSuccess, ValidationError>`

**Example:**
\`\`\`typescript
import { validateAgentsMap } from '@harness-engineering/core'

const result = validateAgentsMap('./AGENTS.md')

if (result.ok) {
console.log(`Valid! Found ${result.value.sections.length} sections`)
} else {
console.error(`Error: ${result.error.message}`)
console.error(`Suggestions: ${result.error.suggestions.join(', ')}`)
}
\`\`\`

---

### `validateKnowledgeMap()`

Validates that all links in AGENTS.md resolve to actual files.

**Signature:**
\`\`\`typescript
function validateKnowledgeMap(): Result<IntegrityReport, IntegrityError>
\`\`\`

**Returns:**

- `Result<IntegrityReport, IntegrityError>`

**Example:**
\`\`\`typescript
import { validateKnowledgeMap } from '@harness-engineering/core'

const result = await validateKnowledgeMap()

if (result.ok) {
console.log(`Integrity: ${result.value.integrity}%`)
if (result.value.brokenLinks.length > 0) {
console.warn('Broken links:', result.value.brokenLinks)
}
}
\`\`\`

---

## Architectural Constraints

APIs for runtime enforcement of layered dependencies and boundary parsing.

### `validateDependencies()`

Validates dependency graph against defined architectural layers.

**Signature:**
\`\`\`typescript
function validateDependencies(
config: LayerConfig
): Promise<Result<DependencyValidation, DependencyError>>
\`\`\`

**Parameters:**

- `config` - Layer configuration with dependency rules

**Returns:**

- `Promise<Result<DependencyValidation, DependencyError>>`

**Example:**
\`\`\`typescript
import { validateDependencies } from '@harness-engineering/core'

const config = {
layers: [
{ name: 'types', allowedDependencies: [], modules: ['src/types/**'] },
{ name: 'service', allowedDependencies: ['types'], modules: ['src/services/**'] },
],
rootDir: process.cwd(),
parser: new TypeScriptParser(),
}

const result = await validateDependencies(config)

if (!result.ok) {
result.error.violations.forEach(v => {
console.error(`${v.file} → ${v.imports}: ${v.reason}`)
})
}
\`\`\`

---

## Types

### `Result<T, E>`

Type-safe error handling used across all APIs.

**Definition:**
\`\`\`typescript
type Result<T, E = Error> =
| { ok: true; value: T }
| { ok: false; error: E }
\`\`\`

**Helpers:**
\`\`\`typescript
function Ok<T>(value: T): Result<T, never>
function Err<E>(error: E): Result<never, E>
function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T }
function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E }
\`\`\`

**Example:**
\`\`\`typescript
import { Result, Ok, Err, isOk } from '@harness-engineering/types'

function divide(a: number, b: number): Result<number, string> {
if (b === 0) {
return Err('Division by zero')
}
return Ok(a / b)
}

const result = divide(10, 2)
if (isOk(result)) {
console.log(result.value) // 5
}
\`\`\`

---

## More Documentation

- [Architecture Decisions](/reference/architecture/) - ADRs and design choices
- [Examples](https://github.com/harness-engineering/harness-engineering/tree/main/examples) - Reference implementations
- [GitHub](https://github.com/harness-engineering/harness-engineering) - Source code and issues
```

- [ ] **Step 5: Create docs/reference/architecture/index.md**

```markdown
# Architecture

Architecture decisions and design choices for the harness-engineering library.

## Architecture Decision Records (ADRs)

ADRs document important architectural decisions made during development.

**Coming soon:**

- ADR-001: Why pnpm + Turborepo for monorepo
- ADR-002: Result type for error handling
- ADR-003: VitePress for documentation
- ADR-004: Rust for CLI tool

---

## Design Principles

### 1. Depth-First Implementation

Build one component to 100% completion before starting the next. Extract abstractions after 2-3 implementations.

**Rationale:** Prevents premature abstraction and ensures each component is production-ready.

### 2. Type Safety by Default

Use TypeScript strict mode and runtime validation (Zod) at all boundaries.

**Rationale:** Catch errors early, provide better DX for consumers.

### 3. Progressive Adoption

Library designed for incremental adoption. Each module works standalone.

**Rationale:** Lower barrier to entry, teams can adopt at their own pace.

### 4. Agent-First APIs

All APIs return structured, JSON-serializable data that agents can parse.

**Rationale:** AI agents are the primary consumers of this library.

---

## System Architecture

### Package Dependencies

\`\`\`
@harness-engineering/types (foundation)
↓
@harness-engineering/core (runtime library)
↓
harness-cli (Rust CLI tool)
\`\`\`

**Dependency rules:**

- Types package has zero dependencies
- Core depends only on types + external libraries (Zod)
- CLI depends on core (calls via Node.js subprocess)

### Module Boundaries

Each module in core has clear boundaries:

\`\`\`
context/ → Validates documentation
constraints/ → Enforces architecture
feedback/ → Agent review loops
entropy/ → Detects drift
validation/ → Cross-cutting utilities
\`\`\`

**Rules:**

- Modules communicate via well-defined types
- No circular dependencies between modules
- Each module independently testable

---

## Technology Choices

### Monorepo: pnpm + Turborepo

**Why pnpm:**

- Fast, efficient package management
- Strict mode prevents phantom dependencies
- Great monorepo support

**Why Turborepo:**

- Incremental build caching
- Parallel task execution
- Simple configuration

### TypeScript

**Why TypeScript:**

- Static typing catches errors early
- Better IDE support
- Standard for modern JS libraries

**Configuration:**

- Strict mode enabled
- No `any` types in public APIs
- Incremental compilation

### VitePress

**Why VitePress:**

- Fast, Vue-based SSG
- Better performance than Docusaurus
- Simpler configuration
- Great markdown support

### Zod

**Why Zod:**

- Runtime validation + TypeScript types
- Composable schemas
- Great error messages
- Standard in the ecosystem

---

## Future Considerations

### CLI in Rust

**Decision:** Use Rust for CLI tool (Phase 2)

**Rationale:**

- Zero runtime dependencies
- Excellent performance
- Cross-platform compilation
- Great error handling

### Language Ports

**Priority:**

1. TypeScript (Phase 1)
2. Python (Phase 2-3)
3. Go/Rust (Phase 4+, based on demand)

**Rationale:** TypeScript ecosystem is primary target. Python port for data/ML teams. Go/Rust if demand emerges.

---

## Contributing

See [CONTRIBUTING.md](https://github.com/harness-engineering/harness-engineering/blob/main/CONTRIBUTING.md) for development guidelines.
```

- [ ] **Step 6: Commit guides and reference documentation**

```bash
git add docs/guides/ docs/reference/
git commit -m "docs: add implementation guides and API reference structure"
```

---

## Chunk 3: AGENTS.md and Testing Setup

### Task 7: Create Top-Level AGENTS.md

**Files:**

- Create: `AGENTS.md`

- [ ] **Step 1: Create AGENTS.md**

```markdown
# Harness Engineering Library - Knowledge Map

## About This Project

The Harness Engineering Library is a comprehensive toolkit for teams transitioning from manual coding to agent-first development. It provides runtime libraries, CLI tools, linters, and documentation for adopting harness engineering principles.

**Current Phase:** Phase 1 - Foundation & Documentation

---

## Core Principles

The library implements 6 core principles:

1. **Context Engineering** - Repository-as-documentation: `docs/standard/context-engineering.md`
2. **Architectural Constraints** - Mechanical enforcement: `docs/standard/architectural-constraints.md`
3. **Agent Feedback Loop** - Self-correcting agents: `docs/standard/agent-feedback-loop.md`
4. **Entropy Management** - Automated cleanup: `docs/standard/entropy-management.md`
5. **Implementation Strategy** - Depth-first approach: `docs/standard/implementation-strategy.md`
6. **Key Performance Indicators** - Measurable success: `docs/standard/kpis.md`

**Overview:** `docs/standard/index.md`

---

## Project Structure

\`\`\`
harness-engineering/
├── packages/ # Runtime libraries
│ ├── types/ # Shared types
│ └── core/ # Core library (5 modules)
├── docs/ # Documentation site (VitePress)
│ ├── standard/ # The standard (manifesto)
│ ├── guides/ # Implementation guides
│ └── reference/ # API reference
├── AGENTS.md # This file
└── ROADMAP.md # Project roadmap
\`\`\`

---

## Implementation

### Core Library

**Package:** `@harness-engineering/core`

- README: `packages/core/README.md`
- Source: `packages/core/src/`
- Tests: `packages/core/tests/`

**Modules** (to be implemented):

- Context Engineering: `packages/core/src/context/`
- Architectural Constraints: `packages/core/src/constraints/`
- Agent Feedback: `packages/core/src/feedback/`
- Entropy Management: `packages/core/src/entropy/`
- Validation: `packages/core/src/validation/`

### Types Package

**Package:** `@harness-engineering/types`

- README: `packages/types/README.md`
- Source: `packages/types/src/index.ts`
- Exports: Result type, helpers

---

## Documentation

### Standard (Manifesto)

**Location:** `docs/standard/`

- Overview: `docs/standard/index.md`
- 6 core principles (one file each)

### Implementation Guides

**Location:** `docs/guides/`

- Getting Started: `docs/guides/index.md`
- Adoption Levels: `docs/guides/adoption-levels.md` (Level 1, 2, 3)

### API Reference

**Location:** `docs/reference/`

- API docs: `docs/reference/index.md`
- Architecture: `docs/reference/architecture/index.md`

### Documentation Site

**Tech:** VitePress

- Config: `docs/.vitepress/config.ts`
- Dev: `pnpm docs:dev`
- Build: `pnpm docs:build`

---

## Active Work

### Current Implementation Plans

**Phase 1:** Foundation & Documentation Infrastructure

- Plan: `docs/superpowers/plans/2026-03-11-phase1-foundation-and-docs.md`
- Status: In Progress (Chunk 3)

**Next:** Core library modules (separate plans per module)

### Roadmap

Full project roadmap: `ROADMAP.md` (to be created in next milestone)

---

## Getting Started

### For Contributors

1. **Clone and install:**
   \`\`\`bash
   git clone https://github.com/harness-engineering/harness-engineering.git
   cd harness-engineering
   pnpm install
   \`\`\`

2. **Build packages:**
   \`\`\`bash
   pnpm build
   \`\`\`

3. **Run docs locally:**
   \`\`\`bash
   pnpm docs:dev
   \`\`\`

4. **Run tests:**
   \`\`\`bash
   pnpm test
   \`\`\`

### For Agents

This file (AGENTS.md) is your entry point. Use it to navigate the codebase:

- Need to understand principles? → `docs/standard/`
- Need API details? → `docs/reference/`
- Need to find implementation? → `packages/*/src/`
- Need to understand active work? → `docs/superpowers/plans/`

---

## Project Metadata

- **License:** MIT
- **Language:** TypeScript
- **Package Manager:** pnpm 8+
- **Build System:** Turborepo
- **Documentation:** VitePress
- **Testing:** Vitest
- **Node Version:** >=18.0.0
```

- [ ] **Step 2: Commit AGENTS.md**

```bash
git add AGENTS.md
git commit -m "docs: create AGENTS.md knowledge map"
```

---

### Task 8: Add Testing Infrastructure

**Files:**

- Create: `packages/core/vitest.config.ts`
- Create: `packages/core/tests/setup.ts`
- Modify: `packages/core/package.json`

- [ ] **Step 1: Install Vitest**

Run: `cd packages/core && pnpm add -D vitest @vitest/ui && cd ../..`

Expected: Vitest added to core package

- [ ] **Step 2: Create packages/core/vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/index.ts', // Re-exports
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
```

- [ ] **Step 3: Create packages/core/tests/setup.ts**

```typescript
/**
 * Vitest setup file
 *
 * Global test configuration and utilities
 */

// No global setup needed yet
// This file ensures tests/ directory exists for Vitest
```

- [ ] **Step 4: Create sample test for Result type**

Create: `packages/core/tests/types.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { Result, Ok, Err, isOk, isErr } from '../src/index';

describe('Result type', () => {
  describe('Ok', () => {
    it('should create a successful Result', () => {
      const result: Result<number, never> = Ok(42);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(42);
      }
    });
  });

  describe('Err', () => {
    it('should create a failed Result', () => {
      const result: Result<never, string> = Err('Something went wrong');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Something went wrong');
      }
    });
  });

  describe('isOk', () => {
    it('should return true for Ok results', () => {
      const result = Ok(42);
      expect(isOk(result)).toBe(true);
    });

    it('should return false for Err results', () => {
      const result = Err('error');
      expect(isOk(result)).toBe(false);
    });

    it('should narrow type correctly', () => {
      const result: Result<number, string> = Ok(42);

      if (isOk(result)) {
        // Type should be narrowed to { ok: true; value: number }
        const value: number = result.value;
        expect(value).toBe(42);
      }
    });
  });

  describe('isErr', () => {
    it('should return true for Err results', () => {
      const result = Err('error');
      expect(isErr(result)).toBe(true);
    });

    it('should return false for Ok results', () => {
      const result = Ok(42);
      expect(isErr(result)).toBe(false);
    });

    it('should narrow type correctly', () => {
      const result: Result<number, string> = Err('error');

      if (isErr(result)) {
        // Type should be narrowed to { ok: false; error: string }
        const error: string = result.error;
        expect(error).toBe('error');
      }
    });
  });
});
```

- [ ] **Step 5: Run tests to verify setup**

Run: `cd packages/core && pnpm test`

Expected: All tests pass

- [ ] **Step 6: Update core package.json with test coverage script**

Add to `packages/core/package.json` scripts:

```json
{
  "scripts": {
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui"
  }
}
```

- [ ] **Step 7: Commit testing infrastructure**

```bash
git add packages/core/vitest.config.ts packages/core/tests/
git commit -m "test: add Vitest testing infrastructure with sample tests"
```

---

### Task 9: Add README files and Project Documentation

**Files:**

- Create: `README.md`
- Create: `packages/types/README.md`
- Create: `packages/core/README.md`
- Create: `CONTRIBUTING.md`
- Create: `LICENSE`

- [ ] **Step 1: Create root README.md**

````markdown
# Harness Engineering Library

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![pnpm](https://img.shields.io/badge/maintained%20with-pnpm-cc00ff.svg)](https://pnpm.io/)

**Comprehensive toolkit for agent-first development.**

Harness Engineering is a systematic approach where human engineers design constraints and feedback loops that enable AI agents to work reliably and autonomously.

---

## 🚀 Quick Start

```bash
# Install the core library
npm install @harness-engineering/core
# or
pnpm add @harness-engineering/core
```
````

```typescript
import { validateAgentsMap } from '@harness-engineering/core';

const result = validateAgentsMap('./AGENTS.md');

if (!result.ok) {
  console.error('Validation failed:', result.error.message);
  process.exit(1);
}

console.log('✓ AGENTS.md is valid!');
```

---

## 📚 Documentation

**Full documentation:** https://harness-engineering.dev (coming soon)

- **[The Standard](https://github.com/harness-engineering/harness-engineering/tree/main/docs/standard)** - Six core principles
- **[Getting Started](https://github.com/harness-engineering/harness-engineering/tree/main/docs/guides)** - Implementation guides
- **[API Reference](https://github.com/harness-engineering/harness-engineering/tree/main/docs/reference)** - Complete API docs
- **[Adoption Levels](https://github.com/harness-engineering/harness-engineering/blob/main/docs/guides/adoption-levels.md)** - Phased rollout plan

---

## 🎯 What is Harness Engineering?

AI Harness Engineering represents a fundamental shift from manual implementation to systemic leverage:

- **Human Role**: Architect, intent-specifier, and validator
- **AI Role**: Executor, implementer, and primary maintainer

### The Six Principles

1. **Context Engineering** - Repository-as-documentation, everything in git
2. **Architectural Constraints** - Mechanical enforcement of dependencies and boundaries
3. **Agent Feedback Loop** - Self-correcting agents with peer review
4. **Entropy Management** - Automated cleanup and drift detection
5. **Implementation Strategy** - Depth-first, one feature to 100% completion
6. **Key Performance Indicators** - Agent autonomy, harness coverage, context density

---

## 📦 Packages

| Package                                          | Version | Description                      |
| ------------------------------------------------ | ------- | -------------------------------- |
| [`@harness-engineering/core`](./packages/core)   | `0.1.0` | Core runtime library (5 modules) |
| [`@harness-engineering/types`](./packages/types) | `0.1.0` | Shared TypeScript types          |

**Coming soon:**

- `harness-cli` - CLI tool for scaffolding and validation
- `@harness-engineering/eslint-plugin` - ESLint rules
- `@harness-engineering/linter-gen` - Custom linter generator

---

## 🏗️ Project Structure

```
harness-engineering/
├── packages/          # Runtime libraries
│   ├── types/        # Shared types
│   └── core/         # Core library
├── docs/             # Documentation (VitePress)
│   ├── standard/     # The standard
│   ├── guides/       # Implementation guides
│   └── reference/    # API reference
├── AGENTS.md         # Knowledge map for AI agents
└── ROADMAP.md        # Project roadmap
```

---

## 🚧 Current Status

**Phase 1: Foundation** (In Progress)

- ✅ Monorepo setup (pnpm + Turborepo)
- ✅ Documentation infrastructure (VitePress)
- ✅ Standard documentation (6 principles)
- ✅ AGENTS.md knowledge map
- 🚧 Core library modules (in development)

See [ROADMAP.md](./ROADMAP.md) for the full project plan.

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

**Ways to contribute:**

- Report bugs or request features via [GitHub Issues](https://github.com/harness-engineering/harness-engineering/issues)
- Submit pull requests
- Improve documentation
- Share your experience using harness engineering

---

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

---

## 🔗 Links

- **Documentation**: https://harness-engineering.dev (coming soon)
- **GitHub**: https://github.com/harness-engineering/harness-engineering
- **npm**: https://www.npmjs.com/org/harness-engineering
- **Discussions**: https://github.com/harness-engineering/harness-engineering/discussions

---

## 🎓 Learn More

- Read [The Standard](./docs/standard/index.md) to understand the principles
- Follow [Getting Started Guide](./docs/guides/index.md) to adopt harness engineering
- Explore [Adoption Levels](./docs/guides/adoption-levels.md) for phased rollout
- Check [API Reference](./docs/reference/index.md) for detailed documentation

````

- [ ] **Step 2: Create packages/types/README.md**

```markdown
# @harness-engineering/types

Shared TypeScript types for harness-engineering packages.

## Installation

```bash
npm install @harness-engineering/types
# or
pnpm add @harness-engineering/types
````

## Usage

```typescript
import { Result, Ok, Err, isOk, isErr } from '@harness-engineering/types';

// Create successful result
const success: Result<number, never> = Ok(42);

// Create error result
const failure: Result<never, string> = Err('Something went wrong');

// Type-safe error handling
function divide(a: number, b: number): Result<number, string> {
  if (b === 0) {
    return Err('Division by zero');
  }
  return Ok(a / b);
}

const result = divide(10, 2);
if (isOk(result)) {
  console.log(result.value); // 5
} else {
  console.error(result.error);
}
```

## API

### `Result<T, E>`

Type-safe error handling used across all harness-engineering APIs.

```typescript
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };
```

### `Ok<T>(value: T)`

Creates a successful Result.

### `Err<E>(error: E)`

Creates a failed Result.

### `isOk<T, E>(result: Result<T, E>)`

Type guard to check if Result is Ok.

### `isErr<T, E>(result: Result<T, E>)`

Type guard to check if Result is Err.

## License

MIT

````

- [ ] **Step 3: Create packages/core/README.md**

```markdown
# @harness-engineering/core

Core runtime library for harness engineering, implementing all 6 principles.

## Installation

```bash
npm install @harness-engineering/core
# or
pnpm add @harness-engineering/core
````

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

````

- [ ] **Step 4: Create CONTRIBUTING.md**

```markdown
# Contributing to Harness Engineering

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0

### Getting Started

1. **Clone the repository:**
   \`\`\`bash
   git clone https://github.com/harness-engineering/harness-engineering.git
   cd harness-engineering
   \`\`\`

2. **Install dependencies:**
   \`\`\`bash
   pnpm install
   \`\`\`

3. **Build all packages:**
   \`\`\`bash
   pnpm build
   \`\`\`

4. **Run tests:**
   \`\`\`bash
   pnpm test
   \`\`\`

5. **Start documentation site:**
   \`\`\`bash
   pnpm docs:dev
   \`\`\`

---

## Project Structure

This is a pnpm monorepo using Turborepo for build orchestration:

\`\`\`
harness-engineering/
├── packages/          # Runtime libraries
│   ├── types/        # Shared types
│   └── core/         # Core library
├── docs/             # VitePress documentation
├── AGENTS.md         # Knowledge map
└── ROADMAP.md        # Project roadmap
\`\`\`

---

## Development Workflow

### Making Changes

1. **Create a branch:**
   \`\`\`bash
   git checkout -b feature/your-feature-name
   \`\`\`

2. **Make your changes**

3. **Write tests:**
   - All new features must have tests
   - Maintain >80% code coverage

4. **Run tests locally:**
   \`\`\`bash
   pnpm test
   pnpm lint
   pnpm typecheck
   \`\`\`

5. **Commit your changes:**
   \`\`\`bash
   git add .
   git commit -m "feat: add your feature"
   \`\`\`

   **Commit format:** Use conventional commits
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation changes
   - `test:` - Test changes
   - `chore:` - Tooling/config changes

6. **Push and create PR:**
   \`\`\`bash
   git push origin feature/your-feature-name
   \`\`\`

### Code Style

- **TypeScript strict mode** enabled
- **ESLint + Prettier** for formatting
- **No `any` types** in public APIs
- **Zod** for runtime validation

Run formatters:
\`\`\`bash
pnpm format      # Format all files
pnpm lint        # Check linting
\`\`\`

### Testing

- **Vitest** for unit tests
- **Target:** >80% coverage
- **Location:** `packages/*/tests/`

\`\`\`bash
pnpm test                # Run all tests
pnpm test:coverage       # Run with coverage
pnpm test:watch          # Watch mode
\`\`\`

---

## Documentation

### Writing Documentation

Documentation lives in `docs/` and uses VitePress.

**Structure:**
- `docs/standard/` - The 6 principles (manifesto)
- `docs/guides/` - Implementation guides
- `docs/reference/` - API reference

**Preview locally:**
\`\`\`bash
pnpm docs:dev
\`\`\`

### Documentation Standards

- Use GitHub-flavored Markdown
- Include code examples for all APIs
- Add type signatures for TypeScript
- Link to related docs
- Keep examples concise and focused

---

## Pull Request Process

### Before Submitting

- [ ] Tests pass (`pnpm test`)
- [ ] Linting passes (`pnpm lint`)
- [ ] Type-checking passes (`pnpm typecheck`)
- [ ] Documentation updated (if needed)
- [ ] Commit messages follow conventional commits

### PR Guidelines

1. **One feature per PR** - Keep PRs focused
2. **Clear description** - Explain what and why
3. **Link issues** - Reference related issues
4. **Request review** - Tag maintainers

### Review Process

1. **Automated checks** - CI must pass
2. **Code review** - Maintainer reviews code
3. **Approval** - At least one maintainer approval required
4. **Merge** - Squash and merge to main

---

## Reporting Bugs

Use [GitHub Issues](https://github.com/harness-engineering/harness-engineering/issues) to report bugs.

**Include:**
- Clear description
- Steps to reproduce
- Expected vs. actual behavior
- Environment (Node version, OS, etc.)
- Code sample (if applicable)

---

## Feature Requests

We welcome feature requests! Use [GitHub Discussions](https://github.com/harness-engineering/harness-engineering/discussions) for ideas and questions.

**Include:**
- Use case / problem to solve
- Proposed solution (if you have one)
- Alternatives considered

---

## Questions?

- **GitHub Discussions:** General questions, ideas
- **GitHub Issues:** Bug reports, feature requests
- **AGENTS.md:** Navigate the codebase

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
````

- [ ] **Step 5: Create LICENSE (MIT)**

```
MIT License

Copyright (c) 2026 Harness Engineering

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 6: Commit all README files and project docs**

```bash
git add README.md packages/*/README.md CONTRIBUTING.md LICENSE
git commit -m "docs: add README files, CONTRIBUTING, and LICENSE"
```

---

### Task 10: Final Verification and Build

**Files:**

- None (verification only)

- [ ] **Step 1: Clean and rebuild everything**

Run: `pnpm clean && pnpm install && pnpm build`

Expected: Clean build succeeds for all packages

- [ ] **Step 2: Run all tests**

Run: `pnpm test`

Expected: All tests pass

- [ ] **Step 3: Run linting**

Run: `pnpm lint`

Expected: No linting errors

- [ ] **Step 4: Run type checking**

Run: `pnpm typecheck`

Expected: No type errors

- [ ] **Step 5: Build and preview documentation**

Run: `pnpm docs:build && pnpm docs:preview`

Expected: Docs build successfully, preview server starts

(Stop server with Ctrl+C after verification)

- [ ] **Step 6: Verify AGENTS.md links**

Manually check that all links in AGENTS.md resolve to actual files/directories.

Expected: All links valid

- [ ] **Step 7: Review git log**

Run: `git log --oneline`

Expected: Clean commit history with meaningful messages

- [ ] **Step 8: Create final commit for milestone completion**

```bash
git add -A
git commit -m "chore: complete Phase 1 Foundation & Documentation Infrastructure

Milestone achievements:
- ✅ Monorepo setup with pnpm + Turborepo
- ✅ TypeScript + ESLint + Prettier configuration
- ✅ Core package structure (types, core)
- ✅ VitePress documentation site
- ✅ Complete standard documentation (6 principles)
- ✅ Implementation guides and API reference
- ✅ AGENTS.md knowledge map
- ✅ Testing infrastructure (Vitest)
- ✅ Project documentation (README, CONTRIBUTING, LICENSE)

Ready for Phase 1 next milestone: Core library implementation."
```

---

## Summary

**Phase 1 Foundation & Documentation Infrastructure - COMPLETE**

**What was built:**

1. ✅ Monorepo with pnpm + Turborepo
2. ✅ TypeScript, ESLint, Prettier setup
3. ✅ Package structure (`@harness-engineering/types`, `@harness-engineering/core`)
4. ✅ VitePress documentation site
5. ✅ Complete standard documentation (6 principles)
6. ✅ Implementation guides and API reference
7. ✅ AGENTS.md knowledge map
8. ✅ Testing infrastructure
9. ✅ Project documentation

**Next steps:**

- Create separate implementation plans for core library modules
- Implement Context Engineering module
- Implement other modules (Constraints, Feedback, Entropy, Validation)
- Build todo-app reference example

**Verification:**
Run `pnpm build && pnpm test && pnpm docs:build` to verify everything works.
