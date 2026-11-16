// packages/cli/tests/mcp/tools/entropy-cleanup-parity.test.ts
//
// Issue #2168: the MCP `detect_entropy` tool and `harness cleanup` read the
// same harness.config.json and must report the same gating finding set for it.
// Measured on this repository before the fix, the MCP surface reported
// 1,686,602 issues where `harness cleanup --findings-json` reported 1,887 —
// because whenever `.harness/graph` existed the tool fed the analyzer
// graph-derived drift and dead-code data, which ignores `forwardLookingPaths`,
// `docPaths`, `ignorePatterns`, `excludePatterns` and `entryPoints` entirely.
//
// Real loader, real analyzer, real detectors, real graph serializer — no mocks.
//
// Scope, not counting: the MCP summary's `deadCode` category also counts
// unused imports, which `harness cleanup` does not publish. That is a
// difference in WHAT each surface counts over an identical scope, so the
// fixture deliberately contains no unused import.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { handleDetectEntropy } from '../../../src/mcp/tools/entropy';
import { runCleanup } from '../../../src/commands/cleanup';

let projectDir: string;

function write(rel: string, content: string): void {
  const file = path.join(projectDir, ...rel.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/**
 * A project whose config scopes drift and dead code in every way the issue
 * names: a forward-looking doc tree, an excluded source tree, explicit entry
 * points, and a docs directory that leaves the root README out of scope.
 */
function writeFixture(): void {
  write(
    'harness.config.json',
    JSON.stringify(
      {
        version: 1,
        rootDir: '.',
        docsDir: './docs',
        entropy: {
          entryPoints: ['src/index.ts'],
          excludePatterns: ['**/node_modules/**', '**/generated/**', '**/*.test.ts'],
          drift: { forwardLookingPaths: ['docs/history/'] },
        },
      },
      null,
      2
    )
  );
  write('src/index.ts', "export { realFunction } from './real';\n");
  write('src/real.ts', 'export function realFunction(): number {\n  return 1;\n}\n');
  // In scope and unreferenced: one dead file, found by both surfaces.
  write('src/orphan.ts', 'export function orphanHelper(): number {\n  return 2;\n}\n');
  // Excluded by `excludePatterns` — must not count anywhere.
  write('src/generated/stub.ts', 'export function generatedStub(): number {\n  return 3;\n}\n');
  // In scope: one genuine drift finding.
  write('docs/guide.md', '# Guide\n\nCall `realFunction` here, not `vanishedFunction`.\n');
  // Forward-looking by config: suppressed.
  write(
    'docs/history/old-plan.md',
    '# Old plan\n\nWe will add `plannedThing` and `anotherPlannedThing`.\n'
  );
  // Outside `docsDir`: not in the drift denominator.
  write('README.md', '# Project\n\nUse `readmeOnlyMissingSymbol`.\n');
}

/**
 * A graph whose `documents` edges point at code nodes that do not exist — the
 * shape `GraphEntropyAdapter.computeDriftData` reports as `missingTargets`
 * with no regard for forwardLookingPaths or docPaths. One edge originates in
 * the forward-looking tree, which the config says must never surface.
 */
async function writeGraph(): Promise<void> {
  const { saveGraph } = await import('@harness-engineering/graph');
  const nodes = [
    {
      id: 'doc:docs/history/old-plan.md',
      type: 'document' as const,
      name: 'old-plan.md',
      path: 'docs/history/old-plan.md',
      metadata: {},
    },
    {
      id: 'doc:README.md',
      type: 'document' as const,
      name: 'README.md',
      path: 'README.md',
      metadata: {},
    },
  ];
  const edges = [
    { from: 'doc:docs/history/old-plan.md', to: 'function:plannedThing', type: 'documents' },
    { from: 'doc:docs/history/old-plan.md', to: 'function:anotherPlannedThing', type: 'documents' },
    { from: 'doc:README.md', to: 'function:readmeOnlyMissingSymbol', type: 'documents' },
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await saveGraph(path.join(projectDir, '.harness', 'graph'), nodes as any, edges as any);
}

async function mcpSummary() {
  const result = await handleDetectEntropy({ path: projectDir, type: 'all', mode: 'summary' });
  expect(result.isError).toBeUndefined();
  return JSON.parse(result.content[0]!.text) as {
    totalIssues: number;
    categories: Record<string, { issueCount: number }>;
  };
}

async function cleanupTotals() {
  const result = await runCleanup({
    cwd: projectDir,
    configPath: path.join(projectDir, 'harness.config.json'),
    type: 'all',
  });
  if (!result.ok) throw result.error;
  return result.value;
}

async function mcpDetailedDriftFiles(): Promise<string[]> {
  const result = await handleDetectEntropy({ path: projectDir, type: 'drift' });
  expect(result.isError).toBeUndefined();
  const report = JSON.parse(result.content[0]!.text) as {
    drift?: { drifts: Array<{ docFile: string }> };
  };
  return (report.drift?.drifts ?? []).map((d) => d.docFile.replaceAll('\\', '/'));
}

describe('detect_entropy honours the same config scope as harness cleanup (#2168)', () => {
  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-entropy-parity-'));
    writeFixture();
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('the fixture is not vacuous: cleanup finds exactly the in-scope drift and dead file', async () => {
    const cleanup = await cleanupTotals();
    expect(cleanup.driftIssues.map((d) => path.basename(d.file))).toEqual(['guide.md']);
    expect(cleanup.deadCode.map((d) => path.basename(d.file))).toContain('orphan.ts');
    expect(cleanup.deadCode.some((d) => d.file.includes('generated'))).toBe(false);
    expect(cleanup.totalIssues).toBeGreaterThan(0);
  });

  it('reports the same totals as runCleanup with no graph present', async () => {
    const [mcp, cleanup] = await Promise.all([mcpSummary(), cleanupTotals()]);
    expect(mcp.categories['drift']?.issueCount).toBe(cleanup.driftIssues.length);
    expect(mcp.categories['deadCode']?.issueCount).toBe(cleanup.deadCode.length);
    expect(mcp.totalIssues).toBe(cleanup.totalIssues);
  });

  it('reports the same totals as runCleanup on a graph-bearing project', async () => {
    await writeGraph();
    // MUTATION: feed `loadEntropyGraphOptions(projectPath)` back into
    // `analyzer.analyze()` and drift reports the graph's three missing targets
    // — two from the forward-looking tree — instead of the one in-scope finding.
    const [mcp, cleanup] = await Promise.all([mcpSummary(), cleanupTotals()]);
    expect(mcp.categories['drift']?.issueCount).toBe(cleanup.driftIssues.length);
    expect(mcp.categories['deadCode']?.issueCount).toBe(cleanup.deadCode.length);
    expect(mcp.totalIssues).toBe(cleanup.totalIssues);
  });

  it('never surfaces a forward-looking or out-of-docsDir document', async () => {
    await writeGraph();
    const files = await mcpDetailedDriftFiles();
    expect(files.some((f) => f.endsWith('docs/guide.md'))).toBe(true);
    expect(files.some((f) => f.includes('docs/history/'))).toBe(false);
    expect(files.some((f) => f.endsWith('README.md'))).toBe(false);
  });
});
