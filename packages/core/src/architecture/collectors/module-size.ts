import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFAULT_SKIP_DIRS } from '@harness-engineering/graph';
import type { Collector, ArchConfig, MetricResult, Violation, ConstraintRule } from '../types';
import { violationId, constraintRuleId } from './hash';
import { relativePosix } from '../../shared/fs-utils';

interface ModuleStats {
  modulePath: string;
  fileCount: number;
  totalLoc: number;
  files: string[];
}

function isSkippedEntry(name: string): boolean {
  return name.startsWith('.') || DEFAULT_SKIP_DIRS.has(name);
}

function isTsSourceFile(name: string): boolean {
  if (!name.endsWith('.ts') && !name.endsWith('.tsx')) return false;
  if (name.endsWith('.test.ts') || name.endsWith('.test.tsx') || name.endsWith('.spec.ts'))
    return false;
  return true;
}

async function countLoc(filePath: string): Promise<number> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return content.split('\n').filter((line) => line.trim().length > 0).length;
  } catch {
    return 0;
  }
}

async function buildModuleStats(
  rootDir: string,
  dir: string,
  tsFiles: string[]
): Promise<ModuleStats> {
  let totalLoc = 0;
  for (const f of tsFiles) {
    totalLoc += await countLoc(f);
  }
  return {
    modulePath: relativePosix(rootDir, dir),
    fileCount: tsFiles.length,
    totalLoc,
    files: tsFiles.map((f) => relativePosix(rootDir, f)),
  };
}

async function scanDir(rootDir: string, dir: string, modules: ModuleStats[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  const tsFiles: string[] = [];
  const subdirs: string[] = [];

  for (const entry of entries) {
    if (isSkippedEntry(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      subdirs.push(fullPath);
      continue;
    }
    if (entry.isFile() && isTsSourceFile(entry.name)) {
      tsFiles.push(fullPath);
    }
  }

  if (tsFiles.length > 0) {
    modules.push(await buildModuleStats(rootDir, dir, tsFiles));
  }

  for (const sub of subdirs) {
    await scanDir(rootDir, sub, modules);
  }
}

async function discoverModules(rootDir: string): Promise<ModuleStats[]> {
  const modules: ModuleStats[] = [];
  await scanDir(rootDir, rootDir, modules);
  return modules;
}

function extractThresholds(config: ArchConfig): { maxLoc: number; maxFiles: number } {
  const thresholds = config.thresholds['module-size'];
  let maxLoc = Infinity;
  let maxFiles = Infinity;
  if (typeof thresholds === 'object' && thresholds !== null) {
    const t = thresholds as Record<string, number>;
    if (t.maxLoc !== undefined) maxLoc = t.maxLoc;
    if (t.maxFiles !== undefined) maxFiles = t.maxFiles;
  }
  return { maxLoc, maxFiles };
}

export class ModuleSizeCollector implements Collector {
  readonly category = 'module-size' as const;

  getRules(config: ArchConfig, _rootDir: string): ConstraintRule[] {
    const { maxLoc, maxFiles } = extractThresholds(config);
    const rules: ConstraintRule[] = [];

    if (maxLoc < Infinity) {
      const desc = `Module LOC must not exceed ${maxLoc}`;
      rules.push({
        id: constraintRuleId(this.category, 'project', desc),
        category: this.category,
        description: desc,
        scope: 'project',
      });
    }
    if (maxFiles < Infinity) {
      const desc = `Module file count must not exceed ${maxFiles}`;
      rules.push({
        id: constraintRuleId(this.category, 'project', desc),
        category: this.category,
        description: desc,
        scope: 'project',
      });
    }
    if (rules.length === 0) {
      const desc = 'Module size must stay within thresholds';
      rules.push({
        id: constraintRuleId(this.category, 'project', desc),
        category: this.category,
        description: desc,
        scope: 'project',
      });
    }
    return rules;
  }

  async collect(config: ArchConfig, rootDir: string): Promise<MetricResult[]> {
    const modules = await discoverModules(rootDir);
    const { maxLoc, maxFiles } = extractThresholds(config);

    return modules.map((mod) => {
      const violations: Violation[] = [];

      if (mod.totalLoc > maxLoc) {
        violations.push({
          id: violationId(mod.modulePath, this.category, 'totalLoc-exceeded'),
          file: mod.modulePath,
          detail: `Module has ${mod.totalLoc} lines of code (threshold: ${maxLoc})`,
          severity: 'warning',
        });
      }

      if (mod.fileCount > maxFiles) {
        violations.push({
          id: violationId(mod.modulePath, this.category, 'fileCount-exceeded'),
          file: mod.modulePath,
          detail: `Module has ${mod.fileCount} files (threshold: ${maxFiles})`,
          severity: 'warning',
        });
      }

      return {
        category: this.category,
        scope: mod.modulePath,
        value: mod.totalLoc,
        violations,
        metadata: { fileCount: mod.fileCount, totalLoc: mod.totalLoc },
      };
    });
  }
}
