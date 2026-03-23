import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { Collector, ArchConfig, MetricResult, Violation } from '../types';
import { violationId } from './hash';

interface ModuleStats {
  modulePath: string;
  fileCount: number;
  totalLoc: number;
  files: string[];
}

async function discoverModules(rootDir: string): Promise<ModuleStats[]> {
  const modules: ModuleStats[] = [];

  async function scanDir(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    const tsFiles: string[] = [];
    const subdirs: string[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        subdirs.push(fullPath);
      } else if (
        entry.isFile() &&
        (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
        !entry.name.endsWith('.test.ts') &&
        !entry.name.endsWith('.test.tsx') &&
        !entry.name.endsWith('.spec.ts')
      ) {
        tsFiles.push(fullPath);
      }
    }

    if (tsFiles.length > 0) {
      let totalLoc = 0;
      for (const f of tsFiles) {
        try {
          const content = await readFile(f, 'utf-8');
          totalLoc += content.split('\n').filter((line) => line.trim().length > 0).length;
        } catch {
          // skip unreadable files
        }
      }
      modules.push({
        modulePath: relative(rootDir, dir),
        fileCount: tsFiles.length,
        totalLoc,
        files: tsFiles.map((f) => relative(rootDir, f)),
      });
    }

    for (const sub of subdirs) {
      await scanDir(sub);
    }
  }

  await scanDir(rootDir);
  return modules;
}

export class ModuleSizeCollector implements Collector {
  readonly category = 'module-size' as const;

  async collect(config: ArchConfig, rootDir: string): Promise<MetricResult[]> {
    const modules = await discoverModules(rootDir);

    const thresholds = config.thresholds['module-size'];
    let maxLoc = Infinity;
    let maxFiles = Infinity;
    if (typeof thresholds === 'object' && thresholds !== null) {
      const t = thresholds as Record<string, number>;
      if (t.maxLoc !== undefined) maxLoc = t.maxLoc;
      if (t.maxFiles !== undefined) maxFiles = t.maxFiles;
    }

    return modules.map((mod) => {
      const violations: Violation[] = [];

      if (mod.totalLoc > maxLoc) {
        violations.push({
          id: violationId(mod.modulePath, this.category, `totalLoc=${mod.totalLoc}`),
          file: mod.modulePath,
          detail: `Module has ${mod.totalLoc} lines of code (threshold: ${maxLoc})`,
          severity: 'warning',
        });
      }

      if (mod.fileCount > maxFiles) {
        violations.push({
          id: violationId(mod.modulePath, this.category, `fileCount=${mod.fileCount}`),
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
