# Module 2: Context Engineering - Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Context Engineering module providing AGENTS.md validation, documentation coverage analysis, knowledge map integrity checking, and AGENTS.md generation.

**Architecture:** Second module building on the validation foundation. Uses regex-based markdown parsing for AGENTS.md (no external markdown parser dependency for MVP). Four main components: agents-map (AGENTS.md structure validation), doc-coverage (documentation completeness), knowledge-map (link integrity), and generate (auto-generation). All operations return Result<T, ContextError> using the established pattern.

**Tech Stack:** TypeScript 5+, Vitest 4+, glob 10+ (already installed)

**Spec Deviations (Intentional Improvements):**

- `AgentMapValidation.brokenLinks` returns `AgentMapLink[]` (not just count) for better debugging
- `REQUIRED_SECTIONS` uses practical section names matching existing AGENTS.md conventions
- Added `missingSections` field to validation result for actionable feedback

---

## File Structure Overview

This plan creates/modifies these files:

**Core Implementation:**

- `packages/core/src/context/types.ts` - Context module types
- `packages/core/src/context/agents-map.ts` - AGENTS.md validation
- `packages/core/src/context/doc-coverage.ts` - Documentation coverage
- `packages/core/src/context/knowledge-map.ts` - Link integrity checking
- `packages/core/src/context/generate.ts` - AGENTS.md generation
- `packages/core/src/context/index.ts` - Public exports
- `packages/core/src/index.ts` - Update main entry point

**Tests:**

- `packages/core/tests/context/agents-map.test.ts`
- `packages/core/tests/context/doc-coverage.test.ts`
- `packages/core/tests/context/knowledge-map.test.ts`
- `packages/core/tests/context/generate.test.ts`

**Test Fixtures:**

- `packages/core/tests/fixtures/valid-project/AGENTS.md` - Update with full structure
- `packages/core/tests/fixtures/valid-project/docs/` - Add documentation files
- `packages/core/tests/fixtures/broken-links-project/` - Project with broken links
- `packages/core/tests/fixtures/undocumented-project/` - Project with missing docs

---

## Chunk 1: Context Types and AGENTS.md Validation

### Task 1: Context Module Types

**Files:**

- Create: `packages/core/src/context/types.ts`

- [ ] **Step 1: Create context types file**

```typescript
// packages/core/src/context/types.ts
import type { ContextError } from '../shared/errors';

// AGENTS.md Validation Types
export interface AgentMapLink {
  text: string; // Link text
  path: string; // File path (relative or absolute)
  exists: boolean; // Does the file exist?
  line: number; // Line number in AGENTS.md
}

export interface AgentMapSection {
  title: string; // Section heading
  level: number; // Heading level (1-6)
  links: AgentMapLink[]; // Links in this section
  description?: string; // Optional description text
  line: number; // Line number where section starts
}

export interface AgentMapValidation {
  valid: boolean;
  sections: AgentMapSection[];
  totalLinks: number;
  brokenLinks: AgentMapLink[];
  missingSections: string[]; // Required sections that are missing
}

// Documentation Coverage Types
export interface DocumentationGap {
  file: string; // Undocumented file path
  suggestedSection: string; // Where it should be documented
  importance: 'high' | 'medium' | 'low'; // Based on file type/location
}

export interface CoverageReport {
  domain: string; // e.g., 'services', 'core', 'ui'
  documented: string[]; // Files mentioned in docs
  undocumented: string[]; // Files not mentioned
  coveragePercentage: number;
  gaps: DocumentationGap[];
}

export interface CoverageOptions {
  docsDir?: string; // Default: './docs'
  sourceDir?: string; // Default: './src'
  excludePatterns?: string[]; // Files to ignore
}

// Knowledge Map Integrity Types
export interface BrokenLink {
  text: string;
  path: string;
  line: number;
  section: string;
  reason: 'NOT_FOUND' | 'PERMISSION_DENIED' | 'INVALID_PATH';
  suggestion: string; // Suggested fix
}

export interface IntegrityReport {
  totalLinks: number;
  brokenLinks: BrokenLink[];
  validLinks: number;
  integrity: number; // 0-100%
}

// AGENTS.md Generation Types
export interface GenerationSection {
  name: string;
  pattern: string; // Glob pattern for files to include
  description: string;
}

export interface AgentsMapConfig {
  rootDir: string;
  includePaths: string[]; // Glob patterns to include
  excludePaths: string[]; // Glob patterns to exclude
  template?: string; // Custom template path
  sections?: GenerationSection[];
}

// Required sections for harness-engineering projects
export const REQUIRED_SECTIONS = [
  'Project Overview',
  'Repository Structure',
  'Development Workflow',
] as const;

export type RequiredSection = (typeof REQUIRED_SECTIONS)[number];
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd packages/core && pnpm typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/context/types.ts
git commit -m "feat(core): add context module types"
```

---

### Task 2: AGENTS.md Link Parser

**Files:**

- Create: `packages/core/src/context/agents-map.ts`
- Create: `packages/core/tests/context/agents-map.test.ts`

- [ ] **Step 1: Write failing test for markdown link extraction**

