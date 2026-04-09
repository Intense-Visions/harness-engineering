import { Command } from 'commander';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { handleGetImpact } from '../mcp/tools/graph/index';

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

const TEST_NODE_TYPES = new Set(['test_result']);
const DOC_NODE_TYPES = new Set(['adr', 'decision', 'document', 'learning']);

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
        if (TEST_NODE_TYPES.has(item.type)) items.tests.push(item);
        else if (DOC_NODE_TYPES.has(item.type)) items.docs.push(item);
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

interface AggregatedCounts {
  code: number;
  tests: number;
  docs: number;
  other: number;
}

function formatCompact(stagedCount: number, merged: ImpactGroup, counts: AggregatedCounts): string {
  const lines: string[] = [];
  lines.push(`Impact Preview (${stagedCount} staged file${stagedCount === 1 ? '' : 's'})`);

  const codeLine = formatCompactLine('Code:', counts.code, 'files', merged.code, 2);
  const testsLine = formatCompactLine('Tests:', counts.tests, 'tests', merged.tests, 2);
  const docsLine = formatCompactLine('Docs:', counts.docs, 'docs', merged.docs, 2);

  if (codeLine) lines.push(codeLine);
  if (testsLine) lines.push(testsLine);
  if (docsLine) lines.push(docsLine);

  const total = counts.code + counts.tests + counts.docs + counts.other;
  lines.push(`  Total: ${total} affected`);

  return lines.join('\n');
}

function formatDetailed(
  stagedCount: number,
  merged: ImpactGroup,
  counts: AggregatedCounts
): string {
  const lines: string[] = [];
  lines.push(`Impact Preview (${stagedCount} staged file${stagedCount === 1 ? '' : 's'})`);

  const sections: Array<{
    label: string;
    count: number;
    unit: string;
    items: Array<{ id: string }>;
  }> = [
    { label: 'Code', count: counts.code, unit: 'files', items: merged.code },
    { label: 'Tests', count: counts.tests, unit: 'tests', items: merged.tests },
    { label: 'Docs', count: counts.docs, unit: 'docs', items: merged.docs },
  ];

  for (const section of sections) {
    if (section.count === 0 && section.items.length === 0) continue;
    lines.push(`  ${section.label}: ${section.count} ${section.unit}`);
    for (const item of section.items) {
      lines.push(`    ${extractNodeName(item.id)}`);
    }
  }

  const total = counts.code + counts.tests + counts.docs + counts.other;
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

interface ImpactAccumulator {
  perFileResults: PerFileImpact[];
  allGroups: ImpactGroup[];
  aggregateCounts: AggregatedCounts;
}

async function accumulateFileImpact(
  file: string,
  projectPath: string,
  mode: 'summary' | 'detailed',
  perFile: boolean,
  acc: ImpactAccumulator
): Promise<void> {
  const response = await handleGetImpact({
    path: projectPath,
    filePath: file,
    mode: perFile ? 'summary' : mode,
  });
  const parsed = parseImpactResponse(response);
  if (!parsed) return;

  acc.aggregateCounts.code += parsed.counts.code;
  acc.aggregateCounts.tests += parsed.counts.tests;
  acc.aggregateCounts.docs += parsed.counts.docs;
  acc.aggregateCounts.other += parsed.counts.other;

  if (perFile) {
    acc.perFileResults.push({
      file,
      code: parsed.counts.code,
      tests: parsed.counts.tests,
      docs: parsed.counts.docs,
    });
  }
  acc.allGroups.push(parsed.items);
}

function formatImpactOutput(
  stagedFiles: string[],
  acc: ImpactAccumulator,
  options: ImpactPreviewOptions
): string {
  if (options.perFile) {
    if (acc.perFileResults.length === 0) {
      return `Impact Preview (${stagedFiles.length} staged file${stagedFiles.length === 1 ? '' : 's'}): no impact data`;
    }
    return formatPerFile(acc.perFileResults);
  }
  const merged = mergeImpactGroups(acc.allGroups);
  return options.detailed
    ? formatDetailed(stagedFiles.length, merged, acc.aggregateCounts)
    : formatCompact(stagedFiles.length, merged, acc.aggregateCounts);
}

export async function runImpactPreview(options: ImpactPreviewOptions): Promise<string> {
  const projectPath = path.resolve(options.path ?? process.cwd());

  const stagedFiles = getStagedFiles(projectPath);
  if (stagedFiles.length === 0) return 'Impact Preview: no staged changes';

  if (!graphExists(projectPath)) {
    return 'Impact Preview: skipped (no graph — run `harness scan` to enable)';
  }

  const mode: 'summary' | 'detailed' = options.detailed ? 'detailed' : 'summary';
  const acc: ImpactAccumulator = {
    perFileResults: [],
    allGroups: [],
    aggregateCounts: { code: 0, tests: 0, docs: 0, other: 0 },
  };

  for (const file of stagedFiles) {
    await accumulateFileImpact(file, projectPath, mode, options.perFile ?? false, acc);
  }

  return formatImpactOutput(stagedFiles, acc, options);
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
