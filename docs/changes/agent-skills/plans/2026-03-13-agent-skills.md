# Agent Skills Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build 11 agent skills for Claude Code and Gemini CLI that wrap harness CLI commands and provide workflow guidance.

**Architecture:** Platform-specific skill directories with shared fragments. Each skill has skill.yaml (metadata), prompt.md (instructions), and README.md (docs). CLI wrapper skills invoke `harness <cmd> --json` via subprocess. Workflow skills provide direct guidance.

**Tech Stack:** YAML, Markdown, Vitest for testing, Zod for schema validation

**Spec Reference:** [Agent Skills Design Spec](../specs/2026-03-13-agent-skills-design.md)

---

## File Structure

```
agents/
└── skills/
    ├── shared/
    │   ├── cli-invocation.md
    │   ├── json-parsing.md
    │   └── success-criteria/
    │       ├── validation.md
    │       ├── architecture.md
    │       └── documentation.md
    │
    ├── claude-code/
    │   ├── validate-context-engineering/
    │   │   ├── skill.yaml
    │   │   ├── prompt.md
    │   │   └── README.md
    │   ├── enforce-architecture/
    │   ├── check-mechanical-constraints/
    │   ├── harness-tdd/
    │   ├── harness-code-review/
    │   ├── harness-refactoring/
    │   ├── detect-doc-drift/
    │   ├── cleanup-dead-code/
    │   ├── align-documentation/
    │   ├── initialize-harness-project/
    │   └── add-harness-component/
    │
    ├── gemini-cli/
    │   └── (mirrors claude-code structure)
    │
    ├── tests/
    │   ├── schema.ts
    │   ├── schema.test.ts
    │   ├── prompt-lint.test.ts
    │   └── includes.test.ts
    │
    ├── package.json
    ├── tsconfig.json
    └── vitest.config.mts
```

---

## Chunk 1: Test Infrastructure & Shared Fragments

### Task 1: Initialize Skills Package

**Files:**

- Create: `agents/skills/package.json`
- Create: `agents/skills/tsconfig.json`
- Create: `agents/skills/vitest.config.mts`
- Modify: `pnpm-workspace.yaml`

- [ ] **Step 1: Create directory structure**

Run:

```bash
mkdir -p agents/skills/tests agents/skills/shared/success-criteria agents/skills/claude-code agents/skills/gemini-cli
```

- [ ] **Step 2: Update pnpm-workspace.yaml**

Add `agents/skills` to the workspace packages:

```yaml
packages:
  - 'packages/*'
  - 'docs'
  - 'agents/skills'
```

- [ ] **Step 3: Create package.json**

```json
{
  "name": "@harness-engineering/skills",
  "version": "1.0.0",
  "private": true,
  "description": "Agent skills for harness engineering",
  "type": "module",
  "scripts": {
    "test": "vitest",
    "test:coverage": "vitest run --coverage"
  },
  "devDependencies": {
    "glob": "^10.3.0",
    "vitest": "^4.0.18",
    "yaml": "^2.3.0",
    "zod": "^3.22.0"
  }
}
```

