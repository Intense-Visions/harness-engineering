# Phase 2: Tooling & Automation - Design Specification

**Date**: 2026-03-12
**Status**: Draft
**Phase**: 2 of 4
**Prerequisites**: Phase 1 Core Library (`@harness-engineering/core` v0.5.0)

## Executive Summary

Phase 2 delivers the tooling and automation layer for harness engineering: a CLI for project validation and scaffolding, an ESLint plugin for architectural enforcement, a linter generator for custom rules, and agent skills for Claude Code and Gemini CLI.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| CLI language | TypeScript | Direct integration with core library, single language |
| CLI framework | Commander.js | Mature, well-documented, widely used |
| Distribution | npm global install | Standard Node ecosystem approach |
| Config format | JSON | Strict, unambiguous, universal tooling support |
| Linter approach | Code generation | YAML config generates actual ESLint rule files |
| Skill platforms | Claude Code + Gemini CLI | Primary agent platforms, similar interfaces |
| Implementation order | Depth-first by component | Follows harness engineering principles |
| Testing | Unit + integration | Solid coverage without over-engineering |

## Implementation Order

1. `@harness-engineering/cli` — Complete 100%
2. `@harness-engineering/eslint-plugin` — Complete 100%
3. `@harness-engineering/linter-gen` — Complete 100%
4. `agents/skills/` — Complete 100%

---

## Section 1: Package Structure

### New Packages

```
packages/
├── core/                 # existing - @harness-engineering/core
├── types/                # existing - @harness-engineering/types
├── cli/                  # NEW - @harness-engineering/cli
├── eslint-plugin/        # NEW - @harness-engineering/eslint-plugin
└── linter-gen/           # NEW - @harness-engineering/linter-gen

agents/
└── skills/               # NEW - Agent skills directory
    ├── validate-context-engineering/
    ├── enforce-architecture/
    ├── check-mechanical-constraints/
    ├── harness-tdd/
    ├── harness-code-review/
    ├── harness-refactoring/
    ├── detect-doc-drift/
    ├── cleanup-dead-code/
    ├── align-documentation/
    ├── initialize-harness-project/
    └── add-harness-component/
```

### Dependency Graph

```
types → core → cli
              → eslint-plugin
              → linter-gen (generates code for eslint-plugin)

skills → wrap CLI commands (invoke via subprocess or direct import)
```

---

## Section 2: CLI (`@harness-engineering/cli`)

### Package Structure

```
packages/cli/
├── src/
│   ├── index.ts           # Entry point, Commander setup
│   ├── commands/
│   │   ├── validate.ts    # harness validate
│   │   ├── check-deps.ts  # harness check-deps
│   │   ├── check-docs.ts  # harness check-docs
│   │   ├── init.ts        # harness init
│   │   ├── add.ts         # harness add <component>
│   │   ├── agent/
│   │   │   ├── run.ts     # harness agent run <task>
│   │   │   └── review.ts  # harness agent review
│   │   ├── cleanup.ts     # harness cleanup
│   │   └── fix-drift.ts   # harness fix-drift
│   ├── config/
│   │   └── loader.ts      # Load harness.config.json
│   ├── output/
│   │   ├── formatter.ts   # JSON, table, plain text output
│   │   └── colors.ts      # Terminal colors (chalk)
│   └── utils/
│       └── errors.ts      # CLI error handling
├── bin/
│   └── harness.ts         # #!/usr/bin/env node shebang
├── package.json
└── README.md
```

### Commands

| Command | Description | Core API Used |
|---------|-------------|---------------|
| `harness validate` | Run all validation checks | `validateFileStructure`, `validateAgentsMap` |
| `harness check-deps` | Validate dependency layers | `validateDependencies`, `detectCircularDeps` |
| `harness check-docs` | Check doc coverage | `checkDocCoverage`, `validateKnowledgeMap` |
| `harness init` | Scaffold new project | Templates + file generation |
| `harness add <component>` | Add component | Templates |
| `harness agent run <task>` | Run agent task | `requestPeerReview`, executor APIs |
| `harness agent review` | Agent code review | `createSelfReview` |
| `harness cleanup` | Detect entropy issues | `detectDocDrift`, `detectDeadCode` |
| `harness fix-drift` | Auto-fix issues | `autoFixEntropy` |

### Global Flags

- `--config <path>` — Custom config file path
- `--json` — Output as JSON (for agent consumption)
- `--verbose` — Detailed output
- `--quiet` — Minimal output

### Exit Codes

- `0` — Success
- `1` — Validation failed (issues found)
- `2` — Error (config not found, crash, etc.)

### Dependencies

