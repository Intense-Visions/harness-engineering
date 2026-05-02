# Plan: Impact Preview CLI Command

**Date:** 2026-03-23
**Spec:** docs/changes/pre-commit-impact-preview/proposal.md
**Phase:** 1 of 3 (CLI command only — skill integration is Phase 3)
**Estimated tasks:** 5
**Estimated time:** 20 minutes

## Goal

Implement `harness impact-preview` CLI command that shows the blast radius of staged git changes using the existing knowledge graph.

## Observable Truths (Acceptance Criteria)

1. When staged files exist and a graph is present, `harness impact-preview` shall print a compact summary showing counts and top 2 items per category (Code, Tests, Docs).
2. When the `--detailed` flag is passed, the system shall print all affected nodes grouped by category instead of the top-2 compact format.
3. When the `--per-file` flag is passed, the system shall print a per-file impact breakdown with counts per category.
4. When no `.harness/graph/graph.json` exists, the system shall print `Impact Preview: skipped (no graph — run \`harness scan\` to enable)` and exit 0.
5. When no files are staged, the system shall print `Impact Preview: no staged changes` and exit 0.
6. The command shall always exit 0 (informational only — never blocks).
7. `npx vitest run packages/cli/tests/commands/impact-preview.test.ts` shall pass with tests covering all output modes and edge cases.
8. `harness validate` shall pass after all tasks complete.

## File Map

```
CREATE packages/cli/src/commands/impact-preview.ts
CREATE packages/cli/tests/commands/impact-preview.test.ts
MODIFY packages/cli/src/index.ts (add import + register command)
```

## Tasks

### Task 1: Create impact-preview command — core logic and compact output

**Depends on:** none
**Files:** `packages/cli/src/commands/impact-preview.ts`

1. Create `packages/cli/src/commands/impact-preview.ts` with the following content:

