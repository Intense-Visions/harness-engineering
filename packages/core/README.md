# @harness-engineering/core

Core library for Harness Engineering toolkit - provides runtime APIs for context engineering, architectural constraints, agent feedback, and entropy management.

## Installation

```bash
pnpm add @harness-engineering/core
```

## Modules

### Validation Module

Cross-cutting validation utilities used by all other modules.

#### File Structure Validation

Verify project follows file structure conventions:

```typescript
import { validateFileStructure, type Convention } from '@harness-engineering/core';

const conventions: Convention[] = [
  {
    pattern: 'README.md',
    required: true,
    description: 'Project README',
    examples: ['README.md'],
  },
  {
    pattern: 'AGENTS.md',
    required: true,
    description: 'Knowledge map',
    examples: ['AGENTS.md'],
  },
];

const result = await validateFileStructure(conventions, './my-project');

if (result.ok) {
  console.log('Valid:', result.value.valid);
  console.log('Conformance:', result.value.conformance + '%');
  console.log('Missing:', result.value.missing);
} else {
  console.error('Error:', result.error.message);
}
```

#### Config Validation

Type-safe configuration validation with Zod:

```typescript
import { validateConfig } from '@harness-engineering/core';
import { z } from 'zod';

const ConfigSchema = z.object({
  version: z.number(),
  layers: z.array(
    z.object({
      name: z.string(),
      allowedDependencies: z.array(z.string()),
    })
  ),
});

const result = validateConfig(userConfig, ConfigSchema);

if (result.ok) {
  // TypeScript knows result.value matches ConfigSchema
  console.log('Config version:', result.value.version);
} else {
  console.error('Validation failed:', result.error.message);
  console.error('Suggestions:', result.error.suggestions);
}
```

#### Commit Message Validation

Validate commit messages follow conventional format:

```typescript
import { validateCommitMessage } from '@harness-engineering/core';

const result = validateCommitMessage('feat(core): add validation module', 'conventional');

if (result.ok) {
  if (result.value.valid) {
    console.log('Type:', result.value.type); // 'feat'
    console.log('Scope:', result.value.scope); // 'core'
    console.log('Breaking:', result.value.breaking); // false
  } else {
    console.log('Issues:', result.value.issues);
  }
}
```

### Context Engineering Module

Tools for validating and generating AGENTS.md knowledge maps.

#### AGENTS.md Validation

Validate the structure and links in an AGENTS.md file:

```typescript
import { validateAgentsMap } from '@harness-engineering/core';

const result = await validateAgentsMap('./AGENTS.md');

if (result.ok) {
  console.log('Valid:', result.value.valid);
  console.log('Sections:', result.value.sections.length);
  console.log('Broken links:', result.value.brokenLinks.length);
  console.log('Missing sections:', result.value.missingSections);
}
```

#### Documentation Coverage

Check how well your code is documented:

```typescript
import { checkDocCoverage } from '@harness-engineering/core';

const result = await checkDocCoverage('src', {
  docsDir: './docs',
  sourceDir: './src',
  excludePatterns: ['**/*.test.ts'],
});

if (result.ok) {
  console.log('Coverage:', result.value.coveragePercentage + '%');
  console.log('Gaps:', result.value.gaps);
}
```

#### Knowledge Map Integrity

Verify all links in your AGENTS.md point to existing files:

```typescript
import { validateKnowledgeMap } from '@harness-engineering/core';

const result = await validateKnowledgeMap('./');

if (result.ok) {
  console.log('Integrity:', result.value.integrity + '%');
  for (const broken of result.value.brokenLinks) {
    console.log(`Broken: ${broken.path} - ${broken.suggestion}`);
  }
}
```

#### AGENTS.md Generation

Auto-generate an AGENTS.md from your project structure:

```typescript
import { generateAgentsMap } from '@harness-engineering/core';

const result = await generateAgentsMap({
  rootDir: './',
  includePaths: ['**/*.md', 'src/**/*.ts'],
  excludePaths: ['node_modules/**'],
  sections: [{ name: 'API Docs', pattern: 'docs/api/**/*.md', description: 'API documentation' }],
});

if (result.ok) {
  console.log(result.value); // Generated markdown content
}
```

