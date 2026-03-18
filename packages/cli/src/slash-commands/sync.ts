import fs from 'node:fs';
import path from 'node:path';
import { GENERATED_HEADER_CLAUDE, GENERATED_HEADER_GEMINI } from './types';
import { GENERATED_HEADER_AGENT } from '../agent-definitions/constants';

export interface SyncResult {
  added: string[];
  updated: string[];
  removed: string[];
  unchanged: string[];
}

export function computeSyncPlan(outputDir: string, rendered: Map<string, string>): SyncResult {
  const added: string[] = [];
  const updated: string[] = [];
  const removed: string[] = [];
  const unchanged: string[] = [];

  for (const [filename, content] of rendered) {
    const filePath = path.join(outputDir, filename);
    if (!fs.existsSync(filePath)) {
      added.push(filename);
    } else {
      const existing = fs.readFileSync(filePath, 'utf-8');
      if (existing === content) {
        unchanged.push(filename);
      } else {
        updated.push(filename);
      }
    }
  }

  if (fs.existsSync(outputDir)) {
    const existing = fs.readdirSync(outputDir).filter((f) => {
      const stat = fs.statSync(path.join(outputDir, f));
      return stat.isFile();
    });

    for (const filename of existing) {
      if (rendered.has(filename)) continue;

      const content = fs.readFileSync(path.join(outputDir, filename), 'utf-8');
      if (
        content.includes(GENERATED_HEADER_CLAUDE) ||
        content.includes(GENERATED_HEADER_GEMINI) ||
        content.includes(GENERATED_HEADER_AGENT)
      ) {
        removed.push(filename);
      }
    }
  }

  return { added, updated, removed, unchanged };
}

export function applySyncPlan(
  outputDir: string,
  rendered: Map<string, string>,
  plan: SyncResult,
  deleteOrphans: boolean
): void {
  fs.mkdirSync(outputDir, { recursive: true });

  for (const filename of [...plan.added, ...plan.updated]) {
    const content = rendered.get(filename);
    if (content !== undefined) {
      fs.writeFileSync(path.join(outputDir, filename), content);
    }
  }

  if (deleteOrphans) {
    for (const filename of plan.removed) {
      const filePath = path.join(outputDir, filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }
}
