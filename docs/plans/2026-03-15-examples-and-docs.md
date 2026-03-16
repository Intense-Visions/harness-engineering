# Examples and Documentation Refinement Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create three progressive example projects (hello-world, task-api, multi-tenant-api) and update stale project documentation.

**Architecture:** Each example is a self-contained project under `examples/` with its own package.json, harness config, source code, tests, and tutorial README. Documentation updates bring README.md, AGENTS.md, and getting-started guide up to date.

**Tech Stack:** TypeScript, Express, Vitest, Zod, ESLint, @harness-engineering/eslint-plugin

**Spec:** `docs/specs/2026-03-15-examples-and-docs-design.md`

---

## Chunk 1: Hello World Example (Basic)

### Task 1: Create hello-world project scaffold

**Files:**

- Create: `examples/hello-world/package.json`
- Create: `examples/hello-world/tsconfig.json`
- Create: `examples/hello-world/harness.config.json`

- [ ] **Step 1: Create package.json**

Create `examples/hello-world/package.json`:

```json
{
  "name": "harness-hello-world",
  "version": "1.0.0",
  "private": true,
  "description": "Minimal harness engineering example — basic adoption level",
  "scripts": {
    "test": "vitest run",
    "lint": "echo 'no linter configured at basic level'",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.9.0",
    "vitest": "^4.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `examples/hello-world/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create harness.config.json**

Create `examples/hello-world/harness.config.json`:

```json
{
  "version": 1,
  "name": "harness-hello-world",
  "layers": [
    { "name": "types", "pattern": "src/types/**", "allowedDependencies": [] },
    { "name": "domain", "pattern": "src/domain/**", "allowedDependencies": ["types"] },
    {
      "name": "services",
      "pattern": "src/services/**",
      "allowedDependencies": ["types", "domain"]
    },
    {
      "name": "api",
      "pattern": "src/api/**",
      "allowedDependencies": ["types", "domain", "services"]
    }
  ],
  "agentsMapPath": "./AGENTS.md",
  "docsDir": "./docs",
  "template": {
    "level": "basic",
    "version": 1
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add examples/hello-world/package.json examples/hello-world/tsconfig.json examples/hello-world/harness.config.json
git commit -m "feat(examples): scaffold hello-world project with basic harness config"
```

---

### Task 2: Create hello-world source code and tests

**Files:**

- Create: `examples/hello-world/src/utils.ts`
- Create: `examples/hello-world/src/index.ts`
- Create: `examples/hello-world/tests/index.test.ts`

- [ ] **Step 1: Create utils.ts**

Create `examples/hello-world/src/utils.ts`:

```typescript
/**
 * Capitalize the first letter of a name.
 */
export function formatName(name: string): string {
  if (!name) return '';
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}
```

- [ ] **Step 2: Create index.ts**

Create `examples/hello-world/src/index.ts`:

```typescript
import { formatName } from './utils';

/**
 * Greet someone by name.
 */
export function greet(name: string): string {
  return `Hello, ${formatName(name)}!`;
}
```

- [ ] **Step 3: Create test**

Create `examples/hello-world/tests/index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { greet } from '../src/index';
import { formatName } from '../src/utils';

describe('greet', () => {
  it('greets by name', () => {
    expect(greet('World')).toBe('Hello, World!');
  });

  it('formats the name', () => {
    expect(greet('alice')).toBe('Hello, Alice!');
  });
});

describe('formatName', () => {
  it('capitalizes first letter', () => {
    expect(formatName('alice')).toBe('Alice');
  });

  it('handles empty string', () => {
    expect(formatName('')).toBe('');
  });
});
```

- [ ] **Step 4: Commit**

```bash
git add examples/hello-world/src/ examples/hello-world/tests/
git commit -m "feat(examples): add hello-world source code and tests"
```

---

### Task 3: Create hello-world AGENTS.md, sample state, and README

**Files:**

- Create: `examples/hello-world/AGENTS.md`
- Create: `examples/hello-world/.harness.example/state.json`
- Create: `examples/hello-world/.harness.example/learnings.md`
- Create: `examples/hello-world/README.md`

- [ ] **Step 1: Create AGENTS.md**

Create `examples/hello-world/AGENTS.md`:

```markdown
# Hello World: AI Agent Knowledge Map

A minimal project demonstrating harness engineering at the **basic** adoption level.

## Project Overview

This is a greeting library with two functions (`greet` and `formatName`). It exists to demonstrate what a harness-managed project looks like at the simplest level.

## Repository Structure
```

hello-world/
├── src/
│ ├── index.ts # greet() — entry point
│ └── utils.ts # formatName() — helper
├── tests/
│ └── index.test.ts # Unit tests
├── harness.config.json
└── AGENTS.md # This file

````

## Conventions

- TypeScript strict mode
- Tests live in `tests/` mirroring `src/` structure
- Run `harness validate` to check project health

## Key Commands

```bash
npm test              # Run tests
npm run typecheck     # Check types
harness validate      # Validate harness configuration
harness check-deps    # Check dependency boundaries
````

````

- [ ] **Step 2: Create sample state**

Create `examples/hello-world/.harness.example/state.json`:

```json
{
  "schemaVersion": 1,
  "position": { "phase": "execute", "task": "Task 2" },
  "decisions": [
    {
      "date": "2026-03-15",
      "decision": "Use formatName as a separate utility",
      "context": "Keeps index.ts focused on the public API"
    }
  ],
  "blockers": [],
  "progress": {
    "Task 1": "complete",
    "Task 2": "complete"
  },
  "lastSession": {
    "date": "2026-03-15",
    "summary": "Implemented greet and formatName with tests. All passing.",
    "lastSkill": "harness-tdd",
    "pendingTasks": []
  }
}
````

Create `examples/hello-world/.harness.example/learnings.md`:

```markdown
# Learnings

- **2026-03-15 [skill:harness-tdd] [outcome:success]:** formatName handles empty strings gracefully — no need for a separate null check in greet().
```

- [ ] **Step 3: Create README.md**

Create `examples/hello-world/README.md`:

````markdown
# Hello World — Harness Engineering (Basic)

A minimal project showing what harness engineering looks like at the **basic** adoption level.

## What is this?

A tiny greeting library managed by harness. It demonstrates the foundation: configuration, validation, and agent context — the building blocks every harness project uses.

## Try it

```bash
cd examples/hello-world
npm install
harness validate
```
````

You should see validation pass. This confirms:

- `harness.config.json` is valid
- `AGENTS.md` exists and is readable
- Layer definitions are syntactically correct

## What just happened?

`harness validate` checked your project's configuration and structure. At the basic level, this means:

- The config file parses correctly and has required fields
- The AGENTS.md knowledge map exists where the config says it should
- Layer definitions (if any) are well-formed

