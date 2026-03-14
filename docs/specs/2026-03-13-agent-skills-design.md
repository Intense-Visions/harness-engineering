# Agent Skills Design Specification

**Date**: 2026-03-13
**Status**: Draft
**Component**: Agent Skills (`agents/skills/`)
**Prerequisites**: CLI (`@harness-engineering/cli` v1.0.0)

## Executive Summary

Agent Skills provide structured guidance for AI coding assistants (Claude Code, Gemini CLI) to validate, enforce, and maintain harness engineering practices. Skills wrap CLI commands for automation and provide workflow guidance for development processes.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Directory structure | Platform-specific with shared fragments | Clean separation, platform optimizations, easy to extend |
| Metadata format | YAML | Human-readable, standard for skill definitions |
| CLI invocation | Subprocess with `--json` | CLI already built, consistent output parsing |
| Workflow skills | Direct guidance (no CLI) | Process guidance doesn't map to single commands |
| Platforms | Claude Code + Gemini CLI | Primary agent platforms, similar capabilities |
| Testing | Schema validation + prompt linting | Declarative content needs structural verification |

---

## Section 1: Directory Structure

```
agents/
└── skills/
    ├── shared/                              # Shared prompt fragments
    │   ├── cli-invocation.md                # How to run harness CLI
    │   ├── json-parsing.md                  # How to parse --json output
    │   └── success-criteria/                # Reusable success criteria
    │       ├── validation.md
    │       ├── architecture.md
    │       └── documentation.md
    │
    ├── claude-code/                         # Claude Code skills
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
    ├── gemini-cli/                          # Gemini CLI skills (mirrors claude-code)
    │   ├── validate-context-engineering/
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
    └── tests/                               # Skill tests
        ├── schema.test.ts
        ├── prompt-lint.test.ts
        ├── includes.test.ts
        └── fixtures/
```

Each skill directory contains:
- `skill.yaml` — Metadata (name, version, triggers, tools)
- `prompt.md` — Skill instructions for the agent
- `README.md` — Human documentation

---

## Section 2: Skill Metadata Format

### Schema (`skill.yaml`)

```yaml
name: validate-context-engineering
version: 1.0.0
description: Validate repository context engineering practices

# Platform this skill is for
platform: claude-code  # claude-code | gemini-cli

# When this skill can be triggered
triggers:
  - manual           # User invokes explicitly
  - on_pr            # Run on pull request
  - on_commit        # Run on commit

# Tools the skill needs access to
tools:
  - Bash             # For CLI invocation
  - Read             # For file reading
  - Grep             # For searching
  - Glob             # For file finding

# CLI command this skill wraps (if applicable)
cli_command: harness validate --json

# Category for organization
category: enforcement  # enforcement | workflow | entropy | setup

# Dependencies on other skills (optional)
depends_on: []

# Shared prompt fragments to include (optional)
includes:
  - shared/cli-invocation.md
  - shared/json-parsing.md
```

### Zod Schema Definition

```typescript
import { z } from 'zod';

export const SkillMetadataSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
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

---

## Section 3: Prompt Structure

Each skill's `prompt.md` follows a consistent structure:

```markdown
# Skill Name

Brief description of what this skill does.

## Context

What situation this skill addresses and when to use it.

## Prerequisites

- Required tools/CLI installed
- Expected project state

## Steps

1. **Step Name** — Description
   - Specific actions to take
   - Expected outputs

2. **Step Name** — Description
   ...

## CLI Invocation

(For CLI-wrapper skills)

\`\`\`bash
harness <command> --json
\`\`\`

### Handling Output

- On success (exit 0): [what to do]
- On validation failure (exit 1): [what to do]
- On error (exit 2): [what to do]

## Success Criteria

Checklist of conditions that indicate the skill completed successfully:

- [ ] Criterion 1
- [ ] Criterion 2

## Error Handling

Common errors and how to address them:

| Error | Cause | Resolution |
|-------|-------|------------|
| Config not found | Missing harness.config.json | Run \`harness init\` first |

## Examples

### Example: Successful Run

[Show sample output and interpretation]

### Example: Handling Issues

[Show how to address common problems]
```