- [ ] **Step 4: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": ".",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"]
  },
  "include": ["tests/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 5: Create vitest.config.mts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 6: Install dependencies**

Run: `pnpm install`
Expected: Dependencies installed successfully (runs from workspace root)

- [ ] **Step 7: Commit**

```bash
git add pnpm-workspace.yaml agents/skills/package.json agents/skills/tsconfig.json agents/skills/vitest.config.mts
git commit -m "chore(skills): initialize skills package with test infrastructure"
```

---

### Task 2: Create Schema and Schema Tests

**Files:**

- Create: `agents/skills/tests/schema.ts`
- Create: `agents/skills/tests/schema.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// agents/skills/tests/schema.test.ts
import { describe, it, expect } from 'vitest';
import { SkillMetadataSchema } from './schema';

describe('SkillMetadataSchema', () => {
  it('validates a complete skill.yaml', () => {
    const valid = {
      name: 'validate-context-engineering',
      version: '1.0.0',
      description: 'Validate repository context engineering practices',
      platform: 'claude-code',
      triggers: ['manual', 'on_pr'],
      tools: ['Bash', 'Read'],
      cli_command: 'harness validate --json',
      category: 'enforcement',
    };
    const result = SkillMetadataSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects invalid name format', () => {
    const invalid = {
      name: 'Invalid Name',
      version: '1.0.0',
      description: 'Test description here',
      platform: 'claude-code',
      triggers: ['manual'],
      tools: ['Bash'],
      category: 'enforcement',
    };
    const result = SkillMetadataSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects invalid platform', () => {
    const invalid = {
      name: 'test-skill',
      version: '1.0.0',
      description: 'Test description here',
      platform: 'invalid-platform',
      triggers: ['manual'],
      tools: ['Bash'],
      category: 'enforcement',
    };
    const result = SkillMetadataSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('allows optional fields', () => {
    const minimal = {
      name: 'test-skill',
      version: '1.0.0',
      description: 'Test description here',
      platform: 'claude-code',
      triggers: ['manual'],
      tools: ['Bash'],
      category: 'enforcement',
    };
    const result = SkillMetadataSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  it('validates depends_on as array of strings', () => {
    const withDeps = {
      name: 'test-skill',
      version: '1.0.0',
      description: 'Test description here',
      platform: 'claude-code',
      triggers: ['manual'],
      tools: ['Bash'],
      category: 'enforcement',
      depends_on: ['other-skill'],
    };
    const result = SkillMetadataSchema.safeParse(withDeps);
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agents/skills && pnpm test -- tests/schema.test.ts`
Expected: FAIL - cannot find module './schema'

- [ ] **Step 3: Write schema implementation**

```typescript
// agents/skills/tests/schema.ts
import { z } from 'zod';

export const SkillMetadataSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Name must be lowercase with hyphens'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semver format'),
  description: z.string().min(10).max(200),
  platform: z.enum(['claude-code', 'gemini-cli']),
  triggers: z.array(z.enum(['manual', 'on_pr', 'on_commit'])),
  tools: z.array(z.string()),
  cli_command: z.string().optional(),
  category: z.enum(['enforcement', 'workflow', 'entropy', 'setup']),
  depends_on: z.array(z.string()).default([]),
  includes: z.array(z.string()).default([]),
});

export type SkillMetadata = z.infer<typeof SkillMetadataSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agents/skills && pnpm test -- tests/schema.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add agents/skills/tests/schema.ts agents/skills/tests/schema.test.ts
git commit -m "feat(skills): add skill metadata schema with validation"
```

---

### Task 3: Create Prompt Lint Tests

**Files:**

- Create: `agents/skills/tests/prompt-lint.test.ts`

- [ ] **Step 1: Write prompt lint test**

```typescript
// agents/skills/tests/prompt-lint.test.ts
import { describe, it, expect } from 'vitest';
import { glob } from 'glob';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REQUIRED_SECTIONS = ['## Steps', '## Success Criteria'];
const SKILLS_DIR = resolve(__dirname, '..');

describe('prompt.md structure', () => {
  const promptFiles = glob.sync('**/prompt.md', {
    cwd: SKILLS_DIR,
    ignore: ['**/shared/**', '**/tests/**', '**/node_modules/**'],
  });

  // Skip if no prompt files exist yet
  if (promptFiles.length === 0) {
    it.skip('no prompt files found yet', () => {});
    return;
  }

  it.each(promptFiles)('%s has required sections', (file) => {
    const content = readFileSync(resolve(SKILLS_DIR, file), 'utf-8');
    for (const section of REQUIRED_SECTIONS) {
      expect(content, `Missing section: ${section}`).toContain(section);
    }
  });

  it.each(promptFiles)('%s starts with h1 heading', (file) => {
    const content = readFileSync(resolve(SKILLS_DIR, file), 'utf-8');
    expect(content.trim()).toMatch(/^# /);
  });
});

describe('skill.yaml exists for each prompt', () => {
  const promptFiles = glob.sync('**/prompt.md', {
    cwd: SKILLS_DIR,
    ignore: ['**/shared/**', '**/tests/**', '**/node_modules/**'],
  });

  if (promptFiles.length === 0) {
    it.skip('no prompt files found yet', () => {});
    return;
  }

  it.each(promptFiles)('%s has corresponding skill.yaml', (file) => {
    const dir = resolve(SKILLS_DIR, file, '..');
    const yamlPath = resolve(dir, 'skill.yaml');
    expect(existsSync(yamlPath), `Missing skill.yaml for ${file}`).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it passes (skipped)**

Run: `cd agents/skills && pnpm test -- tests/prompt-lint.test.ts`
Expected: PASS (skipped - no prompt files yet)

- [ ] **Step 3: Commit**

```bash
git add agents/skills/tests/prompt-lint.test.ts
git commit -m "feat(skills): add prompt.md lint tests"
```

---

### Task 4: Create Includes Validation Tests

**Files:**

- Create: `agents/skills/tests/includes.test.ts`

- [ ] **Step 1: Write includes validation test**

```typescript
// agents/skills/tests/includes.test.ts
import { describe, it, expect } from 'vitest';
import { glob } from 'glob';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';
import { SkillMetadataSchema } from './schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolve(__dirname, '..');

describe('skill.yaml includes validation', () => {
  const skillFiles = glob.sync('**/skill.yaml', {
    cwd: SKILLS_DIR,
    ignore: ['**/node_modules/**', '**/tests/**'],
  });

  if (skillFiles.length === 0) {
    it.skip('no skill files found yet', () => {});
    return;
  }

  it.each(skillFiles)('%s references existing shared fragments', (file) => {
    const content = readFileSync(resolve(SKILLS_DIR, file), 'utf-8');
    const parsed = parse(content);
    const result = SkillMetadataSchema.safeParse(parsed);

    if (!result.success) {
      throw new Error(`Invalid skill.yaml: ${file}`);
    }

    const skill = result.data;
    for (const includePath of skill.includes) {
      const fullPath = resolve(SKILLS_DIR, includePath);
      expect(existsSync(fullPath), `Missing include: ${includePath}`).toBe(true);
    }
  });
});

describe('skill.yaml schema validation', () => {
  const skillFiles = glob.sync('**/skill.yaml', {
    cwd: SKILLS_DIR,
    ignore: ['**/node_modules/**', '**/tests/**'],
  });

  if (skillFiles.length === 0) {
    it.skip('no skill files found yet', () => {});
    return;
  }

  it.each(skillFiles)('%s conforms to schema', (file) => {
    const content = readFileSync(resolve(SKILLS_DIR, file), 'utf-8');
    const parsed = parse(content);
    const result = SkillMetadataSchema.safeParse(parsed);
    expect(result.success, `Schema validation failed: ${JSON.stringify(result)}`).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it passes (skipped)**

Run: `cd agents/skills && pnpm test -- tests/includes.test.ts`
Expected: PASS (skipped - no skill files yet)

- [ ] **Step 3: Commit**

```bash
git add agents/skills/tests/includes.test.ts
git commit -m "feat(skills): add includes validation tests"
```

---

### Task 5: Create Shared Fragments

**Files:**

- Create: `agents/skills/shared/cli-invocation.md`
- Create: `agents/skills/shared/json-parsing.md`
- Create: `agents/skills/shared/success-criteria/validation.md`
- Create: `agents/skills/shared/success-criteria/architecture.md`
- Create: `agents/skills/shared/success-criteria/documentation.md`

- [ ] **Step 1: Create cli-invocation.md**

````markdown
<!-- agents/skills/shared/cli-invocation.md -->

# CLI Invocation Pattern

## Running Harness Commands

All harness CLI commands support `--json` flag for structured output:

```bash
harness <command> --json
```
````

## Exit Codes

| Code | Meaning           | Action                              |
| ---- | ----------------- | ----------------------------------- |
| 0    | Success           | Report success, proceed             |
| 1    | Validation failed | Parse issues from JSON, report each |
| 2    | Error             | Report error message, suggest fix   |

## Tool Usage

**Claude Code:** Use the `Bash` tool
**Gemini CLI:** Use the `shell` tool

````

- [ ] **Step 2: Create json-parsing.md**

```markdown
<!-- agents/skills/shared/json-parsing.md -->
# JSON Output Parsing

## Standard Response Format

```json
{
  "valid": true|false,
  "issues": [
    {
      "file": "path/to/file.ts",
      "line": 42,
      "message": "Description of issue",
      "severity": "error|warning|info",
      "suggestion": "How to fix"
    }
  ],
  "summary": {
    "total": 5,
    "errors": 2,
    "warnings": 3
  }
}
````

## Handling Results

1. Check `valid` field first
2. If `false`, iterate through `issues` array
3. Report each issue with file location
4. Provide actionable fix suggestions

````

- [ ] **Step 3: Create success-criteria/validation.md**

```markdown
<!-- agents/skills/shared/success-criteria/validation.md -->
# Validation Success Criteria

- [ ] AGENTS.md exists in project root
- [ ] AGENTS.md parses without errors
- [ ] All file links in AGENTS.md resolve to existing files
- [ ] Documentation coverage meets threshold (default: 80%)
- [ ] Knowledge map has no broken references
- [ ] harness.config.json exists and is valid
````

- [ ] **Step 4: Create success-criteria/architecture.md**

```markdown
<!-- agents/skills/shared/success-criteria/architecture.md -->

# Architecture Success Criteria

- [ ] No layer boundary violations detected
- [ ] No circular dependency chains found
- [ ] All imports respect configured layer hierarchy
- [ ] Forbidden imports are not used
- [ ] Module boundaries are respected
```

- [ ] **Step 5: Create success-criteria/documentation.md**

```markdown
<!-- agents/skills/shared/success-criteria/documentation.md -->

# Documentation Success Criteria

- [ ] All public exports have documentation
- [ ] Documentation matches current code (no drift)
- [ ] API docs are up to date
- [ ] Examples in docs are valid and runnable
```

- [ ] **Step 6: Commit**

```bash
git add agents/skills/shared/
git commit -m "feat(skills): add shared prompt fragments"
```

---

## Chunk 2: Enforcement Skills (Claude Code)

### Task 6: Create validate-context-engineering Skill

**Files:**

- Create: `agents/skills/claude-code/validate-context-engineering/skill.yaml`
- Create: `agents/skills/claude-code/validate-context-engineering/prompt.md`
- Create: `agents/skills/claude-code/validate-context-engineering/README.md`

- [ ] **Step 1: Create skill.yaml**

```yaml
# agents/skills/claude-code/validate-context-engineering/skill.yaml
name: validate-context-engineering
version: 1.0.0
description: Validate repository context engineering practices (AGENTS.md, doc coverage, knowledge map)
platform: claude-code
triggers:
  - manual
  - on_pr
  - on_commit
tools:
  - Bash
  - Read
  - Glob
cli_command: harness validate --json
category: enforcement
depends_on: []
includes:
  - shared/cli-invocation.md
  - shared/json-parsing.md
  - shared/success-criteria/validation.md
```

- [ ] **Step 2: Create prompt.md**

````markdown
# Validate Context Engineering

Validate this repository's context engineering practices: AGENTS.md structure, documentation coverage, and knowledge map integrity.

## Context

Use this skill to verify that a project follows harness engineering context practices. Run before merging PRs or after significant documentation changes.

## Prerequisites

- `@harness-engineering/cli` installed globally or in project
- `harness.config.json` exists in project root

## Steps

1. **Run validation command** — Execute the harness validate command with JSON output:

   Use the Bash tool:

   ```bash
   harness validate --json
   ```
````

2. **Check exit code**
   - Exit 0: Validation passed
   - Exit 1: Validation issues found
   - Exit 2: Error (config missing, CLI error)

3. **Parse JSON output** — Extract the validation result:

   ```json
   {
     "valid": true|false,
     "issues": [...],
     "summary": {...}
   }
   ```

4. **Report findings**
   - If valid: Report success with summary
   - If issues found: List each issue with:
     - File path and line number
     - Issue description
     - Suggested fix

5. **Suggest fixes** — For each issue type:
   - Missing AGENTS.md: Create with `harness init`
   - Broken links: Update or remove dead references
   - Low doc coverage: Add documentation to undocumented exports
   - Invalid structure: Fix AGENTS.md format

## Success Criteria

- [ ] AGENTS.md exists in project root
- [ ] AGENTS.md parses without errors
- [ ] All file links in AGENTS.md resolve to existing files
- [ ] Documentation coverage meets threshold (default: 80%)
- [ ] Knowledge map has no broken references
- [ ] harness.config.json exists and is valid

## Error Handling

| Error               | Cause                         | Resolution                                             |
| ------------------- | ----------------------------- | ------------------------------------------------------ |
| Config not found    | Missing harness.config.json   | Run `harness init` to create config                    |
| AGENTS.md not found | Missing context file          | Create AGENTS.md or run `harness init`                 |
| CLI not installed   | harness command not available | Install with `npm install -g @harness-engineering/cli` |

## Examples

### Example: Successful Validation

```bash
$ harness validate --json
{
  "valid": true,
  "issues": [],
  "summary": {
    "agentsMap": "valid",
    "docCoverage": "87%",
    "knowledgeMap": "valid"
  }
}
```

Report: "Context engineering validation passed. Documentation coverage: 87%."

### Example: Issues Found

```bash
$ harness validate --json
{
  "valid": false,
  "issues": [
    {
      "file": "AGENTS.md",
      "line": 15,
      "message": "Broken link: ./docs/api.md does not exist",
      "suggestion": "Update link or create the missing file"
    }
  ]
}
```

Report: "Validation failed. Found 1 issue in AGENTS.md:15 - broken link to ./docs/api.md. Fix by updating the link or creating the missing file."

````

- [ ] **Step 3: Create README.md**

```markdown
# validate-context-engineering

Validates repository context engineering practices.

## What It Checks

- AGENTS.md existence and structure
- Documentation coverage percentage
- Knowledge map link integrity
- harness.config.json validity

## Usage

Invoke this skill when you want to verify that a project follows harness engineering context practices.

## CLI Equivalent

```bash
harness validate --json
````

## Related Skills

- `enforce-architecture` - Validates layer boundaries
- `check-mechanical-constraints` - Runs both validation and architecture checks

````

- [ ] **Step 4: Run tests to verify skill validates**

Run: `cd agents/skills && pnpm test`
Expected: PASS (skill.yaml validates, prompt.md has required sections)

- [ ] **Step 5: Commit**

```bash
git add agents/skills/claude-code/validate-context-engineering/
git commit -m "feat(skills): add validate-context-engineering skill for Claude Code"
````

---

### Task 7: Create enforce-architecture Skill

**Files:**

- Create: `agents/skills/claude-code/enforce-architecture/skill.yaml`
- Create: `agents/skills/claude-code/enforce-architecture/prompt.md`
- Create: `agents/skills/claude-code/enforce-architecture/README.md`

- [ ] **Step 1: Create skill.yaml**

```yaml
# agents/skills/claude-code/enforce-architecture/skill.yaml
name: enforce-architecture
version: 1.0.0
description: Validate architectural layer boundaries and detect circular dependencies
platform: claude-code
triggers:
  - manual
  - on_pr
  - on_commit
tools:
  - Bash
  - Read
  - Glob
cli_command: harness check-deps --json
category: enforcement
depends_on: []
includes:
  - shared/cli-invocation.md
  - shared/json-parsing.md
  - shared/success-criteria/architecture.md
```

- [ ] **Step 2: Create prompt.md**

````markdown
# Enforce Architecture

Validate architectural layer boundaries and detect circular dependencies in the codebase.

## Context

Use this skill to verify that imports respect the configured layer hierarchy and no circular dependency chains exist. Critical for maintaining clean architecture.

## Prerequisites

- `@harness-engineering/cli` installed
- `harness.config.json` with `layers` configured

## Steps

1. **Run dependency check** — Execute the harness check-deps command:

   Use the Bash tool:

   ```bash
   harness check-deps --json
   ```
````

2. **Check exit code**
   - Exit 0: No violations
   - Exit 1: Violations found
   - Exit 2: Error

3. **Parse JSON output** — Extract violations:

   ```json
   {
     "valid": false,
     "issues": [
       {
         "type": "layer-violation",
         "file": "src/types/user.ts",
         "line": 5,
         "message": "types layer cannot import from services layer",
         "import": "../services/auth"
       }
     ]
   }
   ```

4. **Report findings**
   - List each violation with file, line, and offending import
   - Explain which layer rule was violated
   - Suggest how to fix (move code, change import direction)

5. **For circular dependencies**
   - Show the full cycle: A → B → C → A
   - Identify the best place to break the cycle
   - Suggest refactoring approach

## Success Criteria

- [ ] No layer boundary violations detected
- [ ] No circular dependency chains found
- [ ] All imports respect configured layer hierarchy
- [ ] Forbidden imports are not used

## Error Handling

| Error                | Cause                              | Resolution                   |
| -------------------- | ---------------------------------- | ---------------------------- |
| No layers configured | harness.config.json missing layers | Add `layers` array to config |
| Parse error          | TypeScript syntax error            | Fix syntax error first       |

## Examples

### Example: Layer Violation

```
Layer violation in src/types/user.ts:5
  Import: ../services/auth
  Rule: types layer cannot import from services layer

Fix: Move shared types to a common location, or restructure to avoid cross-layer import.
```

### Example: Circular Dependency

```
Circular dependency detected:
  src/a.ts → src/b.ts → src/c.ts → src/a.ts

Suggestion: Extract shared code from src/a.ts into a new module that both can import.
```

````

- [ ] **Step 3: Create README.md**

```markdown
# enforce-architecture

Validates architectural layer boundaries and detects circular dependencies.

## What It Checks

- Layer boundary violations (e.g., types importing from services)
- Circular dependency chains
- Forbidden import patterns

## Usage

Run this skill to ensure code changes don't violate architectural constraints.

## CLI Equivalent

```bash
harness check-deps --json
````

## Configuration

Layers are configured in `harness.config.json`:

```json
{
  "layers": [
    { "name": "types", "pattern": "src/types/**", "allowedDependencies": [] },
    { "name": "domain", "pattern": "src/domain/**", "allowedDependencies": ["types"] },
    { "name": "services", "pattern": "src/services/**", "allowedDependencies": ["types", "domain"] }
  ]
}
```

## Related Skills

- `validate-context-engineering` - Validates context practices
- `check-mechanical-constraints` - Runs both checks together

````

- [ ] **Step 4: Run tests**

Run: `cd agents/skills && pnpm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add agents/skills/claude-code/enforce-architecture/
git commit -m "feat(skills): add enforce-architecture skill for Claude Code"
````

---

### Task 8: Create check-mechanical-constraints Skill

**Files:**

- Create: `agents/skills/claude-code/check-mechanical-constraints/skill.yaml`
- Create: `agents/skills/claude-code/check-mechanical-constraints/prompt.md`
- Create: `agents/skills/claude-code/check-mechanical-constraints/README.md`

- [ ] **Step 1: Create skill.yaml**

```yaml
# agents/skills/claude-code/check-mechanical-constraints/skill.yaml
name: check-mechanical-constraints
version: 1.0.0
description: Run all mechanical constraint checks (context validation + architecture)
platform: claude-code
triggers:
  - manual
  - on_pr
tools:
  - Bash
  - Read
  - Glob
cli_command: harness validate --json && harness check-deps --json
category: enforcement
depends_on:
  - validate-context-engineering
  - enforce-architecture
includes:
  - shared/cli-invocation.md
  - shared/json-parsing.md
```

- [ ] **Step 2: Create prompt.md**

````markdown
# Check Mechanical Constraints

Run all mechanical constraint checks: context engineering validation and architectural enforcement.

## Context

This is the comprehensive check that combines `validate-context-engineering` and `enforce-architecture`. Use before merging PRs or as a pre-commit check.

## Prerequisites

- `@harness-engineering/cli` installed
- `harness.config.json` configured

## Steps

1. **Run context validation** — Execute validation first:

   Use the Bash tool:

   ```bash
   harness validate --json
   ```
````

2. **Run architecture check** — Then check dependencies:

   Use the Bash tool:

   ```bash
   harness check-deps --json
   ```

3. **Aggregate results** — Combine findings from both commands

4. **Report summary**
   - Total issues found
   - Breakdown by category (context vs architecture)
   - List all issues with locations

5. **Provide fix guidance**
   - Prioritize errors over warnings
   - Group related issues
   - Suggest order of fixes

## Success Criteria

- [ ] AGENTS.md valid and complete
- [ ] Documentation coverage meets threshold
- [ ] No layer violations
- [ ] No circular dependencies
- [ ] All mechanical constraints pass

## Error Handling

| Error             | Cause                         | Resolution                    |
| ----------------- | ----------------------------- | ----------------------------- |
| First check fails | Config or CLI issue           | Fix config before proceeding  |
| Mixed results     | Some checks pass, others fail | Address failures individually |

## Examples

### Example: All Checks Pass

```
Mechanical Constraints: PASS

Context Engineering:
  ✓ AGENTS.md valid
  ✓ Doc coverage: 85%
  ✓ Knowledge map intact

Architecture:
  ✓ No layer violations
  ✓ No circular deps
```

### Example: Mixed Results

```
Mechanical Constraints: FAIL (3 issues)

Context Engineering: PASS
Architecture: FAIL
  ✗ 2 layer violations
  ✗ 1 circular dependency

See individual issues above for fix guidance.
```

````

- [ ] **Step 3: Create README.md**

```markdown
# check-mechanical-constraints

Runs all mechanical constraint checks in one command.

## What It Runs

1. `harness validate --json` - Context engineering checks
2. `harness check-deps --json` - Architecture checks

## Usage

Use this skill for comprehensive validation before merging or deploying.

## CLI Equivalent

```bash
harness validate --json && harness check-deps --json
````

## Related Skills

- `validate-context-engineering` - Context checks only
- `enforce-architecture` - Architecture checks only

````

- [ ] **Step 4: Run tests**

Run: `cd agents/skills && pnpm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add agents/skills/claude-code/check-mechanical-constraints/
git commit -m "feat(skills): add check-mechanical-constraints skill for Claude Code"
````

---

## Chunk 3: Workflow Skills (Claude Code)

### Task 9: Create harness-tdd Skill

**Files:**

- Create: `agents/skills/claude-code/harness-tdd/skill.yaml`
- Create: `agents/skills/claude-code/harness-tdd/prompt.md`
- Create: `agents/skills/claude-code/harness-tdd/README.md`

- [ ] **Step 1: Create skill.yaml**

```yaml
# agents/skills/claude-code/harness-tdd/skill.yaml
name: harness-tdd
version: 1.0.0
description: Guide test-driven development workflow with harness validation
platform: claude-code
triggers:
  - manual
tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
category: workflow
depends_on: []
includes: []
```

- [ ] **Step 2: Create prompt.md**

````markdown
# Harness TDD Workflow

Guide test-driven development with harness engineering validation integrated at each step.

## Context

Use this skill when implementing new features or fixing bugs. TDD ensures code is tested from the start and harness validation keeps the codebase compliant.

## Prerequisites

- Test framework configured (vitest, jest, etc.)
- `@harness-engineering/cli` installed

## Steps

1. **Understand the requirement**
   - Clarify what behavior needs to be implemented
   - Identify the module/file where code will live
   - Determine test file location

2. **Write the failing test first**
   - Create test file if it doesn't exist
   - Write a test that captures the expected behavior
   - Use descriptive test names: `it('returns X when given Y')`

   ```typescript
   describe('featureName', () => {
     it('does expected behavior', () => {
       const result = functionUnderTest(input);
       expect(result).toBe(expectedOutput);
     });
   });
   ```
````

3. **Run test to confirm it fails**

   Use the Bash tool:

   ```bash
   pnpm test -- path/to/test.ts
   ```

   Expected: Test fails (function not defined, wrong result, etc.)

   **Important:** If the test passes, it's not testing new behavior. Revise the test.

4. **Write minimal implementation**
   - Write just enough code to make the test pass
   - Don't add features not covered by tests
   - Keep it simple

5. **Run test to confirm it passes**

   Use the Bash tool:

   ```bash
   pnpm test -- path/to/test.ts
   ```

   Expected: Test passes

6. **Run harness validation**

   Use the Bash tool:

   ```bash
   harness validate --json && harness check-deps --json
   ```

   - If validation fails, fix issues before proceeding
   - Common issues: missing docs, layer violations

7. **Refactor if needed**
   - Clean up code while keeping tests green
   - Run tests after each refactor step
   - Don't change behavior during refactoring

8. **Commit**

   Use the Bash tool:

   ```bash
   git add <files>
   git commit -m "feat: add feature description"
   ```

## Success Criteria

- [ ] Test written before implementation
- [ ] Test fails initially (proves it tests something real)
- [ ] Implementation makes test pass
- [ ] Harness validation passes
- [ ] Code committed with descriptive message

## Error Handling

| Situation               | Resolution                                    |
| ----------------------- | --------------------------------------------- |
| Test passes immediately | Test isn't capturing new behavior - revise it |
| Can't make test pass    | Break down into smaller steps                 |
| Validation fails        | Fix validation issues before committing       |

## Tips

- **Small steps:** Each test should cover one behavior
- **Fast feedback:** Run tests frequently
- **Green before commit:** Never commit failing tests
- **Refactor in green:** Only refactor when tests pass

````

- [ ] **Step 3: Create README.md**

```markdown
# harness-tdd

Guides test-driven development with harness validation integration.

## The TDD Cycle

1. Write failing test
2. Run test (should fail)
3. Write minimal implementation
4. Run test (should pass)
5. Run harness validation
6. Refactor if needed
7. Commit

## Usage

Invoke this skill when starting to implement a feature or fix. Follow the steps in order.

## Key Principles

- **Test first:** Always write the test before the implementation
- **Minimal code:** Write just enough to pass the test
- **Validate often:** Run harness checks before committing
- **Small commits:** One logical change per commit
````

- [ ] **Step 4: Run tests**

Run: `cd agents/skills && pnpm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add agents/skills/claude-code/harness-tdd/
git commit -m "feat(skills): add harness-tdd workflow skill for Claude Code"
```

---

### Task 10: Create harness-code-review Skill

**Files:**

- Create: `agents/skills/claude-code/harness-code-review/skill.yaml`
- Create: `agents/skills/claude-code/harness-code-review/prompt.md`
- Create: `agents/skills/claude-code/harness-code-review/README.md`

- [ ] **Step 1: Create skill.yaml**

```yaml
# agents/skills/claude-code/harness-code-review/skill.yaml
name: harness-code-review
version: 1.0.0
description: Structured code review with automated harness checks
platform: claude-code
triggers:
  - manual
  - on_pr
tools:
  - Bash
  - Read
  - Glob
  - Grep
cli_command: harness agent review
category: workflow
depends_on: []
includes:
  - shared/cli-invocation.md
```

- [ ] **Step 2: Create prompt.md**

````markdown
# Harness Code Review

Perform structured code review combining automated harness checks with manual review checklist.

## Context

Use this skill when reviewing code changes (PRs, commits, or local changes). Combines automated validation with human-guided review criteria.

## Prerequisites

- `@harness-engineering/cli` installed
- Changes to review (staged, committed, or in PR)

## Steps

1. **Identify changes to review**

   Use the Bash tool to see what changed:

   ```bash
   git diff --name-only HEAD~1
   ```
````

Or for staged changes:

```bash
git diff --cached --name-only
```

2. **Run automated checks**

   Use the Bash tool:

   ```bash
   harness validate --json && harness check-deps --json
   ```

   Report any automated findings first.

3. **Review code changes**

   For each changed file, read the diff and check:

   Use the Bash tool:

   ```bash
   git diff HEAD~1 -- <file>
   ```

4. **Apply review checklist**
   - [ ] **Intent match:** Do changes match the stated purpose?
   - [ ] **Architecture:** No layer violations or new circular deps?
   - [ ] **Tests:** Are new/changed behaviors tested?
   - [ ] **Documentation:** Are docs updated if needed?
   - [ ] **Security:** No obvious vulnerabilities introduced?
   - [ ] **Performance:** No obvious performance issues?
   - [ ] **Error handling:** Are errors handled appropriately?
   - [ ] **Naming:** Are names clear and consistent?

5. **Generate structured feedback**

   Use the Bash tool:

   ```bash
   harness agent review
   ```

6. **Summarize findings**

   Group by severity:
   - **Blockers:** Must fix before merge
   - **Suggestions:** Should consider fixing
   - **Nitpicks:** Minor style issues

## Success Criteria

- [ ] All automated checks pass
- [ ] Review checklist completed for each file
- [ ] Issues documented with clear descriptions
- [ ] Actionable feedback provided

## Error Handling

| Situation             | Resolution                             |
| --------------------- | -------------------------------------- |
| Automated checks fail | Fix automated issues first             |
| Large diff            | Break review into logical chunks       |
| Unclear intent        | Ask for clarification before reviewing |

## Review Checklist Reference

### Architecture

- Imports follow layer hierarchy
- No circular dependencies introduced
- Module boundaries respected

### Testing

- New code has tests
- Edge cases covered
- Tests are readable and maintainable

### Documentation

- Public APIs documented
- Complex logic has comments
- README updated if needed

### Security

- No hardcoded secrets
- Input validation present
- Proper error messages (no sensitive data leaked)

````

- [ ] **Step 3: Create README.md**

```markdown
# harness-code-review

Structured code review with automated harness checks.

## Review Process

1. Run automated checks (validate + check-deps)
2. Review each changed file
3. Apply review checklist
4. Generate structured feedback
5. Summarize by severity

## Usage

Invoke this skill when reviewing PRs or code changes.

## CLI Equivalent

```bash
harness agent review
````

## Related Skills

- `check-mechanical-constraints` - Automated checks only
- `harness-refactoring` - For making improvements found in review

````

- [ ] **Step 4: Run tests**

Run: `cd agents/skills && pnpm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add agents/skills/claude-code/harness-code-review/
git commit -m "feat(skills): add harness-code-review workflow skill for Claude Code"
````

---

### Task 11: Create harness-refactoring Skill

**Files:**

- Create: `agents/skills/claude-code/harness-refactoring/skill.yaml`
- Create: `agents/skills/claude-code/harness-refactoring/prompt.md`
- Create: `agents/skills/claude-code/harness-refactoring/README.md`

- [ ] **Step 1: Create skill.yaml**

```yaml
# agents/skills/claude-code/harness-refactoring/skill.yaml
name: harness-refactoring
version: 1.0.0
description: Safe refactoring with validation before and after changes
platform: claude-code
triggers:
  - manual
tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
category: workflow
depends_on: []
includes:
  - shared/cli-invocation.md
```

- [ ] **Step 2: Create prompt.md**

````markdown
# Harness Refactoring

Perform safe refactoring with validation checkpoints before and after changes.

## Context

Use this skill when refactoring code (restructuring without changing behavior). Validation checkpoints ensure no regression is introduced.

## Prerequisites

- Tests exist for code being refactored
- `@harness-engineering/cli` installed
- Clean git state (no uncommitted changes)

## Steps

1. **Establish baseline**

   Run tests and validation before any changes:

   Use the Bash tool:

   ```bash
   pnpm test
   ```
````

```bash
harness validate --json && harness check-deps --json
```

**Important:** Both must pass before proceeding. If not, fix issues first.

2. **Identify refactoring scope**
   - What files/functions will change?
   - What behavior must be preserved?
   - Are there sufficient tests?

3. **Make incremental changes**

   For each refactoring step:

   a. Make a small, focused change
   b. Run tests immediately:

   ```bash
   pnpm test
   ```

   c. If tests fail, revert and try smaller step

4. **Validate after refactoring**

   Use the Bash tool:

   ```bash
   harness validate --json && harness check-deps --json
   ```

   Ensure no new violations introduced.

5. **Run full test suite**

   Use the Bash tool:

   ```bash
   pnpm test
   ```

   All tests must still pass.

6. **Review changes**

   Use the Bash tool:

   ```bash
   git diff
   ```

   Verify changes match refactoring intent.

7. **Commit**

   Use the Bash tool:

   ```bash
   git add <files>
   git commit -m "refactor: description of refactoring"
   ```

## Success Criteria

- [ ] Baseline tests pass before refactoring
- [ ] Baseline validation passes before refactoring
- [ ] All tests pass after refactoring
- [ ] Validation passes after refactoring
- [ ] No behavior changes (only structure changes)
- [ ] Changes committed with "refactor:" prefix

## Error Handling

| Situation                  | Resolution                           |
| -------------------------- | ------------------------------------ |
| Baseline tests fail        | Fix tests before refactoring         |
| Tests fail during refactor | Revert last change, try smaller step |
| Validation fails after     | Review changes for violations, fix   |
| Behavior changed           | Revert and reconsider approach       |

## Safe Refactoring Patterns

### Extract Function

1. Identify code block to extract
2. Write function with extracted code
3. Replace original code with function call
4. Run tests

### Rename

1. Rename symbol
2. Update all references
3. Run tests

### Move

1. Create new location
2. Move code
3. Update imports
4. Run tests
5. Remove old location

## Anti-Patterns to Avoid

- **Big bang refactor:** Don't change everything at once
- **Refactor + feature:** Don't add features while refactoring
- **No tests:** Don't refactor untested code without adding tests first

````

- [ ] **Step 3: Create README.md**

```markdown
# harness-refactoring

Safe refactoring with validation checkpoints.

## The Refactoring Process

1. Establish baseline (tests + validation pass)
2. Identify scope
3. Make incremental changes
4. Validate after changes
5. Run full test suite
6. Commit

## Usage

Invoke this skill when restructuring code without changing behavior.

## Key Principles

- **Tests first:** Never refactor without tests
- **Small steps:** One change at a time
- **Validate often:** Check after each step
- **No behavior change:** Refactoring is structure-only
````

- [ ] **Step 4: Run tests**

Run: `cd agents/skills && pnpm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add agents/skills/claude-code/harness-refactoring/
git commit -m "feat(skills): add harness-refactoring workflow skill for Claude Code"
```

---

## Chunk 4: Entropy Skills (Claude Code)

### Task 12: Create detect-doc-drift Skill

**Files:**

- Create: `agents/skills/claude-code/detect-doc-drift/skill.yaml`
- Create: `agents/skills/claude-code/detect-doc-drift/prompt.md`
- Create: `agents/skills/claude-code/detect-doc-drift/README.md`

- [ ] **Step 1: Create skill.yaml**

```yaml
# agents/skills/claude-code/detect-doc-drift/skill.yaml
name: detect-doc-drift
version: 1.0.0
description: Detect documentation that has drifted from code
platform: claude-code
triggers:
  - manual
  - on_pr
tools:
  - Bash
  - Read
  - Glob
cli_command: harness cleanup --type drift --json
category: entropy
depends_on: []
includes:
  - shared/cli-invocation.md
  - shared/json-parsing.md
  - shared/success-criteria/documentation.md
```

- [ ] **Step 2: Create prompt.md**

````markdown
# Detect Documentation Drift

Detect documentation that has drifted from the current code state.

## Context

Documentation drift occurs when code changes but docs aren't updated. Use this skill to find stale documentation that needs updating.

## Prerequisites

- `@harness-engineering/cli` installed
- `harness.config.json` configured with docsDir

## Steps

1. **Scan for drift** — Run the drift detection command:

   Use the Bash tool:

   ```bash
   harness cleanup --type drift --json
   ```
````

2. **Parse results** — Extract drift findings:

   ```json
   {
     "issues": [
       {
         "type": "drift",
         "file": "docs/api.md",
         "severity": "high",
         "message": "Function signature changed: foo(a) -> foo(a, b)",
         "sourceFile": "src/api.ts",
         "sourceLine": 42
       }
     ]
   }
   ```

3. **Categorize by severity**
   - **High:** Public API docs completely outdated
   - **Medium:** Missing parameters or return types
   - **Low:** Minor wording or formatting drift

4. **Report findings**

   For each issue:
   - Doc file and location
   - Source file that changed
   - What specifically drifted
   - Severity level

5. **Suggest resolutions**
   - For signature changes: Update doc to match new signature
   - For removed items: Remove from docs or mark deprecated
   - For new items: Add documentation

## Success Criteria

- [ ] All source files scanned
- [ ] Drift findings categorized by severity
- [ ] Each finding has actionable resolution guidance
- [ ] No false positives reported

## Error Handling

| Error             | Cause                  | Resolution                         |
| ----------------- | ---------------------- | ---------------------------------- |
| No docs directory | docsDir not configured | Set docsDir in harness.config.json |
| Parse error       | Malformed source file  | Fix syntax errors first            |

## Examples

### Example: Drift Detected

```
Documentation Drift Report

High Severity (2):
  docs/api.md:15 - Function signature changed
    Source: src/api.ts:42
    Old: createUser(name: string)
    New: createUser(name: string, email: string)
    Fix: Update docs to include email parameter

Medium Severity (1):
  docs/config.md:30 - Missing new option
    Source: src/config.ts:18
    Missing: timeout option added to config
    Fix: Document the new timeout option
```

````

- [ ] **Step 3: Create README.md**

```markdown
# detect-doc-drift

Detects documentation that has drifted from code.

## What It Detects

- Function/method signature changes
- New exports not documented
- Removed items still documented
- Parameter/return type mismatches

## Usage

Run periodically or before releases to find stale documentation.

## CLI Equivalent

```bash
harness cleanup --type drift --json
````

## Related Skills

- `align-documentation` - Auto-fix drift issues
- `cleanup-dead-code` - Find unused code

````

- [ ] **Step 4: Run tests**

Run: `cd agents/skills && pnpm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add agents/skills/claude-code/detect-doc-drift/
git commit -m "feat(skills): add detect-doc-drift entropy skill for Claude Code"
````

---

### Task 13: Create cleanup-dead-code Skill

**Files:**

- Create: `agents/skills/claude-code/cleanup-dead-code/skill.yaml`
- Create: `agents/skills/claude-code/cleanup-dead-code/prompt.md`
- Create: `agents/skills/claude-code/cleanup-dead-code/README.md`

- [ ] **Step 1: Create skill.yaml**

```yaml
# agents/skills/claude-code/cleanup-dead-code/skill.yaml
name: cleanup-dead-code
version: 1.0.0
description: Detect unused exports and dead code
platform: claude-code
triggers:
  - manual
tools:
  - Bash
  - Read
  - Glob
  - Grep
cli_command: harness cleanup --type dead-code --json
category: entropy
depends_on: []
includes:
  - shared/cli-invocation.md
  - shared/json-parsing.md
```

- [ ] **Step 2: Create prompt.md**

````markdown
# Cleanup Dead Code

Detect unused exports, unreferenced files, and dead code in the codebase.

## Context

Dead code increases maintenance burden and cognitive load. Use this skill to identify code that can be safely removed.

## Prerequisites

- `@harness-engineering/cli` installed
- TypeScript project (for accurate analysis)

## Steps

1. **Scan for dead code** — Run detection command:

   Use the Bash tool:

   ```bash
   harness cleanup --type dead-code --json
   ```
````

2. **Parse results** — Extract findings:

   ```json
   {
     "issues": [
       {
         "type": "unused-export",
         "file": "src/utils.ts",
         "line": 15,
         "name": "deprecatedHelper",
         "message": "Export is not imported anywhere"
       },
       {
         "type": "unreferenced-file",
         "file": "src/old-feature.ts",
         "message": "File is not imported by any other file"
       }
     ]
   }
   ```

3. **Categorize findings**
   - **Unused exports:** Exported but never imported
   - **Unreferenced files:** Not imported anywhere
   - **Dead branches:** Code paths that can't be reached

4. **Verify before removal**

   For each finding, check:
   - Is it used dynamically? (string-based imports)
   - Is it a public API entry point?
   - Is it used in tests only?

5. **Report safe removals**

   List items that can safely be removed with confidence level:
   - **High confidence:** No references found, not public API
   - **Medium confidence:** Test-only usage, verify intent
   - **Low confidence:** May have dynamic usage, investigate

## Success Criteria

- [ ] Unused exports identified
- [ ] Unreferenced files detected
- [ ] Each finding verified for safety
- [ ] Safe removal candidates clearly flagged

## Error Handling

| Error                | Cause              | Resolution                    |
| -------------------- | ------------------ | ----------------------------- |
| False positive       | Dynamic imports    | Mark as intentional in config |
| Entry points flagged | Public API exports | Exclude public API patterns   |

## Examples

### Example: Dead Code Found

```
Dead Code Report

Unused Exports (3):
  src/utils.ts:15 - deprecatedHelper [HIGH confidence]
    Not imported anywhere, safe to remove

  src/api.ts:42 - internalOnly [MEDIUM confidence]
    Only used in tests, verify if intentional

Unreferenced Files (1):
  src/old-feature.ts [HIGH confidence]
    No imports found, appears to be legacy code
```

````

- [ ] **Step 3: Create README.md**

```markdown
# cleanup-dead-code

Detects unused exports and dead code.

## What It Detects

- Exported functions/classes never imported
- Files not referenced by any other file
- Dead code branches (unreachable code)

## Usage

Run periodically to identify cleanup opportunities.

## CLI Equivalent

```bash
harness cleanup --type dead-code --json
````

## Caution

Always verify before removing:

- Dynamic imports may not be detected
- Public API entry points are intentionally unused internally
- Test utilities may only be used in test files

````

- [ ] **Step 4: Run tests**

Run: `cd agents/skills && pnpm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add agents/skills/claude-code/cleanup-dead-code/
git commit -m "feat(skills): add cleanup-dead-code entropy skill for Claude Code"
````

---

### Task 14: Create align-documentation Skill

**Files:**

- Create: `agents/skills/claude-code/align-documentation/skill.yaml`
- Create: `agents/skills/claude-code/align-documentation/prompt.md`
- Create: `agents/skills/claude-code/align-documentation/README.md`

- [ ] **Step 1: Create skill.yaml**

```yaml
# agents/skills/claude-code/align-documentation/skill.yaml
name: align-documentation
version: 1.0.0
description: Auto-fix documentation drift issues
platform: claude-code
triggers:
  - manual
tools:
  - Bash
  - Read
  - Write
  - Edit
cli_command: harness fix-drift --json
category: entropy
depends_on:
  - detect-doc-drift
includes:
  - shared/cli-invocation.md
  - shared/json-parsing.md
```

- [ ] **Step 2: Create prompt.md**

````markdown
# Align Documentation

Automatically fix documentation drift issues detected by detect-doc-drift.

## Context

After detecting drift, use this skill to automatically update documentation to match current code state.

## Prerequisites

- `@harness-engineering/cli` installed
- Run `detect-doc-drift` first to understand scope

## Steps

1. **Run auto-fix** — Execute fix-drift command:

   Use the Bash tool:

   ```bash
   harness fix-drift --json
   ```
````

2. **Parse results** — See what was fixed:

   ```json
   {
     "fixed": [
       {
         "file": "docs/api.md",
         "changes": ["Updated createUser signature", "Added email parameter documentation"]
       }
     ],
     "manual": [
       {
         "file": "docs/guide.md",
         "reason": "Requires human judgment to rewrite section"
       }
     ]
   }
   ```

3. **Review auto-fixes**

   Use the Bash tool to see changes:

   ```bash
   git diff docs/
   ```

4. **Verify fixes** — Re-run drift detection:

   Use the Bash tool:

   ```bash
   harness cleanup --type drift --json
   ```

   Should show fewer or no issues.

5. **Handle manual fixes**

   For items requiring manual attention:
   - Read the source code
   - Update documentation to match
   - Follow existing doc style

6. **Commit changes**

   Use the Bash tool:

   ```bash
   git add docs/
   git commit -m "docs: align documentation with code changes"
   ```

## Success Criteria

- [ ] Auto-fixable drift issues resolved
- [ ] Changes reviewed for accuracy
- [ ] Re-running detection shows improvement
- [ ] Manual fixes clearly identified
- [ ] Changes committed

## Error Handling

| Error            | Cause                          | Resolution                 |
| ---------------- | ------------------------------ | -------------------------- |
| No fixes applied | All issues need manual work    | Follow manual fix guidance |
| Incorrect fix    | Auto-fix made wrong assumption | Revert and fix manually    |

## Examples

### Example: Successful Auto-Fix

```
Documentation Alignment Complete

Auto-fixed (3 files):
  docs/api.md
    - Updated createUser signature
    - Added email parameter

  docs/config.md
    - Added timeout option documentation

Manual attention needed (1 file):
  docs/guide.md
    - Tutorial needs rewrite for new workflow
    - See src/workflow.ts for new approach
```

````

- [ ] **Step 3: Create README.md**

```markdown
# align-documentation

Auto-fixes documentation drift issues.

## What It Does

- Updates function signatures in docs
- Adds documentation for new parameters
- Removes documentation for removed items
- Flags complex changes for manual review

## Usage

Run after `detect-doc-drift` to automatically fix issues.

## CLI Equivalent

```bash
harness fix-drift --json
````

## Related Skills

- `detect-doc-drift` - Find drift first

````

- [ ] **Step 4: Run tests**

Run: `cd agents/skills && pnpm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add agents/skills/claude-code/align-documentation/
git commit -m "feat(skills): add align-documentation entropy skill for Claude Code"
````

---

## Chunk 5: Setup Skills (Claude Code)

### Task 15: Create initialize-harness-project Skill

**Files:**

- Create: `agents/skills/claude-code/initialize-harness-project/skill.yaml`
- Create: `agents/skills/claude-code/initialize-harness-project/prompt.md`
- Create: `agents/skills/claude-code/initialize-harness-project/README.md`

- [ ] **Step 1: Create skill.yaml**

```yaml
# agents/skills/claude-code/initialize-harness-project/skill.yaml
name: initialize-harness-project
version: 1.0.0
description: Scaffold a new harness-compliant project
platform: claude-code
triggers:
  - manual
tools:
  - Bash
  - Read
  - Write
  - Glob
cli_command: harness init
category: setup
depends_on: []
includes:
  - shared/cli-invocation.md
```

- [ ] **Step 2: Create prompt.md**

````markdown
# Initialize Harness Project

Scaffold a new project that follows harness engineering practices.

## Context

Use this skill when starting a new project or converting an existing project to use harness engineering practices.

## Prerequisites

- Node.js installed
- npm or pnpm available
- Target directory exists (can be empty or existing project)

## Steps

1. **Check prerequisites**

   Use the Bash tool:

   ```bash
   node --version && (pnpm --version || npm --version)
   ```
````

Ensure Node.js 18+ is installed.

2. **Navigate to project directory**

   Confirm the target directory:

   ```bash
   pwd && ls -la
   ```

3. **Run initialization**

   Use the Bash tool:

   ```bash
   harness init
   ```

   This creates:
   - `harness.config.json` - Configuration file
   - `AGENTS.md` - Context engineering file
   - `docs/` - Documentation directory

4. **Verify created files**

   Use the Bash tool:

   ```bash
   ls -la && cat harness.config.json
   ```

5. **Customize configuration**

   Edit `harness.config.json` to set:
   - Project name
   - Layer configuration
   - Documentation paths

6. **Run initial validation**

   Use the Bash tool:

   ```bash
   harness validate --json
   ```

   Should pass with no issues.

7. **Commit initial setup**

   Use the Bash tool:

   ```bash
   git add harness.config.json AGENTS.md docs/
   git commit -m "chore: initialize harness engineering"
   ```

## Success Criteria

- [ ] harness.config.json created and valid
- [ ] AGENTS.md created with basic structure
- [ ] docs/ directory exists
- [ ] Initial validation passes
- [ ] Files committed to git

## Error Handling

| Error             | Cause                       | Resolution                                |
| ----------------- | --------------------------- | ----------------------------------------- |
| CLI not found     | harness not installed       | `npm install -g @harness-engineering/cli` |
| Permission denied | Directory not writable      | Check permissions                         |
| Files exist       | Project already initialized | Use `harness init --force` to overwrite   |

## Examples

### Example: New Project

```
$ harness init

Initializing harness engineering...

Created:
  ✓ harness.config.json
  ✓ AGENTS.md
  ✓ docs/

Next steps:
  1. Edit harness.config.json to configure layers
  2. Update AGENTS.md with your project structure
  3. Run `harness validate` to verify setup
```

### Example: Existing Project

```
$ harness init

Found existing project. Adding harness engineering...

Created:
  ✓ harness.config.json
  ✓ AGENTS.md
  ~ docs/ (already exists, skipped)

Note: Review generated AGENTS.md and update with your existing structure.
```

````

- [ ] **Step 3: Create README.md**

```markdown
# initialize-harness-project

Scaffolds a new harness-compliant project.

## What It Creates

- `harness.config.json` - Project configuration
- `AGENTS.md` - Context engineering file
- `docs/` - Documentation directory

## Usage

Run in a new or existing project directory to add harness engineering support.

## CLI Equivalent

```bash
harness init
````

## Next Steps After Init

1. Configure layers in harness.config.json
2. Document your project structure in AGENTS.md
3. Run `harness validate` to verify

````

- [ ] **Step 4: Run tests**

Run: `cd agents/skills && pnpm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add agents/skills/claude-code/initialize-harness-project/
git commit -m "feat(skills): add initialize-harness-project setup skill for Claude Code"
````

---

### Task 16: Create add-harness-component Skill

**Files:**

- Create: `agents/skills/claude-code/add-harness-component/skill.yaml`
- Create: `agents/skills/claude-code/add-harness-component/prompt.md`
- Create: `agents/skills/claude-code/add-harness-component/README.md`

- [ ] **Step 1: Create skill.yaml**

```yaml
# agents/skills/claude-code/add-harness-component/skill.yaml
name: add-harness-component
version: 1.0.0
description: Add a component to an existing harness project
platform: claude-code
triggers:
  - manual
tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
cli_command: harness add
category: setup
depends_on:
  - initialize-harness-project
includes:
  - shared/cli-invocation.md
```

- [ ] **Step 2: Create prompt.md**

````markdown
# Add Harness Component

Add a new component (module, service, API, test) to an existing harness project.

## Context

Use this skill when adding new functionality to a harness-compliant project. Ensures new components follow the established patterns.

## Prerequisites

- Project initialized with `harness init`
- `harness.config.json` exists

## Steps

1. **Verify project setup**

   Use the Bash tool:

   ```bash
   cat harness.config.json
   ```
````

Confirm layers are configured.

2. **Determine component type**

   Available types:
   - `module` - Domain module (business logic)
   - `service` - Service layer (orchestration)
   - `api` - API endpoint (external interface)
   - `test` - Test suite

3. **Run add command**

   Use the Bash tool:

   ```bash
   harness add <type> --name <component-name>
   ```

   Examples:

   ```bash
   harness add module --name user
   harness add service --name auth
   harness add api --name users
   ```

4. **Verify created files**

   Use the Bash tool:

   ```bash
   ls -la src/<layer>/<component-name>/
   ```

5. **Update AGENTS.md**

   Add the new component to the knowledge map in AGENTS.md:

   Use the Edit tool to add under the appropriate section:

   ```markdown
   - `src/<layer>/<component>/` - Description of component
   ```

6. **Run validation**

   Use the Bash tool:

   ```bash
   harness validate --json && harness check-deps --json
   ```

   Ensure no violations introduced.

7. **Commit new component**

   Use the Bash tool:

   ```bash
   git add src/<layer>/<component>/ AGENTS.md
   git commit -m "feat: add <component-name> <type>"
   ```

## Success Criteria

- [ ] Component files created in correct layer
- [ ] Files follow project patterns
- [ ] AGENTS.md updated with new component
- [ ] Validation passes after addition
- [ ] Changes committed

## Error Handling

| Error                | Cause                     | Resolution                       |
| -------------------- | ------------------------- | -------------------------------- |
| Layer not configured | Type doesn't match config | Add layer to harness.config.json |
| Name conflict        | Component exists          | Choose different name            |
| Validation fails     | Layer violation           | Check component placement        |

## Component Templates

### Module Template

```
src/domain/<name>/
├── index.ts      # Public exports
├── types.ts      # Type definitions
└── <name>.ts     # Implementation
```

### Service Template

```
src/services/<name>/
├── index.ts      # Public exports
└── <name>.ts     # Service implementation
```

### API Template

```
src/api/<name>/
├── index.ts      # Route exports
├── handler.ts    # Request handlers
└── schema.ts     # Zod schemas
```

## Examples

### Example: Add User Module

```
$ harness add module --name user

Creating module: user

Created:
  ✓ src/domain/user/index.ts
  ✓ src/domain/user/types.ts
  ✓ src/domain/user/user.ts

Don't forget to:
  1. Update AGENTS.md with the new module
  2. Run `harness validate` to verify
```

````

- [ ] **Step 3: Create README.md**

```markdown
# add-harness-component

Adds components to an existing harness project.

## Component Types

- `module` - Domain/business logic
- `service` - Service layer
- `api` - API endpoints
- `test` - Test suites

## Usage

```bash
harness add <type> --name <name>
````

## CLI Equivalent

```bash
harness add module --name user
harness add service --name auth
harness add api --name users
```

## After Adding

1. Update AGENTS.md with new component
2. Run validation to verify placement
3. Commit changes

````

- [ ] **Step 4: Run tests**

Run: `cd agents/skills && pnpm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add agents/skills/claude-code/add-harness-component/
git commit -m "feat(skills): add add-harness-component setup skill for Claude Code"
````

---

## Chunk 6: Gemini CLI Skills

### Task 17: Create Gemini CLI Skill Variants

**Files:**

- Create: `agents/skills/gemini-cli/` (mirror of claude-code with tool name changes)

For each of the 11 Claude Code skills, create a Gemini CLI variant with these changes:

1. `platform: gemini-cli` in skill.yaml
2. Tool name mappings in prompt.md:
   - `Bash` → `shell`
   - `Read` → `read_file`
   - `Write` → `write_file`
   - `Edit` → `edit_file`
   - `Glob` → `find_files`
   - `Grep` → `search_files`

- [ ] **Step 1: Create directory structure**

Use the Bash tool:

```bash
mkdir -p agents/skills/gemini-cli/{validate-context-engineering,enforce-architecture,check-mechanical-constraints,harness-tdd,harness-code-review,harness-refactoring,detect-doc-drift,cleanup-dead-code,align-documentation,initialize-harness-project,add-harness-component}
```

- [ ] **Step 2: Copy and adapt validate-context-engineering**

Create `agents/skills/gemini-cli/validate-context-engineering/skill.yaml`:

```yaml
name: validate-context-engineering
version: 1.0.0
description: Validate repository context engineering practices (AGENTS.md, doc coverage, knowledge map)
platform: gemini-cli
triggers:
  - manual
  - on_pr
  - on_commit
tools:
  - shell
  - read_file
  - find_files
cli_command: harness validate --json
category: enforcement
depends_on: []
includes:
  - shared/cli-invocation.md
  - shared/json-parsing.md
  - shared/success-criteria/validation.md
```

Create prompt.md and README.md with `shell` instead of `Bash`, `read_file` instead of `Read`, etc.

- [ ] **Step 3: Copy and adapt remaining 10 skills**

For each skill, create the Gemini variant with updated tool names.

- [ ] **Step 4: Run tests to verify all skills validate**

Run: `cd agents/skills && pnpm test`
Expected: PASS (all 22 skills validate)

- [ ] **Step 5: Commit**

```bash
git add agents/skills/gemini-cli/
git commit -m "feat(skills): add Gemini CLI skill variants"
```

---

### Task 18: Final Validation and Documentation

**Files:**

- Create: `agents/skills/README.md`

- [ ] **Step 1: Run full test suite**

Use the Bash tool:

```bash
cd agents/skills && pnpm test
```

Expected: All tests pass

- [ ] **Step 2: Create README.md**

```markdown
# Harness Engineering Agent Skills

Agent skills for Claude Code and Gemini CLI that implement harness engineering practices.

## Structure
```

agents/skills/
├── shared/ # Shared prompt fragments
├── claude-code/ # Claude Code skills
├── gemini-cli/ # Gemini CLI skills
└── tests/ # Validation tests

```

## Available Skills

### Enforcement
- `validate-context-engineering` - Validate AGENTS.md, doc coverage, knowledge map
- `enforce-architecture` - Check layer boundaries and circular deps
- `check-mechanical-constraints` - Run all mechanical checks

### Workflow
- `harness-tdd` - Test-driven development guidance
- `harness-code-review` - Structured code review
- `harness-refactoring` - Safe refactoring process

### Entropy
- `detect-doc-drift` - Find stale documentation
- `cleanup-dead-code` - Find unused code
- `align-documentation` - Auto-fix doc drift

### Setup
- `initialize-harness-project` - Scaffold new project
- `add-harness-component` - Add components

## Usage

### Claude Code

```

/validate-context-engineering

```

### Gemini CLI

```

@validate-context-engineering

````

## Testing

```bash
pnpm test
````

## Adding New Skills

1. Create directory under `claude-code/` and `gemini-cli/`
2. Add `skill.yaml`, `prompt.md`, `README.md`
3. Run tests to validate

````

- [ ] **Step 3: Commit**

```bash
git add agents/skills/README.md
git commit -m "docs(skills): add skills package README"
````

- [ ] **Step 4: Update workspace**

Add skills to pnpm-workspace.yaml if needed:

Use the Bash tool:

```bash
cat pnpm-workspace.yaml
```

If not included, add `agents/skills` to packages list.

- [ ] **Step 5: Final commit**

```bash
git add pnpm-workspace.yaml
git commit -m "chore: add skills package to workspace"
```

---

## Summary

This plan implements all 11 agent skills for both Claude Code and Gemini CLI:

| Chunk | Tasks | Skills                                |
| ----- | ----- | ------------------------------------- |
| 1     | 1-5   | Test infrastructure, shared fragments |
| 2     | 6-8   | Enforcement skills (3)                |
| 3     | 9-11  | Workflow skills (3)                   |
| 4     | 12-14 | Entropy skills (3)                    |
| 5     | 15-16 | Setup skills (2)                      |
| 6     | 17-18 | Gemini variants, docs                 |

Total: 18 tasks, ~90 steps