### Architectural Constraints Module

Tools for enforcing layered architecture and detecting dependency issues.

#### Layer Validation

Define and validate architectural layers:

```typescript
import { validateDependencies, defineLayer, TypeScriptParser } from '@harness-engineering/core';

const result = await validateDependencies({
  layers: [
    defineLayer('domain', ['src/domain/**'], []),
    defineLayer('services', ['src/services/**'], ['domain']),
    defineLayer('api', ['src/api/**'], ['services', 'domain']),
  ],
  rootDir: './src',
  parser: new TypeScriptParser(),
});

if (result.ok && !result.value.valid) {
  for (const violation of result.value.violations) {
    console.log(`${violation.file}:${violation.line} - ${violation.reason}`);
    console.log(`  ${violation.fromLayer} cannot import from ${violation.toLayer}`);
  }
}
```

#### Circular Dependency Detection

Find cycles in your dependency graph:

```typescript
import { detectCircularDepsInFiles, TypeScriptParser } from '@harness-engineering/core';

const result = await detectCircularDepsInFiles(
  ['src/a.ts', 'src/b.ts', 'src/c.ts'],
  new TypeScriptParser()
);

if (result.ok && result.value.hasCycles) {
  for (const cycle of result.value.cycles) {
    console.log('Cycle found:', cycle.cycle.join(' -> '));
  }
}
```

#### Boundary Validation

Validate data at module boundaries:

```typescript
import { z } from 'zod';
import { createBoundaryValidator } from '@harness-engineering/core';

const UserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

const validator = createBoundaryValidator(UserSchema, 'UserService.createUser');

const result = validator.parse(requestBody);
if (result.ok) {
  // result.value is typed as { email: string; name: string }
  createUser(result.value);
} else {
  console.error(result.error.suggestions);
}
```

### Entropy Management Module

Detect and fix codebase entropy: documentation drift, dead code, and pattern violations.

#### Quick Analysis

```typescript
import { EntropyAnalyzer } from '@harness-engineering/core';

const analyzer = new EntropyAnalyzer({
  rootDir: './src',
  analyze: {
    drift: true,
    deadCode: true,
    patterns: {
      patterns: [
        {
          name: 'max-exports',
          description: 'Limit exports per file',
          severity: 'warning',
          files: ['**/*.ts'],
          rule: { type: 'max-exports', count: 10 },
        },
      ],
    },
  },
  include: ['**/*.ts'],
  docPaths: ['docs/**/*.md'],
});

const result = await analyzer.analyze();

if (result.ok) {
  console.log(`Found ${result.value.summary.totalIssues} issues`);
  console.log(`${result.value.summary.fixableCount} can be auto-fixed`);
}
```

#### Full Analyzer Workflow

```typescript
import { EntropyAnalyzer, createFixes, applyFixes } from '@harness-engineering/core';

const analyzer = new EntropyAnalyzer({
  rootDir: './src',
  analyze: { drift: true, deadCode: true },
});

// Run analysis
const report = await analyzer.analyze();
if (!report.ok) throw new Error(report.error.message);

// Get suggestions for manual fixes
const suggestions = analyzer.getSuggestions();
console.log(`${suggestions.suggestions.length} suggestions generated`);

// Auto-fix safe issues
if (report.value.deadCode) {
  const fixes = createFixes(report.value.deadCode, {
    fixTypes: ['unused-imports', 'dead-files'],
    dryRun: true, // Preview first
  });

  console.log(
    'Preview:',
    fixes.map((f) => f.description)
  );

  // Apply for real
  await applyFixes(fixes, { dryRun: false, createBackup: true });
}
```

## Error Handling

All APIs use the `Result<T, E>` pattern for type-safe error handling:

```typescript
import { type Result, Ok, Err } from '@harness-engineering/core';

const result: Result<string, Error> = Ok('success');

if (result.ok) {
  console.log(result.value); // TypeScript knows this is string
} else {
  console.error(result.error); // TypeScript knows this is Error
}
```

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Type checking
pnpm typecheck

# Build
pnpm build

# Lint
pnpm lint
```

## License

MIT