```typescript
import { Command } from 'commander';
import { execSync } from 'child_process';
import * as path from 'path';
import { handleGetImpact } from '../mcp/tools/graph';

interface ImpactGroup {
  code: Array<{ id: string; type: string }>;
  tests: Array<{ id: string; type: string }>;
  docs: Array<{ id: string; type: string }>;
  other: Array<{ id: string; type: string }>;
}

interface PerFileImpact {
  file: string;
  code: number;
  tests: number;
  docs: number;
}

function getStagedFiles(cwd: string): string[] {
  try {
    const output = execSync('git diff --cached --name-only', {
      cwd,
      encoding: 'utf-8',
    });
    return output
      .trim()
      .split('\n')
      .filter((f) => f.length > 0);
  } catch {
    return [];
  }
}

function graphExists(projectPath: string): boolean {
  try {
    const fs = require('fs');
    return fs.existsSync(path.join(projectPath, '.harness', 'graph', 'graph.json'));
  } catch {
    return false;
  }
}

function extractNodeName(id: string): string {
  // Node IDs are like "file:src/routes/login.ts" — extract the path part
  const parts = id.split(':');
  if (parts.length > 1) {
    const fullPath = parts.slice(1).join(':');
    return path.basename(fullPath);
  }
  return id;
}

function parseImpactResponse(response: {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}): {
  counts: { code: number; tests: number; docs: number; other: number };
  items: ImpactGroup;
} | null {
  if (response.isError) return null;
  const text = response.content[0]?.text;
  if (!text) return null;

  try {
    const data = JSON.parse(text);
    if (data.mode === 'summary') {
      // Summary mode — reconstruct items from highestRiskItems
      const items: ImpactGroup = { code: [], tests: [], docs: [], other: [] };
      for (const item of data.highestRiskItems ?? []) {
        const testTypes = new Set(['test_result']);
        const docTypes = new Set(['adr', 'decision', 'document', 'learning']);
        if (testTypes.has(item.type)) items.tests.push(item);
        else if (docTypes.has(item.type)) items.docs.push(item);
        else items.code.push(item);
      }
      return { counts: data.impactCounts, items };
    } else {
      // Detailed mode — full impact groups
      const impact = data.impact ?? {};
      const items: ImpactGroup = {
        code: (impact.code ?? []).map((n: { id: string; type: string }) => ({
          id: n.id,
          type: n.type,
        })),
        tests: (impact.tests ?? []).map((n: { id: string; type: string }) => ({
          id: n.id,
          type: n.type,
        })),
        docs: (impact.docs ?? []).map((n: { id: string; type: string }) => ({
          id: n.id,
          type: n.type,
        })),
        other: (impact.other ?? []).map((n: { id: string; type: string }) => ({
          id: n.id,
          type: n.type,
        })),
      };
      return {
        counts: {
          code: items.code.length,
          tests: items.tests.length,
          docs: items.docs.length,
          other: items.other.length,
        },
        items,
      };
    }
  } catch {
    return null;
  }
}

function mergeImpactGroups(groups: ImpactGroup[]): ImpactGroup {
  const seen = new Set<string>();
  const merged: ImpactGroup = { code: [], tests: [], docs: [], other: [] };

  for (const group of groups) {
    for (const category of ['code', 'tests', 'docs', 'other'] as const) {
      for (const item of group[category]) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          merged[category].push(item);
        }
      }
    }
  }
  return merged;
}

function formatCompactLine(
  label: string,
  count: number,
  unit: string,
  items: Array<{ id: string }>,
  maxItems: number
): string {
  if (count === 0) return '';
  const labelPad = label.padEnd(6);
  const countStr = String(count).padStart(3);
  const topNames = items.slice(0, maxItems).map((i) => extractNodeName(i.id));
  const remaining = count - topNames.length;
  const namePart =
    remaining > 0
      ? `(${topNames.join(', ')}, +${remaining})`
      : topNames.length > 0
        ? `(${topNames.join(', ')})`
        : '';
  return `  ${labelPad}${countStr} ${unit.padEnd(7)} ${namePart}`;
}

function formatCompact(stagedCount: number, merged: ImpactGroup): string {
  const lines: string[] = [];
  lines.push(`Impact Preview (${stagedCount} staged file${stagedCount === 1 ? '' : 's'})`);

  const codeLine = formatCompactLine('Code:', merged.code.length, 'files', merged.code, 2);
  const testsLine = formatCompactLine('Tests:', merged.tests.length, 'tests', merged.tests, 2);
  const docsLine = formatCompactLine('Docs:', merged.docs.length, 'docs', merged.docs, 2);

  if (codeLine) lines.push(codeLine);
  if (testsLine) lines.push(testsLine);
  if (docsLine) lines.push(docsLine);

  const total = merged.code.length + merged.tests.length + merged.docs.length + merged.other.length;
  lines.push(`  Total: ${total} affected`);

  return lines.join('\n');
}

function formatDetailed(stagedCount: number, merged: ImpactGroup): string {
  const lines: string[] = [];
  lines.push(`Impact Preview (${stagedCount} staged file${stagedCount === 1 ? '' : 's'})`);

  const sections: Array<{ label: string; items: Array<{ id: string }> }> = [
    { label: `Code: ${merged.code.length} files`, items: merged.code },
    { label: `Tests: ${merged.tests.length} tests`, items: merged.tests },
    { label: `Docs: ${merged.docs.length} docs`, items: merged.docs },
  ];

  for (const section of sections) {
    if (section.items.length === 0) continue;
    lines.push(`  ${section.label}`);
    for (const item of section.items) {
      lines.push(`    ${extractNodeName(item.id)}`);
    }
  }

  const total = merged.code.length + merged.tests.length + merged.docs.length + merged.other.length;
  lines.push(`  Total: ${total} affected`);

  return lines.join('\n');
}

function formatPerFile(perFileResults: PerFileImpact[]): string {
  const lines: string[] = [];
  lines.push(
    `Impact Preview (${perFileResults.length} staged file${perFileResults.length === 1 ? '' : 's'})`
  );

  // Find longest filename for alignment
  const maxLen = Math.max(...perFileResults.map((r) => r.file.length));

  for (const result of perFileResults) {
    const padded = result.file.padEnd(maxLen);
    lines.push(`  ${padded}  -> ${result.code} files, ${result.tests} tests, ${result.docs} docs`);
  }

  return lines.join('\n');
}

export interface ImpactPreviewOptions {
  detailed?: boolean;
  perFile?: boolean;
  path?: string;
}

export async function runImpactPreview(options: ImpactPreviewOptions): Promise<string> {
  const projectPath = path.resolve(options.path ?? process.cwd());

  // Step 1: Get staged files
  const stagedFiles = getStagedFiles(projectPath);
  if (stagedFiles.length === 0) {
    return 'Impact Preview: no staged changes';
  }

  // Step 2: Check for graph
  if (!graphExists(projectPath)) {
    return 'Impact Preview: skipped (no graph — run `harness scan` to enable)';
  }

  // Step 3: Get impact for each file
  const mode = options.detailed ? 'detailed' : 'summary';
  const perFileResults: PerFileImpact[] = [];
  const allGroups: ImpactGroup[] = [];

  for (const file of stagedFiles) {
    const response = await handleGetImpact({
      path: projectPath,
      filePath: file,
      mode: options.perFile ? 'summary' : mode,
    });

    const parsed = parseImpactResponse(response);
    if (!parsed) continue;

    if (options.perFile) {
      perFileResults.push({
        file,
        code: parsed.counts.code,
        tests: parsed.counts.tests,
        docs: parsed.counts.docs,
      });
    }

    allGroups.push(parsed.items);
  }

  // Step 4: Format output
  if (options.perFile) {
    return formatPerFile(perFileResults);
  }

  const merged = mergeImpactGroups(allGroups);

  if (options.detailed) {
    return formatDetailed(stagedFiles.length, merged);
  }

  return formatCompact(stagedFiles.length, merged);
}

export function createImpactPreviewCommand(): Command {
  const command = new Command('impact-preview')
    .description('Show blast radius of staged changes using the knowledge graph')
    .option('--detailed', 'Show all affected files instead of top items')
    .option('--per-file', 'Show impact per staged file instead of aggregate')
    .option('--path <dir>', 'Project root (default: cwd)')
    .action(async (opts) => {
      const output = await runImpactPreview({
        detailed: opts.detailed,
        perFile: opts.perFile,
        path: opts.path,
      });
      console.log(output);
      process.exit(0);
    });

  return command;
}
```