Required sections:
- `## Steps` — Always required
- `## Success Criteria` — Always required

Optional sections:
- `## CLI Invocation` — For CLI wrapper skills
- `## Error Handling` — Recommended for all skills
- `## Examples` — Recommended for complex skills

---

## Section 4: Skill Catalog

### 4.1 Enforcement Skills (CLI Wrappers)

| Skill | CLI Command | Purpose |
|-------|-------------|---------|
| `validate-context-engineering` | `harness validate --json` | Check AGENTS.md, doc coverage, knowledge map |
| `enforce-architecture` | `harness check-deps --json` | Validate layer boundaries, detect circular deps |
| `check-mechanical-constraints` | Both commands | Combined validation |

**Flow:**
1. Run CLI command with `--json`
2. Parse JSON output
3. Report findings with file locations
4. Suggest fixes for each issue

#### validate-context-engineering

```yaml
name: validate-context-engineering
version: 1.0.0
description: Validate repository context engineering practices (AGENTS.md, doc coverage, knowledge map)
platform: claude-code
triggers: [manual, on_pr, on_commit]
tools: [Bash, Read, Glob]
cli_command: harness validate --json
category: enforcement
```

**Success Criteria:**
- AGENTS.md exists and parses correctly
- All links in AGENTS.md resolve to existing files
- Documentation coverage meets threshold (default 80%)
- Knowledge map has no broken references

#### enforce-architecture

```yaml
name: enforce-architecture
version: 1.0.0
description: Validate architectural layer boundaries and detect circular dependencies
platform: claude-code
triggers: [manual, on_pr, on_commit]
tools: [Bash, Read, Glob]
cli_command: harness check-deps --json
category: enforcement
```

**Success Criteria:**
- No layer boundary violations
- No circular dependency chains
- All imports respect configured layer hierarchy

#### check-mechanical-constraints

```yaml
name: check-mechanical-constraints
version: 1.0.0
description: Run all mechanical constraint checks (validation + architecture)
platform: claude-code
triggers: [manual, on_pr]
tools: [Bash, Read, Glob]
cli_command: harness validate --json && harness check-deps --json
category: enforcement
depends_on: [validate-context-engineering, enforce-architecture]
```

**Success Criteria:**
- All validation checks pass
- All architecture checks pass

---

### 4.2 Workflow Skills (Direct Guidance)

| Skill | Purpose | Approach |
|-------|---------|----------|
| `harness-tdd` | Guide TDD workflow | Step-by-step process with validation |
| `harness-code-review` | Structured code review | Checklist + `harness agent review` |
| `harness-refactoring` | Safe refactoring | Validation before/after changes |

#### harness-tdd

```yaml
name: harness-tdd
version: 1.0.0
description: Guide test-driven development workflow with harness validation
platform: claude-code
triggers: [manual]
tools: [Bash, Read, Write, Edit, Glob, Grep]
category: workflow
```

**Steps:**
1. Understand the requirement
2. Write failing test first
3. Run test to confirm it fails
4. Write minimal implementation
5. Run test to confirm it passes
6. Run `harness validate --json`
7. Refactor if needed
8. Commit with descriptive message

**Success Criteria:**
- Test written before implementation
- Test fails initially
- Implementation passes test
- Harness validation passes
- Code committed

#### harness-code-review

```yaml
name: harness-code-review
version: 1.0.0
description: Structured code review with automated checks
platform: claude-code
triggers: [manual, on_pr]
tools: [Bash, Read, Glob, Grep]
cli_command: harness agent review
category: workflow
```

**Steps:**
1. Identify changes (files, functions)
2. Run automated checks (`harness validate && harness check-deps`)
3. Complete review checklist
4. Generate review with `harness agent review`
5. Summarize findings by severity

**Review Checklist:**
- [ ] Changes match stated intent
- [ ] No architectural violations
- [ ] Tests cover new/changed code
- [ ] Documentation updated if needed
- [ ] No obvious security issues