No linting rules are enforced at the basic level — that comes in the [task-api example](../task-api/).

## Explore the config

Open `harness.config.json`:

```json
{
  "version": 1,
  "name": "harness-hello-world",
  "layers": [...],
  "agentsMapPath": "./AGENTS.md",
  "docsDir": "./docs",
  "template": { "level": "basic", "version": 1 }
}
```

- **layers** — Defines the architectural layers. Even at basic level, you declare them. They're enforced starting at intermediate level.
- **agentsMapPath** — Where AI agents look for project context.
- **template.level** — Which harness adoption level this project uses.

## What does sample state look like?

Check `.harness.example/` to see what a project's state directory looks like after a few sessions:

- `state.json` — Current position, progress, decisions
- `learnings.md` — Institutional knowledge captured over time

In a real project, this would be `.harness/` (not `.harness.example/`).

## Next

Ready for layer enforcement, ESLint rules, and personas? Try the [task-api example](../task-api/).

````

- [ ] **Step 4: Commit**

```bash
git add examples/hello-world/AGENTS.md examples/hello-world/.harness.example/ examples/hello-world/README.md
git commit -m "feat(examples): add hello-world AGENTS.md, sample state, and tutorial README"
````

---

## Chunk 2: Task API Example (Intermediate)

### Task 4: Create task-api project scaffold

**Files:**

- Create: `examples/task-api/package.json`
- Create: `examples/task-api/tsconfig.json`
- Create: `examples/task-api/harness.config.json`
- Create: `examples/task-api/eslint.config.mjs`
- Create: `examples/task-api/docs/principles.md`

- [ ] **Step 1: Create package.json**

Create `examples/task-api/package.json`:

```json
{
  "name": "harness-task-api",
  "version": "1.0.0",
  "private": true,
  "description": "Task management API demonstrating harness engineering at intermediate level",
  "scripts": {
    "test": "vitest run",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "express": "^4.21.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@harness-engineering/eslint-plugin": "workspace:*",
    "@types/express": "^5.0.0",
    "eslint": "^9.0.0",
    "typescript": "^5.9.0",
    "vitest": "^4.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `examples/task-api/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create harness.config.json**

Create `examples/task-api/harness.config.json`:

```json
{
  "version": 1,
  "name": "harness-task-api",
  "layers": [
    { "name": "types", "pattern": "src/types/**", "allowedDependencies": [] },
    { "name": "services", "pattern": "src/services/**", "allowedDependencies": ["types"] },
    { "name": "api", "pattern": "src/api/**", "allowedDependencies": ["types", "services"] }
  ],
  "forbiddenImports": [
    {
      "from": "src/types/**",
      "disallow": ["src/services/**", "src/api/**"],
      "message": "Types layer cannot import from services or API"
    },
    {
      "from": "src/services/**",
      "disallow": ["src/api/**"],
      "message": "Services layer cannot import from API"
    }
  ],
  "boundaries": {
    "requireSchema": ["src/api/**"]
  },
  "agentsMapPath": "./AGENTS.md",
  "docsDir": "./docs",
  "template": {
    "level": "intermediate",
    "version": 1
  }
}
```

- [ ] **Step 4: Create eslint.config.mjs**

Create `examples/task-api/eslint.config.mjs`:

```javascript
import harnessPlugin from '@harness-engineering/eslint-plugin';

export default [
  harnessPlugin.configs.recommended,
  {
    rules: {
      '@harness-engineering/no-circular-deps': 'error',
      '@harness-engineering/no-forbidden-imports': 'error',
      '@harness-engineering/no-layer-violation': 'error',
    },
  },
];
```

- [ ] **Step 5: Create docs/principles.md**

Create `examples/task-api/docs/principles.md`:

```markdown
# Task API Principles

1. **Layered Architecture** — Types at the bottom, services in the middle, API on top. Dependencies flow downward only.
2. **TDD** — Tests first, implementation second. No code without a failing test.
3. **In-Memory First** — Use in-memory storage. Swap to a database later without changing the API layer.
4. **Type Safety** — All data structures defined as TypeScript interfaces. No `any`.
```

- [ ] **Step 6: Commit**

```bash
git add examples/task-api/package.json examples/task-api/tsconfig.json examples/task-api/harness.config.json examples/task-api/eslint.config.mjs examples/task-api/docs/
git commit -m "feat(examples): scaffold task-api project with intermediate harness config"
```

---

### Task 5: Create task-api source code

**Files:**

- Create: `examples/task-api/src/types/task.ts`
- Create: `examples/task-api/src/services/task-service.ts`
- Create: `examples/task-api/src/api/routes.ts`

- [ ] **Step 1: Create types**

Create `examples/task-api/src/types/task.ts`:

```typescript
export type TaskStatus = 'pending' | 'in_progress' | 'complete';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  createdAt: string;
}

export interface CreateTaskInput {
  title: string;
  description: string;
}
```

- [ ] **Step 2: Create service**

Create `examples/task-api/src/services/task-service.ts`:

```typescript
import type { Task, CreateTaskInput, TaskStatus } from '../types/task';

const tasks: Task[] = [];
let nextId = 1;

export function createTask(input: CreateTaskInput): Task {
  const task: Task = {
    id: String(nextId++),
    title: input.title,
    description: input.description,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  tasks.push(task);
  return task;
}

export function listTasks(): Task[] {
  return [...tasks];
}

export function getTaskById(id: string): Task | undefined {
  return tasks.find((t) => t.id === id);
}

export function completeTask(id: string): Task | undefined {
  const task = tasks.find((t) => t.id === id);
  if (task) {
    task.status = 'complete';
  }
  return task;
}

/** Reset store — for testing only */
export function _resetTasks(): void {
  tasks.length = 0;
  nextId = 1;
}
```

- [ ] **Step 3: Create API routes**

Create `examples/task-api/src/api/routes.ts`:

```typescript
import { Router } from 'express';
import { createTask, listTasks, getTaskById, completeTask } from '../services/task-service';

export const router = Router();

router.post('/tasks', (req, res) => {
  const { title, description } = req.body;
  if (!title) {
    res.status(400).json({ error: 'title is required' });
    return;
  }
  const task = createTask({ title, description: description ?? '' });
  res.status(201).json(task);
});

router.get('/tasks', (_req, res) => {
  res.json(listTasks());
});

router.get('/tasks/:id', (req, res) => {
  const task = getTaskById(req.params.id);
  if (!task) {
    res.status(404).json({ error: 'task not found' });
    return;
  }
  res.json(task);
});

router.patch('/tasks/:id/complete', (req, res) => {
  const task = completeTask(req.params.id);
  if (!task) {
    res.status(404).json({ error: 'task not found' });
    return;
  }
  res.json(task);
});
```

- [ ] **Step 4: Commit**

```bash
git add examples/task-api/src/
git commit -m "feat(examples): add task-api source code — types, service, routes"
```

---

### Task 6: Create task-api tests

**Files:**

- Create: `examples/task-api/tests/services/task-service.test.ts`
- Create: `examples/task-api/tests/api/routes.test.ts`

- [ ] **Step 1: Create service tests**

Create `examples/task-api/tests/services/task-service.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTask,
  listTasks,
  getTaskById,
  completeTask,
  _resetTasks,
} from '../../src/services/task-service';

describe('TaskService', () => {
  beforeEach(() => {
    _resetTasks();
  });

  it('creates a task with pending status', () => {
    const task = createTask({ title: 'Test', description: 'A test task' });
    expect(task.id).toBeDefined();
    expect(task.title).toBe('Test');
    expect(task.status).toBe('pending');
  });

  it('lists all tasks', () => {
    createTask({ title: 'One', description: '' });
    createTask({ title: 'Two', description: '' });
    expect(listTasks()).toHaveLength(2);
  });

  it('gets a task by ID', () => {
    const created = createTask({ title: 'Find me', description: '' });
    const found = getTaskById(created.id);
    expect(found?.title).toBe('Find me');
  });

  it('returns undefined for unknown ID', () => {
    expect(getTaskById('999')).toBeUndefined();
  });

  it('completes a task', () => {
    const task = createTask({ title: 'Complete me', description: '' });
    const completed = completeTask(task.id);
    expect(completed?.status).toBe('complete');
  });
});
```

- [ ] **Step 2: Create route tests**

Create `examples/task-api/tests/api/routes.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createTask, listTasks, _resetTasks } from '../../src/services/task-service';

// Test the service layer directly — route integration tests would need supertest
// This validates the business logic that routes depend on
describe('Task API logic', () => {
  beforeEach(() => {
    _resetTasks();
  });

  it('create + list round trip', () => {
    createTask({ title: 'API task', description: 'Created via API' });
    const tasks = listTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('API task');
  });

  it('create + complete round trip', () => {
    const task = createTask({ title: 'To complete', description: '' });
    expect(task.status).toBe('pending');

    const { completeTask } = require('../../src/services/task-service');
    const completed = completeTask(task.id);
    expect(completed.status).toBe('complete');
  });

  it('list returns empty array initially', () => {
    expect(listTasks()).toEqual([]);
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add examples/task-api/tests/
git commit -m "feat(examples): add task-api tests for service and route logic"
```

---

### Task 7: Create task-api AGENTS.md, sample state, VIOLATIONS.md, and README

**Files:**

- Create: `examples/task-api/AGENTS.md`
- Create: `examples/task-api/.harness.example/state.json`
- Create: `examples/task-api/.harness.example/learnings.md`
- Create: `examples/task-api/.harness.example/failures.md`
- Create: `examples/task-api/VIOLATIONS.md`
- Create: `examples/task-api/README.md`

- [ ] **Step 1: Create AGENTS.md**

Create `examples/task-api/AGENTS.md`:

```markdown
# Task API: AI Agent Knowledge Map

A task management API demonstrating harness engineering at the **intermediate** adoption level.

## Project Overview

RESTful API for managing tasks (create, list, get, complete). Built to demonstrate layered architecture with mechanical constraint enforcement.

## Architecture

Three layers with strict one-way dependencies:
```

types/ → (no imports from other layers)
services/ → can import from types
api/ → can import from types, services

```

Violations are caught by `@harness-engineering/eslint-plugin`.

## Repository Structure

```

task-api/
├── src/
│ ├── types/task.ts # Task, CreateTaskInput, TaskStatus
│ ├── services/task-service.ts # Business logic (in-memory store)
│ └── api/routes.ts # Express routes
├── tests/
│ ├── services/task-service.test.ts
│ └── api/routes.test.ts
├── docs/principles.md
├── harness.config.json
├── eslint.config.mjs
└── AGENTS.md

````

## Conventions

- TypeScript strict mode
- TDD: tests before implementation
- In-memory storage (no database dependency)
- One module per file

## Key Commands

```bash
npm test          # Run tests
npm run lint      # Check architectural constraints
npm run typecheck # Check types
harness validate  # Full project validation
harness check-deps # Check dependency boundaries
````

## Active Persona

**Architecture Enforcer** — Runs on PRs and commits to validate layer boundaries, detect circular dependencies, and block forbidden imports.

````

- [ ] **Step 2: Create sample state files**

Create `examples/task-api/.harness.example/state.json`:

```json
{
  "schemaVersion": 1,
  "position": { "phase": "execute", "task": "Task 5" },
  "decisions": [
    {
      "date": "2026-03-15",
      "decision": "Use in-memory array instead of Map for task storage",
      "context": "Simpler for the example, easy to swap later"
    },
    {
      "date": "2026-03-15",
      "decision": "Skip Express app setup, export router only",
      "context": "Keeps the example focused on architecture, not server config"
    }
  ],
  "blockers": [],
  "progress": {
    "Task 1": "complete",
    "Task 2": "complete",
    "Task 3": "complete",
    "Task 4": "in_progress",
    "Task 5": "pending"
  },
  "lastSession": {
    "date": "2026-03-15",
    "summary": "Implemented types, service, and routes. Tests passing. Starting integration tests.",
    "lastSkill": "harness-execution",
    "pendingTasks": ["Task 4", "Task 5"]
  }
}
````

Create `examples/task-api/.harness.example/learnings.md`:

```markdown
# Learnings

- **2026-03-15 [skill:harness-tdd] [outcome:success]:** Express route handlers need explicit return types to avoid TypeScript errors with res.json().

- **2026-03-15 [skill:harness-execution] [outcome:gotcha]:** The \_resetTasks() function must be exported for test isolation. Without it, tests leak state between runs.

- **2026-03-15 [skill:harness-verification] [outcome:success]:** Layer violation detection works — tried importing routes from types and ESLint caught it immediately.
```

Create `examples/task-api/.harness.example/failures.md`:

```markdown
# Failures

- **2026-03-15 [skill:harness-tdd] [type:dead-end]:** Attempted to use supertest for route testing but it requires a full Express app instance. Switched to testing service logic directly since routes are thin wrappers. Do not add supertest unless full integration tests are needed.
```

- [ ] **Step 3: Create VIOLATIONS.md**

Create `examples/task-api/VIOLATIONS.md`:

````markdown
# Try Breaking These Constraints

These exercises demonstrate how harness catches architectural violations in real time.

## 1. Layer Violation: Types importing from Services

In `src/types/task.ts`, add this import at the top:

```typescript
import { createTask } from '../services/task-service';
```
````

Then run:

```bash
npm run lint
```

**Expected:** `@harness-engineering/no-layer-violation` error. The types layer cannot import from services.

Remove the import when done.

## 2. Layer Violation: Services importing from API

In `src/services/task-service.ts`, add this import at the top:

```typescript
import { router } from '../api/routes';
```

Then run:

```bash
npm run lint
```

**Expected:** `@harness-engineering/no-layer-violation` error. The services layer cannot import from API.

Remove the import when done.

## 3. Forbidden Import

In `src/types/task.ts`, add this import at the top:

```typescript
import { router } from '../api/routes';
```

Then run:

```bash
npm run lint
```

**Expected:** `@harness-engineering/no-forbidden-imports` error. This matches the forbiddenImports rule in harness.config.json.

Remove the import when done.

````

- [ ] **Step 4: Create README.md**

Create `examples/task-api/README.md`:

```markdown
# Task API — Harness Engineering (Intermediate)

A task management API demonstrating harness engineering at the **intermediate** adoption level. This is where constraints start getting enforced.

## What is this?

A simple REST API for managing tasks, built with Express and TypeScript. The interesting part isn't the API itself — it's the layered architecture with mechanical enforcement. Try breaking a constraint and watch harness catch it.

## Quick Start

```bash
cd examples/task-api
npm install
npm test          # Run tests (should pass)
npm run lint      # Check architectural constraints (should pass)
harness validate  # Validate project configuration
````

## Architecture

Three layers, strict one-way dependencies:

```
┌─────────┐
│   api/   │  ← Express routes (top layer)
├─────────┤
│services/ │  ← Business logic (middle layer)
├─────────┤
│  types/  │  ← Interfaces and types (bottom layer)
└─────────┘

Allowed: api → services → types
Blocked: types → services, types → api, services → api
```

This is enforced by `@harness-engineering/eslint-plugin` via the `no-layer-violation` rule. It reads the layer definitions from `harness.config.json` and blocks imports that go the wrong direction.

## Try Breaking a Constraint

See [VIOLATIONS.md](./VIOLATIONS.md) for step-by-step exercises. Each one shows you how to trigger a specific constraint violation and what the error looks like.

## Skills in Context

When building features on this project, harness skills guide the workflow:

- **harness-tdd** — Write the test first, watch it fail, implement, watch it pass
- **harness-execution** — Execute tasks from a plan, one atomic commit per task
- **harness-verification** — Verify the work exists, is substantive, and is wired in

## Personas

The **Architecture Enforcer** persona is configured for this project. It runs:

- `harness check-deps` to verify dependency boundaries
- `harness validate` to check overall project health
- ESLint with harness rules to catch constraint violations

See `agents/personas/architecture-enforcer.yaml` in the main harness repo for the persona definition.

## State Management

Check `.harness.example/` to see what mid-project state looks like:

- `state.json` — Position (Task 5), progress (3 complete, 2 pending), decisions with rationale
- `learnings.md` — Tagged entries from different skills (tdd, execution, verification)
- `failures.md` — A dead-end that was tried and abandoned (supertest approach)

In a real project, this would be `.harness/` (not `.harness.example/`).

## Next

Ready for custom linter rules, boundary schemas, and the full persona suite? Try the [multi-tenant-api example](../multi-tenant-api/).

````

- [ ] **Step 5: Commit**

```bash
git add examples/task-api/AGENTS.md examples/task-api/.harness.example/ examples/task-api/VIOLATIONS.md examples/task-api/README.md
git commit -m "feat(examples): add task-api AGENTS.md, sample state, violations guide, and tutorial README"
````

---

## Chunk 3: Multi-Tenant API Example (Advanced)

### Task 8: Create multi-tenant-api project scaffold

**Files:**

- Create: `examples/multi-tenant-api/package.json`
- Create: `examples/multi-tenant-api/tsconfig.json`
- Create: `examples/multi-tenant-api/harness.config.json`
- Create: `examples/multi-tenant-api/eslint.config.mjs`
- Create: `examples/multi-tenant-api/harness-linter.yml`
- Create: `examples/multi-tenant-api/docs/principles.md`
- Create: `examples/multi-tenant-api/docs/specs/tenant-isolation.md`
- Create: `examples/multi-tenant-api/docs/changes/.gitkeep`

- [ ] **Step 1: Create package.json**

Create `examples/multi-tenant-api/package.json`:

```json
{
  "name": "harness-multi-tenant-api",
  "version": "1.0.0",
  "private": true,
  "description": "Multi-tenant API demonstrating harness engineering at advanced level",
  "scripts": {
    "test": "vitest run",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "express": "^4.21.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@harness-engineering/eslint-plugin": "workspace:*",
    "@types/express": "^5.0.0",
    "eslint": "^9.0.0",
    "typescript": "^5.9.0",
    "vitest": "^4.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json, harness.config.json, eslint.config.mjs**

Create `examples/multi-tenant-api/tsconfig.json` (same as task-api).

Create `examples/multi-tenant-api/harness.config.json`:

```json
{
  "version": 1,
  "name": "harness-multi-tenant-api",
  "layers": [
    { "name": "types", "pattern": "src/types/**", "allowedDependencies": [] },
    { "name": "middleware", "pattern": "src/middleware/**", "allowedDependencies": ["types"] },
    {
      "name": "services",
      "pattern": "src/services/**",
      "allowedDependencies": ["types", "middleware"]
    },
    {
      "name": "api",
      "pattern": "src/api/**",
      "allowedDependencies": ["types", "middleware", "services"]
    }
  ],
  "forbiddenImports": [
    {
      "from": "src/types/**",
      "disallow": ["src/middleware/**", "src/services/**", "src/api/**"],
      "message": "Types layer cannot import from upper layers"
    },
    {
      "from": "src/middleware/**",
      "disallow": ["src/services/**", "src/api/**"],
      "message": "Middleware cannot import from services or API"
    },
    {
      "from": "src/services/**",
      "disallow": ["src/api/**"],
      "message": "Services layer cannot import from API"
    }
  ],
  "boundaries": {
    "requireSchema": ["src/api/**", "src/services/**"]
  },
  "agentsMapPath": "./AGENTS.md",
  "docsDir": "./docs",
  "crossCheck": {
    "specsDir": "docs/specs",
    "plansDir": "docs/plans"
  },
  "agent": {
    "executor": "subprocess",
    "timeout": 300000
  },
  "entropy": {
    "excludePatterns": ["**/node_modules/**", "**/*.test.ts"],
    "autoFix": false
  },
  "template": {
    "level": "advanced",
    "version": 1
  }
}
```

Create `examples/multi-tenant-api/eslint.config.mjs`:

```javascript
import harnessPlugin from '@harness-engineering/eslint-plugin';

export default [
  harnessPlugin.configs.recommended,
  {
    rules: {
      '@harness-engineering/no-circular-deps': 'error',
      '@harness-engineering/no-forbidden-imports': 'error',
      '@harness-engineering/no-layer-violation': 'error',
      '@harness-engineering/require-boundary-schema': 'warn',
      '@harness-engineering/enforce-doc-exports': 'warn',
    },
  },
];
```

- [ ] **Step 3: Create harness-linter.yml**

Create `examples/multi-tenant-api/harness-linter.yml`:

```yaml
version: 1
output: ./generated/eslint-rules

rules:
  - name: no-direct-db-access
    type: import-restriction
    severity: error
    config:
      source: 'src/api/**'
      forbiddenImports:
        - 'src/data/**'
        - 'pg'
        - 'mysql2'
        - 'mongodb'
      message: 'API layer must not access database directly — use services layer'
```

- [ ] **Step 4: Create docs**

Create `examples/multi-tenant-api/docs/principles.md`:

```markdown
# Multi-Tenant API Principles

1. **Tenant Isolation** — Every data operation must be scoped to a tenant. No query may access another tenant's data.
2. **Layered Architecture** — Four layers: types → middleware → services → api. Dependencies flow downward only.
3. **Boundary Validation** — All service functions validate their inputs with Zod schemas at the boundary.
4. **Explicit Context** — Tenant context is extracted in middleware and passed explicitly, never stored in globals.
5. **Defense in Depth** — Even if middleware fails, services reject requests without a valid tenantId.
```

Create `examples/multi-tenant-api/docs/specs/tenant-isolation.md`:

```markdown
# Tenant Isolation Specification

## Overview

All user data is scoped to a tenant. A tenant is identified by `X-Tenant-ID` header.

## Rules

1. Every API request must include `X-Tenant-ID` header
2. Middleware extracts and validates the tenant ID before any route handler runs
3. All service functions accept `tenantId` as their first parameter
4. The data store uses `tenantId` as a partition key — queries always filter by tenant
5. Attempting to access another tenant's data returns 404 (not 403, to avoid information leakage)

## Enforcement

- Middleware rejects requests without `X-Tenant-ID` with 401
- Service functions throw if `tenantId` is empty
- Integration tests verify cross-tenant isolation
```

Create `examples/multi-tenant-api/docs/changes/.gitkeep` (empty file).

- [ ] **Step 5: Commit**

```bash
git add examples/multi-tenant-api/package.json examples/multi-tenant-api/tsconfig.json examples/multi-tenant-api/harness.config.json examples/multi-tenant-api/eslint.config.mjs examples/multi-tenant-api/harness-linter.yml examples/multi-tenant-api/docs/
git commit -m "feat(examples): scaffold multi-tenant-api project with advanced harness config"
```

---

### Task 9: Create multi-tenant-api source code

**Files:**

- Create: `examples/multi-tenant-api/src/types/tenant.ts`
- Create: `examples/multi-tenant-api/src/types/user.ts`
- Create: `examples/multi-tenant-api/src/middleware/tenant-context.ts`
- Create: `examples/multi-tenant-api/src/services/user-service.ts`
- Create: `examples/multi-tenant-api/src/api/routes.ts`

- [ ] **Step 1: Create types**

Create `examples/multi-tenant-api/src/types/tenant.ts`:

```typescript
export interface TenantContext {
  tenantId: string;
}
```

Create `examples/multi-tenant-api/src/types/user.ts`:

```typescript
export interface User {
  id: string;
  tenantId: string;
  name: string;
  email: string;
}

export interface CreateUserInput {
  name: string;
  email: string;
}
```

- [ ] **Step 2: Create middleware**

Create `examples/multi-tenant-api/src/middleware/tenant-context.ts`:

```typescript
import type { Request, Response, NextFunction } from 'express';
import type { TenantContext } from '../types/tenant';

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
    }
  }
}

/**
 * Extract tenant context from X-Tenant-ID header.
 * Rejects requests without a valid tenant ID.
 */
export function tenantContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const tenantId = req.headers['x-tenant-id'];

  if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
    res.status(401).json({ error: 'X-Tenant-ID header is required' });
    return;
  }

  req.tenant = { tenantId: tenantId.trim() };
  next();
}
```

- [ ] **Step 3: Create service with Zod boundary validation**

Create `examples/multi-tenant-api/src/services/user-service.ts`:

```typescript
import { z } from 'zod';
import type { User, CreateUserInput } from '../types/user';

const store: Map<string, User[]> = new Map();
let nextId = 1;

const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

/**
 * Create a user scoped to a tenant.
 * @param tenantId - The tenant this user belongs to
 * @param input - User creation input (validated with Zod)
 */
export function createUser(tenantId: string, input: CreateUserInput): User {
  const validated = CreateUserSchema.parse(input);

  if (!tenantId) throw new Error('tenantId is required');

  const user: User = {
    id: String(nextId++),
    tenantId,
    name: validated.name,
    email: validated.email,
  };

  const tenantUsers = store.get(tenantId) ?? [];
  tenantUsers.push(user);
  store.set(tenantId, tenantUsers);

  return user;
}

/**
 * List all users for a tenant.
 * @param tenantId - Only returns users belonging to this tenant
 */
export function listUsers(tenantId: string): User[] {
  if (!tenantId) throw new Error('tenantId is required');
  return [...(store.get(tenantId) ?? [])];
}

/**
 * Get a user by ID, scoped to a tenant.
 * Returns undefined if the user doesn't exist or belongs to a different tenant.
 */
export function getUserById(tenantId: string, userId: string): User | undefined {
  if (!tenantId) throw new Error('tenantId is required');
  const tenantUsers = store.get(tenantId) ?? [];
  return tenantUsers.find((u) => u.id === userId);
}

/** Reset store — for testing only */
export function _resetUsers(): void {
  store.clear();
  nextId = 1;
}
```

- [ ] **Step 4: Create API routes**

Create `examples/multi-tenant-api/src/api/routes.ts`:

```typescript
import { Router } from 'express';
import { tenantContextMiddleware } from '../middleware/tenant-context';
import { createUser, listUsers, getUserById } from '../services/user-service';

export const router = Router();

router.use(tenantContextMiddleware);

router.post('/users', (req, res) => {
  try {
    const user = createUser(req.tenant!.tenantId, req.body);
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid input' });
  }
});

router.get('/users', (req, res) => {
  const users = listUsers(req.tenant!.tenantId);
  res.json(users);
});

router.get('/users/:id', (req, res) => {
  const user = getUserById(req.tenant!.tenantId, req.params.id);
  if (!user) {
    res.status(404).json({ error: 'user not found' });
    return;
  }
  res.json(user);
});
```

- [ ] **Step 5: Commit**

```bash
git add examples/multi-tenant-api/src/
git commit -m "feat(examples): add multi-tenant-api source — types, middleware, services, routes"
```

---

### Task 10: Create multi-tenant-api tests

**Files:**

- Create: `examples/multi-tenant-api/tests/middleware/tenant-context.test.ts`
- Create: `examples/multi-tenant-api/tests/services/user-service.test.ts`
- Create: `examples/multi-tenant-api/tests/integration/tenant-isolation.test.ts`

- [ ] **Step 1: Create middleware tests**

Create `examples/multi-tenant-api/tests/middleware/tenant-context.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { tenantContextMiddleware } from '../../src/middleware/tenant-context';

function mockReq(headers: Record<string, string> = {}) {
  return { headers } as any;
}

function mockRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data: any) => {
    res.body = data;
    return res;
  };
  return res;
}

describe('tenantContextMiddleware', () => {
  it('rejects requests without X-Tenant-ID', () => {
    const res = mockRes();
    let nextCalled = false;
    tenantContextMiddleware(mockReq(), res, () => {
      nextCalled = true;
    });
    expect(res.statusCode).toBe(401);
    expect(nextCalled).toBe(false);
  });

  it('rejects empty X-Tenant-ID', () => {
    const res = mockRes();
    let nextCalled = false;
    tenantContextMiddleware(mockReq({ 'x-tenant-id': '  ' }), res, () => {
      nextCalled = true;
    });
    expect(res.statusCode).toBe(401);
    expect(nextCalled).toBe(false);
  });

  it('attaches tenant context for valid header', () => {
    const req = mockReq({ 'x-tenant-id': 'tenant-1' });
    const res = mockRes();
    let nextCalled = false;
    tenantContextMiddleware(req, res, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
    expect(req.tenant?.tenantId).toBe('tenant-1');
  });
});
```

- [ ] **Step 2: Create service tests**

Create `examples/multi-tenant-api/tests/services/user-service.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createUser, listUsers, getUserById, _resetUsers } from '../../src/services/user-service';

describe('UserService', () => {
  beforeEach(() => {
    _resetUsers();
  });

  it('creates a user scoped to a tenant', () => {
    const user = createUser('tenant-1', { name: 'Alice', email: 'alice@example.com' });
    expect(user.tenantId).toBe('tenant-1');
    expect(user.name).toBe('Alice');
  });

  it('lists users for a specific tenant only', () => {
    createUser('tenant-1', { name: 'Alice', email: 'alice@example.com' });
    createUser('tenant-2', { name: 'Bob', email: 'bob@example.com' });

    expect(listUsers('tenant-1')).toHaveLength(1);
    expect(listUsers('tenant-2')).toHaveLength(1);
    expect(listUsers('tenant-1')[0].name).toBe('Alice');
  });

  it('rejects invalid email with Zod validation', () => {
    expect(() => createUser('tenant-1', { name: 'Alice', email: 'not-an-email' })).toThrow();
  });

  it('throws if tenantId is empty', () => {
    expect(() => createUser('', { name: 'Alice', email: 'alice@example.com' })).toThrow(
      'tenantId is required'
    );
  });
});
```

- [ ] **Step 3: Create integration tests**

Create `examples/multi-tenant-api/tests/integration/tenant-isolation.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createUser, listUsers, getUserById, _resetUsers } from '../../src/services/user-service';

describe('Tenant Isolation', () => {
  beforeEach(() => {
    _resetUsers();
  });

  it('tenant-1 cannot see tenant-2 users', () => {
    createUser('tenant-1', { name: 'Alice', email: 'alice@t1.com' });
    createUser('tenant-2', { name: 'Bob', email: 'bob@t2.com' });

    const t1Users = listUsers('tenant-1');
    const t2Users = listUsers('tenant-2');

    expect(t1Users).toHaveLength(1);
    expect(t1Users[0].name).toBe('Alice');
    expect(t2Users).toHaveLength(1);
    expect(t2Users[0].name).toBe('Bob');
  });

  it('getUserById returns undefined for user in different tenant', () => {
    const user = createUser('tenant-1', { name: 'Alice', email: 'alice@t1.com' });

    // Same user ID, different tenant — should not find it
    const result = getUserById('tenant-2', user.id);
    expect(result).toBeUndefined();
  });

  it('empty tenant returns empty list, not all users', () => {
    createUser('tenant-1', { name: 'Alice', email: 'alice@t1.com' });
    const result = listUsers('tenant-3');
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 4: Commit**

```bash
git add examples/multi-tenant-api/tests/
git commit -m "feat(examples): add multi-tenant-api tests — middleware, service, tenant isolation"
```

---

### Task 11: Create multi-tenant-api AGENTS.md, sample state, VIOLATIONS.md, and README

**Files:**

- Create: `examples/multi-tenant-api/AGENTS.md`
- Create: `examples/multi-tenant-api/.harness.example/` (5 files + archive/)
- Create: `examples/multi-tenant-api/VIOLATIONS.md`
- Create: `examples/multi-tenant-api/README.md`

- [ ] **Step 1: Create AGENTS.md**

Create `examples/multi-tenant-api/AGENTS.md`:

```markdown
# Multi-Tenant API: AI Agent Knowledge Map

A multi-tenant user management API demonstrating harness engineering at the **advanced** adoption level.

## Project Overview

RESTful API where all data is scoped to tenants via `X-Tenant-ID` header. Demonstrates custom linter rules, boundary validation, cross-artifact checking, all three personas, and full state management.

## Architecture

Four layers with strict one-way dependencies:
```

types/ → (no imports)
middleware/ → can import from types
services/ → can import from types, middleware
api/ → can import from types, middleware, services

```

### Tenant Isolation

- Middleware extracts `X-Tenant-ID` from request headers
- All service functions take `tenantId` as first parameter
- Data store is partitioned by tenant
- Cross-tenant access returns 404

See `docs/specs/tenant-isolation.md` for the full specification.

## Repository Structure

```

multi-tenant-api/
├── src/
│ ├── types/ # Tenant, User interfaces
│ ├── middleware/ # Tenant context extraction
│ ├── services/ # Business logic with Zod validation
│ └── api/ # Express routes
├── tests/
│ ├── middleware/ # Auth/tenant tests
│ ├── services/ # Unit tests
│ └── integration/ # Tenant isolation tests
├── docs/
│ ├── principles.md
│ ├── specs/ # Source-of-truth specifications
│ └── changes/ # In-progress proposals
├── harness.config.json
├── harness-linter.yml # Custom linter rules
├── eslint.config.mjs
└── AGENTS.md

````

## Conventions

- TypeScript strict mode
- Zod validation at service boundaries
- JSDoc on all exported functions
- TDD: tests before implementation
- Tenant ID passed explicitly, never stored in globals

## Key Commands

```bash
npm test                       # Run tests
npm run lint                   # Check all constraints
npm run typecheck              # Check types
harness validate               # Full validation
harness validate --cross-check # Cross-artifact validation
harness check-deps             # Dependency boundaries
harness linter generate        # Generate custom ESLint rules from harness-linter.yml
````

## Active Personas

- **Architecture Enforcer** — Layer violations, circular deps, forbidden imports
- **Documentation Maintainer** — Doc drift, missing JSDoc on exports
- **Entropy Cleaner** — Dead code, stale patterns, unused dependencies

````

- [ ] **Step 2: Create sample state files**

Create `examples/multi-tenant-api/.harness.example/state.json`:

```json
{
  "schemaVersion": 1,
  "position": { "phase": "execute", "task": "Task 8" },
  "decisions": [
    {
      "date": "2026-03-01",
      "decision": "Use Map<tenantId, User[]> instead of flat array with filter",
      "context": "O(1) tenant lookup vs O(n) filter on every request"
    },
    {
      "date": "2026-03-02",
      "decision": "Return 404 for cross-tenant access, not 403",
      "context": "403 leaks information about resource existence to other tenants"
    }
  ],
  "blockers": [],
  "progress": {
    "Task 1": "complete",
    "Task 2": "complete",
    "Task 3": "complete",
    "Task 4": "complete",
    "Task 5": "complete",
    "Task 6": "complete",
    "Task 7": "complete",
    "Task 8": "in_progress"
  },
  "lastSession": {
    "date": "2026-03-15",
    "summary": "All core features implemented. Working on advanced constraint enforcement.",
    "lastSkill": "harness-execution",
    "pendingTasks": ["Task 8"]
  }
}
````

Create `examples/multi-tenant-api/.harness.example/learnings.md`:

```markdown
# Learnings

- **2026-03-01 [skill:harness-tdd] [outcome:success]:** Map partition by tenantId gives O(1) tenant lookup. Flat array with filter would be O(n) per request.

- **2026-03-01 [skill:harness-execution] [outcome:gotcha]:** Express global type augmentation (declare global { namespace Express }) must be in a .ts file that gets included by tsconfig, not in a .d.ts file.

- **2026-03-02 [skill:harness-verification] [outcome:success]:** Tenant isolation holds — getUserById('tenant-2', user.id) returns undefined when user belongs to tenant-1.

- **2026-03-02 [skill:harness-planning] [outcome:success]:** Splitting middleware into its own layer (between types and services) keeps tenant extraction logic separate from business logic.

- **2026-03-15 [skill:harness-execution] [outcome:gotcha]:** Zod's .parse() throws ZodError, not a plain Error. Catch blocks should handle both for user-friendly messages.
```

Create `examples/multi-tenant-api/.harness.example/failures.md`:

```markdown
# Failures

- **2026-03-01 [skill:harness-tdd] [type:dead-end]:** Tried using a global tenant context (AsyncLocalStorage) to avoid passing tenantId to every function. Abandoned because it hides the dependency — functions appear pure but secretly read global state. Explicit parameter passing is clearer. Do not retry.

- **2026-03-02 [skill:harness-execution] [type:blocked]:** Attempted to use a shared DB connection pool partitioned by tenant. Blocked because in-memory store is the spec for this example. Defer to a real database example if needed later.
```

Create `examples/multi-tenant-api/.harness.example/handoff.json`:

```json
{
  "timestamp": "2026-03-15T10:00:00Z",
  "fromSkill": "harness-planning",
  "phase": "VALIDATE",
  "summary": "8 tasks planned for multi-tenant API implementation",
  "completed": [],
  "pending": ["Task 1", "Task 2", "Task 3", "Task 4", "Task 5", "Task 6", "Task 7", "Task 8"],
  "concerns": ["Tenant isolation must be verified at both service and integration test levels"],
  "decisions": [
    {
      "what": "4-layer architecture",
      "why": "Middleware layer isolates tenant extraction from business logic"
    }
  ],
  "blockers": [],
  "contextKeywords": ["multi-tenant", "isolation", "middleware", "zod", "boundary-validation"]
}
```

Create `examples/multi-tenant-api/.harness.example/archive/failures-2026-03-01.md`:

```markdown
# Failures (archived 2026-03-01)

- **2026-02-28 [skill:harness-brainstorming] [type:dead-end]:** Explored using JWT claims for tenant identification instead of X-Tenant-ID header. Abandoned because it couples authentication to tenant isolation. Simpler to keep them separate.
```

- [ ] **Step 3: Create VIOLATIONS.md**

Create `examples/multi-tenant-api/VIOLATIONS.md`:

````markdown
# Try Breaking These Constraints

Advanced constraint exercises demonstrating the full range of harness enforcement.

## 1. Boundary Schema Violation

In `src/services/user-service.ts`, remove the Zod validation from `createUser`:

Replace:

```typescript
const validated = CreateUserSchema.parse(input);
```
````

With:

```typescript
const validated = input; // skip validation
```

Then run:

```bash
npm run lint
```

**Expected:** `@harness-engineering/require-boundary-schema` warning. Service functions must validate their inputs.

Restore the Zod validation when done.

## 2. Layer Violation

In `src/types/tenant.ts`, add this import:

```typescript
import { router } from '../api/routes';
```

Then run:

```bash
npm run lint
```

**Expected:** `@harness-engineering/no-layer-violation` and `@harness-engineering/no-forbidden-imports` errors. Types cannot import from API.

Remove the import when done.

## 3. Cross-Artifact Staleness

Edit `docs/specs/tenant-isolation.md` and add a new rule:

```markdown
6. All tenant data must be encrypted at rest
```

But don't implement it. Then run:

```bash
harness validate --cross-check
```

**Expected:** Warning about spec-to-implementation drift. The spec mentions encryption but no code implements it.

Remove the added rule when done.

## 4. Missing Documentation

In `src/services/user-service.ts`, remove the JSDoc comment from `createUser`:

```typescript
// Remove: /** Create a user scoped to a tenant... */
```

Then run:

```bash
npm run lint
```

**Expected:** `@harness-engineering/enforce-doc-exports` warning. Exported functions must have JSDoc.

Restore the JSDoc when done.

````

- [ ] **Step 4: Create README.md**

Create `examples/multi-tenant-api/README.md`:

```markdown
# Multi-Tenant API — Harness Engineering (Advanced)

A multi-tenant user management API demonstrating harness engineering at the **advanced** adoption level. Every advanced feature in action.

## What is this?

A REST API where all data is isolated per tenant. Every request requires an `X-Tenant-ID` header. The API layer, middleware, services, and types each live in their own architectural layer with enforced boundaries.

The interesting part: custom linter rules, boundary schema enforcement, cross-artifact validation, all three personas, and a full state management lifecycle.

## Quick Start

```bash
cd examples/multi-tenant-api
npm install
npm test          # Run tests (should pass)
npm run lint      # Check all constraints (should pass)
harness validate  # Validate configuration
````

## Architecture

Four layers, strict one-way dependencies:

```
┌──────────┐
│   api/    │  ← Express routes (top layer)
├──────────┤
│services/  │  ← Business logic + Zod validation (middle)
├──────────┤
│middleware/ │  ← Tenant context extraction
├──────────┤
│  types/   │  ← Interfaces (bottom layer)
└──────────┘
```

### Tenant Isolation

Every request must include `X-Tenant-ID`. Middleware validates it before any route handler runs. Services take `tenantId` as their first parameter. The data store is partitioned by tenant.

See `docs/specs/tenant-isolation.md` for the full specification.

## Custom Linter Rules

`harness-linter.yml` defines custom rules generated by `harness linter generate`:

```yaml
rules:
  - name: no-direct-db-access
    type: import-restriction
    config:
      source: 'src/api/**'
      forbiddenImports: ['pg', 'mysql2', 'mongodb']
      message: 'API layer must not access database directly'
```

This generates an ESLint rule that prevents the API layer from importing database drivers directly. All data access must go through the services layer.

## Boundary Schema Enforcement

The `require-boundary-schema` ESLint rule checks that exported service functions contain Zod validation. Open `src/services/user-service.ts` to see Zod schemas validating inputs at the service boundary:

```typescript
const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});
```

## Cross-Artifact Validation

```bash
harness validate --cross-check
```

Checks that specs in `docs/specs/` align with the implementation. If the spec says something the code doesn't do (or vice versa), you'll get a warning.

## All Three Personas

| Persona                      | What it checks                                     |
| ---------------------------- | -------------------------------------------------- |
| **Architecture Enforcer**    | Layer violations, circular deps, forbidden imports |
| **Documentation Maintainer** | Doc drift, missing JSDoc on exports                |
| **Entropy Cleaner**          | Dead code, stale patterns, unused deps             |

## Specs and Changes

This project uses the `docs/specs/` + `docs/changes/` convention:

- `docs/specs/` — Source of truth for what the system does today
- `docs/changes/` — Proposals for new features (empty now, ready for use)

When planning a new feature, create `docs/changes/<feature>/proposal.md` with your design.

## State Deep Dive

Check `.harness.example/` to see the full state lifecycle:

| File                             | What it shows                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------ |
| `state.json`                     | Position, progress (7/8 tasks), decisions with rationale, enriched lastSession |
| `learnings.md`                   | 5 tagged entries across 4 different skills                                     |
| `failures.md`                    | 2 dead-ends (AsyncLocalStorage, shared DB pool)                                |
| `handoff.json`                   | Planning → execution context transfer                                          |
| `archive/failures-2026-03-01.md` | Archived failures from a previous milestone                                    |

## Try Breaking Constraints

See [VIOLATIONS.md](./VIOLATIONS.md) for 4 exercises covering boundary schemas, layer violations, cross-artifact staleness, and missing documentation.

````

- [ ] **Step 5: Commit**

```bash
git add examples/multi-tenant-api/AGENTS.md examples/multi-tenant-api/.harness.example/ examples/multi-tenant-api/VIOLATIONS.md examples/multi-tenant-api/README.md
git commit -m "feat(examples): add multi-tenant-api AGENTS.md, sample state, violations guide, and tutorial README"
````

---

## Chunk 4: Documentation Updates

### Task 12: Update README.md, AGENTS.md, and getting-started guide

**Files:**

- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/guides/getting-started.md`

- [ ] **Step 1: Rewrite README.md**

Rewrite `README.md` at project root. Keep the MIT badge and overall structure but update all content to reflect current state. Key changes:

- Remove "Coming soon" packages — all 6 exist now
- Update package table with all 6 packages (types, core, cli, eslint-plugin, linter-gen, mcp-server)
- Update project structure to include packages/, agents/, templates/, examples/
- Update status from "Phase 1 in progress" to "Complete"
- Quick start → point to hello-world example
- Add examples section linking to all three
- Remove emoji from headers (match the project's current tone)

- [ ] **Step 2: Update AGENTS.md**

Update the "Current Phase" section (line 17-19):

Replace:

```
**Phase 1: Foundation and Documentation** - We are building the core library, documentation, and tooling that establishes the foundation for agent-first development.
```

With:

```
**Complete** — All core packages, skills, personas, templates, and tooling are implemented. The project is in adoption and refinement mode. See `examples/` for progressive tutorials.
```

Update the repository structure (lines 25-44) to include all current directories:

- Add `packages/cli/`, `packages/eslint-plugin/`, `packages/linter-gen/`, `packages/mcp-server/`
- Add `agents/` with skills/ and personas/ subdirectories
- Add `templates/` directory
- Add `examples/` with all three examples
- Remove `[future packages]` placeholder

- [ ] **Step 3: Update getting-started.md**

Rewrite the installation section to reference examples as the primary learning path:

````markdown
## Quick Start: Try an Example

The fastest way to understand harness engineering is to explore the examples:

### 1. Hello World (Basic) — 5 minutes

```bash
cd examples/hello-world
npm install
harness validate
```
````

See what a harness-managed project looks like at the simplest level.
[Read the full tutorial →](../../examples/hello-world/README.md)

### 2. Task API (Intermediate) — 15 minutes

```bash
cd examples/task-api
npm install
npm test && npm run lint
```

Layer enforcement, ESLint rules, and personas in action.
[Read the full tutorial →](../../examples/task-api/README.md)

### 3. Multi-Tenant API (Advanced) — 30 minutes

```bash
cd examples/multi-tenant-api
npm install
npm test && npm run lint && harness validate --cross-check
```

Custom linter rules, boundary schemas, cross-artifact validation, and all three personas.
[Read the full tutorial →](../../examples/multi-tenant-api/README.md)

````

Keep the rest of the guide (prerequisites, troubleshooting, etc.) but update any stale references.

- [ ] **Step 4: Commit**

```bash
git add README.md AGENTS.md docs/guides/getting-started.md
git commit -m "docs: update README, AGENTS.md, and getting-started guide to reflect current project state"
````

---

### Task 13: Final validation

- [ ] **Step 1: Verify all example files exist**

Run: `find examples/ -type f | sort`
Expected: All files from the three examples present.

- [ ] **Step 2: Verify no superpowers directory references in new files**

Run: `grep -r "docs/superpowers" examples/ AGENTS.md README.md docs/guides/`
Expected: No matches.

- [ ] **Step 3: Spot-check one example's README for broken links**

Read `examples/task-api/README.md` and verify the relative links (`../multi-tenant-api/`, `./VIOLATIONS.md`) point to real files.

- [ ] **Step 4: Commit any fixes**

If issues found, fix and commit.