2. Run: `npx tsc --noEmit -p packages/cli/tsconfig.json` to verify types compile
3. Run: `harness validate`
4. Commit: `feat(cli): add impact-preview command with aggregation and formatting`

---

### Task 2: Register impact-preview command in program builder

**Depends on:** Task 1
**Files:** `packages/cli/src/index.ts`

1. Add import at the end of the import block in `packages/cli/src/index.ts`:

```typescript
import { createImpactPreviewCommand } from './commands/impact-preview';
```

2. Add command registration after the existing `program.addCommand(createMcpCommand());` line:

```typescript
program.addCommand(createImpactPreviewCommand());
```

3. Add export for the run function at the bottom (for future MCP/skill use):

```typescript
export { runImpactPreview } from './commands/impact-preview';
```

4. Run: `npx tsc --noEmit -p packages/cli/tsconfig.json`
5. Run: `harness validate`
6. Commit: `feat(cli): register impact-preview command in program builder`

---

### Task 3: Write tests — edge cases (no staged files, no graph)

**Depends on:** Task 1
**Files:** `packages/cli/tests/commands/impact-preview.test.ts`

1. Create `packages/cli/tests/commands/impact-preview.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runImpactPreview } from '../../src/commands/impact-preview';

// Mock child_process.execSync for staged files
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

// Mock fs for graph existence check
vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

// Mock handleGetImpact
vi.mock('../../src/mcp/tools/graph', () => ({
  handleGetImpact: vi.fn(),
}));

import { execSync } from 'child_process';
import * as fs from 'fs';
import { handleGetImpact } from '../../src/mcp/tools/graph';

const mockedExecSync = vi.mocked(execSync);
const mockedExistsSync = vi.mocked(fs.existsSync);
const mockedHandleGetImpact = vi.mocked(handleGetImpact);

describe('runImpactPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns no staged changes when git diff is empty', async () => {
    mockedExecSync.mockReturnValue('');
    const output = await runImpactPreview({});
    expect(output).toBe('Impact Preview: no staged changes');
  });

  it('returns no staged changes when git diff throws', async () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('not a git repo');
    });
    const output = await runImpactPreview({});
    expect(output).toBe('Impact Preview: no staged changes');
  });

  it('returns skipped message when no graph exists', async () => {
    mockedExecSync.mockReturnValue('src/foo.ts\n');
    mockedExistsSync.mockReturnValue(false);
    const output = await runImpactPreview({});
    expect(output).toBe('Impact Preview: skipped (no graph — run `harness scan` to enable)');
  });

  it('exits 0 in all cases (verified by no thrown errors)', async () => {
    mockedExecSync.mockReturnValue('');
    // No assertion on process.exit — runImpactPreview returns a string, never throws
    const output = await runImpactPreview({});
    expect(typeof output).toBe('string');
  });
});
```