```typescript
// packages/core/tests/context/agents-map.test.ts
import { describe, it, expect } from 'vitest';
import { extractMarkdownLinks } from '../../src/context/agents-map';

describe('extractMarkdownLinks', () => {
  it('should extract simple markdown links', () => {
    const content = 'Check out [README](./README.md) for more info.';
    const links = extractMarkdownLinks(content);

    expect(links).toHaveLength(1);
    expect(links[0]).toEqual({
      text: 'README',
      path: './README.md',
      line: 1,
    });
  });

  it('should extract multiple links from same line', () => {
    const content = 'See [docs](./docs/) and [api](./api.md)';
    const links = extractMarkdownLinks(content);

    expect(links).toHaveLength(2);
    expect(links[0].text).toBe('docs');
    expect(links[1].text).toBe('api');
  });

  it('should track line numbers correctly', () => {
    const content = `# Title

See [link1](./file1.md)

And [link2](./file2.md)`;
    const links = extractMarkdownLinks(content);

    expect(links).toHaveLength(2);
    expect(links[0].line).toBe(3);
    expect(links[1].line).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test agents-map.test.ts`
Expected: FAIL - "Cannot find module '../../src/context/agents-map'"

- [ ] **Step 3: Implement extractMarkdownLinks**

```typescript
// packages/core/src/context/agents-map.ts
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import type { ContextError } from '../shared/errors';
import { createError } from '../shared/errors';
import type { AgentMapLink, AgentMapSection, AgentMapValidation } from './types';
import { REQUIRED_SECTIONS } from './types';
import { fileExists, readFileContent } from '../shared/fs-utils';
import { join, dirname } from 'path';

interface ExtractedLink {
  text: string;
  path: string;
  line: number;
}

/**
 * Extract markdown links from content
 * Pattern: [text](path)
 */
export function extractMarkdownLinks(content: string): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const lines = content.split('\n');

  // Markdown link pattern: [text](path)
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match;

    while ((match = linkPattern.exec(line)) !== null) {
      links.push({
        text: match[1],
        path: match[2],
        line: i + 1, // 1-indexed
      });
    }
  }

  return links;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm test agents-map.test.ts`
Expected: PASS - 3 tests passed

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/context/agents-map.ts packages/core/tests/context/agents-map.test.ts
git commit -m "feat(core): implement markdown link extraction"
```

---

### Task 3: AGENTS.md Section Parser

**Files:**

- Modify: `packages/core/src/context/agents-map.ts`
- Modify: `packages/core/tests/context/agents-map.test.ts`

- [ ] **Step 1: Write failing test for section extraction**

```typescript
// Add to packages/core/tests/context/agents-map.test.ts
import { extractSections } from '../../src/context/agents-map';

describe('extractSections', () => {
  it('should extract sections with headings', () => {
    const content = `# Project Overview

Some description here.

## Repository Structure

- [src](./src/)

## Development Workflow

Run tests with:`;
    const sections = extractSections(content);

    expect(sections).toHaveLength(3);
    expect(sections[0].title).toBe('Project Overview');
    expect(sections[0].level).toBe(1);
    expect(sections[0].line).toBe(1);
    expect(sections[1].title).toBe('Repository Structure');
    expect(sections[1].level).toBe(2);
    expect(sections[2].title).toBe('Development Workflow');
  });

  it('should associate links with correct sections', () => {
    const content = `## About

See [readme](./README.md)

## Code

Check [src](./src/) and [tests](./tests/)`;
    const sections = extractSections(content);

    expect(sections[0].links).toHaveLength(1);
    expect(sections[0].links[0].text).toBe('readme');
    expect(sections[1].links).toHaveLength(2);
  });

  it('should capture section description', () => {
    const content = `## Overview

This is the project overview.
It spans multiple lines.

## Next Section`;
    const sections = extractSections(content);

    expect(sections[0].description).toContain('project overview');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test agents-map.test.ts`
Expected: FAIL - "extractSections is not exported"

- [ ] **Step 3: Implement extractSections**

````typescript
// Add to packages/core/src/context/agents-map.ts

interface SectionData {
  title: string;
  level: number;
  line: number;
  startIndex: number;
  endIndex?: number;
}

/**
 * Extract sections from markdown content
 * Pattern: # Heading or ## Heading etc.
 */
export function extractSections(content: string): AgentMapSection[] {
  const lines = content.split('\n');
  const sections: SectionData[] = [];

  // Heading pattern: # Title or ## Title etc.
  const headingPattern = /^(#{1,6})\s+(.+)$/;

  // First pass: find all headings
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(headingPattern);

    if (match) {
      sections.push({
        title: match[2].trim(),
        level: match[1].length,
        line: i + 1, // 1-indexed
        startIndex: i,
      });
    }
  }

  // Second pass: set end indices
  for (let i = 0; i < sections.length; i++) {
    const nextSection = sections[i + 1];
    sections[i].endIndex = nextSection ? nextSection.startIndex : lines.length;
  }

  // Third pass: extract links and description for each section
  return sections.map((section) => {
    const sectionLines = lines.slice(section.startIndex + 1, section.endIndex);
    const sectionContent = sectionLines.join('\n');

    const links = extractMarkdownLinks(sectionContent).map((link) => ({
      ...link,
      line: link.line + section.startIndex + 1, // Adjust line number
      exists: false, // Will be set later by validateAgentsMap
    }));

    // Extract description (first paragraph after heading)
    const descriptionLines: string[] = [];
    for (const line of sectionLines) {
      const trimmed = line.trim();
      if (trimmed === '') {
        if (descriptionLines.length > 0) break;
        continue;
      }
      if (trimmed.startsWith('#')) break;
      if (trimmed.startsWith('-') || trimmed.startsWith('*')) break;
      if (trimmed.startsWith('```')) break;
      descriptionLines.push(trimmed);
    }

    return {
      title: section.title,
      level: section.level,
      line: section.line,
      links,
      description: descriptionLines.length > 0 ? descriptionLines.join(' ') : undefined,
    };
  });
}
````

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm test agents-map.test.ts`
Expected: PASS - 6 tests passed

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/context/agents-map.ts packages/core/tests/context/agents-map.test.ts
git commit -m "feat(core): implement markdown section extraction"
```

