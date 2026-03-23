import { readFile, readdir } from 'node:fs/promises';
import { join, relative, dirname, resolve } from 'node:path';
import type { Collector, ArchConfig, MetricResult, Violation } from '../types';
import { violationId } from './hash';

interface ModuleDepthInfo {
  modulePath: string;
  longestChain: number;
  files: string[];
}

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

async function collectTsFiles(dir: string): Promise<string[]> {
  const results: string[] = [];

  async function scan(d: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist')
        continue;
      const fullPath = join(d, entry.name);
      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (
        entry.isFile() &&
        (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
        !entry.name.endsWith('.test.ts') &&
        !entry.name.endsWith('.test.tsx') &&
        !entry.name.endsWith('.spec.ts')
      ) {
        results.push(fullPath);
      }
    }
  }

  await scan(dir);
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

  async collect(config: ArchConfig, rootDir: string): Promise<MetricResult[]> {
    const allFiles = await collectTsFiles(rootDir);

    // Build import graph
    const graph = new Map<string, string[]>();
    const fileSet = new Set(allFiles);

    for (const file of allFiles) {
      try {
        const content = await readFile(file, 'utf-8');
        const imports = extractImportSources(content, file).filter((imp) => fileSet.has(imp));
        graph.set(file, imports);
      } catch {
        graph.set(file, []);
      }
    }

    // Group files by module directory
    const moduleMap = new Map<string, string[]>();
    for (const file of allFiles) {
      const relDir = relative(rootDir, dirname(file));
      if (!moduleMap.has(relDir)) moduleMap.set(relDir, []);
      moduleMap.get(relDir)!.push(file);
    }

    // Compute longest chain per module
    const memo = new Map<string, number>();
    const threshold =
      typeof config.thresholds['dependency-depth'] === 'number'
        ? config.thresholds['dependency-depth']
        : Infinity;

    const results: MetricResult[] = [];

    for (const [modulePath, files] of moduleMap) {
      let longestChain = 0;

      for (const file of files) {
        const depth = computeLongestChain(file, graph, new Set(), memo);
        if (depth > longestChain) longestChain = depth;
      }

      const violations: Violation[] = [];
      if (longestChain > threshold) {
        violations.push({
          id: violationId(modulePath, this.category, `depth=${longestChain}`),
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