#### harness-refactoring

```yaml
name: harness-refactoring
version: 1.0.0
description: Safe refactoring with validation before and after changes
platform: claude-code
triggers: [manual]
tools: [Bash, Read, Write, Edit, Glob, Grep]
category: workflow
```

**Steps:**
1. Run baseline validation (`harness validate --json`)
2. Identify refactoring scope
3. Run tests to establish baseline
4. Apply refactoring changes
5. Run tests again (must still pass)
6. Run validation again (must still pass)
7. Commit changes

**Success Criteria:**
- Baseline validation passes
- Tests pass before refactoring
- Tests pass after refactoring
- Validation passes after refactoring
- No new issues introduced

---

### 4.3 Entropy Skills (CLI Wrappers)

| Skill | CLI Command | Purpose |
|-------|-------------|---------|
| `detect-doc-drift` | `harness cleanup --type drift --json` | Find docs that don't match code |
| `cleanup-dead-code` | `harness cleanup --type dead-code --json` | Find unused exports/files |
| `align-documentation` | `harness fix-drift --json` | Auto-fix doc drift issues |

#### detect-doc-drift

```yaml
name: detect-doc-drift
version: 1.0.0
description: Detect documentation that has drifted from code
platform: claude-code
triggers: [manual, on_pr]
tools: [Bash, Read, Glob]
cli_command: harness cleanup --type drift --json
category: entropy
```

**Success Criteria:**
- All source files scanned
- Drift findings categorized by severity (high/medium/low)
- Each finding has actionable resolution guidance

#### cleanup-dead-code

```yaml
name: cleanup-dead-code
version: 1.0.0
description: Detect unused exports and dead code
platform: claude-code
triggers: [manual]
tools: [Bash, Read, Glob, Grep]
cli_command: harness cleanup --type dead-code --json
category: entropy
```

**Success Criteria:**
- Unused exports identified
- Dead files detected
- Safe removal candidates flagged

#### align-documentation

```yaml
name: align-documentation
version: 1.0.0
description: Auto-fix documentation drift issues
platform: claude-code
triggers: [manual]
tools: [Bash, Read, Write, Edit]
cli_command: harness fix-drift --json
category: entropy
depends_on: [detect-doc-drift]
```

**Success Criteria:**
- Auto-fixable drift issues resolved
- Changes verified by re-running detection
- Manual fixes clearly identified if any remain

---

### 4.4 Setup Skills (CLI Wrappers)

| Skill | CLI Command | Purpose |
|-------|-------------|---------|
| `initialize-harness-project` | `harness init` | Scaffold new harness-compliant project |
| `add-harness-component` | `harness add <component>` | Add component to existing project |

#### initialize-harness-project

```yaml
name: initialize-harness-project
version: 1.0.0
description: Scaffold a new harness-compliant project
platform: claude-code
triggers: [manual]
tools: [Bash, Read, Write, Glob]
cli_command: harness init
category: setup
```

**Steps:**
1. Check prerequisites (empty directory, Node.js installed)
2. Gather project info (name, description)
3. Run `harness init`
4. Verify structure created
5. Run initial validation
6. Report success with next steps

**Success Criteria:**
- Project directory created with correct structure
- harness.config.json valid
- AGENTS.md generated
- Initial validation passes

#### add-harness-component

```yaml
name: add-harness-component
version: 1.0.0
description: Add a component to an existing harness project
platform: claude-code
triggers: [manual]
tools: [Bash, Read, Write, Edit, Glob]
cli_command: harness add <type> --name <name>
category: setup
depends_on: [initialize-harness-project]
```

**Component Types:**
- `module` — Domain module
- `service` — Service layer component
- `api` — API endpoint
- `test` — Test suite

**Success Criteria:**
- Component files created in correct layer
- AGENTS.md updated with new component
- Validation still passes after addition

---

## Section 5: Platform Differences

### Tool Mapping