```json
{
  "dependencies": {
    "@harness-engineering/core": "workspace:*",
    "commander": "^12.0.0",
    "chalk": "^5.3.0"
  }
}
```

---

## Section 3: ESLint Plugin (`@harness-engineering/eslint-plugin`)

### Package Structure

```
packages/eslint-plugin/
├── src/
│   ├── index.ts              # Plugin entry, exports rules + configs
│   ├── rules/
│   │   ├── no-layer-violation.ts      # Enforce layer boundaries
│   │   ├── no-circular-deps.ts        # Detect circular imports
│   │   ├── no-forbidden-imports.ts    # Block specific imports
│   │   ├── require-boundary-schema.ts # Zod at module boundaries
│   │   ├── enforce-doc-exports.ts     # Exported items must be documented
│   │   └── index.ts
│   ├── configs/
│   │   ├── recommended.ts    # Sensible defaults
│   │   ├── strict.ts         # All rules as errors
│   │   └── index.ts
│   └── utils/
│       ├── config-loader.ts  # Read harness.config.json for rules
│       └── ast-helpers.ts    # Common AST traversal utilities
├── package.json
└── README.md
```

### Rules

| Rule | Category | Description |
|------|----------|-------------|
| `no-layer-violation` | Architecture | Imports must respect layer hierarchy |
| `no-circular-deps` | Architecture | No circular import chains |
| `no-forbidden-imports` | Architecture | Block imports matching patterns |
| `require-boundary-schema` | Boundary | API exports must have Zod schema |
| `enforce-doc-exports` | Documentation | Public exports need JSDoc |

### Configuration Usage

```js
// eslint.config.js
import harness from '@harness-engineering/eslint-plugin';

export default [
  harness.configs.recommended,
  {
    rules: {
      '@harness-engineering/no-layer-violation': 'error',
    }
  }
];
```

### Rule Configuration from `harness.config.json`

```json
{
  "layers": [
    { "name": "types", "pattern": "src/types/**", "allowedDependencies": [] },
    { "name": "domain", "pattern": "src/domain/**", "allowedDependencies": ["types"] },
    { "name": "services", "pattern": "src/services/**", "allowedDependencies": ["types", "domain"] },
    { "name": "api", "pattern": "src/api/**", "allowedDependencies": ["types", "domain", "services"] }
  ],
  "forbiddenImports": [
    { "from": "src/services/**", "disallow": ["react", "src/ui/**"] }
  ],
  "boundaries": {
    "requireSchema": ["src/api/**/*.ts"]
  }
}
```

### Dependencies

```json
{
  "dependencies": {
    "@harness-engineering/core": "workspace:*",
    "@typescript-eslint/utils": "^7.0.0"
  },
  "peerDependencies": {
    "eslint": "^8.0.0 || ^9.0.0"
  }
}
```

---

## Section 4: Linter Generator (`@harness-engineering/linter-gen`)

### Package Structure

```
packages/linter-gen/
├── src/
│   ├── index.ts              # CLI entry + programmatic API
│   ├── parser/
│   │   └── config-parser.ts  # Parse harness-linter.yml
│   ├── generators/
│   │   ├── eslint-rule.ts    # Generate ESLint rule code
│   │   ├── rule-index.ts     # Generate rules/index.ts
│   │   └── templates/        # Handlebars/EJS templates
│   │       ├── import-restriction.ts.hbs
│   │       ├── boundary-validation.ts.hbs
│   │       └── dependency-graph.ts.hbs
│   ├── schema/
│   │   └── linter-config.ts  # Zod schema for harness-linter.yml
│   └── utils/
│       └── file-writer.ts    # Write generated files
├── package.json
└── README.md
```

### Input Format (`harness-linter.yml`)

```yaml
version: 1
output: ./generated/eslint-rules
rules:
  - name: no-ui-in-services
    type: import-restriction
    severity: error
    config:
      source: 'src/services/**'
      forbiddenImports:
        - 'src/ui/**'
        - 'react'
      message: 'Service layer cannot import UI code'

  - name: api-boundary-validation
    type: boundary-validation
    severity: error
    config:
      pattern: 'src/api/**/*.ts'
      requireZodSchema: true
      message: 'API endpoints must validate with Zod'

  - name: no-cycles
    type: dependency-graph
    severity: error
    config:
      entryPoints: ['src/index.ts']
      exclude: ['**/*.test.ts']
```

### Generated Output

```
generated/
└── eslint-rules/
    ├── no-ui-in-services.ts    # Generated rule implementation
    ├── api-boundary-validation.ts
    ├── no-cycles.ts
    └── index.ts                # Exports all generated rules
```