2. Run: `npx vitest run packages/cli/tests/commands/impact-preview.test.ts`
3. Observe: all 4 tests pass
4. Run: `harness validate`
5. Commit: `test(cli): add edge case tests for impact-preview command`

---

### Task 4: Write tests — compact, detailed, and per-file output formats

**Depends on:** Task 3
**Files:** `packages/cli/tests/commands/impact-preview.test.ts`

1. Append the following test block to `packages/cli/tests/commands/impact-preview.test.ts` inside the existing `describe` block:

```typescript
describe('with graph and staged files', () => {
  beforeEach(() => {
    mockedExistsSync.mockReturnValue(true);
  });

  const summaryResponse = (
    counts: { code: number; tests: number; docs: number; other: number },
    items: Array<{ id: string; type: string }>
  ) => ({
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          mode: 'summary',
          targetNodeId: 'file:test',
          impactCounts: counts,
          highestRiskItems: items,
          stats: {},
        }),
      },
    ],
  });

  const detailedResponse = (impact: Record<string, Array<{ id: string; type: string }>>) => ({
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          targetNodeId: 'file:test',
          impact,
          stats: {},
          edges: [],
        }),
      },
    ],
  });

  it('formats compact summary with counts and top items', async () => {
    mockedExecSync.mockReturnValue('src/auth.ts\nsrc/login.ts\n');
    mockedHandleGetImpact.mockResolvedValue(
      summaryResponse({ code: 5, tests: 2, docs: 1, other: 0 }, [
        { id: 'file:src/routes/login.ts', type: 'file' },
        { id: 'file:src/middleware/verify.ts', type: 'file' },
        { id: 'test_result:auth.test.ts', type: 'test_result' },
        { id: 'test_result:integration.test.ts', type: 'test_result' },
        { id: 'document:auth-guide.md', type: 'document' },
      ])
    );

    const output = await runImpactPreview({});
    expect(output).toContain('Impact Preview (2 staged files)');
    expect(output).toContain('Code:');
    expect(output).toContain('Tests:');
    expect(output).toContain('Docs:');
    expect(output).toContain('Total:');
  });

  it('formats detailed output with all items listed', async () => {
    mockedExecSync.mockReturnValue('src/auth.ts\n');
    mockedHandleGetImpact.mockResolvedValue(
      detailedResponse({
        code: [
          { id: 'file:src/routes/login.ts', type: 'file' },
          { id: 'file:src/middleware/verify.ts', type: 'file' },
        ],
        tests: [{ id: 'test_result:auth.test.ts', type: 'test_result' }],
        docs: [{ id: 'document:auth-guide.md', type: 'document' }],
        other: [],
      })
    );

    const output = await runImpactPreview({ detailed: true });
    expect(output).toContain('Impact Preview (1 staged file)');
    expect(output).toContain('login.ts');
    expect(output).toContain('verify.ts');
    expect(output).toContain('auth.test.ts');
    expect(output).toContain('auth-guide.md');
    expect(output).toContain('Total: 4 affected');
  });

  it('formats per-file breakdown', async () => {
    mockedExecSync.mockReturnValue('src/auth.ts\nsrc/login.ts\n');
    mockedHandleGetImpact
      .mockResolvedValueOnce(summaryResponse({ code: 5, tests: 2, docs: 1, other: 0 }, []))
      .mockResolvedValueOnce(summaryResponse({ code: 3, tests: 1, docs: 0, other: 0 }, []));

    const output = await runImpactPreview({ perFile: true });
    expect(output).toContain('Impact Preview (2 staged files)');
    expect(output).toContain('src/auth.ts');
    expect(output).toContain('5 files, 2 tests, 1 docs');
    expect(output).toContain('src/login.ts');
    expect(output).toContain('3 files, 1 tests, 0 docs');
  });

  it('deduplicates nodes across multiple files in aggregate mode', async () => {
    mockedExecSync.mockReturnValue('src/a.ts\nsrc/b.ts\n');
    // Both files impact the same node — should be counted once
    mockedHandleGetImpact
      .mockResolvedValueOnce(
        summaryResponse({ code: 1, tests: 0, docs: 0, other: 0 }, [
          { id: 'file:src/shared.ts', type: 'file' },
        ])
      )
      .mockResolvedValueOnce(
        summaryResponse({ code: 1, tests: 0, docs: 0, other: 0 }, [
          { id: 'file:src/shared.ts', type: 'file' },
        ])
      );

    const output = await runImpactPreview({});
    // Deduplicated: only 1 code file
    expect(output).toContain('Total: 1 affected');
  });

  it('handles handleGetImpact returning error gracefully', async () => {
    mockedExecSync.mockReturnValue('src/unknown.ts\n');
    mockedHandleGetImpact.mockResolvedValue({
      content: [{ type: 'text' as const, text: 'Error: no file node found' }],
      isError: true,
    });

    const output = await runImpactPreview({});
    // Should still produce valid output (0 affected)
    expect(output).toContain('Impact Preview (1 staged file)');
    expect(output).toContain('Total: 0 affected');
  });

  it('singular form for 1 staged file', async () => {
    mockedExecSync.mockReturnValue('src/auth.ts\n');
    mockedHandleGetImpact.mockResolvedValue(
      summaryResponse({ code: 0, tests: 0, docs: 0, other: 0 }, [])
    );

    const output = await runImpactPreview({});
    expect(output).toContain('(1 staged file)');
    expect(output).not.toContain('files)');
  });
});
```