| Action | Claude Code | Gemini CLI |
|--------|-------------|------------|
| Run shell command | `Bash` | `shell` |
| Read file | `Read` | `read_file` |
| Write file | `Write` | `write_file` |
| Edit file | `Edit` | `edit_file` |
| Search files | `Glob` | `find_files` |
| Search content | `Grep` | `search_files` |

### Skill Invocation

**Claude Code:**
```
Use the Skill tool or /skill-name shorthand
```

**Gemini CLI:**
```
Use activate_skill tool
```

### Implementation Approach

The `shared/` directory contains platform-agnostic content (logic, success criteria, error handling). Platform-specific `prompt.md` files reference shared concepts but use platform-appropriate tool names.

Differences between platforms are minimal (mostly tool names), so maintaining both versions is low overhead.

---

## Section 6: Testing Strategy

### Test Types

| Test Type | What It Checks |
|-----------|----------------|
| Schema validation | skill.yaml conforms to SkillMetadataSchema |
| Prompt linting | prompt.md has required sections |
| Link validation | File references in prompts resolve |
| Include validation | Shared fragments in `includes` exist |

### Test Structure

```
agents/skills/tests/
├── schema.test.ts          # Validate all skill.yaml files
├── prompt-lint.test.ts     # Check prompt.md structure
├── includes.test.ts        # Verify shared fragments exist
├── schema.ts               # Zod schema for skill.yaml
└── fixtures/
    └── invalid-skill.yaml  # Error case testing
```

### Schema Validation Test

```typescript
import { describe, it, expect } from 'vitest';
import { glob } from 'glob';
import { parse } from 'yaml';
import { readFileSync } from 'fs';
import { SkillMetadataSchema } from './schema';

describe('skill.yaml validation', () => {
  const skillFiles = glob.sync('**/skill.yaml', {
    cwd: 'agents/skills',
    ignore: ['**/node_modules/**', '**/tests/**']
  });

  it.each(skillFiles)('%s conforms to schema', (file) => {
    const content = readFileSync(`agents/skills/${file}`, 'utf-8');
    const parsed = parse(content);
    const result = SkillMetadataSchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });
});
```

### Prompt Lint Test

```typescript
import { describe, it, expect } from 'vitest';
import { glob } from 'glob';
import { readFileSync } from 'fs';

const REQUIRED_SECTIONS = ['## Steps', '## Success Criteria'];

describe('prompt.md structure', () => {
  const promptFiles = glob.sync('**/prompt.md', {
    cwd: 'agents/skills',
    ignore: ['**/shared/**', '**/tests/**']
  });

  it.each(promptFiles)('%s has required sections', (file) => {
    const content = readFileSync(`agents/skills/${file}`, 'utf-8');
    for (const section of REQUIRED_SECTIONS) {
      expect(content).toContain(section);
    }
  });
});
```

### Coverage Targets

- All skill.yaml files pass schema validation
- All prompt.md files have required sections
- All `includes` references resolve to existing files

---

## Section 7: Implementation Order

Following depth-first approach:

1. **Shared fragments** — cli-invocation.md, json-parsing.md, success-criteria/
2. **Test infrastructure** — schema.ts, test files
3. **Enforcement skills** — validate-context-engineering, enforce-architecture, check-mechanical-constraints
4. **Workflow skills** — harness-tdd, harness-code-review, harness-refactoring
5. **Entropy skills** — detect-doc-drift, cleanup-dead-code, align-documentation
6. **Setup skills** — initialize-harness-project, add-harness-component
7. **Gemini CLI variants** — Mirror all Claude Code skills

---

## Success Criteria

- [ ] All 11 skills implemented for Claude Code
- [ ] All 11 skills implemented for Gemini CLI
- [ ] Shared fragments reduce duplication
- [ ] All skills pass schema validation
- [ ] All prompts have required sections
- [ ] Skills successfully invoke CLI commands
- [ ] Workflow skills provide clear guidance

---

## Open Questions

None — all decisions made during design review.

---

## Next Steps

1. Create implementation plan using `writing-plans` skill
2. Implement shared fragments
3. Implement skills by category (enforcement → workflow → entropy → setup)
4. Create Gemini CLI variants
5. Add tests