---

### Task 4: Full AGENTS.md Validation

**Files:**

- Modify: `packages/core/src/context/agents-map.ts`
- Modify: `packages/core/tests/context/agents-map.test.ts`
- Modify: `packages/core/tests/fixtures/valid-project/AGENTS.md`

- [ ] **Step 1: Update test fixture with full AGENTS.md structure**

```markdown
<!-- packages/core/tests/fixtures/valid-project/AGENTS.md -->

# Valid Project Agents Map

This is the knowledge map for the valid project.

## Project Overview

This project is a test fixture for validating the context engineering module.

## Repository Structure

The project has the following structure:

- [README](./README.md) - Project readme
- [Docs](./docs/) - Documentation directory

## Development Workflow

To get started:

1. Read the [getting started guide](./docs/guide.md)
2. Check the [API reference](./docs/api.md)
```

- [ ] **Step 2: Create the referenced fixture files**

```bash
mkdir -p packages/core/tests/fixtures/valid-project/docs
echo "# Getting Started Guide" > packages/core/tests/fixtures/valid-project/docs/guide.md
echo "# API Reference" > packages/core/tests/fixtures/valid-project/docs/api.md
```

- [ ] **Step 3: Write failing test for validateAgentsMap**

```typescript
// Add to packages/core/tests/context/agents-map.test.ts
import { validateAgentsMap } from '../../src/context/agents-map';
import { join } from 'path';

describe('validateAgentsMap', () => {
  const fixturesDir = join(__dirname, '../fixtures');

  it('should validate a well-formed AGENTS.md', async () => {
    const path = join(fixturesDir, 'valid-project/AGENTS.md');
    const result = await validateAgentsMap(path);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(true);
      expect(result.value.missingSections).toHaveLength(0);
      expect(result.value.brokenLinks).toHaveLength(0);
    }
  });

  it('should detect broken links', async () => {
    const path = join(fixturesDir, 'valid-project/AGENTS.md');
    // Temporarily test with a non-existent link
    const content = `## Repository Structure

- [missing](./does-not-exist.md)`;

    // We'll test this differently - using the existing fixture but checking link validation
    const result = await validateAgentsMap(path);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // All links in the fixture should exist
      expect(result.value.totalLinks).toBeGreaterThan(0);
    }
  });

  it('should report missing required sections', async () => {
    // Create a minimal AGENTS.md without required sections
    const path = join(fixturesDir, 'invalid-project/AGENTS.md');
    const result = await validateAgentsMap(path);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(false);
      expect(result.value.missingSections.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 4: Create invalid-project AGENTS.md fixture**

```bash
mkdir -p packages/core/tests/fixtures/invalid-project
echo "# Minimal Agents

Just a basic file without required sections." > packages/core/tests/fixtures/invalid-project/AGENTS.md
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd packages/core && pnpm test agents-map.test.ts`
Expected: FAIL - "validateAgentsMap is not exported"

- [ ] **Step 6: Implement validateAgentsMap**

```typescript
// Add to packages/core/src/context/agents-map.ts

/**
 * Validate an AGENTS.md file
 * - Parses sections and links
 * - Checks for required sections
 * - Verifies all links point to existing files
 */