### CLI Usage

```bash
# Generate rules from config
harness-linter generate

# Generate with custom config path
harness-linter generate --config ./custom-linter.yml

# Validate config without generating
harness-linter validate
```

### Dependencies

```json
{
  "dependencies": {
    "@harness-engineering/core": "workspace:*",
    "yaml": "^2.3.0",
    "handlebars": "^4.7.0"
  }
}
```

---

## Section 5: Agent Skills

### Directory Structure

```
agents/skills/
├── validate-context-engineering/
│   ├── skill.yaml           # Metadata
│   ├── prompt.md            # Skill instructions
│   └── README.md            # Documentation
├── enforce-architecture/
├── check-mechanical-constraints/
├── harness-tdd/
├── harness-code-review/
├── harness-refactoring/
├── detect-doc-drift/
├── cleanup-dead-code/
├── align-documentation/
├── initialize-harness-project/
└── add-harness-component/
```

### Skill Metadata Format (`skill.yaml`)

```yaml
name: validate-context-engineering
version: 1.0.0
description: Validate repository context engineering practices (AGENTS.md, doc coverage, knowledge map)
platforms:
  - claude-code
  - gemini-cli
triggers:
  - manual
  - on_pr
  - on_commit
tools:
  - Bash
  - Read
  - Grep
  - Glob
cli_command: harness validate --json
```

### Skills and CLI Mapping

| Category | Skill | CLI Command |
|----------|-------|-------------|
| **Enforcement** | `validate-context-engineering` | `harness validate` |
| | `enforce-architecture` | `harness check-deps` |
| | `check-mechanical-constraints` | `harness validate && harness check-deps` |
| **Workflow** | `harness-tdd` | Uses core APIs directly |
| | `harness-code-review` | `harness agent review` |
| | `harness-refactoring` | Uses core APIs + validation |
| **Entropy** | `detect-doc-drift` | `harness cleanup --type drift` |
| | `cleanup-dead-code` | `harness cleanup --type dead-code` |
| | `align-documentation` | `harness fix-drift` |
| **Setup** | `initialize-harness-project` | `harness init` |
| | `add-harness-component` | `harness add` |

### Prompt Structure (`prompt.md`)

```markdown
# Validate Context Engineering

You are validating this repository's context engineering practices.

## Steps

1. Run `harness validate --json` to get structured results
2. Parse the JSON output
3. Report issues found with file locations
4. Suggest fixes for each issue

## Success Criteria

- AGENTS.md exists and is valid
- All links in AGENTS.md resolve
- Documentation coverage > 80%
- No broken links in knowledge map
```

### Platform Adaptation

- **Claude Code**: `skill.yaml` + `prompt.md` loaded via Skill tool
- **Gemini CLI**: Same structure, loaded via `activate_skill`

---

## Section 6: Shared Configuration Schema

### Location

`packages/types/src/config.ts`

### Schema Definition

```typescript
import { z } from 'zod';

export const LayerSchema = z.object({
  name: z.string(),
  pattern: z.string(),  // glob pattern
  allowedDependencies: z.array(z.string()),
});

export const ForbiddenImportSchema = z.object({
  from: z.string(),     // glob pattern for source files
  disallow: z.array(z.string()),  // patterns to block
  message: z.string().optional(),
});

export const BoundaryConfigSchema = z.object({
  requireSchema: z.array(z.string()),  // glob patterns requiring Zod
});

export const AgentConfigSchema = z.object({
  executor: z.enum(['subprocess', 'cloud', 'noop']).default('subprocess'),
  timeout: z.number().default(300000),  // 5 min default
  skills: z.array(z.string()).optional(),
});

export const HarnessConfigSchema = z.object({
  version: z.literal(1),

  // Project info
  name: z.string().optional(),
  rootDir: z.string().default('.'),

  // Architecture
  layers: z.array(LayerSchema).optional(),
  forbiddenImports: z.array(ForbiddenImportSchema).optional(),
  boundaries: BoundaryConfigSchema.optional(),

  // Context engineering
  agentsMapPath: z.string().default('./AGENTS.md'),
  docsDir: z.string().default('./docs'),

  // Agent settings
  agent: AgentConfigSchema.optional(),

  // Entropy management
  entropy: z.object({
    excludePatterns: z.array(z.string()).default(['**/node_modules/**', '**/*.test.ts']),
    autoFix: z.boolean().default(false),
  }).optional(),
});

export type HarnessConfig = z.infer<typeof HarnessConfigSchema>;
```

### Example Configuration

