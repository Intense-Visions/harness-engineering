import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { DEFAULT_SKIP_DIRS } from '@harness-engineering/graph';
import type { Collector, ArchConfig, MetricResult, Violation, ConstraintRule } from '../types';
import { violationId, constraintRuleId } from './hash';
import { relativePosix } from '../../shared/fs-utils';

/**
 * Extract relative import sources from a TypeScript file using regex.
 * Returns resolved absolute paths.
 */
function extractImportSources(content: string, filePath: string): string[] {
  const importRegex = /(?:import|export)\s+.*?from\s+['"](\.[^'"]+)['"]/g;
  const dynamicRegex = /import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  const sources: string[] = [];
  const dir = dirname(filePath);

  for (const regex of [importRegex, dynamicRegex]) {
    let match;
    while ((match = regex.exec(content)) !== null) {
      let resolved = resolve(dir, match[1]!);
      if (!resolved.endsWith('.ts') && !resolved.endsWith('.tsx')) {
        resolved += '.ts';
      }
      sources.push(resolved);
    }
  }

  return sources;
}

function isSkippedEntry(name: string): boolean {
  return name.startsWith('.') || DEFAULT_SKIP_DIRS.has(name);
}

function isTsSourceFile(name: string): boolean {
  if (!name.endsWith('.ts') && !name.endsWith('.tsx')) return false;
  return !name.endsWith('.test.ts') && !name.endsWith('.test.tsx') && !name.endsWith('.spec.ts');
}

async function scanDir(d: string, results: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(d, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (isSkippedEntry(entry.name)) continue;
    const fullPath = join(d, entry.name);
    if (entry.isDirectory()) {
      await scanDir(fullPath, results);
    } else if (entry.isFile() && isTsSourceFile(entry.name)) {
      results.push(fullPath);
    }
  }
}

async function collectTsFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  await scanDir(dir, results);
  return results;
}

function computeLongestChain(
  file: string,
  graph: Map<string, string[]>,
  visited: Set<string>,
  memo: Map<string, number>
): number {
  if (memo.has(file)) return memo.get(file)!;
  if (visited.has(file)) return 0; // cycle — avoid infinite recursion

  visited.add(file);
  const deps = graph.get(file) || [];
  let maxDepth = 0;

  for (const dep of deps) {
    const depth = 1 + computeLongestChain(dep, graph, visited, memo);
    if (depth > maxDepth) maxDepth = depth;
  }

  visited.delete(file);
  memo.set(file, maxDepth);
  return maxDepth;
}

export class DepDepthCollector implements Collector {
  readonly category = 'dependency-depth' as const;

  getRules(config: ArchConfig, _rootDir: string): ConstraintRule[] {
    const threshold =
      typeof config.thresholds['dependency-depth'] === 'number'
        ? config.thresholds['dependency-depth']
        : null;

    const desc =
      threshold !== null
        ? `Dependency chain depth must not exceed ${threshold}`
        : 'Dependency chain depth must stay within thresholds';
    return [
      {
        id: constraintRuleId(this.category, 'project', desc),
        category: this.category,
        description: desc,
        scope: 'project',
      },
    ];
  }

  private async buildImportGraph(allFiles: string[]): Promise<Map<string, string[]>> {
    const graph = new Map<string, string[]>();
    const fileSet = new Set(allFiles);
    for (const file of allFiles) {
      try {
        const content = await readFile(file, 'utf-8');
        graph.set(
          file,
          extractImportSources(content, file).filter((imp) => fileSet.has(imp))
        );
      } catch {
        graph.set(file, []);
      }
    }
    return graph;
  }

  private buildModuleMap(allFiles: string[], rootDir: string): Map<string, string[]> {
    const moduleMap = new Map<string, string[]>();
    for (const file of allFiles) {
      const relDir = relativePosix(rootDir, dirname(file));
      if (!moduleMap.has(relDir)) moduleMap.set(relDir, []);
      moduleMap.get(relDir)!.push(file);
    }
    return moduleMap;
  }

  async collect(config: ArchConfig, rootDir: string): Promise<MetricResult[]> {
    const allFiles = await collectTsFiles(rootDir);
    const graph = await this.buildImportGraph(allFiles);
    const moduleMap = this.buildModuleMap(allFiles, rootDir);

    const memo = new Map<string, number>();
    const threshold =
      typeof config.thresholds['dependency-depth'] === 'number'
        ? config.thresholds['dependency-depth']
        : Infinity;

    const results: MetricResult[] = [];

    for (const [modulePath, files] of moduleMap) {
      const longestChain = files.reduce((max, file) => {
        return Math.max(max, computeLongestChain(file, graph, new Set(), memo));
      }, 0);

      const violations: Violation[] = [];
      if (longestChain > threshold) {
        violations.push({
          id: violationId(modulePath, this.category, 'depth-exceeded'),
          file: modulePath,
          detail: `Import chain depth is ${longestChain} (threshold: ${threshold})`,
          severity: 'warning',
        });
      }

      results.push({
        category: this.category,
        scope: modulePath,
        value: longestChain,
        violations,
        metadata: { longestChain },
      });
    }

    return results;
  }
}