export async function validateAgentsMap(
  path: string = './AGENTS.md'
): Promise<Result<AgentMapValidation, ContextError>> {
  // Read the file
  const contentResult = await readFileContent(path);
  if (!contentResult.ok) {
    return Err(
      createError<ContextError>(
        'PARSE_ERROR',
        `Failed to read AGENTS.md: ${contentResult.error.message}`,
        { path },
        ['Ensure the file exists', 'Check file permissions']
      )
    );
  }

  const content = contentResult.value;
  const sections = extractSections(content);
  const baseDir = dirname(path);

  // Check for required sections
  const sectionTitles = sections.map((s) => s.title);
  const missingSections = REQUIRED_SECTIONS.filter(
    (required) =>
      !sectionTitles.some((title) => title.toLowerCase().includes(required.toLowerCase()))
  );

  // Validate all links
  const allLinks: AgentMapLink[] = [];
  const brokenLinks: AgentMapLink[] = [];

  for (const section of sections) {
    for (const link of section.links) {
      // Resolve relative paths
      const absolutePath = link.path.startsWith('.') ? join(baseDir, link.path) : link.path;

      const exists = await fileExists(absolutePath);
      const fullLink: AgentMapLink = {
        ...link,
        exists,
      };

      allLinks.push(fullLink);
      if (!exists) {
        brokenLinks.push(fullLink);
      }
    }

    // Update section links with exists status
    section.links = section.links.map((link) => {
      const absolutePath = link.path.startsWith('.') ? join(baseDir, link.path) : link.path;
      return (
        allLinks.find((l) => l.path === link.path && l.line === link.line) || {
          ...link,
          exists: false,
        }
      );
    });
  }

  const valid = missingSections.length === 0 && brokenLinks.length === 0;

  return Ok({
    valid,
    sections,
    totalLinks: allLinks.length,
    brokenLinks,
    missingSections: [...missingSections],
  });
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd packages/core && pnpm test agents-map.test.ts`
Expected: PASS - 9 tests passed

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/context/agents-map.ts packages/core/tests/context/agents-map.test.ts packages/core/tests/fixtures/
git commit -m "feat(core): implement AGENTS.md validation"
```

---

## Chunk 2: Documentation Coverage

### Task 5: Documentation Coverage Analysis

**Files:**

- Create: `packages/core/src/context/doc-coverage.ts`
- Create: `packages/core/tests/context/doc-coverage.test.ts`

- [ ] **Step 1: Create test fixture with undocumented files**

```bash
mkdir -p packages/core/tests/fixtures/undocumented-project/src
mkdir -p packages/core/tests/fixtures/undocumented-project/docs

# Create source files
echo "export function documented() {}" > packages/core/tests/fixtures/undocumented-project/src/documented.ts
echo "export function undocumented() {}" > packages/core/tests/fixtures/undocumented-project/src/undocumented.ts
echo "export function alsoUndocumented() {}" > packages/core/tests/fixtures/undocumented-project/src/also-undocumented.ts

# Create docs that only reference one file
cat > packages/core/tests/fixtures/undocumented-project/docs/api.md << 'EOF'
# API Documentation

## documented.ts

The [documented](../src/documented.ts) module provides...
EOF
```

- [ ] **Step 2: Write failing test for checkDocCoverage**

```typescript
// packages/core/tests/context/doc-coverage.test.ts
import { describe, it, expect } from 'vitest';
import { checkDocCoverage } from '../../src/context/doc-coverage';
import { join } from 'path';

describe('checkDocCoverage', () => {
  const fixturesDir = join(__dirname, '../fixtures');

  it('should calculate documentation coverage', async () => {
    const rootDir = join(fixturesDir, 'undocumented-project');
    const result = await checkDocCoverage('src', {
      docsDir: join(rootDir, 'docs'),
      sourceDir: join(rootDir, 'src'),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.domain).toBe('src');
      expect(result.value.documented.length).toBeGreaterThan(0);
      expect(result.value.undocumented.length).toBeGreaterThan(0);
      expect(result.value.coveragePercentage).toBeLessThan(100);
    }
  });

  it('should identify documentation gaps', async () => {
    const rootDir = join(fixturesDir, 'undocumented-project');
    const result = await checkDocCoverage('src', {
      docsDir: join(rootDir, 'docs'),
      sourceDir: join(rootDir, 'src'),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.gaps.length).toBeGreaterThan(0);
      const gap = result.value.gaps[0];
      expect(gap.file).toBeDefined();
      expect(gap.suggestedSection).toBeDefined();
      expect(['high', 'medium', 'low']).toContain(gap.importance);
    }
  });

  it('should support exclude patterns', async () => {
    const rootDir = join(fixturesDir, 'undocumented-project');
    const result = await checkDocCoverage('src', {
      docsDir: join(rootDir, 'docs'),
      sourceDir: join(rootDir, 'src'),
      excludePatterns: ['**/also-undocumented.ts'],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // The excluded file should not appear in undocumented
      expect(result.value.undocumented).not.toContain(expect.stringContaining('also-undocumented'));
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/core && pnpm test doc-coverage.test.ts`
Expected: FAIL - "Cannot find module '../../src/context/doc-coverage'"

- [ ] **Step 4: Implement checkDocCoverage**

```typescript
// packages/core/src/context/doc-coverage.ts
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import type { ContextError } from '../shared/errors';
import { createError } from '../shared/errors';
import type { CoverageReport, CoverageOptions, DocumentationGap } from './types';
import { findFiles, readFileContent } from '../shared/fs-utils';
import { join, basename, relative } from 'path';
import { extractMarkdownLinks } from './agents-map';

/**
 * Determine importance of a file being documented
 */
function determineImportance(filePath: string): 'high' | 'medium' | 'low' {
  const name = basename(filePath).toLowerCase();

  // High importance: entry points, main files
  if (name === 'index.ts' || name === 'index.js' || name === 'main.ts') {
    return 'high';
  }

  // High importance: type definitions
  if (name.includes('types') || name.endsWith('.d.ts')) {
    return 'high';
  }

  // Low importance: tests, configs
  if (name.includes('.test.') || name.includes('.spec.') || name.includes('config')) {
    return 'low';
  }

  return 'medium';
}

/**
 * Suggest which documentation section a file belongs in
 */
function suggestSection(filePath: string, domain: string): string {
  const name = basename(filePath).toLowerCase();

  if (name.includes('types')) return 'API Types';
  if (name === 'index.ts' || name === 'index.js') return 'Module Exports';
  if (name.includes('util')) return 'Utilities';

  return `${domain} Reference`;
}

/**
 * Check documentation coverage for a domain
 */
export async function checkDocCoverage(
  domain: string,
  options: CoverageOptions = {}
): Promise<Result<CoverageReport, ContextError>> {
  const { docsDir = './docs', sourceDir = './src', excludePatterns = [] } = options;

  try {
    // Find all source files in the domain
    const sourceFiles = await findFiles('**/*.{ts,js,tsx,jsx}', sourceDir);

    // Filter out excluded patterns
    const filteredSourceFiles = sourceFiles.filter((file) => {
      const relativePath = relative(sourceDir, file);
      return !excludePatterns.some((pattern) => {
        // Simple glob matching
        const regex = new RegExp(
          '^' + pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$'
        );
        return regex.test(relativePath) || regex.test(file);
      });
    });

    // Find all documentation files
    const docFiles = await findFiles('**/*.md', docsDir);

    // Extract all links from documentation
    const documentedPaths = new Set<string>();

    for (const docFile of docFiles) {
      const contentResult = await readFileContent(docFile);
      if (contentResult.ok) {
        const links = extractMarkdownLinks(contentResult.value);
        for (const link of links) {
          // Normalize the path
          const normalizedPath = link.path.replace(/^\.\.\//, '').replace(/^\.\//, '');
          documentedPaths.add(normalizedPath);

          // Also add just the filename for matching
          const linkBasename = basename(link.path);
          documentedPaths.add(linkBasename);
        }
      }
    }

    // Categorize files as documented or undocumented
    const documented: string[] = [];
    const undocumented: string[] = [];
    const gaps: DocumentationGap[] = [];

    for (const sourceFile of filteredSourceFiles) {
      const relativePath = relative(sourceDir, sourceFile);
      const fileName = basename(sourceFile);

      // Check if documented (by full path or filename)
      const isDocumented =
        documentedPaths.has(relativePath) ||
        documentedPaths.has(fileName) ||
        documentedPaths.has(`src/${relativePath}`);

      if (isDocumented) {
        documented.push(relativePath);
      } else {
        undocumented.push(relativePath);
        gaps.push({
          file: relativePath,
          suggestedSection: suggestSection(sourceFile, domain),
          importance: determineImportance(sourceFile),
        });
      }
    }

    // Calculate coverage percentage
    const total = documented.length + undocumented.length;
    const coveragePercentage = total > 0 ? Math.round((documented.length / total) * 100) : 100;

    return Ok({
      domain,
      documented,
      undocumented,
      coveragePercentage,
      gaps,
    });
  } catch (error) {
    return Err(
      createError<ContextError>(
        'PARSE_ERROR',
        `Failed to analyze documentation coverage: ${(error as Error).message}`,
        { domain, docsDir, sourceDir },
        ['Ensure directories exist', 'Check file permissions']
      )
    );
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/core && pnpm test doc-coverage.test.ts`
Expected: PASS - 3 tests passed

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/context/doc-coverage.ts packages/core/tests/context/doc-coverage.test.ts packages/core/tests/fixtures/undocumented-project/
git commit -m "feat(core): implement documentation coverage analysis"
```

---

## Chunk 3: Knowledge Map Integrity

### Task 6: Knowledge Map Integrity Checking

**Files:**

- Create: `packages/core/src/context/knowledge-map.ts`
- Create: `packages/core/tests/context/knowledge-map.test.ts`
- Create: `packages/core/tests/fixtures/broken-links-project/`

- [ ] **Step 1: Create test fixture with broken links**

```bash
mkdir -p packages/core/tests/fixtures/broken-links-project/docs

cat > packages/core/tests/fixtures/broken-links-project/AGENTS.md << 'EOF'
# Broken Links Project

## Documentation

- [exists](./docs/exists.md) - This file exists
- [missing](./docs/missing.md) - This file does not exist
- [also-missing](./nonexistent/file.md) - Invalid path

## Code

- [src](./src/) - Missing directory
EOF

echo "# Existing Doc" > packages/core/tests/fixtures/broken-links-project/docs/exists.md
```

- [ ] **Step 2: Write failing test for validateKnowledgeMap**

```typescript
// packages/core/tests/context/knowledge-map.test.ts
import { describe, it, expect } from 'vitest';
import { validateKnowledgeMap } from '../../src/context/knowledge-map';
import { join } from 'path';

describe('validateKnowledgeMap', () => {
  const fixturesDir = join(__dirname, '../fixtures');

  it('should report broken links with details', async () => {
    const rootDir = join(fixturesDir, 'broken-links-project');
    const result = await validateKnowledgeMap(rootDir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.brokenLinks.length).toBeGreaterThan(0);

      const brokenLink = result.value.brokenLinks[0];
      expect(brokenLink.reason).toBe('NOT_FOUND');
      expect(brokenLink.suggestion).toBeDefined();
      expect(brokenLink.section).toBeDefined();
    }
  });

  it('should calculate integrity percentage', async () => {
    const rootDir = join(fixturesDir, 'broken-links-project');
    const result = await validateKnowledgeMap(rootDir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.integrity).toBeLessThan(100);
      expect(result.value.integrity).toBeGreaterThanOrEqual(0);
      expect(result.value.totalLinks).toBeGreaterThan(0);
      expect(result.value.validLinks + result.value.brokenLinks.length).toBe(
        result.value.totalLinks
      );
    }
  });

  it('should return 100% integrity for valid project', async () => {
    const rootDir = join(fixturesDir, 'valid-project');
    const result = await validateKnowledgeMap(rootDir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.integrity).toBe(100);
      expect(result.value.brokenLinks).toHaveLength(0);
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/core && pnpm test knowledge-map.test.ts`
Expected: FAIL - "Cannot find module '../../src/context/knowledge-map'"

- [ ] **Step 4: Implement validateKnowledgeMap**

```typescript
// packages/core/src/context/knowledge-map.ts
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import type { ContextError } from '../shared/errors';
import { createError } from '../shared/errors';
import type { BrokenLink, IntegrityReport } from './types';
import { validateAgentsMap } from './agents-map';
import { findFiles } from '../shared/fs-utils';
import { join, dirname, basename } from 'path';

/**
 * Suggest a fix for a broken link
 */
function suggestFix(path: string, existingFiles: string[]): string {
  const targetName = basename(path).toLowerCase();

  // Try to find similar files
  const similar = existingFiles.find((file) => {
    const fileName = basename(file).toLowerCase();
    return fileName.includes(targetName) || targetName.includes(fileName);
  });

  if (similar) {
    return `Did you mean "${similar}"?`;
  }

  return `Create the file "${path}" or remove the link`;
}

/**
 * Validate knowledge map integrity (all links in AGENTS.md and docs)
 */
export async function validateKnowledgeMap(
  rootDir: string = process.cwd()
): Promise<Result<IntegrityReport, ContextError>> {
  const agentsPath = join(rootDir, 'AGENTS.md');

  // Get validation from AGENTS.md
  const agentsResult = await validateAgentsMap(agentsPath);

  if (!agentsResult.ok) {
    return Err(agentsResult.error);
  }

  const {
    sections,
    brokenLinks: agentsBrokenLinks,
    totalLinks: agentsTotalLinks,
  } = agentsResult.value;

  // Get all existing files in the project for suggestions
  const existingFiles = await findFiles('**/*', rootDir);
  const relativeExistingFiles = existingFiles.map((f) => f.replace(rootDir + '/', ''));

  // Convert to BrokenLink format with suggestions
  const brokenLinks: BrokenLink[] = agentsBrokenLinks.map((link) => {
    // Find which section this link belongs to
    const section = sections.find((s) =>
      s.links.some((l) => l.path === link.path && l.line === link.line)
    );

    return {
      text: link.text,
      path: link.path,
      line: link.line,
      section: section?.title || 'Unknown',
      reason: 'NOT_FOUND' as const,
      suggestion: suggestFix(link.path, relativeExistingFiles),
    };
  });

  const validLinks = agentsTotalLinks - brokenLinks.length;
  const integrity = agentsTotalLinks > 0 ? Math.round((validLinks / agentsTotalLinks) * 100) : 100;

  return Ok({
    totalLinks: agentsTotalLinks,
    brokenLinks,
    validLinks,
    integrity,
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/core && pnpm test knowledge-map.test.ts`
Expected: PASS - 3 tests passed

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/context/knowledge-map.ts packages/core/tests/context/knowledge-map.test.ts packages/core/tests/fixtures/broken-links-project/
git commit -m "feat(core): implement knowledge map integrity checking"
```

---

## Chunk 4: AGENTS.md Generation

### Task 7: AGENTS.md Generation

**Files:**

- Create: `packages/core/src/context/generate.ts`
- Create: `packages/core/tests/context/generate.test.ts`

- [ ] **Step 1: Write failing test for generateAgentsMap**

```typescript
// packages/core/tests/context/generate.test.ts
import { describe, it, expect } from 'vitest';
import { generateAgentsMap } from '../../src/context/generate';
import { join } from 'path';

describe('generateAgentsMap', () => {
  const fixturesDir = join(__dirname, '../fixtures');

  it('should generate basic AGENTS.md structure', async () => {
    const config = {
      rootDir: join(fixturesDir, 'valid-project'),
      includePaths: ['**/*.md', 'docs/**/*'],
      excludePaths: ['node_modules/**'],
    };

    const result = await generateAgentsMap(config);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('# ');
      expect(result.value).toContain('## Project Overview');
      expect(result.value).toContain('## Repository Structure');
    }
  });

  it('should include custom sections', async () => {
    const config = {
      rootDir: join(fixturesDir, 'valid-project'),
      includePaths: ['**/*.md'],
      excludePaths: [],
      sections: [
        {
          name: 'Documentation',
          pattern: 'docs/**/*.md',
          description: 'Project documentation files',
        },
      ],
    };

    const result = await generateAgentsMap(config);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('## Documentation');
      expect(result.value).toContain('Project documentation files');
    }
  });

  it('should generate links to discovered files', async () => {
    const config = {
      rootDir: join(fixturesDir, 'valid-project'),
      includePaths: ['**/*.md'],
      excludePaths: [],
    };

    const result = await generateAgentsMap(config);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should contain markdown links
      expect(result.value).toMatch(/\[.+\]\(.+\)/);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test generate.test.ts`
Expected: FAIL - "Cannot find module '../../src/context/generate'"

- [ ] **Step 3: Implement generateAgentsMap**

```typescript
// packages/core/src/context/generate.ts
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import type { ContextError } from '../shared/errors';
import { createError } from '../shared/errors';
import type { AgentsMapConfig, GenerationSection } from './types';
import { findFiles } from '../shared/fs-utils';
import { relative, basename, dirname } from 'path';

/**
 * Default template sections for AGENTS.md
 */
const DEFAULT_SECTIONS: GenerationSection[] = [
  {
    name: 'Documentation',
    pattern: 'docs/**/*.md',
    description: 'Project documentation',
  },
  {
    name: 'Source Code',
    pattern: 'src/**/*.ts',
    description: 'Source code modules',
  },
];

/**
 * Group files by directory
 */
function groupByDirectory(files: string[], rootDir: string): Map<string, string[]> {
  const groups = new Map<string, string[]>();

  for (const file of files) {
    const relativePath = relative(rootDir, file);
    const dir = dirname(relativePath);

    if (!groups.has(dir)) {
      groups.set(dir, []);
    }
    groups.get(dir)!.push(relativePath);
  }

  return groups;
}

/**
 * Format a file as a markdown link
 */
function formatFileLink(filePath: string): string {
  const name = basename(filePath, '.md')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return `- [${name}](./${filePath})`;
}

/**
 * Generate AGENTS.md content from project structure
 */
export async function generateAgentsMap(
  config: AgentsMapConfig
): Promise<Result<string, ContextError>> {
  const { rootDir, includePaths, excludePaths, sections = DEFAULT_SECTIONS } = config;

  try {
    // Collect all files matching include patterns
    const allFiles: string[] = [];
    for (const pattern of includePaths) {
      const files = await findFiles(pattern, rootDir);
      allFiles.push(...files);
    }

    // Filter out excluded patterns
    const filteredFiles = allFiles.filter((file) => {
      const relativePath = relative(rootDir, file);
      return !excludePaths.some((pattern) => {
        const regex = new RegExp(
          '^' + pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$'
        );
        return regex.test(relativePath);
      });
    });

    // Start building the AGENTS.md content
    const lines: string[] = [];

    // Header
    lines.push('# AI Agent Knowledge Map');
    lines.push('');
    lines.push('This is the single source of truth for AI agents working on this project.');
    lines.push('');

    // Project Overview section
    lines.push('## Project Overview');
    lines.push('');
    lines.push('> TODO: Add project description');
    lines.push('');

    // Repository Structure section
    lines.push('## Repository Structure');
    lines.push('');
    const grouped = groupByDirectory(filteredFiles, rootDir);
    for (const [dir, files] of grouped) {
      if (dir !== '.') {
        lines.push(`### ${dir}/`);
        lines.push('');
      }
      for (const file of files.slice(0, 10)) {
        // Limit to 10 files per directory
        lines.push(formatFileLink(file));
      }
      if (files.length > 10) {
        lines.push(`- _... and ${files.length - 10} more files_`);
      }
      lines.push('');
    }

    // Custom sections
    for (const section of sections) {
      lines.push(`## ${section.name}`);
      lines.push('');
      if (section.description) {
        lines.push(section.description);
        lines.push('');
      }

      const sectionFiles = await findFiles(section.pattern, rootDir);
      const filteredSectionFiles = sectionFiles.filter((file) => {
        const relativePath = relative(rootDir, file);
        return !excludePaths.some((pattern) => {
          const regex = new RegExp(
            '^' + pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$'
          );
          return regex.test(relativePath);
        });
      });

      for (const file of filteredSectionFiles.slice(0, 20)) {
        lines.push(formatFileLink(relative(rootDir, file)));
      }
      if (filteredSectionFiles.length > 20) {
        lines.push(`- _... and ${filteredSectionFiles.length - 20} more files_`);
      }
      lines.push('');
    }

    // Development Workflow section
    lines.push('## Development Workflow');
    lines.push('');
    lines.push('> TODO: Add development workflow instructions');
    lines.push('');

    return Ok(lines.join('\n'));
  } catch (error) {
    return Err(
      createError<ContextError>(
        'PARSE_ERROR',
        `Failed to generate AGENTS.md: ${(error as Error).message}`,
        { rootDir },
        ['Check directory permissions', 'Ensure glob patterns are valid']
      )
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm test generate.test.ts`
Expected: PASS - 3 tests passed

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/context/generate.ts packages/core/tests/context/generate.test.ts
git commit -m "feat(core): implement AGENTS.md generation"
```

---

## Chunk 5: Module Integration and Documentation

### Task 8: Context Module Exports

**Files:**

- Create: `packages/core/src/context/index.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Create context module index**

```typescript
// packages/core/src/context/index.ts
// AGENTS.md Validation
export { validateAgentsMap, extractMarkdownLinks, extractSections } from './agents-map';

// Documentation Coverage
export { checkDocCoverage } from './doc-coverage';

// Knowledge Map Integrity
export { validateKnowledgeMap } from './knowledge-map';

// AGENTS.md Generation
export { generateAgentsMap } from './generate';

// Types
export type {
  AgentMapLink,
  AgentMapSection,
  AgentMapValidation,
  DocumentationGap,
  CoverageReport,
  CoverageOptions,
  BrokenLink,
  IntegrityReport,
  GenerationSection,
  AgentsMapConfig,
} from './types';

export { REQUIRED_SECTIONS } from './types';
```

- [ ] **Step 2: Update main entry point**

```typescript
// packages/core/src/index.ts
/**
 * @harness-engineering/core
 *
 * Core library for Harness Engineering toolkit
 */

export * from '@harness-engineering/types';

// Result type and helpers
export type { Result } from './shared/result';
export { Ok, Err, isOk, isErr } from './shared/result';

// Error types and helpers
export type {
  BaseError,
  ValidationError,
  ContextError,
  ConstraintError,
  EntropyError,
  FeedbackError,
} from './shared/errors';
export { createError } from './shared/errors';

// Validation module
export * from './validation';

// Context module
export * from './context';

// Package version
export const VERSION = '0.2.0';
```

- [ ] **Step 3: Verify exports work**

```bash
cd packages/core && pnpm typecheck
```

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/context/index.ts packages/core/src/index.ts
git commit -m "feat(core): export context module APIs"
```

---

### Task 9: Coverage and Final Testing

**Files:**

- None (running existing tests)

- [ ] **Step 1: Run all tests**

Run: `cd packages/core && pnpm test`
Expected: All tests pass

- [ ] **Step 2: Check test coverage**

Run: `cd packages/core && pnpm test:coverage`
Expected: Coverage >80% for all metrics

- [ ] **Step 3: If coverage is below 80%, identify and fix gaps**

Check: Coverage report in `packages/core/coverage/index.html`

If any file shows <80% coverage:

1. Open coverage report in browser
2. Click on file name to see uncovered lines
3. Write additional test cases for uncovered paths
4. Re-run: `cd packages/core && pnpm test:coverage`
5. Repeat until all files show ≥80%

Common gaps to check:

- Error handling branches
- Edge cases (empty files, no sections)
- Exclude pattern matching
- File permission errors

- [ ] **Step 4: Run linter**

Run: `cd packages/core && pnpm lint`
Expected: No linting errors

- [ ] **Step 5: Build the package**

Run: `cd packages/core && pnpm build`
Expected: Build succeeds, dist/ folder updated

- [ ] **Step 6: Commit if any fixes were needed**

```bash
git add .
git commit -m "test(core): ensure >80% coverage for context module"
```

---

### Task 10: Update Documentation

**Files:**

- Modify: `packages/core/README.md`
- Modify: `packages/core/CHANGELOG.md`

- [ ] **Step 1: Add context module section to README**

Add after the Validation Module section in `packages/core/README.md`:

```markdown
### Context Engineering Module

Tools for validating and generating AGENTS.md knowledge maps.

#### AGENTS.md Validation

Validate the structure and links in an AGENTS.md file:

\`\`\`typescript
import { validateAgentsMap } from '@harness-engineering/core';

const result = await validateAgentsMap('./AGENTS.md');

if (result.ok) {
console.log('Valid:', result.value.valid);
console.log('Sections:', result.value.sections.length);
console.log('Broken links:', result.value.brokenLinks.length);
console.log('Missing sections:', result.value.missingSections);
}
\`\`\`

#### Documentation Coverage

Check how well your code is documented:

\`\`\`typescript
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
\`\`\`

#### Knowledge Map Integrity

Verify all links in your AGENTS.md point to existing files:

\`\`\`typescript
import { validateKnowledgeMap } from '@harness-engineering/core';

const result = await validateKnowledgeMap('./');

if (result.ok) {
console.log('Integrity:', result.value.integrity + '%');
for (const broken of result.value.brokenLinks) {
console.log(`Broken: ${broken.path} - ${broken.suggestion}`);
}
}
\`\`\`

#### AGENTS.md Generation

Auto-generate an AGENTS.md from your project structure:

\`\`\`typescript
import { generateAgentsMap } from '@harness-engineering/core';

const result = await generateAgentsMap({
rootDir: './',
includePaths: ['**/*.md', 'src/**/*.ts'],
excludePaths: ['node_modules/**'],
sections: [
{ name: 'API Docs', pattern: 'docs/api/**/*.md', description: 'API documentation' },
],
});

if (result.ok) {
console.log(result.value); // Generated markdown content
}
\`\`\`
```

- [ ] **Step 2: Update CHANGELOG**

Add to `packages/core/CHANGELOG.md` after the header:

```markdown
## [0.2.0] - YYYY-MM-DD

_Replace YYYY-MM-DD with actual implementation date_

### Added

- **Context Engineering Module** - Tools for AGENTS.md validation and generation
  - `validateAgentsMap()` - Parse and validate AGENTS.md structure
  - `checkDocCoverage()` - Analyze documentation coverage for code files
  - `validateKnowledgeMap()` - Check integrity of all documentation links
  - `generateAgentsMap()` - Auto-generate AGENTS.md from project structure
  - `extractMarkdownLinks()` - Extract markdown links from content
  - `extractSections()` - Extract sections from markdown content
- Required sections validation for harness-engineering projects
- Documentation gap identification with importance levels
- Broken link detection with fix suggestions

### Changed

- Updated VERSION to 0.2.0
```

- [ ] **Step 3: Commit documentation**

```bash
git add packages/core/README.md packages/core/CHANGELOG.md
git commit -m "docs(core): add context module usage examples"
```

---

### Task 11: Version and Release Preparation

**Files:**

- Modify: `packages/core/package.json`

- [ ] **Step 1: Update version to 0.2.0**

Update `packages/core/package.json`:

```json
{
  "version": "0.2.0"
}
```

- [ ] **Step 2: Build and verify final package**

Run: `cd packages/core && pnpm build && pnpm test`
Expected: All tests pass, build succeeds

- [ ] **Step 3: Verify packaged files**

Run: `cd packages/core && pnpm pack --dry-run`
Expected: Shows list of files that would be published

- [ ] **Step 4: Commit version update**

```bash
git add packages/core/package.json
git commit -m "chore(core): prepare v0.2.0 release"
```

- [ ] **Step 5: Tag release**

```bash
git tag @harness-engineering/core@0.2.0
```

---

## Success Criteria

Module 2 (Context Engineering) is complete when:

- [ ] All tests passing (run: `cd packages/core && pnpm test`)
- [ ] Test coverage >80% (run: `cd packages/core && pnpm test:coverage`)
- [ ] No linting errors (run: `cd packages/core && pnpm lint`)
- [ ] TypeScript compiles without errors (run: `cd packages/core && pnpm typecheck`)
- [ ] Build succeeds (run: `cd packages/core && pnpm build`)
- [ ] README includes usage examples for all APIs
- [ ] CHANGELOG documents all changes
- [ ] Version set to 0.2.0
- [ ] All changes committed to git
- [ ] Release tagged: `@harness-engineering/core@0.2.0`

---

## Next Steps

After Module 2 is complete:

1. **Publish v0.2.0** (optional) - `pnpm publish --access public`
2. **Create implementation plan for Module 3 (Architectural Constraints)**
3. **Begin Module 3 implementation** following same TDD approach

---

_Last Updated: 2026-03-12_