```json
{
  "version": 1,
  "name": "my-project",
  "layers": [
    { "name": "types", "pattern": "src/types/**", "allowedDependencies": [] },
    { "name": "domain", "pattern": "src/domain/**", "allowedDependencies": ["types"] },
    { "name": "services", "pattern": "src/services/**", "allowedDependencies": ["types", "domain"] },
    { "name": "api", "pattern": "src/api/**", "allowedDependencies": ["types", "domain", "services"] }
  ],
  "forbiddenImports": [
    { "from": "src/services/**", "disallow": ["react", "src/ui/**"] }
  ],
  "boundaries": {
    "requireSchema": ["src/api/**/*.ts"]
  },
  "agentsMapPath": "./AGENTS.md",
  "docsDir": "./docs",
  "entropy": {
    "excludePatterns": ["**/node_modules/**", "**/dist/**"],
    "autoFix": false
  }
}
```

### Config Loading

```typescript
// packages/core/src/config/loader.ts
export function loadConfig(configPath?: string): Result<HarnessConfig, ConfigError> {
  const path = configPath ?? findConfigFile();
  const raw = readJsonFile(path);
  return validateConfig(raw, HarnessConfigSchema);
}
```

---

## Section 7: Testing Strategy

### Structure Per Package

```
packages/cli/
├── tests/
│   ├── commands/
│   │   ├── validate.test.ts      # Unit tests for validate command
│   │   ├── check-deps.test.ts
│   │   └── init.test.ts
│   ├── integration/
│   │   ├── cli-validate.test.ts  # Full CLI invocation tests
│   │   └── cli-init.test.ts
│   └── fixtures/
│       ├── valid-project/
│       └── invalid-project/

packages/eslint-plugin/
├── tests/
│   ├── rules/
│   │   ├── no-layer-violation.test.ts
│   │   ├── no-circular-deps.test.ts
│   │   └── no-forbidden-imports.test.ts
│   └── fixtures/
│       ├── layer-violations/
│       └── valid-layers/

packages/linter-gen/
├── tests/
│   ├── parser/
│   │   └── config-parser.test.ts
│   ├── generators/
│   │   └── eslint-rule.test.ts
│   └── fixtures/
│       ├── sample-linter.yml
│       └── expected-output/
```

### Testing Approach by Component

| Component | Unit Tests | Integration Tests |
|-----------|------------|-------------------|
| **CLI** | Command handlers, config loading, output formatting | Spawn CLI process, verify exit codes and output |
| **ESLint Plugin** | Rule logic using `RuleTester` | Run ESLint on fixture projects |
| **Linter-Gen** | YAML parsing, template rendering | Generate rules, verify output matches expected |
| **Skills** | N/A (declarative) | Validate skill.yaml schema, lint prompt.md |

### ESLint Rule Testing Pattern

```typescript
import { RuleTester } from '@typescript-eslint/rule-tester';
import rule from '../src/rules/no-layer-violation';

const ruleTester = new RuleTester();

ruleTester.run('no-layer-violation', rule, {
  valid: [
    { code: `import { User } from '../types/user'`, filename: 'src/domain/user.ts' },
  ],
  invalid: [
    {
      code: `import { handler } from '../api/handler'`,
      filename: 'src/types/user.ts',
      errors: [{ messageId: 'layerViolation' }]
    },
  ],
});
```

### CLI Integration Testing Pattern

```typescript
import { execSync } from 'child_process';

describe('harness validate', () => {
  it('returns 0 for valid project', () => {
    const result = execSync('harness validate', {
      cwd: './fixtures/valid-project'
    });
    expect(result.status).toBe(0);
  });

  it('returns 1 for invalid project with JSON output', () => {
    const result = execSync('harness validate --json', {
      cwd: './fixtures/invalid-project'
    });
    const output = JSON.parse(result.stdout);
    expect(output.valid).toBe(false);
    expect(output.errors).toHaveLength(2);
  });
});
```

### Coverage Targets

- All packages: >80% line coverage
- Critical paths (config loading, rule matching): >95%

---

## Success Criteria

From the original Phase 2 spec:

- [ ] CLI scaffolds harness-compliant project in <5 minutes
- [ ] Linters catch >90% of architectural violations
- [ ] Skills work in Claude Code + Gemini CLI
- [ ] All packages have >80% test coverage
- [ ] Second reference example (`api-service`) demonstrates Phase 2 tooling

---

## Open Questions

None — all decisions have been made during design review.

---

## Next Steps

1. Create detailed implementation plan using `writing-plans` skill
2. Implement CLI package (depth-first)
3. Implement ESLint plugin
4. Implement linter generator
5. Create agent skills