2. Run: `npx vitest run packages/cli/tests/commands/impact-preview.test.ts`
3. Observe: all tests pass (4 edge case + 6 format = 10 total)
4. Run: `harness validate`
5. Commit: `test(cli): add output format tests for impact-preview command`

---

### Task 5: Verify end-to-end and final validation

**Depends on:** Task 2, Task 4
**Files:** none (verification only)

[checkpoint:human-verify]

1. Run: `npx vitest run packages/cli/tests/commands/impact-preview.test.ts` — observe all tests pass
2. Run: `npx tsc --noEmit -p packages/cli/tsconfig.json` — observe no type errors
3. Run: `harness validate` — observe validation passes
4. Run: `npx harness impact-preview --help` — verify help output shows:

   ```
   Usage: harness impact-preview [options]

   Show blast radius of staged changes using the knowledge graph

   Options:
     --detailed     Show all affected files instead of top items
     --per-file     Show impact per staged file instead of aggregate
     --path <dir>   Project root (default: cwd)
     -h, --help     display help for command
   ```

5. Run: `npx harness impact-preview` — verify it prints one of:
   - `Impact Preview: no staged changes` (if nothing staged)
   - `Impact Preview: skipped (no graph — run \`harness scan\` to enable)` (if no graph)
   - A compact summary (if graph and staged files exist)

No commit in this task — verification only.
